import { describe, expect, it } from 'vitest';
import type { NpmAdvisory, NpmAdvisoryData, NpmMalwareData } from './advisories';
import type { PackageResult } from './match';
import { affectingByAdvisory, DEFAULT_NPM_FILTERS, filterNpmRows, npmRows, npmStats, type NpmFilters } from './npmFilters';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

function advisory(id: string, over: Partial<NpmAdvisory> = {}): NpmAdvisory {
  return {
    id,
    cves: [],
    summary: `Summary of ${id}`,
    description: '',
    severity: 'high',
    cvss: [],
    cwes: [],
    ranges: [{ package: 'lodash', vulnerable: '< 4.17.21', patched: '4.17.21' }],
    published: daysAgo(1),
    updated: daysAgo(1),
    references: [],
    credits: [],
    url: `https://github.com/advisories/${id}`,
    ...over,
  };
}

const DATA: NpmAdvisoryData = {
  version: 1,
  generatedAt: daysAgo(0),
  updatedAt: daysAgo(0),
  recent: [
    advisory('GHSA-aaaa-aaaa-aaaa', { severity: 'critical', cves: ['CVE-2026-1111'], kev: true, epss: { score: 0.4, percentile: 0.9 } }),
    advisory('GHSA-bbbb-bbbb-bbbb', { severity: 'medium', published: daysAgo(20), updated: daysAgo(20), ranges: [{ package: 'qs', vulnerable: '< 6.2.4' }] }),
    // published long ago, updated recently: it is in the 30-day window by its update
    advisory('GHSA-cccc-cccc-cccc', { severity: 'high', published: daysAgo(400), updated: daysAgo(10), ranges: [{ package: 'express', vulnerable: '< 4.0.0', patched: '4.0.0' }] }),
    advisory('GHSA-dddd-dddd-dddd', { severity: 'low', published: daysAgo(60), updated: daysAgo(60), summary: 'Prototype pollution in minimist' }),
    advisory('GHSA-eeee-eeee-eeee', { severity: 'critical', published: daysAgo(2), updated: daysAgo(2), withdrawn: daysAgo(1) }),
  ],
  index: [],
};

const MALWARE: NpmMalwareData = {
  version: 1,
  generatedAt: daysAgo(0),
  updatedAt: daysAgo(0),
  entries: [
    ['GHSA-mmmm-mmmm-mmmm', 'evil-pkg', '>= 0', daysAgo(3)],
    ['GHSA-mmmm-mmmm-mmmm', 'evil-pkg-two', '>= 0', daysAgo(3)],
    ['GHSA-nnnn-nnnn-nnnn', 'old-evil', '= 1.0.0', daysAgo(20)],
  ],
};

const filters = (over: Partial<NpmFilters> = {}): NpmFilters => ({ ...DEFAULT_NPM_FILTERS, type: 'all', days: 90, ...over });
const ids = (rows: { id: string }[]) => rows.map(r => r.id);

describe('npmRows', () => {
  it('lists advisories and malware newest first, by the later of published and updated', () => {
    const rows = npmRows(DATA, MALWARE);
    expect(ids(rows)).toEqual([
      'GHSA-aaaa-aaaa-aaaa', 'GHSA-eeee-eeee-eeee', 'GHSA-mmmm-mmmm-mmmm', 'GHSA-cccc-cccc-cccc',
      'GHSA-bbbb-bbbb-bbbb', 'GHSA-nnnn-nnnn-nnnn', 'GHSA-dddd-dddd-dddd',
    ]);
  });

  it('groups a malware advisory over its packages and reads it as critical', () => {
    const row = npmRows(DATA, MALWARE).find(r => r.id === 'GHSA-mmmm-mmmm-mmmm')!;
    expect(row).toMatchObject({ kind: 'malware', severity: 'critical', packages: ['evil-pkg', 'evil-pkg-two'], withdrawn: false });
    expect(row.ranges).toEqual([{ package: 'evil-pkg', vulnerable: '>= 0' }, { package: 'evil-pkg-two', vulnerable: '>= 0' }]);
  });

  it('copes with either file missing', () => {
    expect(npmRows(null, null)).toEqual([]);
    expect(npmRows(null, MALWARE).every(r => r.kind === 'malware')).toBe(true);
    expect(npmRows(DATA, null).every(r => r.kind === 'vulnerability')).toBe(true);
  });
});

describe('filterNpmRows', () => {
  const rows = npmRows(DATA, MALWARE);
  const none = new Map();

  it('filters by date range on the later of published and updated', () => {
    expect(ids(filterNpmRows(rows, filters({ days: 7 }), none, NOW))).toEqual(['GHSA-aaaa-aaaa-aaaa', 'GHSA-eeee-eeee-eeee', 'GHSA-mmmm-mmmm-mmmm']);
    expect(ids(filterNpmRows(rows, filters({ days: 30 }), none, NOW))).not.toContain('GHSA-dddd-dddd-dddd');
    expect(ids(filterNpmRows(rows, filters({ days: 30 }), none, NOW))).toContain('GHSA-cccc-cccc-cccc');
  });

  it('filters by severity and type', () => {
    expect(ids(filterNpmRows(rows, filters({ severity: 'critical' }), none, NOW))).toEqual(['GHSA-aaaa-aaaa-aaaa', 'GHSA-eeee-eeee-eeee', 'GHSA-mmmm-mmmm-mmmm', 'GHSA-nnnn-nnnn-nnnn']);
    expect(ids(filterNpmRows(rows, filters({ type: 'malware' }), none, NOW))).toEqual(['GHSA-mmmm-mmmm-mmmm', 'GHSA-nnnn-nnnn-nnnn']);
    expect(filterNpmRows(rows, filters({ type: 'vulnerability' }), none, NOW).every(r => r.kind === 'vulnerability')).toBe(true);
  });

  it('filters by fix, KEV and CVE', () => {
    expect(ids(filterNpmRows(rows, filters({ fix: true }), none, NOW))).toEqual(['GHSA-aaaa-aaaa-aaaa', 'GHSA-eeee-eeee-eeee', 'GHSA-cccc-cccc-cccc', 'GHSA-dddd-dddd-dddd']);
    expect(ids(filterNpmRows(rows, filters({ kev: true }), none, NOW))).toEqual(['GHSA-aaaa-aaaa-aaaa']);
    expect(ids(filterNpmRows(rows, filters({ cve: true }), none, NOW))).toEqual(['GHSA-aaaa-aaaa-aaaa']);
  });

  it('searches package, summary and ids, case-insensitively', () => {
    expect(ids(filterNpmRows(rows, filters({ query: 'MINIMIST' }), none, NOW))).toEqual(['GHSA-dddd-dddd-dddd']);
    expect(ids(filterNpmRows(rows, filters({ query: 'cve-2026-1111' }), none, NOW))).toEqual(['GHSA-aaaa-aaaa-aaaa']);
    expect(ids(filterNpmRows(rows, filters({ query: 'evil-pkg-two' }), none, NOW))).toEqual(['GHSA-mmmm-mmmm-mmmm']);
    expect(ids(filterNpmRows(rows, filters({ query: 'ghsa-bbbb' }), none, NOW))).toEqual(['GHSA-bbbb-bbbb-bbbb']);
  });

  it('filters by one package, case-insensitively', () => {
    expect(ids(filterNpmRows(rows, filters({ pkg: 'QS' }), none, NOW))).toEqual(['GHSA-bbbb-bbbb-bbbb']);
  });

  it('keeps only rows affecting a watched package with "affects my packages"', () => {
    const affecting = new Map([['GHSA-cccc-cccc-cccc', [{ entry: 'express@3.0.0', versioned: true, vulnerable: '< 4.0.0', patched: '4.0.0' }]]]);
    expect(ids(filterNpmRows(rows, filters({ mine: true }), affecting, NOW))).toEqual(['GHSA-cccc-cccc-cccc']);
  });
});

describe('affectingByAdvisory', () => {
  it('maps each listed advisory to the watched entries it affects, with the matched range', () => {
    const results: PackageResult[] = [
      {
        entry: { name: 'lodash', version: '4.17.15' }, status: 'affected', malware: false, malwareCheckedDays: 30, osv: 'off',
        advisories: [{ id: 'GHSA-aaaa-aaaa-aaaa', severity: 'critical', vulnerable: '< 4.17.21', patched: '4.17.21', source: 'ghsa' }],
      },
      {
        entry: { name: 'lodash' }, status: 'no-version', malware: false, malwareCheckedDays: 30, osv: 'off',
        advisories: [{ id: 'GHSA-aaaa-aaaa-aaaa', severity: 'critical', vulnerable: '< 4.17.21', patched: '4.17.21', source: 'ghsa' }],
      },
      { entry: { name: 'left-pad' }, status: 'not-affected', malware: false, malwareCheckedDays: 30, osv: 'off', advisories: [] },
    ];
    const map = affectingByAdvisory(results);
    expect([...map.keys()]).toEqual(['GHSA-aaaa-aaaa-aaaa']);
    expect(map.get('GHSA-aaaa-aaaa-aaaa')).toEqual([
      { entry: 'lodash@4.17.15', versioned: true, vulnerable: '< 4.17.21', patched: '4.17.21' },
      { entry: 'lodash', versioned: false, vulnerable: '< 4.17.21', patched: '4.17.21' },
    ]);
  });
});

describe('npmStats', () => {
  it('counts the last 7 and 30 days, critical and high, malware over 7 days and the top packages, leaving out withdrawn advisories', () => {
    const extra = { ...DATA, recent: [...DATA.recent, advisory('GHSA-ffff-ffff-ffff', { published: daysAgo(5), updated: daysAgo(5) })] };
    const stats = npmStats(npmRows(extra, MALWARE), NOW);
    expect(stats).toEqual({
      last7: 2, // aaaa, ffff (eeee is withdrawn)
      last30: 4, // + bbbb, cccc
      critical30: 1,
      high30: 2,
      malware7: 1,
      topPackages: [['lodash', 2], ['express', 1], ['qs', 1]], // ties by name
    });
  });

  it('caps the top packages at 5', () => {
    const many = { ...DATA, recent: 'abcdefg'.split('').map(c => advisory(`GHSA-${c.repeat(4)}-0000-0000`, { ranges: [{ package: `pkg-${c}`, vulnerable: '< 1.0.0' }] })) };
    expect(npmStats(npmRows(many, null), NOW).topPackages).toHaveLength(5);
  });
});

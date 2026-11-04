import { describe, expect, it } from 'vitest';
import { decodeNpmData, decodeNpmMalware, mergeNpmData, mergeNpmMalware, normalizeGhsaMalware, normalizeGhsaNpm, NpmAdvisory, NpmAdvisoryData, NpmMalwareData, toIndexEntry } from './advisories';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-04T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

// Shaped like GET /advisories?ecosystem=npm&type=reviewed (trimmed)
const ghsaReviewed = {
  ghsa_id: 'GHSA-xq3m-2v4x-88gg',
  cve_id: 'CVE-2026-41242',
  html_url: 'https://github.com/advisories/GHSA-xq3m-2v4x-88gg',
  summary: 'protobufjs has an arbitrary code execution issue',
  description: '## Summary\n\nprotobufjs could execute generated JavaScript code derived from protobuf schema metadata.',
  type: 'reviewed',
  severity: 'critical',
  identifiers: [{ value: 'GHSA-xq3m-2v4x-88gg', type: 'GHSA' }, { value: 'CVE-2026-41242', type: 'CVE' }],
  references: [
    'https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-xq3m-2v4x-88gg',
    'https://nvd.nist.gov/vuln/detail/CVE-2026-41242',
    'javascript:alert(1)',
    'https://github.com/advisories/GHSA-xq3m-2v4x-88gg',
  ],
  published_at: '2026-04-16T22:34:57Z',
  updated_at: '2026-11-04T17:14:43Z',
  withdrawn_at: null,
  vulnerabilities: [
    { package: { ecosystem: 'npm', name: 'protobufjs' }, vulnerable_version_range: '>= 8.0.0, < 8.0.1', first_patched_version: '8.0.1' },
    { package: { ecosystem: 'npm', name: 'protobufjs' }, vulnerable_version_range: '< 6.11.6', first_patched_version: '6.11.6' },
    { package: { ecosystem: 'pip', name: 'protobuf' }, vulnerable_version_range: '< 1.0', first_patched_version: '1.0' },
  ],
  cvss_severities: {
    cvss_v3: { vector_string: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', score: 9.8 },
    cvss_v4: { vector_string: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H', score: 9.4 },
  },
  cwes: [{ cwe_id: 'CWE-94', name: 'Improper Control of Generation of Code' }],
  credits: [{ user: { login: 'cristianstaicu' }, type: 'reporter' }, { user: { login: 'alexander-fenster' }, type: 'remediation_developer' }],
};

// Shaped like GET /advisories?ecosystem=npm&type=malware
const ghsaMalware = {
  ghsa_id: 'GHSA-hvrq-7pvp-2573',
  cve_id: null,
  html_url: 'https://github.com/advisories/GHSA-hvrq-7pvp-2573',
  summary: 'Malware in nminer',
  description: 'Any computer that has this package installed or running should be considered fully compromised.',
  type: 'malware',
  severity: 'critical',
  published_at: '2026-11-04T20:29:43Z',
  updated_at: '2026-11-04T20:29:44Z',
  withdrawn_at: null,
  vulnerabilities: [
    { package: { ecosystem: 'npm', name: 'nminer' }, vulnerable_version_range: '= 3.0.0', first_patched_version: null },
    { package: { ecosystem: 'npm', name: 'nminer-cli' }, vulnerable_version_range: '>= 0', first_patched_version: null },
  ],
  cvss_severities: { cvss_v3: { vector_string: null, score: 0 }, cvss_v4: { vector_string: null, score: 0 } },
  cwes: [{ cwe_id: 'CWE-506', name: 'Embedded Malicious Code' }],
  credits: [],
};

const advisory = (id: string, over: Partial<NpmAdvisory> = {}): NpmAdvisory => ({
  id, cves: [], summary: `Advisory ${id}`, description: '', severity: 'high', cvss: [], cwes: [],
  ranges: [{ package: 'pkg', vulnerable: '< 1.0.0', patched: '1.0.0' }],
  published: daysAgo(1), updated: daysAgo(1), references: [], credits: [], url: `https://github.com/advisories/${id}`,
  ...over,
});

const noScores = new Map<string, { score: number; percentile: number }>();

describe('normalizeGhsaNpm', () => {
  it('normalises a reviewed npm advisory, keeping npm ranges only', () => {
    const a = normalizeGhsaNpm(ghsaReviewed, { 'CWE-94': 'Improper Control of Generation of Code (\'Code Injection\')' });
    expect(a).toEqual({
      id: 'GHSA-xq3m-2v4x-88gg',
      cves: ['CVE-2026-41242'],
      summary: 'protobufjs has an arbitrary code execution issue',
      description: '## Summary\n\nprotobufjs could execute generated JavaScript code derived from protobuf schema metadata.',
      severity: 'critical',
      cvss: [
        { version: '3', score: 9.8, vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' },
        { version: '4', score: 9.4, vector: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H' },
      ],
      cwes: [{ id: 'CWE-94', name: 'Improper Control of Generation of Code (\'Code Injection\')' }],
      ranges: [
        { package: 'protobufjs', vulnerable: '>= 8.0.0, < 8.0.1', patched: '8.0.1' },
        { package: 'protobufjs', vulnerable: '< 6.11.6', patched: '6.11.6' },
      ],
      published: '2026-04-16T22:34:57Z',
      updated: '2026-11-04T17:14:43Z',
      references: [
        'https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-xq3m-2v4x-88gg',
        'https://nvd.nist.gov/vuln/detail/CVE-2026-41242',
      ],
      credits: ['cristianstaicu', 'alexander-fenster'],
      url: 'https://github.com/advisories/GHSA-xq3m-2v4x-88gg',
    });
  });
  it("falls back to GitHub's CWE name", () => {
    expect(normalizeGhsaNpm(ghsaReviewed)?.cwes).toEqual([{ id: 'CWE-94', name: 'Improper Control of Generation of Code' }]);
  });
  it('caps the description at 800 characters', () => {
    const a = normalizeGhsaNpm({ ...ghsaReviewed, description: 'x'.repeat(5000) });
    expect(a?.description.length).toBe(800);
    expect(a?.description.endsWith('…')).toBe(true);
  });
  it('keeps a withdrawn advisory, marked', () => {
    expect(normalizeGhsaNpm({ ...ghsaReviewed, withdrawn_at: '2026-11-01T10:00:00Z' })?.withdrawn).toBe('2026-11-01T10:00:00Z');
  });
  it('keeps a range without a version range as an empty (unparseable) range rather than dropping it', () => {
    const a = normalizeGhsaNpm({ ...ghsaReviewed, vulnerabilities: [{ package: { ecosystem: 'npm', name: 'x' }, vulnerable_version_range: null, first_patched_version: null }] });
    expect(a?.ranges).toEqual([{ package: 'x', vulnerable: '' }]);
  });
  it('rejects advisories without an id, dates or npm ranges', () => {
    expect(normalizeGhsaNpm(null)).toBeNull();
    expect(normalizeGhsaNpm({ ...ghsaReviewed, ghsa_id: 'nope' })).toBeNull();
    expect(normalizeGhsaNpm({ ...ghsaReviewed, published_at: null })).toBeNull();
    expect(normalizeGhsaNpm({ ...ghsaReviewed, vulnerabilities: [ghsaReviewed.vulnerabilities[2]] })).toBeNull();
  });
  it('maps unknown severities to unknown and builds the url when html_url is not GitHub', () => {
    const a = normalizeGhsaNpm({ ...ghsaReviewed, severity: 'urgent', html_url: 'https://evil.example/x' });
    expect(a?.severity).toBe('unknown');
    expect(a?.url).toBe('https://github.com/advisories/GHSA-xq3m-2v4x-88gg');
  });
});

describe('toIndexEntry', () => {
  it('keeps id, severity, ranges as tuples and the withdrawn flag', () => {
    const a = normalizeGhsaNpm(ghsaReviewed)!;
    const ranges = [['protobufjs', '>= 8.0.0, < 8.0.1', '8.0.1'], ['protobufjs', '< 6.11.6', '6.11.6']];
    expect(toIndexEntry(a)).toEqual(['GHSA-xq3m-2v4x-88gg', 'critical', ranges]);
    expect(toIndexEntry({ ...a, withdrawn: '2026-11-01T10:00:00Z' })).toEqual(['GHSA-xq3m-2v4x-88gg', 'critical', ranges, 1]);
  });
  it('leaves the patched version out when there is none', () => {
    expect(toIndexEntry(advisory('GHSA-aaaa-aaaa-aaaa', { ranges: [{ package: 'p', vulnerable: '>= 0' }] }))[2]).toEqual([['p', '>= 0']]);
  });
});

describe('normalizeGhsaMalware', () => {
  it('gives one tuple per npm package', () => {
    expect(normalizeGhsaMalware(ghsaMalware)).toEqual([
      ['GHSA-hvrq-7pvp-2573', 'nminer', '= 3.0.0', '2026-11-04T20:29:43Z'],
      ['GHSA-hvrq-7pvp-2573', 'nminer-cli', '>= 0', '2026-11-04T20:29:43Z'],
    ]);
  });
  it('drops withdrawn and malformed malware advisories', () => {
    expect(normalizeGhsaMalware({ ...ghsaMalware, withdrawn_at: '2026-11-04T21:00:00Z' })).toEqual([]);
    expect(normalizeGhsaMalware({ ...ghsaMalware, published_at: undefined })).toEqual([]);
    expect(normalizeGhsaMalware('nope')).toEqual([]);
  });
});

describe('mergeNpmData', () => {
  const previous = (): NpmAdvisoryData => ({
    version: 1,
    generatedAt: daysAgo(1),
    updatedAt: daysAgo(1),
    recent: [advisory('GHSA-aaaa-aaaa-aaaa', { summary: 'old copy' }), advisory('GHSA-bbbb-bbbb-bbbb')],
    index: [
      toIndexEntry(advisory('GHSA-aaaa-aaaa-aaaa')),
      toIndexEntry(advisory('GHSA-bbbb-bbbb-bbbb')),
      toIndexEntry(advisory('GHSA-oooo-oooo-oooo', { published: daysAgo(900), updated: daysAgo(800) })),
    ],
  });

  it('starts from nothing', () => {
    const d = mergeNpmData(null, [advisory('GHSA-aaaa-aaaa-aaaa')], new Set(), noScores, NOW);
    expect(d.version).toBe(1);
    expect(d.updatedAt).toBe(new Date(NOW).toISOString());
    expect(d.recent.map(a => a.id)).toEqual(['GHSA-aaaa-aaaa-aaaa']);
    expect(d.index.map(e => e[0])).toEqual(['GHSA-aaaa-aaaa-aaaa']);
  });
  it('replaces an updated advisory and keeps every index entry', () => {
    const updated = advisory('GHSA-aaaa-aaaa-aaaa', { summary: 'new copy', severity: 'critical', ranges: [{ package: 'pkg', vulnerable: '< 2.0.0', patched: '2.0.0' }] });
    const d = mergeNpmData(previous(), [updated, advisory('GHSA-cccc-cccc-cccc')], new Set(), noScores, NOW);
    expect(d.recent.filter(a => a.id === 'GHSA-aaaa-aaaa-aaaa')).toHaveLength(1);
    expect(d.recent.find(a => a.id === 'GHSA-aaaa-aaaa-aaaa')?.summary).toBe('new copy');
    expect(d.index.map(e => e[0]).sort()).toEqual(['GHSA-aaaa-aaaa-aaaa', 'GHSA-bbbb-bbbb-bbbb', 'GHSA-cccc-cccc-cccc', 'GHSA-oooo-oooo-oooo']);
    expect(d.index.find(e => e[0] === 'GHSA-aaaa-aaaa-aaaa')).toEqual(['GHSA-aaaa-aaaa-aaaa', 'critical', [['pkg', '< 2.0.0', '2.0.0']]]);
  });
  it('prunes recent to 90 days by the later of published and updated', () => {
    const prev = previous();
    prev.recent.push(
      advisory('GHSA-dddd-dddd-dddd', { published: daysAgo(200), updated: daysAgo(91) }),
      advisory('GHSA-eeee-eeee-eeee', { published: daysAgo(200), updated: daysAgo(10) }),
    );
    const d = mergeNpmData(prev, [], new Set(), noScores, NOW);
    expect(d.recent.map(a => a.id)).not.toContain('GHSA-dddd-dddd-dddd');
    expect(d.recent.map(a => a.id)).toContain('GHSA-eeee-eeee-eeee');
  });
  it('sorts newest first', () => {
    const d = mergeNpmData(null, [advisory('GHSA-old0-old0-old0', { published: daysAgo(5) }), advisory('GHSA-new0-new0-new0', { published: daysAgo(1) })], new Set(), noScores, NOW);
    expect(d.recent.map(a => a.id)).toEqual(['GHSA-new0-new0-new0', 'GHSA-old0-old0-old0']);
  });
  it('keeps a withdrawn advisory marked, in recent and the index', () => {
    const d = mergeNpmData(previous(), [advisory('GHSA-bbbb-bbbb-bbbb', { withdrawn: daysAgo(0) })], new Set(), noScores, NOW);
    expect(d.recent.find(a => a.id === 'GHSA-bbbb-bbbb-bbbb')?.withdrawn).toBe(daysAgo(0));
    expect(d.index.find(e => e[0] === 'GHSA-bbbb-bbbb-bbbb')?.[3]).toBe(1);
  });
  it('applies KEV and EPSS, and keeps the previous EPSS score when there is no new one', () => {
    const prev = previous();
    prev.recent[1] = { ...prev.recent[1], cves: ['CVE-2026-0002'], epss: { score: 0.2, percentile: 0.9 }, kev: true };
    const updated = advisory('GHSA-aaaa-aaaa-aaaa', { cves: ['CVE-2026-0001', 'CVE-2026-0003'] });
    const scores = new Map([['CVE-2026-0001', { score: 0.1, percentile: 0.5 }], ['CVE-2026-0003', { score: 0.7, percentile: 0.99 }]]);
    const d = mergeNpmData(prev, [updated], new Set(['CVE-2026-0003']), scores, NOW);
    const a = d.recent.find(x => x.id === 'GHSA-aaaa-aaaa-aaaa');
    expect(a?.kev).toBe(true);
    expect(a?.epss).toEqual({ score: 0.7, percentile: 0.99 }); // the highest of its CVEs
    const b = d.recent.find(x => x.id === 'GHSA-bbbb-bbbb-bbbb');
    expect(b?.kev).toBeUndefined(); // no longer in the KEV set
    expect(b?.epss).toEqual({ score: 0.2, percentile: 0.9 });
  });
  it('carries the EPSS score of the previous copy over to an updated advisory', () => {
    const prev = previous();
    prev.recent[0] = { ...prev.recent[0], cves: ['CVE-2026-0001'], epss: { score: 0.3, percentile: 0.95 } };
    const d = mergeNpmData(prev, [advisory('GHSA-aaaa-aaaa-aaaa', { cves: ['CVE-2026-0001'] })], new Set(), noScores, NOW);
    expect(d.recent.find(x => x.id === 'GHSA-aaaa-aaaa-aaaa')?.epss).toEqual({ score: 0.3, percentile: 0.95 });
  });
});

describe('mergeNpmMalware', () => {
  const previous = (): NpmMalwareData => ({
    version: 1, generatedAt: daysAgo(1), updatedAt: daysAgo(1),
    entries: [['GHSA-mmmm-mmmm-mmmm', 'evil', '>= 0', daysAgo(2)], ['GHSA-wwww-wwww-wwww', 'fp', '>= 0', daysAgo(3)], ['GHSA-nnnn-nnnn-nnnn', 'old', '>= 0', daysAgo(31)]],
  });
  it('prunes to 30 days by published and sorts newest first', () => {
    const d = mergeNpmMalware(previous(), [['GHSA-zzzz-zzzz-zzzz', 'new', '>= 0', daysAgo(0)], ['GHSA-yyyy-yyyy-yyyy', 'mid', '>= 0', daysAgo(29)]], [], NOW);
    expect(d.entries.map(m => m[0])).toEqual(['GHSA-zzzz-zzzz-zzzz', 'GHSA-mmmm-mmmm-mmmm', 'GHSA-wwww-wwww-wwww', 'GHSA-yyyy-yyyy-yyyy']);
    expect(d.updatedAt).toBe(new Date(NOW).toISOString());
  });
  it('replaces the entries of an advisory fetched again and drops withdrawn ones', () => {
    const d = mergeNpmMalware(previous(), [['GHSA-mmmm-mmmm-mmmm', 'evil', '= 1.0.0', daysAgo(2)]], ['GHSA-wwww-wwww-wwww'], NOW);
    expect(d.entries).toEqual([['GHSA-mmmm-mmmm-mmmm', 'evil', '= 1.0.0', daysAgo(2)]]);
  });
  it('starts from nothing', () => {
    expect(mergeNpmMalware(null, normalizeGhsaMalware(ghsaMalware), [], Date.parse('2026-11-05T00:00:00Z')).entries).toHaveLength(2);
  });
});

describe('decodeNpmMalware', () => {
  const good = (): NpmMalwareData => mergeNpmMalware(null, normalizeGhsaMalware(ghsaMalware), [], Date.parse('2026-11-05T00:00:00Z'));
  it('round-trips a file the job wrote', () => {
    const d = good();
    expect(decodeNpmMalware(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('rejects malformed data and drops malformed entries', () => {
    expect(decodeNpmMalware(null)).toBeNull();
    expect(decodeNpmMalware({ ...good(), version: 2 })).toBeNull();
    expect(decodeNpmMalware({ ...good(), entries: {} })).toBeNull();
    expect(decodeNpmMalware({ ...good(), updatedAt: 'x' })).toBeNull();
    const d = good();
    expect(decodeNpmMalware({ ...d, entries: [...d.entries, ['GHSA-x', 'p', '>= 0'], { id: 1 }, ['GHSA-x', 'p', '>= 0', 'never']] })?.entries).toEqual(d.entries);
  });
  it('is not an npm-advisories.json', () => {
    expect(decodeNpmData(good())).toBeNull();
  });
});

describe('decodeNpmData', () => {
  const good = (): NpmAdvisoryData => mergeNpmData(null, [normalizeGhsaNpm(ghsaReviewed)!], new Set(), noScores, NOW);

  it('round-trips a file the job wrote', () => {
    const d = { ...good(), epssAt: daysAgo(0) };
    expect(decodeNpmData(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('rejects malformed data', () => {
    expect(decodeNpmData(null)).toBeNull();
    expect(decodeNpmData('x')).toBeNull();
    expect(decodeNpmData({ ...good(), version: 2 })).toBeNull();
    expect(decodeNpmData({ ...good(), index: {} })).toBeNull();
    expect(decodeNpmData({ ...good(), recent: 'x' })).toBeNull();
    expect(decodeNpmData({ ...good(), updatedAt: 'yesterday' })).toBeNull();
  });
  it('rejects a file with a malformed index entry, since the index backs "not affected"', () => {
    const d = good();
    expect(decodeNpmData({ ...d, index: [...d.index, ['GHSA-x', 'high', 'not ranges']] })).toBeNull();
    expect(decodeNpmData({ ...d, index: [...d.index, ['GHSA-xxxx-xxxx-xxxx', 'high', [[1, '< 1']]]] })).toBeNull();
    expect(decodeNpmData({ ...d, index: [...d.index, ['GHSA-xxxx-xxxx-xxxx', 'high', [{ package: 'p', vulnerable: '< 1' }]]] })).toBeNull();
  });
  it('drops malformed detail entries', () => {
    const d = good();
    expect(decodeNpmData({ ...d, recent: [...d.recent, { id: 'GHSA-xxxx-xxxx-xxxx' }] })?.recent).toEqual(d.recent);
  });
});

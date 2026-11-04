import { describe, expect, it } from 'vitest';
import type { NpmAdvisory, NpmAdvisoryData, NpmIndexEntry, NpmMalwareData, NpmMalwareTuple } from './advisories';
import { affectingKeys, knownAdvisoryIds, matchPackages } from './match';
import type { OsvResult } from './osv';

const NOW = '2026-11-04T00:00:00Z';

function data(index: NpmIndexEntry[], recent: Partial<NpmAdvisory>[] = []): NpmAdvisoryData {
  return { version: 1, generatedAt: NOW, updatedAt: NOW, recent: recent as NpmAdvisory[], index };
}

function malware(entries: NpmMalwareTuple[]): NpmMalwareData {
  return { version: 1, generatedAt: NOW, updatedAt: NOW, entries };
}

const LODASH: NpmIndexEntry = ['GHSA-aaaa-aaaa-aaaa', 'high', [['lodash', '< 4.17.21', '4.17.21']]];
const LODASH_OLD: NpmIndexEntry = ['GHSA-bbbb-bbbb-bbbb', 'critical', [['lodash', '< 4.17.12', '4.17.12']]];
const MULTI: NpmIndexEntry = ['GHSA-cccc-cccc-cccc', 'medium', [['qs', '< 6.2.4', '6.2.4'], ['qs', '>= 6.3.0, < 6.3.3', '6.3.3']]];

describe('matchPackages', () => {
  it('flags an exact version inside a range and clears one outside it', () => {
    const d = data([LODASH, LODASH_OLD]);
    const [inside] = matchPackages([{ name: 'lodash', version: '4.17.20' }], d, null);
    expect(inside.status).toBe('affected');
    expect(inside.advisories.map(a => a.id)).toEqual(['GHSA-aaaa-aaaa-aaaa']);
    expect(inside.advisories[0]).toMatchObject({ severity: 'high', vulnerable: '< 4.17.21', patched: '4.17.21', source: 'ghsa' });
    expect(inside.highestSeverity).toBe('high');

    const [outside] = matchPackages([{ name: 'lodash', version: '4.17.21' }], d, null);
    expect(outside.status).toBe('not-affected');
    expect(outside.advisories).toEqual([]);
    expect(outside.minSafeVersion).toBeUndefined();
    expect(outside.highestSeverity).toBeUndefined();
  });

  it('uses the range that contains the version when an advisory has several', () => {
    const [r] = matchPackages([{ name: 'qs', version: '6.3.1' }], data([MULTI]), null);
    expect(r.status).toBe('affected');
    expect(r.advisories[0]).toMatchObject({ vulnerable: '>= 6.3.0, < 6.3.3', patched: '6.3.3' });
    expect(matchPackages([{ name: 'qs', version: '6.2.5' }], data([MULTI]), null)[0].status).toBe('not-affected');
  });

  it('gives no-version and lists every advisory on the package when the entry has no version', () => {
    const [r] = matchPackages([{ name: 'lodash' }], data([LODASH, LODASH_OLD, MULTI]), null);
    expect(r.status).toBe('no-version');
    expect(r.advisories.map(a => a.id).sort()).toEqual(['GHSA-aaaa-aaaa-aaaa', 'GHSA-bbbb-bbbb-bbbb']);
    expect(r.highestSeverity).toBe('critical');
    const [qs] = matchPackages([{ name: 'qs' }], data([MULTI]), null);
    expect(qs.advisories[0]).toMatchObject({ vulnerable: '< 6.2.4 || >= 6.3.0, < 6.3.3', patched: '6.3.3' });
  });

  it('reads a package with no advisories at all as not affected even without a version', () => {
    expect(matchPackages([{ name: 'left-pad' }], data([LODASH]), null)[0].status).toBe('not-affected');
  });

  it('gives unknown, never not-affected, when a relevant range cannot be parsed', () => {
    const bad: NpmIndexEntry = ['GHSA-dddd-dddd-dddd', 'low', [['lodash', '~4.17']]];
    const empty: NpmIndexEntry = ['GHSA-eeee-eeee-eeee', 'low', [['lodash', '']]];
    for (const entry of [bad, empty]) {
      const [r] = matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH, entry]), null);
      expect(r.status).toBe('unknown');
      expect(r.advisories).toEqual([expect.objectContaining({ id: entry[0], unparsed: true })]);
    }
    // Something else marks it affected: affected wins, the unreadable one stays listed
    const [r] = matchPackages([{ name: 'lodash', version: '4.17.20' }], data([LODASH, bad]), null);
    expect(r.status).toBe('affected');
    expect(r.advisories.map(a => a.id).sort()).toEqual(['GHSA-aaaa-aaaa-aaaa', 'GHSA-dddd-dddd-dddd']);
    // An unreadable range on another package is not relevant
    const other: NpmIndexEntry = ['GHSA-ffff-ffff-ffff', 'low', [['qs', 'garbage']]];
    expect(matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH, other]), null)[0].status).toBe('not-affected');
  });

  it('gives unknown when the entry version itself cannot be read', () => {
    const [r] = matchPackages([{ name: 'lodash', version: 'latest' }], data([LODASH]), null);
    expect(r.status).toBe('unknown');
    expect(r.advisories.map(a => a.id)).toEqual(['GHSA-aaaa-aaaa-aaaa']);
  });

  it('ignores withdrawn advisories', () => {
    const withdrawn: NpmIndexEntry = ['GHSA-gggg-gggg-gggg', 'critical', [['lodash', '< 5.0.0', '5.0.0']], 1];
    const d = data([withdrawn]);
    expect(matchPackages([{ name: 'lodash', version: '4.17.20' }], d, null)[0].status).toBe('not-affected');
    expect(matchPackages([{ name: 'lodash' }], d, null)[0].status).toBe('not-affected');
    // Also when the withdrawn one has an unreadable range
    const withdrawnBad: NpmIndexEntry = ['GHSA-gggg-gggg-gggg', 'critical', [['lodash', '???']], 1];
    expect(matchPackages([{ name: 'lodash', version: '4.17.20' }], data([withdrawnBad]), null)[0].status).toBe('not-affected');
  });

  it('takes the summary from the detailed list when the advisory is in it', () => {
    const [r] = matchPackages([{ name: 'lodash', version: '4.17.20' }], data([LODASH], [{ id: 'GHSA-aaaa-aaaa-aaaa', summary: 'Prototype pollution' }]), null);
    expect(r.advisories[0].summary).toBe('Prototype pollution');
    const [r2] = matchPackages([{ name: 'lodash', version: '4.17.10' }], data([LODASH, LODASH_OLD]), null);
    expect(r2.advisories.every(a => a.summary === undefined)).toBe(true);
  });

  it('flags malware for a matching version, an unversioned entry and says the window was checked', () => {
    const m = malware([['GHSA-mmmm-mmmm-mmmm', 'evil-pkg', '>= 0', '2026-11-01T00:00:00Z'], ['GHSA-nnnn-nnnn-nnnn', 'hijacked', '= 1.2.4', '2026-11-02T00:00:00Z']]);
    const results = matchPackages([{ name: 'evil-pkg', version: '1.0.0' }, { name: 'evil-pkg' }, { name: 'hijacked', version: '1.2.4' }, { name: 'hijacked', version: '1.2.3' }], data([]), m);
    const by = (name: string, version?: string) => results.find(r => r.entry.name === name && r.entry.version === version)!;
    expect(by('evil-pkg', '1.0.0')).toMatchObject({ status: 'affected', malware: true, highestSeverity: 'critical', malwareCheckedDays: 30 });
    expect(by('evil-pkg', '1.0.0').advisories[0]).toMatchObject({ id: 'GHSA-mmmm-mmmm-mmmm', malware: true, source: 'ghsa', vulnerable: '>= 0' });
    expect(by('evil-pkg', undefined)).toMatchObject({ status: 'no-version', malware: true });
    expect(by('hijacked', '1.2.4')).toMatchObject({ status: 'affected', malware: true });
    expect(by('hijacked', '1.2.3')).toMatchObject({ status: 'not-affected', malware: false, malwareCheckedDays: 30 });
    expect(by('evil-pkg', '1.0.0').minSafeVersion).toBeUndefined();
  });

  it('says malware was not checked when the malware file is not loaded', () => {
    expect(matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH]), null)[0].malwareCheckedDays).toBeNull();
  });

  it('takes the highest patched version as the minimum safe version, none when a fix is missing', () => {
    const [r] = matchPackages([{ name: 'lodash', version: '4.17.10' }], data([LODASH, LODASH_OLD]), null);
    expect(r.minSafeVersion).toBe('4.17.21');
    const [n] = matchPackages([{ name: 'lodash' }], data([LODASH, LODASH_OLD]), null);
    expect(n.minSafeVersion).toBe('4.17.21');
    const unfixed: NpmIndexEntry = ['GHSA-hhhh-hhhh-hhhh', 'low', [['lodash', '< 5.0.0']]];
    expect(matchPackages([{ name: 'lodash', version: '4.17.10' }], data([LODASH, unfixed]), null)[0].minSafeVersion).toBeUndefined();
  });

  it('orders malware first, then by severity, then by name', () => {
    const d = data([
      ['GHSA-1111-1111-1111', 'low', [['a-low', '< 2.0.0', '2.0.0']]],
      ['GHSA-2222-2222-2222', 'critical', [['z-crit', '< 2.0.0', '2.0.0']]],
      ['GHSA-3333-3333-3333', 'critical', [['b-crit', '< 2.0.0', '2.0.0']]],
      ['GHSA-4444-4444-4444', 'medium', [['c-med', '< 2.0.0', '2.0.0']]],
    ]);
    const m = malware([['GHSA-5555-5555-5555', 'y-mal', '>= 0', NOW]]);
    const names = matchPackages(
      ['clean', 'a-low', 'c-med', 'z-crit', 'y-mal', 'b-crit', 'aaa-clean'].map(name => ({ name, version: '1.0.0' })), d, m,
    ).map(r => r.entry.name);
    expect(names).toEqual(['y-mal', 'b-crit', 'z-crit', 'c-med', 'a-low', 'aaa-clean', 'clean']);
  });

  it('returns one result per distinct entry', () => {
    expect(matchPackages([{ name: 'lodash', version: '4.17.20' }, { name: 'lodash', version: '4.17.20' }, { name: 'lodash' }], data([LODASH]), null)).toHaveLength(2);
  });

  describe('with OSV', () => {
    const key = 'lodash@4.17.21';
    it('marks OSV off when no OSV results are given, unavailable when the lookup failed', () => {
      expect(matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH]), null)[0].osv).toBe('off');
      expect(matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH]), null, null)[0].osv).toBe('unavailable');
      expect(matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH]), null, new Map())[0].osv).toBe('unavailable');
    });

    it('adds OSV-only vulnerabilities as affecting and keeps not-affected when OSV agrees', () => {
      const clean = new Map<string, OsvResult>([[key, { vulns: [], complete: true }]]);
      expect(matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH]), null, clean)[0]).toMatchObject({ status: 'not-affected', osv: 'checked' });

      const found = new Map<string, OsvResult>([[key, { complete: true, vulns: [
        { id: 'MAL-2025-1', summary: 'Malicious code in lodash (npm)', severity: 'critical', malware: true, aliases: [], ranges: [{ vulnerable: '= 4.17.21' }] },
        { id: 'OSV-NODETAIL', severity: 'unknown', malware: false, aliases: [], ranges: [] },
      ] }]]);
      const [r] = matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH]), null, found);
      expect(r).toMatchObject({ status: 'affected', malware: true, osv: 'checked', highestSeverity: 'critical' });
      expect(r.advisories.map(a => [a.id, a.source])).toEqual([['MAL-2025-1', 'osv'], ['OSV-NODETAIL', 'osv']]);
    });

    it('does not repeat an advisory already matched, by id or alias, and never revives a withdrawn one', () => {
      const withdrawn: NpmIndexEntry = ['GHSA-gggg-gggg-gggg', 'critical', [['lodash', '< 5.0.0', '5.0.0']], 1];
      const m = malware([['GHSA-mmmm-mmmm-mmmm', 'lodash', '>= 0', NOW]]);
      const osv = new Map<string, OsvResult>([['lodash@4.17.20', { complete: true, vulns: [
        { id: 'GHSA-aaaa-aaaa-aaaa', severity: 'unknown', malware: false, aliases: [], ranges: [] },
        { id: 'GHSA-gggg-gggg-gggg', severity: 'unknown', malware: false, aliases: [], ranges: [] },
        { id: 'MAL-2025-2', severity: 'critical', malware: true, aliases: ['GHSA-mmmm-mmmm-mmmm'], ranges: [] },
      ] }]]);
      const [r] = matchPackages([{ name: 'lodash', version: '4.17.20' }], data([LODASH, withdrawn]), m, osv);
      expect(r.advisories.map(a => [a.id, a.source]).sort()).toEqual([['GHSA-aaaa-aaaa-aaaa', 'ghsa'], ['GHSA-mmmm-mmmm-mmmm', 'ghsa']]);
    });

    it('trusts OSV over our own reading for an indexed advisory it reports as affecting', () => {
      const osv = new Map<string, OsvResult>([['lodash@4.17.21', { complete: true, vulns: [{ id: 'GHSA-aaaa-aaaa-aaaa', severity: 'unknown', malware: false, aliases: [], ranges: [] }] }]]);
      const [r] = matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH]), null, osv);
      expect(r.status).toBe('affected');
      expect(r.advisories[0]).toMatchObject({ id: 'GHSA-aaaa-aaaa-aaaa', source: 'osv', severity: 'high', vulnerable: '< 4.17.21' });
    });

    it('turns unknown into affected when OSV confirms an advisory whose range we could not read', () => {
      const bad: NpmIndexEntry = ['GHSA-dddd-dddd-dddd', 'low', [['lodash', '~4.17']]];
      const osv = new Map<string, OsvResult>([[key, { complete: true, vulns: [{ id: 'GHSA-dddd-dddd-dddd', severity: 'unknown', malware: false, aliases: [], ranges: [] }] }]]);
      const [r] = matchPackages([{ name: 'lodash', version: '4.17.21' }], data([bad]), null, osv);
      expect(r.status).toBe('affected');
      expect(r.advisories).toHaveLength(1);
      expect(r.advisories[0].unparsed).toBeUndefined();
    });

    it('reads an incomplete OSV answer with nothing in it as unavailable', () => {
      const osv = new Map<string, OsvResult>([[key, { vulns: [], complete: false }]]);
      expect(matchPackages([{ name: 'lodash', version: '4.17.21' }], data([LODASH]), null, osv)[0]).toMatchObject({ status: 'not-affected', osv: 'unavailable' });
    });
  });
});

describe('affectingKeys', () => {
  it('keys advisory + package + version, or advisory + package without a version', () => {
    const m = malware([['GHSA-mmmm-mmmm-mmmm', 'evil', '>= 0', NOW]]);
    const bad: NpmIndexEntry = ['GHSA-dddd-dddd-dddd', 'low', [['qs', 'nonsense']]];
    const results = matchPackages(
      [{ name: 'lodash', version: '4.17.20' }, { name: 'lodash', version: '4.17.21' }, { name: 'evil' }, { name: 'qs', version: '1.0.0' }],
      data([LODASH, bad]), m,
    );
    expect(affectingKeys(results).sort()).toEqual([
      'GHSA-aaaa-aaaa-aaaa|lodash@4.17.20',
      'GHSA-dddd-dddd-dddd|qs@1.0.0',
      'GHSA-mmmm-mmmm-mmmm|evil',
    ]);
  });
});

describe('knownAdvisoryIds', () => {
  it('collects index and malware ids', () => {
    const ids = knownAdvisoryIds(data([LODASH]), malware([['GHSA-mmmm-mmmm-mmmm', 'evil', '>= 0', NOW]]));
    expect([...ids].sort()).toEqual(['GHSA-aaaa-aaaa-aaaa', 'GHSA-mmmm-mmmm-mmmm']);
    expect([...knownAdvisoryIds(data([LODASH]), null)]).toEqual(['GHSA-aaaa-aaaa-aaaa']);
  });
});

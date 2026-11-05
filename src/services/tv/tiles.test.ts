import { describe, expect, it } from 'vitest';
import { ghsaUrl, npmTilesForMix, toEngineItems, tilesForBriefing, tilesForFront, tilesForNpm, tilesForRansomware, TvTile } from './tiles';
import { toIndexEntry, type NpmAdvisory, type NpmAdvisoryData, type NpmMalwareData } from '../npm/advisories';
import { matchPackages } from '../npm/match';
import { article } from '../../test/fixtures';
import { Briefing } from '../intelligence/briefing';
import { LeakSiteVictim } from '../../types';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3600e3).toISOString();

const tile = (id: string, weight = 1): TvTile => ({ id, kind: 'story', tone: 'info', source: 's', headline: id, weight });
const victim = (n: number): LeakSiteVictim => ({ id: `v${n}`, victim: `Victim ${n}`, group: 'Akira', discoveredAt: ago(n), sector: 'Health', country: 'SE' });
const ransomNews = (n: number) =>
  article(`n${n}`, { title: `Hospital ${n} hit by ransomware attack`, publishedAt: ago(n) });

describe('tilesForFront', () => {
  it('drops stories older than 24h and leak-site posts', () => {
    const tiles = tilesForFront(
      [
        article('fresh', { title: 'Fresh story about widgets', publishedAt: ago(2) }),
        article('old', { title: 'Old story about gadgets', publishedAt: ago(24 * 8) }),
        article('leak', { title: 'Akira has just published a new victim', publishedAt: ago(1) }),
      ],
      [],
      NOW
    );
    expect(tiles.map(t => t.id)).toEqual(['fresh']);
  });

  it('story tiles carry CVEs, critical and the link for breaking news and QR codes', () => {
    const [t] = tilesForFront(
      [article('crit', { title: 'Zebra firmware overflow disclosed', publishedAt: ago(1), severity: 'critical', cves: ['CVE-2026-1'], url: 'https://x.test/a' })],
      [],
      NOW
    );
    expect(t).toMatchObject({ cves: ['CVE-2026-1'], critical: true, url: 'https://x.test/a' });
  });

  it('widens to 72h, then 7 days, while fewer than 5 stories are fresh', () => {
    const mk = (id: string, h: number) => article(id, { title: `Distinct headline number ${id} about topic ${id}x`, publishedAt: ago(h) });
    expect(tilesForFront([mk('a', 2), mk('b', 30), mk('c', 100)], [], NOW).map(t => t.id).sort()).toEqual(['a', 'b', 'c']);
    expect(tilesForFront([mk('a', 2), mk('b', 30), mk('c', 100), mk('d', 200)], [], NOW).map(t => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('ranks critical above info of the same age', () => {
    const tiles = tilesForFront(
      [
        article('calm', { id: 'calm', title: 'Quarterly widget roundup', publishedAt: ago(3), severity: 'info' }),
        article('crit', { title: 'Zebra firmware overflow disclosed', publishedAt: ago(3), severity: 'critical' }),
      ],
      [],
      NOW
    );
    expect(tiles[0].id).toBe('crit');
    expect(tiles[0].tone).toBe('critical');
  });

  it('strips HTML from summaries', () => {
    const [t] = tilesForFront([article('a', { publishedAt: ago(1), description: '  <p>Hello <b>world</b>&amp;co</p> ' })], [], NOW);
    expect(t.summary).toBe('Hello world&co');
  });
});

describe('tilesForRansomware', () => {
  const kinds = (tiles: TvTile[]) => tiles.map(t => t.kind);

  it('puts a victim at every third position', () => {
    const news = [1, 2, 3, 4, 5, 6].map(ransomNews);
    const victims = [1, 2, 3, 4, 5, 6].map(victim);
    const tiles = tilesForRansomware(news, victims, [], NOW);
    expect(kinds(tiles).slice(0, 9)).toEqual(['story', 'story', 'victim', 'story', 'story', 'victim', 'story', 'story', 'victim']);
    expect(tiles).toHaveLength(12);
  });

  it('is all victims with no news', () => {
    expect(kinds(tilesForRansomware([], [victim(1), victim(2)], [], NOW))).toEqual(['victim', 'victim']);
  });

  it('places a lone victim at position 3', () => {
    const tiles = tilesForRansomware([1, 2, 3, 4].map(ransomNews), [victim(1)], [], NOW);
    expect(kinds(tiles)).toEqual(['story', 'story', 'victim', 'story', 'story']);
  });

  it('formats victim tiles and omits missing parts', () => {
    const full = tilesForRansomware([], [victim(1)], [], NOW)[0];
    expect(full.headline).toBe('Akira listed Victim 1');
    expect(full.summary).toBe('Health · Sweden');
    expect(full.tone).toBe('ransomware');
    const bare = tilesForRansomware([], [{ ...victim(2), sector: undefined, country: undefined }], [], NOW)[0];
    expect(bare.summary).toBeUndefined();
    const noSector = tilesForRansomware([], [{ ...victim(3), sector: undefined }], [], NOW)[0];
    expect(noSector.summary).toBe('Sweden');
  });

  it('caps the total at max', () => {
    expect(tilesForRansomware([], [1, 2, 3, 4].map(victim), [], NOW, 3)).toHaveLength(3);
  });
});

describe('toEngineItems', () => {
  it('keeps ids, order and weights and allows every shape', () => {
    expect(toEngineItems([tile('a', 7), tile('b', 2)])).toEqual([
      { id: 'a', weight: 7, shapes: ['1x1', '2x1', '2x2'] },
      { id: 'b', weight: 2, shapes: ['1x1', '2x1', '2x2'] },
    ]);
  });

  it('returns nothing for no tiles', () => {
    expect(toEngineItems([])).toEqual([]);
  });
});

describe('tilesForBriefing', () => {
  it('words the trend comparison by its direction', () => {
    const trend = (count: number, previous: number) => ({ kind: 'actor', name: `T${count}-${previous}`, count, previous });
    const b = {
      generatedAt: ago(0), windowHours: 24, articleCount: 1, topStories: [], watchlist: [], stack: [], newKev: [],
      ransomware: { count: 0, byGroup: [] }, breaches: [],
      trending: [trend(19, 28), trend(30, 10), trend(5, 5), trend(4, 0)],
      stackVulns: { kev: [], cves: [], advisories: [] },
    } as unknown as Briefing;
    expect(tilesForBriefing(b).map(t => t.summary)).toEqual(['19 articles, down from 28', '30 articles, up from 10', '5 articles', '4 articles']);
  });

  it('makes a kev tile naming the CVE', () => {
    const b = {
      generatedAt: ago(0), windowHours: 24, articleCount: 1, topStories: [], watchlist: [], stack: [],
      newKev: [{ cve: 'CVE-2026-1234', intel: { kev: true, kevName: 'Acme Gateway RCE' }, articles: [] }],
      ransomware: { count: 0, byGroup: [] }, breaches: [], trending: [],
      stackVulns: { kev: [], cves: [], advisories: [] },
    } as Briefing;
    const tiles = tilesForBriefing(b);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].kind).toBe('kev');
    expect(tiles[0].tone).toBe('critical');
    expect(tiles[0].headline).toContain('CVE-2026-1234');
  });
});

describe('tilesForNpm', () => {
  const adv = (id: string, severity: NpmAdvisory['severity'], hoursAgo: number, over: Partial<NpmAdvisory> = {}): NpmAdvisory => ({
    id, cves: [], summary: `Summary of ${id}`, description: '', severity, cvss: [], cwes: [],
    ranges: [{ package: `pkg-${id.slice(5, 9)}`, vulnerable: '< 2.0.0', patched: '2.0.0' }],
    published: ago(hoursAgo), updated: ago(hoursAgo), references: [], credits: [], url: `https://github.com/advisories/${id}`, ...over,
  });
  const npmData = (recent: NpmAdvisory[]): NpmAdvisoryData => ({
    version: 1, generatedAt: ago(0), updatedAt: ago(0), recent,
    index: recent.map(toIndexEntry),
  });
  const ids = (tiles: TvTile[]) => tiles.map(t => t.id);

  it('shows 7 days of critical and high first, then medium, newest first in each; low and older ones are left out', () => {
    const d = npmData([
      adv('GHSA-2222-2222-2222', 'medium', 1),
      adv('GHSA-3333-3333-3333', 'high', 30),
      adv('GHSA-4444-4444-4444', 'critical', 5),
      adv('GHSA-5555-5555-5555', 'low', 2),
      adv('GHSA-6666-6666-6666', 'critical', 24 * 8),
      adv('GHSA-7777-7777-7777', 'medium', 50),
    ]);
    expect(ids(tilesForNpm(d, null, [], NOW))).toEqual(['npm-GHSA-4444-4444-4444', 'npm-GHSA-3333-3333-3333', 'npm-GHSA-2222-2222-2222', 'npm-GHSA-7777-7777-7777']);
    expect(tilesForNpm(d, null, [], NOW, 2)).toHaveLength(2);
  });

  it('leaves out withdrawn advisories', () => {
    const d = npmData([adv('GHSA-2222-2222-2222', 'critical', 1, { withdrawn: ago(0) }), adv('GHSA-3333-3333-3333', 'high', 1)]);
    expect(ids(tilesForNpm(d, null, [], NOW))).toEqual(['npm-GHSA-3333-3333-3333']);
  });

  it('carries severity, packages, the range to the fix, the GHSA and CVE ids, and the advisory as text', () => {
    const d = npmData([adv('GHSA-2222-2222-2222', 'critical', 1, {
      cves: ['CVE-2026-1'], ranges: [{ package: 'left-pad', vulnerable: '< 1.3.0', patched: '1.3.0' }, { package: 'right-pad', vulnerable: '< 2.0.0' }],
    })]);
    const [t] = tilesForNpm(d, null, [], NOW);
    expect(t).toMatchObject({
      kind: 'npm', tone: 'critical', headline: 'Summary of GHSA-2222-2222-2222', time: ago(1),
      url: 'https://github.com/advisories/GHSA-2222-2222-2222',
      npm: { severity: 'critical', packages: ['left-pad', 'right-pad'], vulnerable: '< 1.3.0', patched: '1.3.0', ids: ['GHSA-2222-2222-2222', 'CVE-2026-1'], yours: [] },
    });
  });

  it('adds a "Yours" line only when the advisory affects a watched version, and puts those first at any age and severity', () => {
    const lodash = adv('GHSA-2222-2222-2222', 'low', 24 * 40, { ranges: [{ package: 'lodash', vulnerable: '<= 4.17.22', patched: '4.17.23' }] });
    const d = npmData([adv('GHSA-3333-3333-3333', 'critical', 1), lodash]);
    const affected = matchPackages([{ name: 'lodash', version: '4.17.15' }], d, null);
    const tiles = tilesForNpm(d, null, affected, NOW);
    expect(ids(tiles)).toEqual(['npm-GHSA-2222-2222-2222', 'npm-GHSA-3333-3333-3333']);
    expect(tiles[0].npm?.yours).toEqual(['lodash@4.17.15']);
    expect(tiles[1].npm?.yours).toEqual([]);

    // A version outside the range, or no version at all, is not "yours"
    for (const entry of [{ name: 'lodash', version: '4.17.23' }, { name: 'lodash' }]) {
      const tiles = tilesForNpm(d, null, matchPackages([entry], d, null), NOW);
      expect(ids(tiles)).toEqual(['npm-GHSA-3333-3333-3333']);
    }
  });

  it('adds malware releases only when they affect a watched package, first', () => {
    const d = npmData([adv('GHSA-3333-3333-3333', 'high', 1)]);
    const m: NpmMalwareData = { version: 1, generatedAt: ago(0), updatedAt: ago(0), entries: [
      ['GHSA-4444-4444-4444', 'evil-pkg', '>= 0', ago(3)],
      ['GHSA-5555-5555-5555', 'other-evil', '>= 0', ago(2)],
    ] };
    const results = matchPackages([{ name: 'evil-pkg', version: '1.0.0' }], d, m);
    const tiles = tilesForNpm(d, m, results, NOW);
    expect(ids(tiles)).toEqual(['npm-GHSA-4444-4444-4444', 'npm-GHSA-3333-3333-3333']);
    expect(tiles[0]).toMatchObject({ tone: 'critical', time: ago(3), npm: { severity: 'malware', packages: ['evil-pkg'], yours: ['evil-pkg@1.0.0'] } });
  });

  it('gives one tile per advisory id when the malware list and the advisories share one', () => {
    const shared = adv('GHSA-4444-4444-4444', 'critical', 1, { ranges: [{ package: 'evil-pkg', vulnerable: '>= 0' }] });
    const d = npmData([shared]);
    const m: NpmMalwareData = { version: 1, generatedAt: ago(0), updatedAt: ago(0), entries: [['GHSA-4444-4444-4444', 'evil-pkg', '>= 0', ago(1)]] };
    const tiles = tilesForNpm(d, m, matchPackages([{ name: 'evil-pkg', version: '1.0.0' }], d, m), NOW);
    expect(ids(tiles)).toEqual(['npm-GHSA-4444-4444-4444']);
    expect(npmTilesForMix(d, m, matchPackages([{ name: 'evil-pkg', version: '1.0.0' }], d, m), NOW)).toHaveLength(1);
  });

  it('links the QR code to the GitHub advisory only for a valid GHSA id', () => {
    expect(ghsaUrl('GHSA-cfgh-jmpq-rvwx')).toBe('https://github.com/advisories/GHSA-cfgh-jmpq-rvwx');
    for (const bad of ['GHSA-aaaa-aaaa-aaaa', 'GHSA-2222-2222', 'GHSA-2222-2222-2222/../x', 'javascript:alert(1)', '']) expect(ghsaUrl(bad)).toBeUndefined();
    const d = npmData([adv('GHSA-2222-2222-2222', 'critical', 1), adv('GHSA-0000-0000-0000', 'critical', 2)]);
    const tiles = tilesForNpm(d, null, [], NOW);
    expect(tiles.map(t => t.url)).toEqual(['https://github.com/advisories/GHSA-2222-2222-2222', undefined]);
  });

  it('mixed mode takes critical and high from the last 48 hours plus anything affecting a watched package', () => {
    const old = adv('GHSA-2222-2222-2222', 'medium', 24 * 40, { ranges: [{ package: 'lodash', vulnerable: '<= 4.17.22', patched: '4.17.23' }] });
    const d = npmData([adv('GHSA-3333-3333-3333', 'critical', 10), adv('GHSA-4444-4444-4444', 'high', 60), adv('GHSA-5555-5555-5555', 'medium', 1), old]);
    const results = matchPackages([{ name: 'lodash', version: '4.17.15' }], d, null);
    expect(ids(npmTilesForMix(d, null, results, NOW))).toEqual(['npm-GHSA-2222-2222-2222', 'npm-GHSA-3333-3333-3333']);
  });
});

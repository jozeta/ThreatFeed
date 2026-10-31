import { describe, expect, it } from 'vitest';
import { toEngineItems, tilesForBriefing, tilesForFront, tilesForRansomware, TvTile } from './tiles';
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

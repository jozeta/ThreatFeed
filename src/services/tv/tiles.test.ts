import { describe, expect, it } from 'vitest';
import { chunkSets, tilesForBriefing, tilesForFront, tilesForRansomware, TvTile } from './tiles';
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
        article('old', { title: 'Old story about gadgets', publishedAt: ago(25) }),
        article('leak', { title: 'Akira has just published a new victim', publishedAt: ago(1) }),
      ],
      [],
      NOW
    );
    expect(tiles.map(t => t.id)).toEqual(['fresh']);
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

describe('chunkSets', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => tile(`t${i}`, i));

  it('chunks 14 into 6, 6, 2 with full-width rows at the end', () => {
    const sets = chunkSets(mk(14));
    expect(sets.map(s => s.tiles.length)).toEqual([6, 6, 2]);
    expect(sets[2].tiles.map(t => ({ col: t.col, row: t.row }))).toEqual([{ col: 3, row: 1 }, { col: 3, row: 1 }]);
  });

  it('gives only the heaviest of 5 a double width', () => {
    const [set] = chunkSets(mk(5));
    expect(set.tiles.filter(t => t.col === 2).map(t => t.id)).toEqual(['t4']);
  });

  it('spans two heaviest of 4', () => {
    const [set] = chunkSets(mk(4));
    expect(set.tiles.filter(t => t.col === 2).map(t => t.id)).toEqual(['t2', 't3']);
  });

  it('makes tall columns of 3 and a full screen of 1', () => {
    expect(chunkSets(mk(3))[0].tiles.every(t => t.col === 1 && t.row === 2)).toBe(true);
    expect(chunkSets(mk(1))[0].tiles[0]).toMatchObject({ col: 3, row: 2 });
  });

  it('returns nothing for no tiles and always fills six cells', () => {
    expect(chunkSets([])).toEqual([]);
    for (let n = 1; n <= 6; n++) {
      expect(chunkSets(mk(n))[0].tiles.reduce((s, t) => s + t.col * t.row, 0)).toBe(6);
    }
  });
});

describe('tilesForBriefing', () => {
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

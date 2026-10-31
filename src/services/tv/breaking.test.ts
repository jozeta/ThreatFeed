import { describe, expect, it } from 'vitest';
import { findBreaking, kevAddedMap } from './breaking';
import { TvTile } from './tiles';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const MIN = 60 * 1000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const tile = (over: Partial<TvTile>): TvTile => ({
  id: 'a1', kind: 'story', tone: 'info', source: 'Src', time: iso(10 * MIN), headline: 'H', weight: 1, ...over,
});
const none = new Map<string, string>();

describe('findBreaking', () => {
  it('a critical story 10 minutes old that was not seen is breaking', () => {
    expect(findBreaking([tile({ critical: true })], new Set(), none, NOW).map(t => t.id)).toEqual(['a1']);
  });
  it('a seen story is not', () => {
    expect(findBreaking([tile({ critical: true })], new Set(['a1']), none, NOW)).toEqual([]);
  });
  it('a story 2 hours old is not', () => {
    expect(findBreaking([tile({ critical: true, time: iso(120 * MIN) })], new Set(), none, NOW)).toEqual([]);
  });
  it('a story without a time is not', () => {
    expect(findBreaking([tile({ critical: true, time: undefined })], new Set(), none, NOW)).toEqual([]);
  });
  it('victims never are', () => {
    expect(findBreaking([tile({ kind: 'victim', critical: true })], new Set(), none, NOW)).toEqual([]);
  });
  it('a non-critical story about a CVE added to KEV 3 hours ago is; 3 days ago is not', () => {
    const t = tile({ critical: false, cves: ['CVE-2026-1'] });
    expect(findBreaking([t], new Set(), new Map([['CVE-2026-1', iso(180 * MIN)]]), NOW).map(x => x.id)).toEqual(['a1']);
    expect(findBreaking([t], new Set(), new Map([['CVE-2026-1', iso(3 * 24 * 60 * MIN)]]), NOW)).toEqual([]);
    expect(findBreaking([t], new Set(), none, NOW)).toEqual([]);
  });
  it('a plain non-critical story is not', () => {
    expect(findBreaking([tile({})], new Set(), none, NOW)).toEqual([]);
  });
  it('lists newest first', () => {
    const tiles = [tile({ id: 'old', critical: true, time: iso(40 * MIN) }), tile({ id: 'new', critical: true, time: iso(5 * MIN) })];
    expect(findBreaking(tiles, new Set(), none, NOW).map(t => t.id)).toEqual(['new', 'old']);
  });
  it("Briefing's KEV tiles count while their dateAdded (a day) is within 24 hours", () => {
    const kev = (date: string) => tile({ id: 'kev-CVE-2026-2', kind: 'kev', time: date, cves: ['CVE-2026-2'], critical: false });
    const added = (date: string) => new Map([['CVE-2026-2', date]]);
    expect(findBreaking([kev('2026-10-31')], new Set(), added('2026-10-31'), NOW)).toHaveLength(1);
    expect(findBreaking([kev('2026-10-28')], new Set(), added('2026-10-28'), NOW)).toEqual([]);
  });
});

describe('kevAddedMap', () => {
  it('merges the KEV catalog and per-CVE intel', () => {
    const m = kevAddedMap(
      { kev: [{ cve: 'CVE-1', dateAdded: '2026-10-30' }] },
      { 'CVE-2': { kev: true, kevDateAdded: '2026-10-31' }, 'CVE-3': { kev: false } }
    );
    expect(m.get('CVE-1')).toBe('2026-10-30');
    expect(m.get('CVE-2')).toBe('2026-10-31');
    expect(m.has('CVE-3')).toBe(false);
  });
  it('copes with missing data', () => {
    expect(kevAddedMap(null, undefined).size).toBe(0);
  });
});

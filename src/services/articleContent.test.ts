import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearArticleContentCache, loadArticleContent, shardDay } from './articleContent';

const shard = (day: string, content: Record<string, string>) => ({ version: 1, day, content });

describe('shardDay', () => {
  it('gives the UTC day of an ISO date', () => {
    expect(shardDay('2026-11-04T09:30:00.000Z')).toBe('2026-11-04');
  });

  it('converts an offset date to its UTC day', () => {
    expect(shardDay('2026-11-04T01:30:00+02:00')).toBe('2026-11-03');
    expect(shardDay('Tue, 03 Nov 2026 23:30:00 -0200')).toBe('2026-11-04');
  });

  it('returns null for an invalid date', () => {
    expect(shardDay('not a date')).toBeNull();
    expect(shardDay('')).toBeNull();
  });
});

describe('loadArticleContent', () => {
  beforeEach(() => clearArticleContentCache());

  it('reads content from old snapshots and stored articles without fetching', async () => {
    const fetchJson = vi.fn();
    expect(await loadArticleContent({ id: 'a', publishedAt: '2026-11-04T09:00:00Z', content: '<p>Stored</p>' }, fetchJson)).toBe('<p>Stored</p>');
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('fetches the day file once for two articles of the same day', async () => {
    const fetchJson = vi.fn(async () => shard('2026-11-04', { a: '<p>A</p>', b: '<p>B</p>' }));
    const [a, b] = await Promise.all([
      loadArticleContent({ id: 'a', publishedAt: '2026-11-04T09:00:00Z' }, fetchJson),
      loadArticleContent({ id: 'b', publishedAt: '2026-11-04T18:00:00Z' }, fetchJson),
    ]);
    expect([a, b]).toEqual(['<p>A</p>', '<p>B</p>']);
    expect(await loadArticleContent({ id: 'a', publishedAt: '2026-11-04T09:00:00Z' }, fetchJson)).toBe('<p>A</p>');
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson).toHaveBeenCalledWith(expect.stringMatching(/data\/content\/2026-11-04\.json$/));
  });

  it('falls back to the description when the shard is missing', async () => {
    // A 404 (fetchJson gives null), an id the shard lacks, a malformed file and a network error all give null
    expect(await loadArticleContent({ id: 'a', publishedAt: '2026-10-01T09:00:00Z' }, async () => null)).toBeNull();
    expect(await loadArticleContent({ id: 'x', publishedAt: '2026-10-02T09:00:00Z' }, async () => shard('2026-10-02', { a: '<p>A</p>' }))).toBeNull();
    expect(await loadArticleContent({ id: 'a', publishedAt: '2026-10-03T09:00:00Z' }, async () => ({ version: 1, content: 'nope' }))).toBeNull();
    expect(await loadArticleContent({ id: 'a', publishedAt: '2026-10-04T09:00:00Z' }, async () => { throw new Error('offline'); })).toBeNull();
    expect(await loadArticleContent({ id: 'a', publishedAt: 'garbage' }, vi.fn())).toBeNull();
  });

  it('retries a day file whose load failed', async () => {
    const fetchJson = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(shard('2026-11-04', { a: '<p>A</p>' }));
    const a = { id: 'a', publishedAt: '2026-11-04T09:00:00Z' };
    expect(await loadArticleContent(a, fetchJson)).toBeNull();
    expect(await loadArticleContent(a, fetchJson)).toBe('<p>A</p>');
  });

  it('re-reads a cached day file once for an id it lacks (the shard is rebuilt every run)', async () => {
    const fetchJson = vi.fn()
      .mockResolvedValueOnce(shard('2026-11-04', { a: '<p>A</p>' }))
      .mockResolvedValueOnce(shard('2026-11-04', { a: '<p>A</p>', b: '<p>B</p>' }));
    expect(await loadArticleContent({ id: 'a', publishedAt: '2026-11-04T09:00:00Z' }, fetchJson)).toBe('<p>A</p>');
    expect(await loadArticleContent({ id: 'b', publishedAt: '2026-11-04T10:00:00Z' }, fetchJson)).toBe('<p>B</p>');
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });
});

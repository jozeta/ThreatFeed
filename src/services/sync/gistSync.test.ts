import { describe, expect, it } from 'vitest';
import { mergeSyncData } from './gistSync';
import { article, feed } from '../../test/fixtures';

const data = (overrides: any) => ({ version: '1.1', exportDate: '', feeds: [], articleStates: [], bookmarkedArticles: [], settings: null, ...overrides });

describe('mergeSyncData', () => {
  it('takes the most recently changed state per article, including un-bookmarking', () => {
    const local = data({ articleStates: [
      { id: 'a', read: true, viewed: true, bookmarked: false, updatedAt: '2026-10-28T10:00:00Z' }, // un-bookmarked later
      { id: 'b', read: false, viewed: false, bookmarked: false, updatedAt: '2026-10-01T00:00:00Z' },
    ] });
    const remote = data({ articleStates: [
      { id: 'a', read: true, viewed: true, bookmarked: true, bookmarkedAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' },
      { id: 'b', read: true, viewed: true, bookmarked: false, readAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' },
      { id: 'c', read: true, viewed: false, bookmarked: false, updatedAt: '2026-10-20T00:00:00Z' },
    ] });
    const merged = mergeSyncData(local, remote);
    const byId = Object.fromEntries(merged.articleStates.map(s => [s.id, s]));
    expect(byId.a.bookmarked).toBe(false);
    expect(byId.b.read).toBe(true);
    expect(byId.c).toBeDefined();
  });

  it('unions feeds, bookmarked articles and keyword lists', () => {
    const local = data({ feeds: [feed({ id: 'x' })], bookmarkedArticles: [article('1')], settings: { watchlistKeywords: ['LockBit'], stackKeywords: [], mutedKeywords: [], savedSearches: [], bookmarkFolders: ['General'] } });
    const remote = data({ feeds: [feed({ id: 'x', name: 'Renamed' }), feed({ id: 'y' })], bookmarkedArticles: [article('2')], settings: { watchlistKeywords: ['Akira'], stackKeywords: ['Okta'] } });
    const merged = mergeSyncData(local as any, remote);
    expect(merged.feeds.map(f => f.id)).toEqual(['x', 'y']);
    expect(merged.feeds[0].name).toBe('Test Feed'); // local wins on conflict
    expect(merged.bookmarkedArticles.map(a => a.id)).toEqual(['1', '2']);
    expect(merged.settings!.watchlistKeywords).toEqual(['LockBit', 'Akira']);
    expect(merged.settings!.stackKeywords).toEqual(['Okta']);
  });
});

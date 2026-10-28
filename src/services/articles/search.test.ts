import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchScores } from './search';
import { filterAndSortArticles } from './filterSort';
import { article, feed } from '../../test/fixtures';

const filters = {
  searchQuery: '', selectedCategory: null, selectedSourceId: null, selectedTag: null, readStatus: 'all',
  viewedStatus: 'all', bookmarkedOnly: false, dateRange: 'all', sortBy: 'newest',
} as const;

const arts = [
  article('a', { title: 'Ransomware gang hits hospital', publishedAt: '2026-10-27T00:00:00Z' }),
  article('b', { title: 'FortiGate flaw exploited', cves: ['CVE-2026-1234'], publishedAt: '2026-10-28T00:00:00Z' }),
  article('c', { title: 'Weekly deals on headphones', sourceId: 'deals', publishedAt: '2026-10-26T00:00:00Z' }),
];

describe('search', () => {
  const index = buildSearchIndex(arts);
  it('matches prefixes, typos and CVE ids', () => {
    expect([...searchScores(index, 'ransomwar').keys()]).toEqual(['a']);
    expect([...searchScores(index, 'fortigte').keys()]).toEqual(['b']);
    expect([...searchScores(index, 'CVE-2026-1234').keys()]).toEqual(['b']);
  });

  it('feeds relevance into filtering and sorting', () => {
    const scores = searchScores(index, 'flaw');
    const out = filterAndSortArticles(arts, { ...filters, searchQuery: 'flaw', sortBy: 'relevance' }, false, [], [], { searchScores: scores });
    expect(out.map(a => a.id)).toEqual(['b']);
  });
});

describe('mute rules and hidden categories', () => {
  it('hides muted keywords except bookmarks', () => {
    const withBookmark = [...arts, article('d', { title: 'Deals roundup', bookmarked: true })];
    const out = filterAndSortArticles(withBookmark, filters, false, [], [], { mutedKeywords: ['deals'] });
    expect(out.map(a => a.id).sort()).toEqual(['a', 'b', 'd']);
  });

  it('hides categories from the front page', () => {
    const feeds = [feed({ id: 'deals', category: 'Consumer Tech' }), feed({ id: 'test-feed', category: 'Security News' })];
    const out = filterAndSortArticles(arts, filters, false, feeds, [], { hiddenCategories: ['Consumer Tech'] });
    expect(out.map(a => a.id)).not.toContain('c');
  });
});

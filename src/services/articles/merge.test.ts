import { describe, expect, it } from 'vitest';
import { mergeFetchedArticles } from './merge';
import { deduplicateArticles } from './deduplication';
import { article } from '../../test/fixtures';

describe('mergeFetchedArticles', () => {
  const existing = [
    article('a', { title: 'Old title for A', read: true, bookmarked: true, bookmarkFolder: 'IR', bookmarkNotes: 'note', customTags: ['x'] }),
    article('b', { title: 'Fortinet patches critical FortiOS flaw today', bookmarked: true }),
  ];
  const fetched = [
    article('a', { title: 'New title for A' }),
    article('c', { title: 'Fortinet patches critical FortiOS flaw today!' }),
    article('d', { title: 'Brand new story' }),
  ];
  const merged = mergeFetchedArticles(existing, fetched, 30);

  it('keeps user state on re-fetched articles and takes fresh content', () => {
    const a = merged.find(x => x.id === 'a')!;
    expect(a).toMatchObject({ read: true, bookmarked: true, bookmarkFolder: 'IR', bookmarkNotes: 'note', customTags: ['x'], title: 'New title for A' });
  });

  it('keeps the existing article over a new near-duplicate', () => {
    expect(merged.map(x => x.id)).toContain('b');
    expect(merged.map(x => x.id)).not.toContain('c');
    expect(merged.map(x => x.id)).toContain('d');
  });

  it('prunes expired articles except bookmarks', () => {
    const old = article('e', { publishedAt: '2020-01-01T00:00:00Z' });
    const oldBookmark = article('f', { publishedAt: '2020-01-01T00:00:00Z', bookmarked: true });
    expect(mergeFetchedArticles([old, oldBookmark], [], 30).map(a => a.id)).toEqual(['f']);
  });
});

describe('deduplicateArticles', () => {
  it('drops near-identical titles within 48h only', () => {
    const t = Date.parse('2026-10-27T23:00:00Z');
    const at = (h: number) => new Date(t + h * 3600e3).toISOString();
    const kept = deduplicateArticles([
      article('a', { title: 'Fortinet patches critical FortiOS zero-day flaw', publishedAt: at(0) }),
      article('b', { title: 'Fortinet patches critical FortiOS zero-day flaw!', publishedAt: at(47) }),
      article('c', { title: 'Fortinet patches critical FortiOS zero-day flaw', publishedAt: at(49) }),
      article('g', { title: 'other', url: 'https://example.com/a', publishedAt: at(0) }),
    ]);
    expect(kept.map(a => a.id)).toEqual(['a', 'c']);
  });
});

import { describe, expect, it } from 'vitest';
import { applyMergeResult, bookmarksMissingText, findDemoBookmarks, keepBookmarkText, mergeFetchedArticles } from './merge';
import { deduplicateArticles } from './deduplication';
import { article } from '../../test/fixtures';
import type { Article } from '../../types';

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

  it('keeps the stored text of a bookmark when the fresh copy has none, and only of a bookmark', () => {
    const stored = [article('g', { bookmarked: true, content: '<p>Kept</p>' }), article('h', { content: '<p>Old</p>' })];
    const fresh = [article('g', { content: undefined }), article('h', { content: undefined })];
    const result = mergeFetchedArticles(stored, fresh, 30);
    expect(result.find(x => x.id === 'g')!.content).toBe('<p>Kept</p>');
    expect(result.find(x => x.id === 'h')!.content).toBeUndefined();
    expect(mergeFetchedArticles(stored, [article('g', { content: '<p>New</p>' })], 30).find(x => x.id === 'g')!.content).toBe('<p>New</p>');
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

describe('mergeFetchedArticles first-seen time', () => {
  it('re-fetching an existing article keeps the original fetchedAt; new ones keep their own', () => {
    const old = article('a', { fetchedAt: '2026-11-04T08:00:00.000Z' });
    const refetched = article('a', { fetchedAt: '2026-11-04T17:55:00.000Z' });
    const fresh = article('b', { title: 'Something else entirely', fetchedAt: '2026-11-04T17:55:00.000Z' });
    const out = mergeFetchedArticles([old], [refetched, fresh], 0);
    expect(out.find((x) => x.id === 'a')!.fetchedAt).toBe('2026-11-04T08:00:00.000Z');
    expect(out.find((x) => x.id === 'b')!.fetchedAt).toBe('2026-11-04T17:55:00.000Z');
  });
});

describe('mergeFetchedArticles with articles of turned-off categories', () => {
  it('lets a shown copy win the near-duplicate check over a hidden earlier one', () => {
    const hidden = article('h', { sourceId: 'off-feed', title: 'Fortinet patches critical FortiOS flaw today' });
    const fresh = article('s', { sourceId: 'on-feed', title: 'Fortinet patches critical FortiOS flaw today!' });
    const shown = (a: Article) => a.sourceId !== 'off-feed';
    expect(mergeFetchedArticles([hidden], [fresh], 30).map(a => a.id)).toEqual(['h']); // without the predicate the earlier copy wins
    const merged = mergeFetchedArticles([hidden, article('k', { sourceId: 'off-feed', title: 'Unrelated hidden story' })], [fresh], 30, shown);
    expect(merged.map(a => a.id)).toEqual(['k', 's']);
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

describe('findDemoBookmarks', () => {
  it('only picks seeded bookmarks the user never touched', () => {
    const articles = [
      article('seed-demo', { bookmarked: true }), // seeded, no state record -> demo
      article('seed-mine', { bookmarked: true }), // seeded, but the user bookmarked it -> keep
      article('seed-unbookmarked'), // seeded, not bookmarked
      article('real', { bookmarked: true }), // not a seed
    ];
    const seedIds = new Set(['seed-demo', 'seed-mine', 'seed-unbookmarked']);
    const stateIds = new Set(['seed-mine', 'real']);
    expect(findDemoBookmarks(articles, seedIds, stateIds).map(a => a.id)).toEqual(['seed-demo']);
  });
});

describe('mergeFetchedArticles bookmark priority', () => {
  it('keeps a bookmarked later copy of a near-identical non-Latin title', () => {
    const title = 'Критическая уязвимость в Fortinet позволяет удалённо выполнить код';
    const now = Date.now();
    const first = article('first', { title, publishedAt: new Date(now - 3600_000).toISOString() });
    const later = article('later', { title, bookmarked: true, publishedAt: new Date(now - 1800_000).toISOString() });
    const merged = mergeFetchedArticles([first, later], [], 30);
    expect(merged.map(x => x.id)).toContain('later');
    expect(merged.map(x => x.id)).not.toContain('first');
  });
});

describe('applyMergeResult', () => {
  // The merge ran on `before`; the user toggled state in between, giving `current`
  const before = [article('a', { title: 'A' }), article('b', { title: 'B' }), article('gone', { title: 'Gone' })];
  const fetched = [article('a', { title: 'A updated' }), article('n', { title: 'New one' })];
  const merged = mergeFetchedArticles(before, fetched, 30);
  const current = [
    { ...before[0], read: true, bookmarked: true, bookmarkFolder: 'IR' },
    { ...before[1], read: true, content: '<p>stored</p>' },
  ];
  const result = applyMergeResult(merged, current, new Set(fetched.map(x => x.id)));

  it('keeps the merge order and adds the fetched articles', () => {
    expect(result.map(x => x.id)).toEqual(['a', 'b', 'n']);
  });

  it('takes fresh content for fetched articles but the user state toggled in between', () => {
    expect(result[0]).toMatchObject({ title: 'A updated', read: true, bookmarked: true, bookmarkFolder: 'IR' });
  });

  it('takes articles that were not fetched as they are now', () => {
    expect(result[1]).toBe(current[1]);
  });

  it('does not bring back an article removed in between', () => {
    expect(result.map(x => x.id)).not.toContain('gone');
  });

  it('matches merging into the current list directly', () => {
    expect(result).toEqual(mergeFetchedArticles(current, fetched, 30));
  });
});

describe('keepBookmarkText', () => {
  it('keeps the stored text of a bookmark when the incoming copy has none', () => {
    const incoming = article('a', { content: undefined });
    expect(keepBookmarkText(incoming, { content: '<p>Kept</p>' }, true).content).toBe('<p>Kept</p>');
  });

  it('takes the incoming copy when it has text, the article isn\'t bookmarked or nothing is stored', () => {
    expect(keepBookmarkText(article('a', { content: '<p>New</p>' }), { content: '<p>Old</p>' }, true).content).toBe('<p>New</p>');
    expect(keepBookmarkText(article('a', { content: undefined }), { content: '<p>Old</p>' }, false).content).toBeUndefined();
    expect(keepBookmarkText(article('a', { content: undefined }), undefined, true).content).toBeUndefined();
  });
});

describe('bookmarksMissingText', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  it('lists bookmarks without text published within the window, newest first', () => {
    const list = [
      article('old', { bookmarked: true, content: undefined, publishedAt: '2026-10-01T00:00:00Z' }),
      article('recent', { bookmarked: true, content: undefined, publishedAt: '2026-11-01T00:00:00Z' }),
      article('newest', { bookmarked: true, content: undefined, publishedAt: '2026-11-04T08:00:00Z' }),
      article('has-text', { bookmarked: true, content: '<p>x</p>', publishedAt: '2026-11-03T00:00:00Z' }),
      article('not-bookmarked', { bookmarked: false, content: undefined, publishedAt: '2026-11-03T00:00:00Z' }),
      article('bad-date', { bookmarked: true, content: undefined, publishedAt: 'garbage' }),
    ];
    expect(bookmarksMissingText(list, now, 30).map(a => a.id)).toEqual(['newest', 'recent']);
  });
});

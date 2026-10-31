import type { Article, Feed } from '../../types';

// Categories the user turned off are removed from the whole app. Bookmarks stay, and so do
// articles whose feed is gone (nothing to say which category they were in).
export function withoutDisabledCategories(articles: Article[], feeds: Feed[], disabled: string[]): Article[] {
  if (disabled.length === 0) return articles;
  const off = new Set(disabled);
  const categoryOf = new Map(feeds.map(f => [f.id, f.category]));
  return articles.filter(a => a.bookmarked || !off.has(categoryOf.get(a.sourceId) ?? ''));
}

export function feedsInUse(feeds: Feed[], disabled: string[]): Feed[] {
  if (disabled.length === 0) return feeds;
  const off = new Set(disabled);
  return feeds.filter(f => !off.has(f.category));
}

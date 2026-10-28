import { Article } from '../../types';
import { deduplicateArticles } from './deduplication';

// Fields owned by the user rather than the feed; a re-fetched copy must never reset them.
const USER_STATE_KEYS = [
  'read',
  'viewed',
  'bookmarked',
  'readAt',
  'viewedAt',
  'bookmarkedAt',
  'customTags',
  'bookmarkFolder',
  'bookmarkNotes',
] as const;

function withUserState(fresh: Article, existing: Article): Article {
  const merged: Article = { ...fresh };
  for (const key of USER_STATE_KEYS) {
    (merged as any)[key] = existing[key];
  }
  return merged;
}

/**
 * Seed articles that earlier versions shipped pre-bookmarked as a demo. A bookmark the user made always
 * has an article state record (written by updateArticleStateInDB); a seeded one doesn't.
 */
export function findDemoBookmarks(articles: Article[], seedIds: Set<string>, stateIds: Set<string>): Article[] {
  return articles.filter(a => a.bookmarked && seedIds.has(a.id) && !stateIds.has(a.id));
}

export function isExpired(article: Article, maxAgeDays: number): boolean {
  if (maxAgeDays <= 0) return false;
  const t = new Date(article.publishedAt).getTime();
  return !isNaN(t) && t < Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * Merges freshly fetched articles into the current list.
 * - Articles already present take the fresh feed content but keep their user state.
 * - Existing articles come first, so when a new item is a near-duplicate of one the user
 *   already has (possibly read or bookmarked), the existing one is kept.
 * - Articles older than maxAgeDays are dropped unless bookmarked.
 */
export function mergeFetchedArticles(
  existing: Article[],
  fetched: Article[],
  maxAgeDays: number
): Article[] {
  const fetchedById = new Map(fetched.map(a => [a.id, a]));

  const merged = existing.map(old => {
    const fresh = fetchedById.get(old.id);
    if (!fresh) return old;
    fetchedById.delete(old.id);
    return withUserState(fresh, old);
  });
  merged.push(...fetchedById.values());

  return deduplicateArticles(merged).filter(a => a.bookmarked || !isExpired(a, maxAgeDays));
}

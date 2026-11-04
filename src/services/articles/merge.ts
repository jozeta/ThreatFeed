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
  // fetchedAt means "first seen on this device" (new-since-last-visit); a re-fetch must not reset it
  if (existing.fetchedAt) merged.fetchedAt = existing.fetchedAt;
  // Snapshot copies carry no text (it ships in content shards); a bookmark keeps the text stored with it
  if (!merged.content && existing.bookmarked && existing.content) merged.content = existing.content;
  return merged;
}

/**
 * Applies a merge result computed from an earlier copy of the list (`merged`) to the current list, so changes
 * made in between (read and bookmark toggles, notes, tags, stored text) survive: articles that weren't fetched
 * are taken as they are now, fetched ones get the current user state, and articles removed in between stay
 * removed unless they were just fetched.
 */
export function applyMergeResult(merged: Article[], current: Article[], fetchedIds: Set<string>): Article[] {
  const currentById = new Map(current.map(a => [a.id, a]));
  const out: Article[] = [];
  for (const article of merged) {
    const now = currentById.get(article.id);
    if (!now) {
      if (fetchedIds.has(article.id)) out.push(article);
    } else if (!fetchedIds.has(article.id) || now === article) {
      out.push(now);
    } else {
      out.push(withUserState(article, now));
    }
  }
  return out;
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

/** Stable reorder with bookmarked articles first, so deduplication never drops a bookmarked copy. */
export function bookmarkedFirst(articles: Article[]): Article[] {
  return [...articles.filter(a => a.bookmarked), ...articles.filter(a => !a.bookmarked)];
}

/**
 * Merges freshly fetched articles into the current list.
 * - Articles already present take the fresh feed content but keep their user state.
 * - Existing articles come first, so when a new item is a near-duplicate of one the user
 *   already has (possibly read or bookmarked), the existing one is kept.
 * - Bookmarked articles are always ahead of the rest in that check, so a bookmarked copy is never the one removed.
 * - Articles older than maxAgeDays are dropped unless bookmarked.
 * - With `shown`, articles that are shown win near-duplicate checks over hidden ones (disabled categories), so a
 *   story isn't hidden because a copy from a turned-off category came first.
 */
export function mergeFetchedArticles(
  existing: Article[],
  fetched: Article[],
  maxAgeDays: number,
  shown?: (a: Article) => boolean
): Article[] {
  const fetchedById = new Map(fetched.map(a => [a.id, a]));

  const merged = existing.map(old => {
    const fresh = fetchedById.get(old.id);
    if (!fresh) return old;
    fetchedById.delete(old.id);
    return withUserState(fresh, old);
  });
  merged.push(...fetchedById.values());

  const kept = shown
    ? new Set(deduplicateArticles(bookmarkedFirst([...merged.filter(shown), ...merged.filter(a => !shown(a))])))
    : new Set(deduplicateArticles(bookmarkedFirst(merged)));
  return merged.filter(a => kept.has(a) && (a.bookmarked || !isExpired(a, maxAgeDays)));
}

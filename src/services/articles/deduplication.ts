import { Article } from '../../types';

const TITLE_SIMILARITY_THRESHOLD = 0.82;
const DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function cleanTitleForComparison(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleWordSet(title: string): Set<string> {
  const cleaned = cleanTitleForComparison(title);
  return new Set(cleaned ? cleaned.split(' ') : []);
}

/**
 * Calculates Jaccard similarity between two sets of words.
 */
function jaccard(w1: Set<string>, w2: Set<string>): number {
  if (w1.size === 0 || w2.size === 0) return 0;

  let intersection = 0;
  for (const word of w1) {
    if (w2.has(word)) intersection++;
  }

  const union = w1.size + w2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface KeptEntry {
  words: Set<string>;
  pubTime: number;
}

/**
 * Deduplicates articles using exact ID, normalized URL, and fuzzy title matching.
 * Earlier entries win, so callers pass fresh items first.
 */
export function deduplicateArticles(articles: Article[]): Article[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const deduped: Article[] = [];
  // Kept articles bucketed by publish day: a fuzzy-title duplicate must be within 48h,
  // so only the neighbouring day buckets need to be compared instead of every kept article.
  const byDay = new Map<number, KeptEntry[]>();

  for (const article of articles) {
    // 1. Exact ID check
    if (seenIds.has(article.id)) continue;

    // 2. Exact URL check (if URL exists)
    if (article.url && seenUrls.has(article.url)) continue;

    // 3. High similarity title check (cross-syndicated articles published within 48h of each other).
    // Articles without a parseable date are never treated as title duplicates.
    const words = titleWordSet(article.title || '');
    const pubTime = new Date(article.publishedAt).getTime();
    const hasDate = !isNaN(pubTime);

    if (hasDate && words.size > 0) {
      const day = Math.floor(pubTime / DAY_MS);
      let isDuplicateTitle = false;

      for (let d = day - 2; d <= day + 2 && !isDuplicateTitle; d++) {
        const bucket = byDay.get(d);
        if (!bucket) continue;
        isDuplicateTitle = bucket.some(
          existing =>
            Math.abs(existing.pubTime - pubTime) < DUPLICATE_WINDOW_MS &&
            jaccard(existing.words, words) > TITLE_SIMILARITY_THRESHOLD
        );
      }

      if (isDuplicateTitle) continue;

      const bucket = byDay.get(day);
      if (bucket) bucket.push({ words, pubTime });
      else byDay.set(day, [{ words, pubTime }]);
    }

    seenIds.add(article.id);
    if (article.url) seenUrls.add(article.url);
    deduped.push(article);
  }

  return deduped;
}

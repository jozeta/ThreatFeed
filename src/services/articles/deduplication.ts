import { Article } from '../../types';

function cleanTitleForComparison(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates Jaccard similarity between two sets of words.
 */
function titleSimilarity(t1: string, t2: string): number {
  const w1 = new Set(cleanTitleForComparison(t1).split(' '));
  const w2 = new Set(cleanTitleForComparison(t2).split(' '));

  if (w1.size === 0 || w2.size === 0) return 0;

  let intersection = 0;
  for (const word of w1) {
    if (w2.has(word)) intersection++;
  }

  const union = new Set([...w1, ...w2]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicates articles using exact ID, normalized URL, and fuzzy title matching.
 */
export function deduplicateArticles(articles: Article[]): Article[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const deduped: Article[] = [];

  for (const article of articles) {
    // 1. Exact ID check
    if (seenIds.has(article.id)) continue;

    // 2. Exact URL check (if URL exists)
    if (article.url && seenUrls.has(article.url)) continue;

    // 3. High similarity title check (e.g., cross-syndicated articles across different feeds with >85% title similarity published around the same day)
    const isDuplicateTitle = deduped.some(existing => {
      const sim = titleSimilarity(existing.title, article.title);
      if (sim > 0.82) {
        // Check if published within 48 hours of each other
        const diffHours = Math.abs(
          new Date(existing.publishedAt).getTime() - new Date(article.publishedAt).getTime()
        ) / (1000 * 60 * 60);
        return diffHours < 48;
      }
      return false;
    });

    if (isDuplicateTitle) continue;

    seenIds.add(article.id);
    if (article.url) seenUrls.add(article.url);
    deduped.push(article);
  }

  return deduped;
}

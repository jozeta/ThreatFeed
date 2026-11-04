import { Article } from '../../types';
import { MIN_COMPARABLE_TOKENS, wordTokens } from './titleTokens';

const TITLE_SIMILARITY_THRESHOLD = 0.82;
const DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function cleanTitleForComparison(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Word sets per article object: the same objects go through every merge, so each title is tokenized once
const wordSetCache = new WeakMap<Article, Set<string>>();

function titleWordSet(article: Article): Set<string> {
  let words = wordSetCache.get(article);
  if (!words) {
    const cleaned = cleanTitleForComparison(article.title || '');
    words = new Set(cleaned ? cleaned.split(' ').flatMap(wordTokens) : []);
    wordSetCache.set(article, words);
  }
  return words;
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

/**
 * How many of a title's rarest words to index. Jaccard > t needs an overlap of at least t·|A| words, so two
 * titles that similar always share one of their first |A| − ⌈t·|A|⌉ + 1 words in a common order (prefix
 * filtering). The epsilon only ever lengthens the prefix, so float rounding can't lose a match.
 */
function prefixLength(size: number): number {
  return size - Math.ceil(TITLE_SIMILARITY_THRESHOLD * size - 1e-9) + 1;
}

interface KeptEntry {
  words: Set<string>;
  pubTime: number;
  /** Index of the article it was last compared with, so a candidate found through several words is checked once. */
  checkedBy: number;
}

/**
 * Deduplicates articles using exact ID, normalized URL, and fuzzy title matching.
 * Earlier entries win, so callers pass fresh items first.
 */
export function deduplicateArticles(articles: Article[]): Article[] {
  // Fuzzy candidates: titles with a date and at least 2 tokens. Count how many of them use each word,
  // so every title's words can be ordered rarest first.
  const comparable: (Set<string> | null)[] = articles.map(article => {
    const words = titleWordSet(article);
    return words.size >= MIN_COMPARABLE_TOKENS && !isNaN(new Date(article.publishedAt).getTime()) ? words : null;
  });
  const frequency = new Map<string, number>();
  for (const words of comparable) {
    if (!words) continue;
    for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }
  const rarestFirst = (x: string, y: string) => frequency.get(x)! - frequency.get(y)! || (x < y ? -1 : x > y ? 1 : 0);

  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const deduped: Article[] = [];
  // Kept articles indexed by publish day and then by each of their rarest words: a fuzzy-title duplicate
  // must be within 48h and share one of those words, so only those few entries need a Jaccard check.
  const byDay = new Map<number, Map<string, KeptEntry[]>>();

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    // 1. Exact ID check
    if (seenIds.has(article.id)) continue;

    // 2. Exact URL check (if URL exists)
    if (article.url && seenUrls.has(article.url)) continue;

    // 3. High similarity title check (cross-syndicated articles published within 48h of each other).
    // Articles without a parseable date, and titles with fewer than 2 tokens, are only deduped by id/url.
    const words = comparable[i];
    if (words) {
      const pubTime = new Date(article.publishedAt).getTime();
      const day = Math.floor(pubTime / DAY_MS);
      const prefix = [...words].sort(rarestFirst).slice(0, prefixLength(words.size));
      let isDuplicateTitle = false;

      for (let d = day - 2; d <= day + 2 && !isDuplicateTitle; d++) {
        const index = byDay.get(d);
        if (!index) continue;
        for (const word of prefix) {
          const candidates = index.get(word);
          if (!candidates) continue;
          isDuplicateTitle = candidates.some(existing => {
            if (existing.checkedBy === i) return false;
            existing.checkedBy = i;
            return (
              Math.abs(existing.pubTime - pubTime) < DUPLICATE_WINDOW_MS &&
              jaccard(existing.words, words) > TITLE_SIMILARITY_THRESHOLD
            );
          });
          if (isDuplicateTitle) break;
        }
      }

      if (isDuplicateTitle) continue;

      const entry: KeptEntry = { words, pubTime, checkedBy: -1 };
      let index = byDay.get(day);
      if (!index) byDay.set(day, (index = new Map()));
      for (const word of prefix) {
        const list = index.get(word);
        if (list) list.push(entry);
        else index.set(word, [entry]);
      }
    }

    seenIds.add(article.id);
    if (article.url) seenUrls.add(article.url);
    deduped.push(article);
  }

  return deduped;
}

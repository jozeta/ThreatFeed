import { Article, StoryCluster } from '../../types';
import { MIN_COMPARABLE_TOKENS, hasCjk, wordTokens } from './titleTokens';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'of', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'that', 'this',
  'it', 'its', 'as', 'new', 'security', 'cyber', 'report', 'warns', 'alert', 'reveals'
]);

function extractSignificantTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .flatMap(wordTokens)
    // Two-character CJK bigrams are real tokens; only Latin-style words need the length floor
    .filter(w => (w.length > 2 || hasCjk(w)) && !STOP_WORDS.has(w));
  return new Set(words);
}

// Tokens per article object: the same objects come back on every render and merge, so each title is tokenized once
const tokenCache = new WeakMap<Article, Set<string>>();

function titleTokens(article: Article): Set<string> {
  let tokens = tokenCache.get(article);
  if (!tokens) {
    tokens = extractSignificantTokens(article.title);
    tokenCache.set(article, tokens);
  }
  return tokens;
}

const CLUSTER_WINDOW_MS = 96 * 60 * 60 * 1000;
const TITLE_SIMILARITY_THRESHOLD = 0.40;

/** Adds `position` to the posting list for `key`. Positions are added in ascending order. */
function post(index: Map<string, number[]>, key: string, position: number): void {
  const list = index.get(key);
  if (list) list.push(position);
  else index.set(key, [position]);
}

/** First slot in an ascending posting list whose position is at least `from`. */
function lowerBound(list: number[], from: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid] < from) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Clusters related articles across different news sources.
 * Groups stories that cover the same incident, CVE, or breach.
 *
 * Articles are walked in publish order. The first unassigned one starts a cluster, and the later
 * unassigned ones published within 96h of it join when they share a CVE, or come from another source
 * with a title Jaccard similarity of at least 0.40. Candidates are found through inverted indexes
 * (CVE → positions, title token → positions): a pair with no shared CVE or token can never match, so
 * this gives the same result as comparing every pair in the window.
 */
export function clusterArticles(articles: Article[]): StoryCluster[] {
  if (!articles || articles.length === 0) return [];

  const clusters: StoryCluster[] = [];
  const assignedArticleIds = new Set<string>();

  // Undated articles never cluster; the sort puts them last
  const metadata = articles
    .map(art => ({
      article: art,
      tokens: titleTokens(art),
      cveSet: new Set(art.cves || []),
      pubTime: new Date(art.publishedAt).getTime()
    }))
    .sort((a, b) => (isNaN(a.pubTime) ? 1 : isNaN(b.pubTime) ? -1 : a.pubTime - b.pubTime));

  let datedEnd = 0;
  while (datedEnd < metadata.length && !isNaN(metadata[datedEnd].pubTime)) datedEnd++;

  // Titles with too few tokens are never similar to anything, so they stay out of the token index
  const byCve = new Map<string, number[]>();
  const byToken = new Map<string, number[]>();
  for (let j = 0; j < datedEnd; j++) {
    const { cveSet, tokens } = metadata[j];
    for (const cve of cveSet) post(byCve, cve, j);
    if (tokens.size >= MIN_COMPARABLE_TOKENS) for (const token of tokens) post(byToken, token, j);
  }

  // Per-candidate scratch, tagged with the position of the article being matched so it never needs clearing
  const seenFor = new Int32Array(metadata.length).fill(-1);
  const sharedTokens = new Int32Array(metadata.length);
  const cveMatchFor = new Int32Array(metadata.length).fill(-1);
  let windowEnd = 0;

  for (let i = 0; i < metadata.length; i++) {
    const itemA = metadata[i];
    if (assignedArticleIds.has(itemA.article.id)) continue;
    assignedArticleIds.add(itemA.article.id);

    const members = [itemA];

    if (i < datedEnd) {
      // Sorted by time, so the window (i, windowEnd) only ever moves forward
      if (windowEnd <= i) windowEnd = i + 1;
      while (windowEnd < datedEnd && metadata[windowEnd].pubTime - itemA.pubTime <= CLUSTER_WINDOW_MS) windowEnd++;

      const candidates: number[] = [];
      const touch = (j: number) => {
        if (seenFor[j] === i) return;
        seenFor[j] = i;
        sharedTokens[j] = 0;
        candidates.push(j);
      };

      // Criteria 1: Shared specific CVE ID
      for (const cve of itemA.cveSet) {
        const list = byCve.get(cve)!;
        for (let k = lowerBound(list, i + 1); k < list.length && list[k] < windowEnd; k++) {
          touch(list[k]);
          cveMatchFor[list[k]] = i;
        }
      }

      // Criteria 2: count shared title tokens for the later Jaccard check
      if (itemA.tokens.size >= MIN_COMPARABLE_TOKENS) {
        for (const token of itemA.tokens) {
          const list = byToken.get(token)!;
          for (let k = lowerBound(list, i + 1); k < list.length && list[k] < windowEnd; k++) {
            touch(list[k]);
            sharedTokens[list[k]]++;
          }
        }
      }

      // In publish order, as a scan of the window would meet them
      candidates.sort((x, y) => x - y);
      for (const j of candidates) {
        const itemB = metadata[j];
        if (assignedArticleIds.has(itemB.article.id)) continue;

        const matchedByCVE = cveMatchFor[j] === i;
        // High title token overlap (Jaccard similarity >= 0.40), only across different sources
        let matchedByTitle = false;
        if (!matchedByCVE && itemA.article.sourceId !== itemB.article.sourceId && itemB.tokens.size >= MIN_COMPARABLE_TOKENS) {
          const intersectionCount = sharedTokens[j];
          const unionCount = itemA.tokens.size + itemB.tokens.size - intersectionCount;
          matchedByTitle = intersectionCount / unionCount >= TITLE_SIMILARITY_THRESHOLD;
        }

        if (matchedByCVE || matchedByTitle) {
          members.push(itemB);
          assignedArticleIds.add(itemB.article.id);
        }
      }
    }

    // CVEs mentioned by at least two members of the cluster
    const cveCounts = new Map<string, number>();
    for (const m of members) {
      for (const cve of m.cveSet) cveCounts.set(cve, (cveCounts.get(cve) || 0) + 1);
    }
    const sharedCVEs = Array.from(cveCounts).filter(([, n]) => n >= 2).map(([cve]) => cve);

    // Pick best primary article (prefer one with image or higher severity)
    const allMembers = members.map(m => m.article);
    allMembers.sort((a, b) => {
      const scoreA = (a.severityScore || 0) + (a.image ? 10 : 0);
      const scoreB = (b.severityScore || 0) + (b.image ? 10 : 0);
      return scoreB - scoreA;
    });

    const primary = allMembers[0];
    const related = allMembers.slice(1);

    clusters.push({
      id: primary.id,
      primaryArticle: primary,
      relatedArticles: related,
      sharedCVEs,
      clusterSize: 1 + related.length
    });
  }

  return clusters;
}

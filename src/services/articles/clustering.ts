import { Article, StoryCluster } from '../../types';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'of', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'that', 'this',
  'it', 'its', 'as', 'new', 'security', 'cyber', 'report', 'warns', 'alert', 'reveals'
]);

function extractSignificantTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionCount = 0;
  setA.forEach(item => {
    if (setB.has(item)) intersectionCount++;
  });
  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

const CLUSTER_WINDOW_MS = 96 * 60 * 60 * 1000;

/**
 * Clusters related articles across different news sources.
 * Groups stories that cover the same incident, CVE, or breach.
 *
 * Articles are walked in publish order and each one is only compared with the ones published
 * within the following 96h, which keeps this close to linear instead of comparing every pair.
 */
export function clusterArticles(articles: Article[]): StoryCluster[] {
  if (!articles || articles.length === 0) return [];

  const clusters: StoryCluster[] = [];
  const assignedArticleIds = new Set<string>();

  // Precompute tokens and CVE sets for speed; undated articles never cluster
  const metadata = articles
    .map(art => ({
      article: art,
      tokens: extractSignificantTokens(art.title),
      cveSet: new Set(art.cves || []),
      pubTime: new Date(art.publishedAt).getTime()
    }))
    .sort((a, b) => (isNaN(a.pubTime) ? 1 : isNaN(b.pubTime) ? -1 : a.pubTime - b.pubTime));

  for (let i = 0; i < metadata.length; i++) {
    const itemA = metadata[i];
    if (assignedArticleIds.has(itemA.article.id)) continue;
    assignedArticleIds.add(itemA.article.id);

    const members = [itemA];

    if (!isNaN(itemA.pubTime)) {
      for (let j = i + 1; j < metadata.length; j++) {
        const itemB = metadata[j];
        // Sorted by time: once past the window (or into undated items), nothing later can match
        if (isNaN(itemB.pubTime) || itemB.pubTime - itemA.pubTime > CLUSTER_WINDOW_MS) break;
        if (assignedArticleIds.has(itemB.article.id)) continue;

        // Criteria 1: Shared specific CVE ID
        let matchedByCVE = false;
        for (const cve of itemA.cveSet) {
          if (itemB.cveSet.has(cve)) {
            matchedByCVE = true;
            break;
          }
        }

        // Criteria 2: High title token overlap (Jaccard similarity >= 0.40), only across different sources
        const matchedByTitle =
          !matchedByCVE &&
          itemA.article.sourceId !== itemB.article.sourceId &&
          calculateJaccardSimilarity(itemA.tokens, itemB.tokens) >= 0.40;

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

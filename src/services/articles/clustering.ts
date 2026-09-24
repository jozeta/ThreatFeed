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

/**
 * Clusters related articles across different news sources.
 * Groups stories that cover the same incident, CVE, or breach.
 */
export function clusterArticles(articles: Article[]): StoryCluster[] {
  if (!articles || articles.length === 0) return [];

  const clusters: StoryCluster[] = [];
  const assignedArticleIds = new Set<string>();

  // Precompute tokens and CVE sets for speed
  const metadata = articles.map(art => ({
    article: art,
    tokens: extractSignificantTokens(art.title),
    cveSet: new Set(art.cves || []),
    pubTime: new Date(art.publishedAt).getTime()
  }));

  for (let i = 0; i < metadata.length; i++) {
    const itemA = metadata[i];
    if (assignedArticleIds.has(itemA.article.id)) continue;

    const clusterMembers: Article[] = [];
    const sharedCVEs = new Set<string>(itemA.article.cves || []);

    for (let j = i + 1; j < metadata.length; j++) {
      const itemB = metadata[j];
      if (assignedArticleIds.has(itemB.article.id)) continue;

      // Don't cluster articles from the exact same feed source unless identical CVE
      const isDifferentSource = itemA.article.sourceId !== itemB.article.sourceId;

      // Time difference check (within 4 days / 96 hours)
      const timeDiffHours = Math.abs(itemA.pubTime - itemB.pubTime) / (1000 * 60 * 60);
      if (timeDiffHours > 96) continue;

      // Criteria 1: Shared specific CVE ID
      let matchedByCVE = false;
      if (itemA.cveSet.size > 0 && itemB.cveSet.size > 0) {
        for (const cve of itemA.cveSet) {
          if (itemB.cveSet.has(cve)) {
            matchedByCVE = true;
            sharedCVEs.add(cve);
          }
        }
      }

      // Criteria 2: High title token overlap (Jaccard similarity >= 0.40)
      const similarity = calculateJaccardSimilarity(itemA.tokens, itemB.tokens);
      const matchedByTitle = isDifferentSource && similarity >= 0.40;

      if (matchedByCVE || matchedByTitle) {
        clusterMembers.push(itemB.article);
        assignedArticleIds.add(itemB.article.id);
      }
    }

    assignedArticleIds.add(itemA.article.id);

    // Pick best primary article (prefer one with image or higher severity)
    const allMembers = [itemA.article, ...clusterMembers];
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
      sharedCVEs: Array.from(sharedCVEs),
      clusterSize: 1 + related.length
    });
  }

  return clusters;
}

import { Article } from '../../types';
import { stackMatches } from '../intelligence/stack';

// Deterministic hash to provide stable organic randomness per article
export function getArticleHash(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  return Math.abs(hash);
}

// Calculate importance score based on threat tags and high-impact indicators
export function calculateImportance(article: Article, stackKeywords: string[] = []): number {
  let score = 0;
  const criticalTags = [
    'zero-day',
    '0-day',
    'ransomware',
    'apt',
    'critical',
    'exploit',
    'vulnerability',
    'cve',
    'cisa',
    'remote code execution',
  ];

  for (const tag of article.tags) {
    if (criticalTags.includes(tag.toLowerCase())) {
      score += 3;
    }
  }

  const topSources = [
    'cisa-advisories',
    'google-project-zero',
    'the-hacker-news',
    'cisco-talos',
    'krebs-on-security',
  ];
  if (topSources.includes(article.sourceId)) {
    score += 2;
  }

  if (article.image) score += 2;
  if (article.bookmarked) score += 1;
  // Stories about products the user runs belong near the top of their section
  if (stackMatches(article, stackKeywords).length > 0) score += 4;
  if (article.severity === 'critical') score += 4;
  else if (article.severity === 'high') score += 2;

  const pseudoRandom = getArticleHash(article.id) % 3;
  return score + pseudoRandom;
}


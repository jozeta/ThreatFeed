import { Article, CveIntel, FeedHealth } from '../types';

export interface FeedSnapshot {
  generatedAt: string;
  feedHealth: Record<string, FeedHealth>;
  cveIntel: Record<string, CveIntel>;
  articles: Article[];
}

/**
 * Loads the server-side snapshot published with the site (see scripts/build-snapshot.ts).
 * Returns null when there is none (local dev without `npm run snapshot`) or it's malformed,
 * in which case the caller falls back to fetching feeds live.
 */
export async function loadSnapshot(): Promise<FeedSnapshot | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/snapshot.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.articles) || typeof data.feedHealth !== 'object') return null;
    return {
      generatedAt: String(data.generatedAt),
      feedHealth: data.feedHealth,
      cveIntel: data.cveIntel && typeof data.cveIntel === 'object' ? data.cveIntel : {},
      articles: data.articles,
    };
  } catch {
    return null;
  }
}

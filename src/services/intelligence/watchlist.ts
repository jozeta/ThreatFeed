import { Article } from '../../types';

export const DEFAULT_WATCHLIST_KEYWORDS = [
  'Fortinet',
  'Ivanti',
  'Palo Alto',
  'CrowdStrike',
  'LockBit',
  'Salt Typhoon',
  'Active Directory',
  'Exchange',
  'Cisco'
];

export interface WatchlistMatchResult {
  matched: boolean;
  matchedTerms: string[];
}

/**
 * Checks an article against the user's active watchlist terms.
 * Performs word-boundary / case-insensitive search across title, description, and tags.
 */
export function checkWatchlistMatch(
  article: Article,
  watchlistKeywords: string[] = []
): WatchlistMatchResult {
  if (!watchlistKeywords || watchlistKeywords.length === 0) {
    return { matched: false, matchedTerms: [] };
  }

  const searchableText = [
    article.title || '',
    article.description || '',
    (article.tags || []).join(' '),
    (article.cves || []).join(' ')
  ].join(' ').toLowerCase();

  const matchedTerms: string[] = [];

  for (const rawTerm of watchlistKeywords) {
    const term = rawTerm.trim();
    if (!term) continue;

    // Use boundary or substring match
    const lowerTerm = term.toLowerCase();
    if (searchableText.includes(lowerTerm)) {
      matchedTerms.push(term);
    }
  }

  return {
    matched: matchedTerms.length > 0,
    matchedTerms
  };
}

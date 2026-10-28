import { Article } from '../../types';
import { checkWatchlistMatch } from './watchlist';

/** Products/vendors from the user's "my stack" list mentioned by an article (same whole-word rules as the watchlist). */
export function stackMatches(article: Article, stackKeywords: string[]): string[] {
  return stackKeywords.length > 0 ? checkWatchlistMatch(article, stackKeywords).matchedTerms : [];
}

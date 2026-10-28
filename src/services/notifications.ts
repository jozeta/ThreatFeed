import { Article } from '../types';
import { checkWatchlistMatch } from './intelligence/watchlist';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Shows one desktop notification summarising new articles that match the watchlist.
 * A fixed tag makes a newer summary replace the previous one instead of stacking up.
 */
export function notifyWatchlistMatches(newArticles: Article[], keywords: string[]): number {
  if (!notificationsSupported() || Notification.permission !== 'granted' || keywords.length === 0) return 0;
  const matches = newArticles
    .map(article => ({ article, terms: checkWatchlistMatch(article, keywords).matchedTerms }))
    .filter(m => m.terms.length > 0);
  if (matches.length === 0) return 0;

  const lines = matches.slice(0, 3).map(m => `• ${m.article.title} [${m.terms.slice(0, 2).join(', ')}]`);
  if (matches.length > 3) lines.push(`…and ${matches.length - 3} more`);
  const notification = new Notification(
    `ThreatFeed: ${matches.length} new watchlist ${matches.length === 1 ? 'match' : 'matches'}`,
    { body: lines.join('\n'), tag: 'threatfeed-watchlist', icon: `${import.meta.env.BASE_URL}icon.svg` }
  );
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  return matches.length;
}

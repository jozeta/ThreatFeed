import type { AlertMatch } from './intelligence/alertEngine';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/** Title, body and click target of the one notification that summarises new alert matches */
export function formatAlertNotification(matches: AlertMatch[]): { title: string; body: string; hash: string } {
  const lines = matches.slice(0, 4).map(m => `• ${m.title} [${m.ruleName}]`);
  if (matches.length > 4) lines.push(`…and ${matches.length - 4} more`);
  return {
    title: `ThreatFeed: ${matches.length} new ${matches.length === 1 ? 'match' : 'matches'}`,
    body: lines.join('\n'),
    hash: matches.some(m => m.kind === 'vulns') ? '#/feed/vulns' : '#/feed/news',
  };
}

/**
 * One desktop notification for everything the alert rules matched. A fixed tag makes a newer summary
 * replace the previous one instead of stacking up.
 */
export function notifyAlertMatches(matches: AlertMatch[]): void {
  if (!notificationsSupported() || Notification.permission !== 'granted' || matches.length === 0) return;
  const { title, body, hash } = formatAlertNotification(matches);
  const notification = new Notification(title, { body, tag: 'threatfeed-alerts', icon: `${import.meta.env.BASE_URL}icon.svg` });
  notification.onclick = () => {
    window.focus();
    window.location.hash = hash;
    notification.close();
  };
}

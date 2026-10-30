import { Feed } from '../../types';

interface MonitorOptions {
  lang?: string;
  country?: string;
  days?: number;
}

// Google News RSS search URL; "when:Nd" limits results to the last N days
export function googleNewsFeedUrl(query: string, opts: MonitorOptions = {}): string {
  const { lang = 'en-US', country = 'US', days = 7 } = opts;
  const q = encodeURIComponent(query.trim()).replace(/%20/g, '+');
  const when = days > 0 ? `+when:${days}d` : '';
  return `https://news.google.com/rss/search?q=${q}${when}&hl=${lang}&gl=${country}&ceid=${country}:${lang.split('-')[0]}`;
}

function parseMonitorUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.hostname === 'news.google.com' && u.pathname.startsWith('/rss/search') ? u : null;
  } catch {
    return null;
  }
}

export function isKeywordMonitor(feed: Feed): boolean {
  return parseMonitorUrl(feed.url) !== null;
}

// The search terms, without the trailing "when:Nd" window
export function monitorQuery(feed: Feed): string | null {
  const q = parseMonitorUrl(feed.url)?.searchParams.get('q');
  if (q == null) return null;
  return q.replace(/\s*when:\d+d\s*$/, '').trim();
}

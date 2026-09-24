import { Article, Feed, FeedHealth, ProxyMode } from '../../types';
import { parseFeedXml } from './parser';

const TIMEOUT_MS = 12000;

export function buildFetchUrl(targetUrl: string, proxyMode: ProxyMode, customProxyUrl?: string): string {
  switch (proxyMode) {
    case 'allorigins':
      return `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    case 'custom':
      if (customProxyUrl && customProxyUrl.trim()) {
        const base = customProxyUrl.trim();
        return base.includes('%s') ? base.replace('%s', encodeURIComponent(targetUrl)) : `${base}${encodeURIComponent(targetUrl)}`;
      }
      return targetUrl;
    case 'direct':
    default:
      return targetUrl;
  }
}

export async function fetchFeed(
  feed: Feed,
  proxyMode: ProxyMode = 'allorigins',
  customProxyUrl?: string
): Promise<{ articles: Article[]; health: FeedHealth }> {
  // Strategy 1: Fetch using configured proxy mode
  const primaryUrl = buildFetchUrl(feed.url, proxyMode, customProxyUrl);
  const primaryResult = await doFetch(feed, primaryUrl, proxyMode);

  if (primaryResult.articles.length > 0) {
    return primaryResult;
  }

  // Strategy 2: If proxy mode was not direct, and it failed with 401/403 or network error, attempt direct fetch as fallback
  if (proxyMode !== 'direct') {
    try {
      const fallbackResult = await doFetch(feed, feed.url, 'direct');
      if (fallbackResult.articles.length > 0) {
        return fallbackResult;
      }
    } catch {
      // Fallback failed, return primary result with diagnostics
    }
  }

  return primaryResult;
}

async function doFetch(
  feed: Feed,
  fetchUrl: string,
  mode: ProxyMode
): Promise<{ articles: Article[]; health: FeedHealth }> {
  const now = new Date().toISOString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status} (${response.statusText || 'Fetch failed'})`;
      if (response.status === 401) {
        errorMsg = 'Source or proxy returned 401 Unauthorized.';
      } else if (response.status === 403) {
        errorMsg = 'Access Forbidden (Cloudflare or server anti-bot challenge).';
      }

      return {
        articles: [],
        health: {
          feedId: feed.id,
          status: 'http_error',
          lastFetchedAt: now,
          articleCount: 0,
          errorMessage: errorMsg,
          httpStatus: response.status
        }
      };
    }

    const xmlText = await response.text();

    if (!xmlText || xmlText.trim().length === 0) {
      return {
        articles: [],
        health: {
          feedId: feed.id,
          status: 'invalid_xml',
          lastFetchedAt: now,
          articleCount: 0,
          errorMessage: 'Empty response returned from feed.'
        }
      };
    }

    try {
      const articles = parseFeedXml(xmlText, feed);
      return {
        articles,
        health: {
          feedId: feed.id,
          status: 'healthy',
          lastFetchedAt: now,
          lastSuccessAt: now,
          articleCount: articles.length
        }
      };
    } catch (parseError: any) {
      return {
        articles: [],
        health: {
          feedId: feed.id,
          status: 'invalid_xml',
          lastFetchedAt: now,
          articleCount: 0,
          errorMessage: parseError.message || 'Malformed XML format'
        }
      };
    }

  } catch (err: any) {
    clearTimeout(timeoutId);

    let status: FeedHealth['status'] = 'network_error';
    let errorMessage = err.message || 'Network request failed';

    if (err.name === 'AbortError') {
      status = 'timeout';
      errorMessage = `Request timed out after ${TIMEOUT_MS / 1000}s`;
    } else if (err instanceof TypeError && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
      status = mode === 'direct' ? 'cors_error' : 'network_error';
      errorMessage = mode === 'direct'
        ? 'CORS restriction prevented direct browser access. Use AllOrigins proxy in Settings.'
        : 'Network error or proxy unavailable.';
    }

    return {
      articles: [],
      health: {
        feedId: feed.id,
        status,
        lastFetchedAt: now,
        articleCount: 0,
        errorMessage
      }
    };
  }
}

/**
 * Concurrently fetches feeds with a concurrency queue limit to prevent overwhelming the browser
 */
export async function fetchAllFeeds(
  feeds: Feed[],
  proxyMode: ProxyMode,
  customProxyUrl?: string,
  onProgress?: (completed: number, total: number, latestHealth: FeedHealth) => void
): Promise<{ articles: Article[]; healthMap: Record<string, FeedHealth> }> {
  const activeFeeds = feeds.filter(f => f.enabled);
  const total = activeFeeds.length;
  let completed = 0;
  const allArticles: Article[] = [];
  const healthMap: Record<string, FeedHealth> = {};

  const CONCURRENCY_LIMIT = 4;
  const queue = [...activeFeeds];

  async function worker() {
    while (queue.length > 0) {
      const feed = queue.shift();
      if (!feed) break;

      const result = await fetchFeed(feed, proxyMode, customProxyUrl);
      allArticles.push(...result.articles);
      healthMap[feed.id] = result.health;
      completed++;

      if (onProgress) {
        onProgress(completed, total, result.health);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, total) }, () => worker());
  await Promise.all(workers);

  return { articles: allArticles, healthMap };
}

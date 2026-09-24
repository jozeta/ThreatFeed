import { Article, Feed, FeedHealth, ProxyMode } from '../../types';
import { parseFeedXml, parseRss2Json } from './parser';

export interface GatewayProbeResult {
  alive: boolean;
  latencyMs: number;
  status: number;
  error?: string;
}

export interface FeedDiagnosticResult {
  ok: boolean;
  gateway: string;
  status: number;
  latencyMs: number;
  articleCount: number;
  rawSnippet: string;
  errorMessage?: string;
  headers?: Record<string, string>;
}

/**
 * Resolves legacy, redirected, or moved feed URLs to their canonical active endpoints.
 */
export function resolveCanonicalFeedUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  // Google Project Zero moved from Blogger to projectzero.google
  if (trimmed.includes('googleprojectzero.blogspot.com')) {
    return 'https://projectzero.google/feed.xml';
  }
  return trimmed;
}

export function buildFetchUrl(targetUrl: string, proxyMode: ProxyMode, customProxyUrl?: string): string {
  const canonicalUrl = resolveCanonicalFeedUrl(targetUrl);
  switch (proxyMode) {
    case 'corsfix':
      return `https://proxy.corsfix.com/?url=${encodeURIComponent(canonicalUrl)}`;
    case 'rss2json':
      return `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(canonicalUrl)}`;
    case 'allorigins':
      return `https://api.allorigins.win/raw?url=${encodeURIComponent(canonicalUrl)}`;
    case 'custom':
      if (customProxyUrl && customProxyUrl.trim()) {
        const base = customProxyUrl.trim();
        return base.includes('%s') ? base.replace('%s', encodeURIComponent(canonicalUrl)) : `${base}${encodeURIComponent(canonicalUrl)}`;
      }
      return canonicalUrl;
    case 'direct':
    default:
      return canonicalUrl;
  }
}

interface AttemptResult {
  success: boolean;
  articles: Article[];
  latencyMs: number;
  httpStatus?: number;
  errorMessage?: string;
  rawSnippet?: string;
  isTimeout?: boolean;
  isCors?: boolean;
}

/**
 * Executes a single fetch attempt with specified timeout and parser logic.
 */
async function fetchAttempt(
  feed: Feed,
  url: string,
  gatewayType: 'corsfix' | 'rss2json' | 'allorigins-raw' | 'allorigins-json' | 'direct' | 'custom',
  timeoutMs: number
): Promise<AttemptResult> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': gatewayType === 'rss2json'
          ? 'application/json'
          : 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    const httpStatus = response.status;

    if (!response.ok) {
      const errSnippet = await response.text().catch(() => '');
      return {
        success: false,
        articles: [],
        latencyMs,
        httpStatus,
        errorMessage: `HTTP ${httpStatus} (${response.statusText || 'Error'})`,
        rawSnippet: errSnippet.slice(0, 500)
      };
    }

    if (gatewayType === 'rss2json') {
      const data = await response.json();
      const rawSnippet = JSON.stringify(data).slice(0, 500);
      if (data.status === 'error' || !data.items) {
        return {
          success: false,
          articles: [],
          latencyMs,
          httpStatus,
          errorMessage: data.message || 'RSS2JSON conversion error',
          rawSnippet
        };
      }
      const articles = parseRss2Json(data, feed);
      return {
        success: true,
        articles,
        latencyMs,
        httpStatus,
        rawSnippet
      };
    }

    if (gatewayType === 'allorigins-json') {
      const data = await response.json();
      const contents = data.contents || '';
      const rawSnippet = contents.slice(0, 500);
      if (!contents.trim()) {
        return {
          success: false,
          articles: [],
          latencyMs,
          httpStatus,
          errorMessage: 'Empty contents in AllOrigins JSON payload',
          rawSnippet
        };
      }
      const articles = parseFeedXml(contents, feed);
      return {
        success: true,
        articles,
        latencyMs,
        httpStatus,
        rawSnippet
      };
    }

    // Raw XML parsing for corsfix, allorigins-raw, direct, and custom
    const xmlText = await response.text();
    const rawSnippet = xmlText.slice(0, 500);

    if (!xmlText || xmlText.trim().length === 0) {
      return {
        success: false,
        articles: [],
        latencyMs,
        httpStatus,
        errorMessage: 'Empty response returned from source.',
        rawSnippet
      };
    }

    const articles = parseFeedXml(xmlText, feed);
    return {
      success: true,
      articles,
      latencyMs,
      httpStatus,
      rawSnippet
    };

  } catch (err: any) {
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    const isTimeout = err.name === 'AbortError';
    const isCors = err instanceof TypeError && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'));

    let errorMessage = err.message || 'Network request failed';
    if (isTimeout) {
      errorMessage = `Request timed out after ${timeoutMs}ms`;
    } else if (isCors) {
      errorMessage = 'CORS restriction or network block';
    }

    return {
      success: false,
      articles: [],
      latencyMs,
      errorMessage,
      isTimeout,
      isCors
    };
  }
}

/**
 * Sorts articles newest-first, filters out items older than maxArticleAgeDays,
 * and limits each feed to maxArticlesPerFeed.
 */
export function filterAndLimitArticles(
  rawArticles: Article[],
  maxArticlesPerFeed: number = 25,
  maxArticleAgeDays: number = 30
): Article[] {
  let articles = [...rawArticles];

  // Sort newest first so the limit retains the latest articles
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Filter out articles older than cutoff (if maxArticleAgeDays > 0)
  if (maxArticleAgeDays > 0) {
    const cutoffMs = Date.now() - (maxArticleAgeDays * 24 * 60 * 60 * 1000);
    articles = articles.filter(a => {
      const pubMs = new Date(a.publishedAt).getTime();
      return isNaN(pubMs) || pubMs >= cutoffMs;
    });
  }

  // Limit number of items (if maxArticlesPerFeed > 0)
  if (maxArticlesPerFeed > 0) {
    articles = articles.slice(0, maxArticlesPerFeed);
  }

  return articles;
}

/**
 * Resilient multi-tier feed fetcher.
 * Guarantees zero unhandled hangs: attempts primary configured gateway with fast failover.
 */
export async function fetchFeed(
  feed: Feed,
  proxyMode: ProxyMode = 'corsfix',
  customProxyUrl?: string,
  maxArticlesPerFeed: number = 25,
  maxArticleAgeDays: number = 30
): Promise<{ articles: Article[]; health: FeedHealth }> {
  const now = new Date().toISOString();
  const attemptedGateways: string[] = [];

  const canonicalFeed: Feed = {
    ...feed,
    url: resolveCanonicalFeedUrl(feed.url)
  };

  // Determine tiered attempt strategy
  interface Tier {
    url: string;
    type: 'corsfix' | 'rss2json' | 'allorigins-raw' | 'allorigins-json' | 'direct' | 'custom';
    label: string;
    timeoutMs: number;
  }

  const tiers: Tier[] = [];

  if (proxyMode === 'corsfix') {
    tiers.push({
      url: `https://proxy.corsfix.com/?url=${encodeURIComponent(canonicalFeed.url)}`,
      type: 'corsfix',
      label: 'CORSFix Gateway',
      timeoutMs: 8000
    });
    // Direct browser fetch (for CORS-enabled sites like Dark Reading, WIRED, The Record, etc.)
    tiers.push({
      url: canonicalFeed.url,
      type: 'direct',
      label: 'Direct Fetch (CORS)',
      timeoutMs: 2500
    });
    // Secondary fallback: RSS2JSON
    tiers.push({
      url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(canonicalFeed.url)}`,
      type: 'rss2json',
      label: 'RSS2JSON API',
      timeoutMs: 4000
    });
  } else if (proxyMode === 'rss2json') {
    tiers.push({
      url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(canonicalFeed.url)}`,
      type: 'rss2json',
      label: 'RSS2JSON API',
      timeoutMs: 4000
    });
    tiers.push({
      url: `https://proxy.corsfix.com/?url=${encodeURIComponent(canonicalFeed.url)}`,
      type: 'corsfix',
      label: 'CORSFix Fallback',
      timeoutMs: 8000
    });
    tiers.push({
      url: canonicalFeed.url,
      type: 'direct',
      label: 'Direct Fetch',
      timeoutMs: 2500
    });
  } else if (proxyMode === 'allorigins') {
    // Allorigins is currently degraded; keep timeout short (3s) and fall back immediately to CORSFix
    tiers.push({
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(canonicalFeed.url)}`,
      type: 'allorigins-raw',
      label: 'AllOrigins Raw',
      timeoutMs: 3000
    });
    tiers.push({
      url: `https://proxy.corsfix.com/?url=${encodeURIComponent(canonicalFeed.url)}`,
      type: 'corsfix',
      label: 'CORSFix Fallback',
      timeoutMs: 8000
    });
    tiers.push({
      url: canonicalFeed.url,
      type: 'direct',
      label: 'Direct Fetch',
      timeoutMs: 2500
    });
    tiers.push({
      url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(canonicalFeed.url)}`,
      type: 'rss2json',
      label: 'RSS2JSON API',
      timeoutMs: 4000
    });
  } else if (proxyMode === 'custom') {
    tiers.push({
      url: buildFetchUrl(canonicalFeed.url, 'custom', customProxyUrl),
      type: 'custom',
      label: 'Custom Proxy',
      timeoutMs: 8000
    });
  } else {
    // Strict Direct
    tiers.push({
      url: canonicalFeed.url,
      type: 'direct',
      label: 'Direct Fetch (Strict Origin)',
      timeoutMs: 5000
    });
  }

  let lastResult: AttemptResult | null = null;
  let successfulGatewayLabel = '';

  for (const tier of tiers) {
    const res = await fetchAttempt(feed, tier.url, tier.type, tier.timeoutMs);
    lastResult = res;

    if (res.success && res.articles.length > 0) {
      const filteredArticles = filterAndLimitArticles(res.articles, maxArticlesPerFeed, maxArticleAgeDays);
      attemptedGateways.push(`${tier.label} (OK ${res.latencyMs}ms, ${filteredArticles.length} items)`);
      successfulGatewayLabel = tier.type;

      return {
        articles: filteredArticles,
        health: {
          feedId: feed.id,
          status: 'healthy',
          lastFetchedAt: now,
          lastSuccessAt: now,
          articleCount: filteredArticles.length,
          httpStatus: res.httpStatus || 200,
          latencyMs: res.latencyMs,
          gatewayUsed: successfulGatewayLabel,
          rawSnippet: res.rawSnippet,
          attemptedGateways
        }
      };
    }

    const failureNote = res.isTimeout
      ? `Timed out (${tier.timeoutMs}ms)`
      : res.httpStatus
        ? `HTTP ${res.httpStatus}`
        : res.errorMessage || 'Failed';

    attemptedGateways.push(`${tier.label} [${failureNote}]`);
  }

  // All tiers failed; construct detailed diagnostic health
  const isTimeout = lastResult?.isTimeout;
  const isCors = proxyMode === 'direct' && lastResult?.isCors;

  let status: FeedHealth['status'] = 'network_error';
  if (isTimeout) status = 'timeout';
  else if (isCors) status = 'cors_error';
  else if (lastResult?.httpStatus) status = 'http_error';
  else if (lastResult?.errorMessage?.includes('XML')) status = 'invalid_xml';

  const errorSummary = isCors
    ? 'CORS restriction: Server does not allow direct browser access. Switch to CORSFix Gateway in Settings or Health tab.'
    : lastResult?.errorMessage || 'All fetch tiers exhausted without valid feed response.';

  return {
    articles: [],
    health: {
      feedId: feed.id,
      status,
      lastFetchedAt: now,
      articleCount: 0,
      errorMessage: errorSummary,
      httpStatus: lastResult?.httpStatus,
      latencyMs: lastResult?.latencyMs,
      gatewayUsed: proxyMode,
      rawSnippet: lastResult?.rawSnippet,
      attemptedGateways
    }
  };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Concurrently fetches feeds with worker pool and live progress updates.
 */
export async function fetchAllFeeds(
  feeds: Feed[],
  proxyMode: ProxyMode,
  customProxyUrl?: string,
  onProgress?: (completed: number, total: number, latestHealth: FeedHealth) => void,
  maxArticlesPerFeed: number = 25,
  maxArticleAgeDays: number = 30
): Promise<{ articles: Article[]; healthMap: Record<string, FeedHealth> }> {
  const activeFeeds = feeds.filter(f => f.enabled);
  const total = activeFeeds.length;
  let completed = 0;
  const allArticles: Article[] = [];
  const healthMap: Record<string, FeedHealth> = {};

  // Increased concurrency to 6 workers for swift execution
  const CONCURRENCY_LIMIT = 6;
  const queue = [...activeFeeds];

  async function worker() {
    while (queue.length > 0) {
      const feed = queue.shift();
      if (!feed) break;

      const result = await fetchFeed(feed, proxyMode, customProxyUrl, maxArticlesPerFeed, maxArticleAgeDays);
      allArticles.push(...result.articles);
      healthMap[feed.id] = result.health;
      completed++;

      if (onProgress) {
        onProgress(completed, total, result.health);
      }

      // Polite micro-delay
      await delay(60);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, total) }, () => worker());
  await Promise.all(workers);

  return { articles: allArticles, healthMap };
}

/**
 * Direct isolated diagnostic probe for a specific feed against a specific gateway.
 * Used by the Feed Debugger Modal.
 */
export async function testFeedGateway(
  feed: Feed,
  gateway: ProxyMode,
  customProxyUrl?: string,
  maxArticlesPerFeed: number = 25,
  maxArticleAgeDays: number = 30
): Promise<FeedDiagnosticResult> {
  const targetUrl = feed.url;
  const fetchUrl = buildFetchUrl(targetUrl, gateway, customProxyUrl);
  const t0 = Date.now();
  const controller = new AbortController();
  const timeoutMs = 12000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        'Accept': gateway === 'rss2json'
          ? 'application/json'
          : 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        gateway,
        status: res.status,
        latencyMs,
        articleCount: 0,
        rawSnippet: text.slice(0, 1500),
        errorMessage: `HTTP ${res.status} ${res.statusText}`,
        headers
      };
    }

    if (gateway === 'rss2json') {
      const data = await res.json();
      const rawSnippet = JSON.stringify(data, null, 2).slice(0, 1500);
      if (data.status === 'error' || !data.items) {
        return {
          ok: false,
          gateway,
          status: res.status,
          latencyMs,
          articleCount: 0,
          rawSnippet,
          errorMessage: data.message || 'RSS2JSON parse failure',
          headers
        };
      }
      const rawArticles = parseRss2Json(data, feed);
      const articles = filterAndLimitArticles(rawArticles, maxArticlesPerFeed, maxArticleAgeDays);
      return {
        ok: true,
        gateway,
        status: res.status,
        latencyMs,
        articleCount: articles.length,
        rawSnippet,
        headers
      };
    }

    const xml = await res.text();
    const rawSnippet = xml.slice(0, 1500);
    const rawArticles = parseFeedXml(xml, feed);
    const articles = filterAndLimitArticles(rawArticles, maxArticlesPerFeed, maxArticleAgeDays);

    return {
      ok: true,
      gateway,
      status: res.status,
      latencyMs,
      articleCount: articles.length,
      rawSnippet,
      headers
    };
  } catch (err: any) {
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    return {
      ok: false,
      gateway,
      status: err.name === 'AbortError' ? 408 : 0,
      latencyMs,
      articleCount: 0,
      rawSnippet: '',
      errorMessage: err.name === 'AbortError' ? `Timed out after ${timeoutMs}ms` : err.message || 'Network fetch failed'
    };
  }
}

/**
 * Pings a gateway with a lightweight probe to test availability and latency.
 */
export async function pingGateway(gateway: ProxyMode, customProxyUrl?: string): Promise<GatewayProbeResult> {
  let probeTarget = '';
  if (gateway === 'corsfix') {
    probeTarget = 'https://proxy.corsfix.com/?url=https://www.google.com/robots.txt';
  } else if (gateway === 'rss2json') {
    probeTarget = 'https://api.rss2json.com/v1/api.json?rss_url=https://thehackernews.com/feeds/posts/default';
  } else if (gateway === 'allorigins') {
    probeTarget = 'https://api.allorigins.win/raw?url=https://www.google.com/robots.txt';
  } else if (gateway === 'direct') {
    probeTarget = 'https://www.darkreading.com/rss.xml';
  } else if (gateway === 'custom') {
    probeTarget = buildFetchUrl('https://www.google.com/robots.txt', 'custom', customProxyUrl);
  }

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(probeTarget, {
      signal: controller.signal,
      method: 'GET'
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;

    return {
      alive: res.ok,
      status: res.status,
      latencyMs,
      error: res.ok ? undefined : `HTTP ${res.status}`
    };
  } catch (err: any) {
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    return {
      alive: false,
      status: err.name === 'AbortError' ? 408 : 0,
      latencyMs,
      error: err.name === 'AbortError' ? 'Probe timed out (>4000ms)' : err.message || 'Failed'
    };
  }
}

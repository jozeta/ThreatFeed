/**
 * ThreatFeed RSS proxy — a small Cloudflare Worker that fetches feeds on behalf of the browser
 * and adds CORS headers. Use it as ThreatFeed's "Custom User Proxy":
 *
 *   https://threatfeed-proxy.<your-subdomain>.workers.dev/?url=
 *
 * It is deliberately not an open proxy:
 * - only browser origins listed in ALLOWED_ORIGINS get CORS access (other sites can't spend your quota),
 * - only http(s) URLs to public hostnames are fetched,
 * - responses must look like feeds (XML/RSS/Atom/JSON/text) and stay under MAX_BYTES.
 *
 * Errors use the same `target_unreachable` marker as CORSFix, so ThreatFeed's Feed Health page
 * can tell "the proxy couldn't reach the site" apart from other failures.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://jozeta.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
];
const UPSTREAM_TIMEOUT_MS = 10000;
// Full-content feeds get big (Project Zero ~11 MB, Elastic ~8 MB); Workers have 128 MB of memory
const MAX_BYTES = 20 * 1024 * 1024;
const CACHE_SECONDS = 300;
const USER_AGENT = 'ThreatFeed RSS proxy (+https://github.com/jozeta/ThreatFeed)';
const FEED_CONTENT_TYPE = /xml|rss|atom|json|text\/plain|text\/html/i;

function allowedOrigins(env) {
  return env && env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonError(status, error, message, extraHeaders = {}) {
  return new Response(JSON.stringify({ error, message }, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// Workers can't reach private networks anyway; refusing them up front keeps the proxy's intent obvious.
function isPublicHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  if (host.includes(':')) return false; // IPv6 literals: not needed for feeds
  return true;
}

async function proxyFeed(target, ctx) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(target.toString(), { method: 'GET' });
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    const timedOut = err && err.name === 'AbortError';
    return jsonError(timedOut ? 504 : 502, 'target_unreachable',
      timedOut ? `Target did not respond within ${UPSTREAM_TIMEOUT_MS}ms` : 'Unable to connect to the target server');
  }

  try {
    if (!upstream.ok) {
      const headers = {};
      const retryAfter = upstream.headers.get('Retry-After');
      if (retryAfter) headers['Retry-After'] = retryAfter;
      return jsonError(upstream.status, 'target_error', `Target responded with HTTP ${upstream.status}`, headers);
    }

    const contentType = upstream.headers.get('Content-Type') || 'application/xml';
    if (!FEED_CONTENT_TYPE.test(contentType)) {
      return jsonError(415, 'unsupported_content_type', `Refusing to proxy ${contentType}`);
    }
    const declaredLength = Number(upstream.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BYTES) {
      return jsonError(413, 'too_large', `Feed is larger than ${MAX_BYTES} bytes`);
    }
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_BYTES) {
      return jsonError(413, 'too_large', `Feed is larger than ${MAX_BYTES} bytes`);
    }

    const response = new Response(body, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
    });
    if (cache && ctx) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigins(env);
    const allowOrigin = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : null;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowOrigin ? 204 : 403, headers: allowOrigin ? corsHeaders(allowOrigin) : {} });
    }

    let response;
    if (request.method !== 'GET') {
      response = jsonError(405, 'method_not_allowed', 'Only GET is supported');
    } else if (!allowOrigin) {
      response = jsonError(403, 'origin_not_allowed', 'This origin is not in ALLOWED_ORIGINS');
    } else {
      const raw = new URL(request.url).searchParams.get('url');
      let target = null;
      try {
        target = raw ? new URL(raw) : null;
      } catch {
        target = null;
      }
      if (!target || (target.protocol !== 'http:' && target.protocol !== 'https:')) {
        response = jsonError(400, 'invalid_url', 'Pass an http(s) feed URL as ?url=');
      } else if (!isPublicHostname(target.hostname)) {
        response = jsonError(400, 'forbidden_host', 'Only public hostnames can be fetched');
      } else {
        response = await proxyFeed(target, ctx);
      }
    }

    // CORS headers go on every response (including errors) so the app can read the error body
    const out = new Response(response.body, response);
    if (allowOrigin) {
      for (const [k, v] of Object.entries(corsHeaders(allowOrigin))) out.headers.set(k, v);
    }
    return out;
  },
};

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAllFeeds } from './fetcher';
import { resetGatewayPacing } from './gatewayPacer';
import { feed } from '../../test/fixtures';

const feedXml = (u: string) =>
  `<rss version="2.0"><channel><item><title>Item ${u}</title><link>${u}/1</link><guid>${u}</guid><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;

afterEach(() => vi.unstubAllGlobals());

describe('fetchAllFeeds via a rate-limited proxy', () => {
  it('backs off on 429 and gets every feed', async () => {
    resetGatewayPacing();
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      if (!url.startsWith('https://proxy.corsfix.com/')) throw new TypeError('Failed to fetch');
      calls++;
      // Every third request is rate-limited
      if (calls % 3 === 0) return new Response('slow down', { status: 429, headers: { 'Retry-After': '0' } });
      return new Response(feedXml(decodeURIComponent(url.split('url=')[1])), { status: 200 });
    });
    const feeds = Array.from({ length: 12 }, (_, i) => feed({ id: `f${i}`, url: `https://site${i}.example/feed` }));
    const { healthMap } = await fetchAllFeeds(feeds, 'corsfix', undefined, undefined, 25, 0);
    expect(Object.values(healthMap).every(h => h.status === 'healthy')).toBe(true);
  }, 30000);

  it('reports a proxy that cannot reach the site', async () => {
    resetGatewayPacing();
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('https://proxy.corsfix.com/')) {
        return new Response('{"corsfix_error":"target_unreachable"}', { status: 502 });
      }
      throw new TypeError('Failed to fetch');
    });
    const { healthMap } = await fetchAllFeeds([feed()], 'corsfix', undefined, undefined, 25, 0);
    expect(healthMap['test-feed'].status).toBe('proxy_unreachable');
  });
});

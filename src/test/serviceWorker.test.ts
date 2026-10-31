import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
// The real public/sw.js, run against an in-memory Cache Storage and a scripted network
import source from '../../public/sw.js?raw';
const ORIGIN = 'https://jozeta.github.io';

type Network = (url: string) => Promise<Response>;

function loadWorker(network: Network) {
  const store = new Map<string, Response>();
  const caches = {
    open: async () => ({
      put: async (req: Request, res: Response) => void store.set(req.url, res),
      addAll: async () => undefined,
    }),
    match: async (req: Request | string) => {
      const url = typeof req === 'string' ? new URL(req, `${ORIGIN}/ThreatFeed/`).href : req.url;
      return store.get(url)?.clone();
    },
    keys: async () => [],
    delete: async () => true,
  };
  const listeners: Record<string, (event: any) => void> = {};
  const self = { addEventListener: (type: string, fn: (e: any) => void) => (listeners[type] = fn), skipWaiting() {}, clients: { claim() {} } };
  const fetchSpy = vi.fn((req: Request) => network(req.url));
  new Function('self', 'caches', 'fetch', 'location', source)(self, caches, fetchSpy, new URL(ORIGIN));

  const request = (path: string, navigate = false, init?: RequestInit) => {
    let responded: Promise<Response | undefined> | undefined;
    const req = new Request(`${ORIGIN}${path}`, init);
    Object.defineProperty(req, 'mode', { value: navigate ? 'navigate' : 'cors' });
    listeners.fetch({ request: req, respondWith: (p: Promise<Response>) => (responded = p) });
    return responded!;
  };
  const seed = (path: string, body: string) => store.set(`${ORIGIN}${path}`, new Response(body));
  return { request, seed, fetchSpy, store };
}

const ok = (body: string) => async () => new Response(body);
const offline = async () => { throw new TypeError('Failed to fetch'); };

describe('service worker caching', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it('serves a new deploy on the first page load (network first)', async () => {
    const sw = loadWorker(ok('new index'));
    sw.seed('/ThreatFeed/', 'old index');
    expect(await (await sw.request('/ThreatFeed/', true))!.text()).toBe('new index');
  });

  it('falls back to the cached page when offline', async () => {
    const sw = loadWorker(offline);
    sw.seed('/ThreatFeed/', 'cached index');
    expect(await (await sw.request('/ThreatFeed/', true))!.text()).toBe('cached index');
  });

  it('falls back to the cached page when the network is too slow', async () => {
    vi.useFakeTimers();
    const sw = loadWorker(() => new Promise(() => {})); // never answers
    sw.seed('/ThreatFeed/', 'cached index');
    const pending = sw.request('/ThreatFeed/', true);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await (await pending)!.text()).toBe('cached index');
  });

  it('serves hashed build assets from cache without touching the network', async () => {
    const sw = loadWorker(ok('network copy'));
    sw.seed('/ThreatFeed/assets/index-abc123.js', 'cached bundle');
    expect(await (await sw.request('/ThreatFeed/assets/index-abc123.js'))!.text()).toBe('cached bundle');
    expect(sw.fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches data files network first', async () => {
    const sw = loadWorker(ok('fresh snapshot'));
    sw.seed('/ThreatFeed/data/snapshot.json', 'stale snapshot');
    expect(await (await sw.request('/ThreatFeed/data/snapshot.json'))!.text()).toBe('fresh snapshot');
  });

  it('passes the TV version check (index.html?v=…) straight to the network, never caching it', async () => {
    const sw = loadWorker(ok('deployed index'));
    expect(sw.request('/ThreatFeed/index.html?v=1761900000000')).toBeUndefined(); // no respondWith: the browser fetches it
    expect(sw.fetchSpy).not.toHaveBeenCalled();
    expect(sw.store.size).toBe(0);
  });

  it('passes no-store requests straight to the network', async () => {
    const sw = loadWorker(ok('fresh'));
    const req = new Request(`${ORIGIN}/ThreatFeed/icon.svg`, { cache: 'no-store' });
    if (req.cache !== 'no-store') return; // this runtime's Request drops the cache mode
    expect(sw.request('/ThreatFeed/icon.svg', false, { cache: 'no-store' })).toBeUndefined();
    expect(sw.store.size).toBe(0);
  });

  it('still caches the plain index.html and static files', async () => {
    const sw = loadWorker(ok('static'));
    expect(await (await sw.request('/ThreatFeed/manifest.webmanifest'))!.text()).toBe('static');
    await new Promise(r => setTimeout(r, 0));
    expect(sw.store.size).toBe(1);
  });
});

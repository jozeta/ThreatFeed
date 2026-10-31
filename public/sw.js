// ThreatFeed Service Worker for Offline First / Caching
const CACHE_NAME = 'threatfeed-v5'; // v5: drops the TV version-check copies v4 kept (index.html?v=…)
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './data/feeds.json'
];

// How long a page load waits for the network before falling back to the cached copy
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Failed to precache static assets:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

function cacheCopy(request, response) {
  if (response && response.status === 200) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

// Network first, cached copy only when the network fails (or, if timeoutMs is set, is too slow)
function networkFirst(request, timeoutMs) {
  const network = fetch(request).then((response) => cacheCopy(request, response));
  const fallback = () => caches.match(request).then((cached) => cached || network);
  if (!timeoutMs) return network.catch(fallback);
  const slow = new Promise((resolve) => setTimeout(resolve, timeoutMs)).then(() =>
    caches.match(request).then((cached) => cached || network)
  );
  return Promise.race([network, slow]).catch(fallback);
}

// Cache first: only for files whose content can never change under the same URL
function cacheFirst(request) {
  return caches.match(request).then((cached) => cached || fetch(request).then((response) => cacheCopy(request, response)));
}

// Serve from cache immediately and refresh it in the background
function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => cacheCopy(request, response));
    if (cached) {
      network.catch(() => {});
      return cached;
    }
    return network;
  });
}

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Page loads: network first so a new deploy shows up on the first visit, not the second.
  // Offline (or on a connection slower than NAVIGATION_TIMEOUT_MS), the cached page is used.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      networkFirst(event.request, NAVIGATION_TIMEOUT_MS)
        .then((response) => response || caches.match('./index.html'))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Asked for fresh on purpose (the TV screens' version check, index.html?v=<time>): the network only, and never
  // cached, so each check doesn't leave another copy in Cache Storage
  if (event.request.cache === 'no-store' || (url.search && url.pathname.endsWith('/index.html'))) return;

  // Vite's build output has a content hash in every file name, so a cached copy is always correct
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Feed list and snapshot change between deploys (the snapshot every 30 minutes)
  if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Icon, manifest and other static files
  event.respondWith(staleWhileRevalidate(event.request));
});

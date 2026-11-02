/* eslint-disable no-restricted-globals */
// Al Maha Farm — prototype-grade service worker.
//
// Strategy:
//   * Precache the app shell (root HTML + the hashed bundle files are not
//     enumerated here — CRA creates new hashes on every build and we don't
//     want to chase them — so the "network first, fallback to cache" model
//     is kept deliberately simple).
//   * For GET navigations we try the network; if offline, we fall back to
//     the cached shell so the SPA can still bootstrap.
//   * Static same-origin assets go through a stale-while-revalidate cache
//     so they load instantly on repeat visits.
//   * API (/api/*) requests are never cached. Data must always be live.

const CACHE_NAME = 'al-maha-shell-v1';
const OFFLINE_URL = '/';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => { /* first-run offline — precache is best-effort */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('al-maha-shell-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache API responses — they must always reflect server truth.
  if (url.pathname.startsWith('/api/')) return;

  // SPA navigations: network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((response) => {
            if (response && response.status === 200) {
              cache.put(req, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
  }
});

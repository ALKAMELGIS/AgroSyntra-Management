/* AgroSyntra service worker — the app opens and the field map shows without signal.
 *  - app shell: network-first for pages (fallback to the cached index.html), cache-first for hashed /assets
 *  - basemap tiles: stale-while-revalidate (kept for offline use; "Save field offline" pre-fills them)
 *  API calls are not cached here: the app keeps its own offline data (notes cache + outbox). */
const SHELL = "ags-shell-v1";
const TILES = "ags-tiles-v1";
const MODELS = "ags-models-v1";
const TILE_MAX = 4000;
const TILE_HOSTS = ["server.arcgisonline.com", "services.arcgisonline.com", "api.mapbox.com", "tile.openstreetmap.org", "tiles.stadiamaps.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/index.html", "/favicon.svg", "/manifest.webmanifest"]).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![SHELL, TILES, MODELS].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - TILE_MAX; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === "opaque") { c.put(req, r.clone()); if (Math.random() < 0.02) trimTiles(); } return r; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/models/")) {
    e.respondWith((async () => {
      const c = await caches.open(MODELS);
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit || Response.error());
      return hit || net;
    })());
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { caches.open(SHELL).then((c) => c.put("/index.html", r.clone())); return r; })
      .catch(async () => (await caches.match("/index.html")) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/") || /\.(woff2?|svg|png)$/.test(url.pathname)) {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
  }
});

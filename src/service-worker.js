/* eslint-disable no-restricted-globals */
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { ExpirationPlugin } from 'workbox-expiration';

precacheAndRoute(self.__WB_MANIFEST);

const handler = createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html');
const navigationRoute = new NavigationRoute(handler, {
  denylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
});
registerRoute(navigationRoute);

// Cache API reference data (stale-while-revalidate)
registerRoute(
  ({ url }) =>
    url.pathname.includes('/manpower/activities') ||
    url.pathname.includes('/manpower/fields-with-variety') ||
    url.pathname.includes('/manpower/workers/search') ||
    url.pathname.includes('/crops') ||
    url.pathname.includes('/fields'),
  new StaleWhileRevalidate({
    cacheName: 'api-reference-data',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 3600 })],
  })
);

// Cache static images
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 })],
  })
);

// Cache fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts' })
);

// Background sync for offline form submissions
const bgSyncPlugin = new BackgroundSyncPlugin('offline-records-queue', {
  maxRetentionTime: 24 * 60,
});

registerRoute(
  ({ url, request }) =>
    request.method === 'POST' && (
      url.pathname.includes('/manpower/records') ||
      url.pathname.includes('/ecph')
    ),
  new NetworkFirst({
    cacheName: 'api-writes',
    plugins: [bgSyncPlugin],
  }),
  'POST'
);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

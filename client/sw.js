/**
 * Service worker (registered on deployed sites, not on localhost).
 *  - App files: network first, falling back to the last copy when offline.
 *  - Gallery photos from Unsplash: cache first, so a live demo survives a flaky network.
 *  - API responses are never cached; the app labels possibly stale data instead.
 */
const APP_CACHE = 'aerotrack-app-v1';
const PHOTO_CACHE = 'aviation-photos';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(['/', '/css/styles.css', '/js/main.js', '/js/theme-init.js', '/icons/icon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== PHOTO_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === 'https://images.unsplash.com') {
    event.respondWith(
      caches.open(PHOTO_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(request)) ?? (request.mode === 'navigate' ? caches.match('/') : Response.error())),
  );
});

/* Collectibles offline shell — cache the app chrome so downloaded music can play. */
const VERSION = 'onsocial-collectibles-shell-v1';
const SHELL_PATHS = ['/collectibles', '/collectibles/play'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL_PATHS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isApiPath(pathname) {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/graph') ||
    pathname.includes('/onapi/')
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(VERSION);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(VERSION);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiPath(url.pathname)) return;

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.(?:woff2?|svg|png|jpg|jpeg|webp|css|js)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  const collectiblesPath =
    url.pathname === '/collectibles' ||
    url.pathname.startsWith('/collectibles/');

  if (request.mode === 'navigate' || collectiblesPath) {
    event.respondWith(networkFirst(request, '/collectibles'));
  }
});

/* OnSocial app shell — installable PWA + Collectibles offline chrome. */
const CACHE_NAME = 'onsocial-app-shell-v2';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/onsocial_icon_192.png',
  '/onsocial_icon_512.png',
  '/onsocial_icon_maskable_512.png',
  '/apple-touch-icon.png',
  '/collectibles',
  '/collectibles/play',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
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
            .filter((key) => key !== CACHE_NAME)
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
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Collectibles chrome only — may cache for offline listen. */
async function networkFirstCollectibles(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match('/collectibles');
    if (fallback) return fallback;
    throw new Error('offline');
  }
}

/**
 * App navigations stay network-only so deploys are not sticky.
 * Offline fallback is the precached gate (`/`), never a stale HTML document.
 */
async function networkOnlyNavigate(request) {
  try {
    return await fetch(request);
  } catch {
    const fallback = await caches.match('/');
    if (fallback) return fallback;
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
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/fonts/') ||
    /\.(?:woff2?|png|svg|ico|webp)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  const collectiblesPath =
    url.pathname === '/collectibles' ||
    url.pathname.startsWith('/collectibles/');

  if (request.mode === 'navigate') {
    if (collectiblesPath) {
      event.respondWith(networkFirstCollectibles(request));
      return;
    }
    event.respondWith(networkOnlyNavigate(request));
    return;
  }

  if (collectiblesPath) {
    event.respondWith(networkFirstCollectibles(request));
  }
});

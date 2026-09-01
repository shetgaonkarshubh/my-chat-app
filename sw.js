const CACHE_NAME = 'self-chat-v11';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './localforage.min.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept only local app assets; bypass Service Worker for GitHub API
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // If request is going to GitHub API or external URLs, do NOT intercept
  if (url.origin !== location.origin || url.hostname.includes('github')) {
    return; // Passes straight to the network
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache valid responses
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        // Return fallback or network error if not in cache
        return new Response('Network error occurred', {
          status: 408,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
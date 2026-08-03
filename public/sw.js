/* HBR Toolbox Service Worker — offline cache */
const CACHE = 'hbr-toolbox-v1';
const SCOPE = self.registration.scope; // ends with '/', base-agnostic
const INDEX = SCOPE;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.add(INDEX))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Same-origin only; let Supabase/fonts/analytics go through the network untouched
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;

  // Navigation: NetworkFirst with cached index fallback (offline shell)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(INDEX, copy));
          return res;
        })
        .catch(() => caches.match(INDEX))
    );
    return;
  }

  // Static assets (JS/CSS/WebP): CacheFirst
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});

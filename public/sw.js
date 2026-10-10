/* HBR Toolbox Service Worker — offline cache */
const CACHE = 'hbr-toolbox-v4';
const SCOPE = self.registration.scope; // ends with '/', base-agnostic
const INDEX = SCOPE;

// Precached on install: the shell plus the icons/manifest. The icons matter because
// the tab icon is fetched by the browser itself, outside any app code — when the
// CacheFirst rule below misses, the tab is left blank while the app still renders
// from cache.
//
// Bumping CACHE is what forces every existing client to drop its old cache (see the
// activate handler). This name sat at v1 on the Vercel deployment and was never
// raised, so those clients stayed pinned to whatever they cached first, while the
// other deployment went v1 -> v2 -> v3 and therefore re-fetched everything.
const PRECACHE = [INDEX, 'icon-192.png', 'icon-512.png', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Tolerant precache: one missing file must not fail the whole install, since a
      // failed install leaves the previous worker in charge indefinitely. (Some
      // branches ship without manifest.json or the PNG icons.)
      .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {}))))
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

  // Never intercept API calls — they must always hit the network (local SQLite backend).
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

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

// Service worker do GeoGus: app-shell cache-first, dados/tiles network-first.
const SHELL = 'gg-shell-v4';
const DATA = 'gg-data-v4';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (url.origin === location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/'))) {
    // dados: rede primeiro, cache como fallback offline
    e.respondWith(
      fetch(e.request)
        .then((r) => { caches.open(DATA).then((c) => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  if (url.hostname.includes('basemaps.cartocdn.com') || url.hostname.includes('arcgisonline.com') || url.hostname.includes('nominatim.openstreetmap.org')) {
    // tiles/geocoding: rede primeiro com fallback de cache
    e.respondWith(
      fetch(e.request)
        .then((r) => { caches.open(DATA).then((c) => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  if (url.origin === location.origin && (url.pathname === '/' || url.pathname === '/index.html')) {
    // entrypoint: rede primeiro para acompanhar hashes de build
    e.respondWith(
      fetch(e.request).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request))
    );
    return;
  }
  if (url.origin === location.origin) {
    // app shell (assets com hash): cache primeiro com atualização em segundo plano
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const net = fetch(e.request).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => hit);
        return hit || net;
      })
    );
  }
});

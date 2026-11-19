// Service worker do GeoGus: app-shell cache-first, dados/tiles network-first.
// v15: ondas circulares globais para alertas vulcânicos laranja/vermelhos e estados oficiais ativos.
const SHELL = 'gg-shell-v15';
const DATA = 'gg-data-v15';

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});


// Exibe notificações push enviadas pelo servidor quando o app estiver em segundo plano/fechado.
// A entrega remota depende de subscription Web Push e chaves VAPID configuradas no backend.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch { payload = { body: event.data?.text?.() || 'Há uma nova atualização no GeoGus.' }; }
  const title = payload.title || 'GeoGus · Novo alerta';
  const options = {
    body: payload.body || payload.message || 'Um novo evento foi registrado.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || payload.id || 'geogus-push',
    renotify: Boolean(payload.renotify),
    data: { url: payload.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appClient = windows.find((client) => client.url.startsWith(self.location.origin));
    if (appClient && target.startsWith('/')) {
      await appClient.focus();
      if ('navigate' in appClient) await appClient.navigate(new URL(target, self.location.origin).href);
      return;
    }
    await self.clients.openWindow(target.startsWith('http') ? target : new URL(target, self.location.origin).href);
  })());
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icons/icon.svg']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL && key !== DATA).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function fetchAndCache(request, cacheName) {
  const response = await fetch(request);
  // Clone imediatamente, antes de devolver a resposta ao navegador ou consumir seu body.
  if (response.ok) {
    const copy = response.clone();
    try {
      const cache = await caches.open(cacheName);
      await cache.put(request, copy);
    } catch {
      // Falha de cache não deve transformar uma resposta de rede válida em erro.
    }
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Feeds em tempo quase real: não servir dados antigos do cache do navegador.
  if (url.origin === self.location.origin && (url.pathname === '/api/tsunami' || url.pathname === '/api/earthquakes')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (url.origin === self.location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/'))) {
    event.respondWith(fetchAndCache(event.request, DATA).catch(async () => {
      return (await caches.match(event.request)) || Response.error();
    }));
    return;
  }

  if (url.hostname.includes('basemaps.cartocdn.com') || url.hostname.includes('arcgisonline.com') || url.hostname.includes('nominatim.openstreetmap.org')) {
    event.respondWith(fetchAndCache(event.request, DATA).catch(async () => {
      return (await caches.match(event.request)) || Response.error();
    }));
    return;
  }

  if (url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(fetchAndCache(event.request, SHELL).catch(async () => {
      return (await caches.match(event.request)) || Response.error();
    }));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((hit) => {
        if (hit) {
          // Atualiza o cache em segundo plano, clonando antes do consumo da resposta.
          fetchAndCache(event.request, SHELL).catch(() => {});
          return hit;
        }
        return fetchAndCache(event.request, SHELL).catch(() => Response.error());
      })
    );
  }
});

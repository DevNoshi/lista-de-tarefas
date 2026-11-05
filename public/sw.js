const CACHE = 'lista-de-tarefas-v1';
const SHELL = [
  '/',
  '/css/style.css',
  '/js/script.js',
  '/js/push.js',
  '/imgs/favicon-32x32.png',
  '/imgs/icon-192.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Rede primeiro (sempre pega a versão nova); cache só como fallback offline.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(request)) || (await caches.match('/')))
  );
});

// Chega do servidor mesmo com o navegador/aba fechados.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Lista de Tarefas', {
      body: data.body || '',
      tag: data.tag,
      icon: '/imgs/icon-192.png',
      badge: '/imgs/badge-96.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) {
      if ('focus' in w) { await w.focus(); return; }
    }
    await self.clients.openWindow(url);
  })());
});

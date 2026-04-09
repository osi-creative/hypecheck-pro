const CACHE_NAME = 'schedule-pro-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/db.js',
  '/manifest.json',
];

// ─── Install ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignore caching errors during dev
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
  console.log('[SW] Activated');
});

// ─── Fetch (Cache First untuk aset, Network First untuk API) ─
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET dan API calls
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline fallback
          if (url.pathname === '/' || url.pathname.endsWith('.html')) {
            return caches.match('/index.html');
          }
        });
    })
  );
});

// ─── Background Sync ──────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-schedules') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC' });
        });
      })
    );
  }
});

// ─── Push Notification ────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Schedule Pro', {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data: data,
      actions: [
        { action: 'open', title: 'Buka App' },
        { action: 'dismiss', title: 'Tutup' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(clients.openWindow('/'));
  }
});

// THE PLUG 242 — service worker
// Network-FIRST for page loads/navigations: always try to fetch the freshest
// HTML so a new deploy reaches users on their next open. The saved copy is used
// only as an offline fallback. Other assets stay stale-while-revalidate for speed.
const CACHE = 'plug242-v4';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Page navigations (and the HTML itself): network-first so deploys take effect.
  const isNav = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNav) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.open(CACHE).then((c) =>
            c.match(req).then((cached) => cached || c.match('./'))
          )
        )
    );
    return;
  }

  // Everything else: serve from cache instantly, refresh in the background.
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);
        return cached || network;
      })
    )
  );
});

// ── WEB PUSH ───────────────────────────────────────────────────────────────
// A push from the server (a new delivery/task) wakes the service worker even
// when the app is fully closed, and we show a system notification.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {
    try { data = { body: e.data && e.data.text() }; } catch (e2) {}
  }
  const title = data.title || 'THE PLUG 242';
  const body = data.body || 'New delivery / task';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag || 'plug242-task',
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
      data: { url: data.url || './' },
    })
  );
});

// Tapping the notification focuses the open app (or opens it) on the Tasks page.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  // An EXTERNAL link (e.g. a customer's wa.me WhatsApp link on a delivery alert) →
  // open it directly so tapping the notification jumps straight into the chat.
  const external = /^https?:\/\//i.test(target) && target.indexOf('242plug.netlify.app') === -1 && target.indexOf('github.io') === -1;
  e.waitUntil((async () => {
    if (external) {
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return;
    }
    // Otherwise focus the open app (or open it) on the Tasks page.
    const cl = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cl) {
      if ('focus' in c) { c.postMessage({ type: 'open-tasks' }); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

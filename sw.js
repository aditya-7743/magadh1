const CACHE_NAME = 'lms-v53';
const IS_LOCALHOST = ['127.0.0.1', 'localhost', '[::1]'].includes(self.location.hostname);
const assets = ['config', 'firebase-db', 'store', 'db-core', 'auth', 'utils', 'finance', 'records', 'icons', 'components', 'attendance-alerts', 'sql-migration', 'sql-api', 'sql-db', 'accounts-access', 'router', 'login', 'dashboard', 'students', 'seats', 'payments', 'accounts', 'dues', 'alerts', 'attendance', 'activity', 'settings', 'chatbot', 'screensaver', 'app'];
const urls = ['./', './index.html', './styles.css?v=53', './modern.css?v=53', './icon.svg', './manifest.json', ...assets.map(name => './js/' + name + '.js?v=53')];
const vendors = ['https://cdn.tailwindcss.com', 'https://unpkg.com/react@18/umd/react.production.min.js', 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js', 'https://unpkg.com/htm@3/dist/htm.js', ...['app', 'database', 'auth'].map(name => 'https://www.gstatic.com/firebasejs/9.23.0/firebase-' + name + '-compat.js')];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(urls);
  // Local edits should take effect on the next refresh, without closing every tab.
  if (IS_LOCALHOST) await self.skipWaiting();
  await Promise.allSettled(vendors.map(url => cache.add(url)));
})()));
// Activation never reloads an open page or interrupts its unsaved form.
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('lms-') && key !== CACHE_NAME) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  const local = url.origin === self.location.origin;
  const vendor = vendors.some(value => new URL(value).origin === url.origin);
  if (!local && !vendor) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response.ok) await cache.put('./index.html', response.clone());
        return response;
      }
      catch { return await cache.match('./index.html'); }
    }
    // On localhost, prefer the source files over a previously cached release.
    if (IS_LOCALHOST && local) {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        const offline = await cache.match(event.request);
        if (offline) return offline;
        throw error;
      }
    }
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && (local || vendor)) await cache.put(event.request, response.clone());
    return response;
  })());
});

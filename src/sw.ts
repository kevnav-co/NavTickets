import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// --- Force immediate activation ---
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// --- Workbox precache ---
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// --- Runtime Caching Strategies ---

// Supabase REST API - NetworkFirst for freshness, fallback to cache offline
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/v1/'),
  new NetworkFirst({
    cacheName: 'supabase-api',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
        purgeOnQuotaError: true,
      }),
    ],
    networkTimeoutSeconds: 5,
  })
);

// Supabase Auth API - NetworkOnly (auth should always go to network)
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.startsWith('/auth/v1/'),
  new NetworkOnly()
);

// Supabase Realtime - NetworkOnly (websockets don't cache)
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.startsWith('/realtime/v1/'),
  new NetworkOnly()
);

// Supabase Storage - CacheFirst for images/files
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.startsWith('/storage/v1/'),
  new CacheFirst({
    cacheName: 'supabase-storage',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Google Fonts - CacheFirst
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// Firebase Storage (legacy) - CacheFirst
registerRoute(
  ({ url }) => url.hostname === 'firebasestorage.googleapis.com',
  new CacheFirst({
    cacheName: 'firebase-storage',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// App routes - StaleWhileRevalidate for navigation
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new StaleWhileRevalidate({
    cacheName: 'pages',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
    ],
  })
);

const ICON_URL = 'https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Icon-app.png?alt=media&token=11895e56-9aaa-4691-92ca-3b66c4c8417d';

// --- Company name cache (set from main thread via postMessage) ---
let companyName: string | null = null;

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SET_COMPANY_NAME') {
    companyName = event.data.name;
    console.log(`[SW] Company name updated: ${companyName}`);
  }

  // Allow clients to request cache clearing
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('supabase-') || name === 'pages')
            .map((name) => caches.delete(name))
        );
      }).then(() => {
        event.ports[0]?.postMessage({ success: true });
      })
    );
  }
});

// --- Primary push handler (works on ALL platforms: Android, iOS, Desktop) ---
// This is the SINGLE source of truth for displaying notifications.
// We do NOT use Firebase's onBackgroundMessage because:
// 1. It doesn't reliably fire on iOS Safari PWA
// 2. It conflicts with native push events on Android Chrome
// 3. The native 'push' event is the W3C standard and works everywhere
// 4. The previous implementation had a critical bug where the native handler
//    was skipped when Firebase SDK initialized, causing silent notification drops.
self.addEventListener('push', (event: PushEvent) => {
  console.log('[SW] Push event received.');

  let title = companyName || 'Notificación';
  let body = 'Tienes una nueva notificación.';
  let path = '/';
  let url = '/';

  try {
    const data = event.data?.json();
    console.log('[SW] Push data:', data);
    
    if (data) {
      // 1. Notification Object (standard FCM)
      if (data.notification) {
        title = data.notification.title || title;
        body = data.notification.body || body;
      }

      // 2. Data Object (custom fields)
      if (data.data) {
        title = data.data.title || title;
        body = data.data.body || body;
        path = data.data.path || path;
        url = data.data.url || url;
      }

      // 3. Webpush options link (fallback)
      if (data.fcmOptions?.link) {
        url = data.fcmOptions.link;
      }
    }
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
    try {
      const text = event.data?.text();
      if (text) body = text;
    } catch { }
  }

  // Ensure url is at least the path if url is not absolute
  if (url === '/' && path !== '/') {
    url = `/#${path}`;
  }

  const notificationOptions: NotificationOptions = {
    body,
    icon: ICON_URL,
    badge: ICON_URL,
    data: { url, path }, // Store both for click handler
    tag: `navas-${Date.now()}`,
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions)
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as { url?: string, path?: string };
  const urlToOpen = data.url || '/';

  console.log('[SW] Notification clicked. Target URL:', urlToOpen);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList: readonly Client[]) => {
      // 1. Try to find an existing window client that is already open
      for (const client of clientList) {
        const windowClient = client as WindowClient;
        // Check if the client is one of ours (matches origin)
        if (windowClient.url.startsWith(self.location.origin)) {
          console.log('[SW] Found existing client, navigating and focusing.');
          return windowClient.navigate(urlToOpen).then(c => c?.focus());
        }
      }

      // 2. If no window is open, open a new one
      console.log('[SW] No existing client found, opening new window.');
      return self.clients.openWindow(urlToOpen);
    })
  );
});

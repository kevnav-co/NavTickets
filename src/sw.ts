import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute, Route } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

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

// --- Background Sync for mutations ---
// Queue failed POST/PUT/DELETE requests when offline
const bgSyncPlugin = new BackgroundSyncPlugin('supabase-mutations-queue', {
  maxRetentionTime: 24 * 60, // 24 hours
  onSync: async (queue) => {
    console.log('[SW] Background sync triggered');
  },
});

// Register background sync for Supabase REST API mutations
registerRoute(
  ({ url, request }) => {
    const isSupabaseRest = url.hostname.includes('supabase.co') &&
      url.pathname.startsWith('/rest/v1/');
    return isSupabaseRest && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method);
  },
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'POST'
);

registerRoute(
  ({ url, request }) => {
    const isSupabaseRest = url.hostname.includes('supabase.co') &&
      url.pathname.startsWith('/rest/v1/');
    return isSupabaseRest && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method);
  },
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'PATCH'
);

registerRoute(
  ({ url, request }) => {
    const isSupabaseRest = url.hostname.includes('supabase.co') &&
      url.pathname.startsWith('/rest/v1/');
    return isSupabaseRest && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method);
  },
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'PUT'
);

registerRoute(
  ({ url, request }) => {
    const isSupabaseRest = url.hostname.includes('supabase.co') &&
      url.pathname.startsWith('/rest/v1/');
    return isSupabaseRest && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method);
  },
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'DELETE'
);

// --- Runtime Caching Strategies ---

// Supabase REST API (GET) - NetworkFirst for freshness, fallback to cache offline
registerRoute(
  ({ url, request }) => url.hostname.includes('supabase.co') &&
    url.pathname.startsWith('/rest/v1/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'supabase-api',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 500,
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
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
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

// CDN resources (unpkg, jsdelivr, etc.) - StaleWhileRevalidate
registerRoute(
  ({ url }) => url.hostname === 'unpkg.com' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'cdn.tailwindcss.com',
  new StaleWhileRevalidate({
    cacheName: 'cdn-resources',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// App routes (navigation) - StaleWhileRevalidate for SPA navigation
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

const ICON_URL = '/assets/icon-app.png';

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
            .filter((name) => name.startsWith('supabase-') || name === 'pages' || name === 'cdn-resources')
            .map((name) => caches.delete(name))
        );
      }).then(() => {
        event.ports[0]?.postMessage({ success: true });
      })
    );
  }

  // Handle skip waiting message
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// --- Primary push handler ---
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
      if (data.notification) {
        title = data.notification.title || title;
        body = data.notification.body || body;
      }

      if (data.data) {
        title = data.data.title || title;
        body = data.data.body || body;
        path = data.data.path || path;
        url = data.data.url || url;
      }

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

  if (url === '/' && path !== '/') {
    url = `/#${path}`;
  }

  const notificationOptions: NotificationOptions = {
    body,
    icon: ICON_URL,
    badge: ICON_URL,
    data: { url, path },
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
      for (const client of clientList) {
        const windowClient = client as WindowClient;
        if (windowClient.url.startsWith(self.location.origin)) {
          console.log('[SW] Found existing client, navigating and focusing.');
          return windowClient.navigate(urlToOpen).then(c => c?.focus());
        }
      }

      console.log('[SW] No existing client found, opening new window.');
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// --- Periodic background sync registration ---
self.addEventListener('periodicsync', (event: ExtendableEvent) => {
  if (event.tag === 'check-updates') {
    event.waitUntil(
      self.registration.update().catch(console.error)
    );
  }
});
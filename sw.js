/**
 * GrevesPT - Service Worker
 * Versão: 2.0.0
 * Suporte a OneSignal Web Push SDK + Estratégia Network First para greves.json
 * Suporte offline completo para utentes sem rede no metro/comboios.
 */

// 1. Integração com o Service Worker do OneSignal (apenas se ativado por parâmetro)
if (typeof self !== 'undefined' && self.location && self.location.search.includes('onesignal=true')) {
  try {
    importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
  } catch (e) {
    // Silencioso em contingência offline
  }
}

const CACHE_STATIC_NAME = 'grevespt-static-v2';
const CACHE_DATA_NAME = 'grevespt-data-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/greves.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
  'https://cdn.tailwindcss.com'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME).then((cache) => {
      return cache.addAll(
        STATIC_ASSETS.map((url) => new Request(url, { cache: 'reload' }))
      ).catch((err) => {
        console.warn('[SW] Aviso na pré-cache de alguns recursos:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Ativação e limpeza de caches antigas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_STATIC_NAME && key !== CACHE_DATA_NAME) {
            console.log('[SW] A remover cache antiga:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceção de pedidos de rede
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (!event.request.url.startsWith('http')) return;

  // Não intercetar chamadas de API do OneSignal
  if (requestUrl.hostname.includes('onesignal.com')) {
    return;
  }

  // 1. ESTRATÉGIA PARA DADOS: Network First, falling back to cache
  if (requestUrl.pathname.endsWith('greves.json') || requestUrl.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_DATA_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[SW] Sem rede para dados. A recorrer à cache para:', event.request.url);
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const fallbackMatch = await caches.match('/greves.json');
          if (fallbackMatch) {
            return fallbackMatch;
          }
          return new Response(JSON.stringify({ error: 'offline', offline: true, items: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
          });
        })
    );
    return;
  }

  // 2. ESTRATÉGIA PARA NAVEGAÇÃO HTML
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cachedHtml = await caches.match('/index.html') || await caches.match('/');
        return cachedHtml || new Response('Modo Offline - GrevesPT', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      })
    );
    return;
  }

  // 3. ESTRATÉGIA PARA RECURSOS ESTÁTICOS
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_STATIC_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.destination === 'image') {
          return caches.match('/icon.svg');
        }
      });
    })
  );
});

// Fallback nativo para eventos push quando OneSignal não processar
self.addEventListener('push', (event) => {
  // Se o OneSignal processar a mensagem, este handler serve de fallback seguro
  if (!event.data) return;
  try {
    const data = event.data.json();
    if (data && data.custom && data.custom.i) {
      // É uma notificação OneSignal, o OneSignalSDK.sw.js cuida do display
      return;
    }
  } catch (e) {
    // Payload em texto simples
  }

  const options = {
    body: event.data ? event.data.text() : 'Nova atualização de greves em Portugal.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [200, 100, 200],
    tag: 'grevespt-broadcast-alert',
    data: { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification('GrevesPT • Alerta de Greve', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

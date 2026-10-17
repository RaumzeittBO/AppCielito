importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCdyWVDT3P6lDi8S_OgARUKrhhALKxLil8',
  authDomain: 'appcielito.firebaseapp.com',
  projectId: 'appcielito',
  storageBucket: 'appcielito.firebasestorage.app',
  messagingSenderId: '622582613718',
  appId: '1:622582613718:web:86a859f90c3bc44dc5eb77',
});

const SHELL_CACHE = 'cielito-shell-v2';
const ASSET_CACHE = 'cielito-assets-v2';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon.svg'];

firebase.messaging().onBackgroundMessage(({ notification, data }) => {
  self.registration.showNotification(notification?.title || 'Recordatorio de Cielito', {
    body: notification?.body || 'Tienes una entrega pendiente.',
    icon: '/icon.svg',
    tag: data?.reminderId || undefined,
    renotify: false,
    data: { url: data?.url || '/' },
  });
});

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL_URLS.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const oldCaches = (await caches.keys()).filter(name => name.startsWith('cielito-') && ![SHELL_CACHE, ASSET_CACHE].includes(name));
    await Promise.all(oldCaches.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});

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
const messaging = firebase.messaging();
messaging.onBackgroundMessage(({ notification, data }) => {
  self.registration.showNotification(notification?.title || 'Recordatorio de Cielito', {
    body: notification?.body || 'Tienes una entrega pendiente.',
    icon: '/icon.svg',
    tag: data?.reminderId || undefined,
    renotify: false,
    data: { url: data?.url || '/' },
  });
});
self.addEventListener('install',event=>{event.waitUntil(caches.open('cielito-v1').then(cache=>cache.addAll(['/','/manifest.webmanifest','/icon.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{if(event.request.method==='GET'&&new URL(event.request.url).origin===location.origin){event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open('cielito-v1').then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match('/'))));}});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow(event.notification.data?.url||'/'));});

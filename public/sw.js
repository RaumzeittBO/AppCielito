self.addEventListener('install',event=>{event.waitUntil(caches.open('cielito-v1').then(cache=>cache.addAll(['/','/manifest.webmanifest','/icon.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{if(event.request.method==='GET'&&new URL(event.request.url).origin===location.origin){event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open('cielito-v1').then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match('/'))));}});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow('/'));});

/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Service worker powiadomień push dla RejHub 2.0 (rejhub.vercel.app).
   Obsługuje wyłącznie push i kliknięcie — nie przechwytuje ruchu strony. */
'use strict';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (error) { data = { body: event.data && event.data.text() }; }
  var title = data.title || 'RejHub';
  var options = {
    body: data.body || 'Masz nowe powiadomienie.',
    icon: '/hub/brand-mark.svg',
    badge: '/hub/brand-mark.svg',
    tag: data.tag || 'rejhub',
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
    vibrate: [40, 30, 40]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i += 1) {
        var client = list[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(function () {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

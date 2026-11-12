/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/*!
 * RejHub 2.0 — service worker (rejhub.vercel.app), wersja 4.
 *
 * Dwie rzeczy naraz:
 *   1. POWIADOMIENIA PUSH — push, notificationclick i powiadomienie testowe
 *      na żądanie strony (RJ_NOTIFY_TEST),
 *   2. LOKALNA PAMIĘĆ POWŁOKI — CSS, JS, fonty i tapety zostają w przeglądarce,
 *      więc kolejne wejście i przejścia między podstronami nie czekają na sieć,
 *      a nowa wersja strony pobiera się po cichu w tle.
 *
 * Czego ten plik pilnuje (te zasady są ważniejsze niż szybkość):
 *   A. /api/, strony logowania, panel, profil, konto i „w budowie” NIGDY nie
 *      trafiają do cache — ani ich HTML, ani odpowiedzi API. Cache nie może
 *      pokazać cudzej sesji ani zamrozić formularza logowania.
 *   B. HTML jest zawsze najpierw z sieci (z limitem czasu). Cache to wyłącznie
 *      ratunek na offline lub na zbyt wolne łącze — strona nie „zamarza”
 *      na starej wersji.
 *   C. Zasób z numerem wersji (?v=...) idzie natychmiast z cache i odświeża się
 *      w tle. Zasób bez numeru — najpierw sieć, cache tylko jako ratunek.
 *   D. Odpowiedzi z `cache-control: no-store`, przekierowania i błędy nie są
 *      zapisywane.
 *   E. Nowa wersja pracownika instaluje się po cichu i kasuje stare cache.
 */
'use strict';

var VERSION = 'v4';
var PREFIX = 'rj-shell-';
var HTML_CACHE = PREFIX + 'html-' + VERSION;
var ASSET_CACHE = PREFIX + 'assets-' + VERSION;
var FONT_CACHE = PREFIX + 'fonts-' + VERSION;
var CURRENT_CACHES = [HTML_CACHE, ASSET_CACHE, FONT_CACHE];

/* HTML z sieci: tyle czekamy, zanim pokażemy wersję z pamięci. */
var NAV_TIMEOUT_MS = 3500;
/* Zasób bez numeru wersji: krótko, bo to zwykle jedno warunkowe 304. */
var ASSET_TIMEOUT_MS = 1800;

var MAX_HTML = 24;
var MAX_ASSETS = 180;
var MAX_FONTS = 24;
var MAX_WARM_URLS = 48;

/* Strony publiczne — tylko one mogą wylądować w cache jako HTML.
   Wszystko inne jest za bramą serwerową i nie może zostać zapisane lokalnie. */
var PUBLIC_NAV = /^\/(?:index\.html)?$|^\/(?:licencja|w-budowie)(?:\.html)?$|^\/(?:ai|humans|robots)\.txt$/i;
/* Pas bezpieczeństwa: nawet gdyby coś się zmieniło w PUBLIC_NAV, te ścieżki
   są nietykalne. */
var PRIVATE_NAV = /^\/(?:api|login|logowanie|panel|admin|profil|konto-demo|w-budowie|studio-source)(?:[/.]|$)/i;

var ASSET_EXT = /\.(?:css|m?js|json|map|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf)$/i;
var FONT_HOSTS = { 'fonts.googleapis.com': 1, 'fonts.gstatic.com': 1 };

/* Małe, niezmienne pliki pobierane od razu po instalacji. Tapety są potrzebne
   do pierwszej klatki, a ikona do powiadomień — bez nich offline wygląda pusto. */
var PRECACHE = [
  '/favicon.svg',
  '/hub/brand-mark.svg',
  '/hub/wallpaper-1280.webp',
  '/hub/wallpaper-mobile.webp',
  '/hub/wallpaper-glass.webp',
  '/hub/wallpaper-glass-light.webp'
];

function noop() {}

function safe(promise) {
  try {
    return Promise.resolve(promise).catch(noop);
  } catch (error) {
    return Promise.resolve();
  }
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      reject(new Error('timeout'));
    }, ms);
    promise.then(
      function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      },
      function (error) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function cacheable(response) {
  if (!response || !response.ok || response.status !== 200) return false;
  if (response.redirected) return false;
  var control = '';
  try {
    control = String(response.headers.get('cache-control') || '').toLowerCase();
  } catch (error) {
    control = '';
  }
  if (control.indexOf('no-store') !== -1) return false;
  return true;
}

/* Odpowiedź offline dla nawigacji — bez plików zewnętrznych, więc działa
   także wtedy, gdy nie ma czym pobrać nawet logo. */
function offlineResponse() {
  var html =
    '<!doctype html><html lang="pl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#0b0e13">' +
    '<title>RejHub — brak połączenia</title>' +
    '<style>' +
    'html,body{margin:0;height:100%;background:#0b0e13;color:#e8eefc;' +
    'font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    'body{display:grid;place-items:center;padding:24px;box-sizing:border-box}' +
    'main{max-width:420px;text-align:center}' +
    '.mark{width:56px;height:56px;margin:0 auto 18px;border-radius:16px;' +
    'background:linear-gradient(158deg,rgba(255,255,255,.16),rgba(255,255,255,.03));' +
    'border:1px solid rgba(255,255,255,.14);display:grid;place-items:center;' +
    'font-weight:700;font-size:22px;letter-spacing:.02em}' +
    'h1{font-size:20px;margin:0 0 10px;font-weight:600}' +
    'p{margin:0 0 20px;color:#9fb0cc}' +
    'button{font:inherit;font-weight:600;color:#0b0e13;background:#e8eefc;' +
    'border:0;border-radius:999px;padding:11px 22px;cursor:pointer}' +
    'button:active{transform:scale(.98)}' +
    'footer{margin-top:26px;font-size:12px;color:#66748c}' +
    'footer a{color:#9fb0cc}' +
    '</style></head><body><main>' +
    '<div class="mark">RJ</div>' +
    '<h1>Brak połączenia z internetem</h1>' +
    '<p>Ta strona nie zdążyła zapisać się w pamięci przeglądarki. ' +
    'Sprawdź sieć i spróbuj ponownie.</p>' +
    '<button onclick="location.reload()">Spróbuj ponownie</button>' +
    '<footer>© 2026 rejson59 · <a href="/licencja">licencja</a></footer>' +
    '</main></body></html>';
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

/* Odpowiedź dla zasobu (CSS/JS), którego nie ma w cache i nie ma sieci.
   Nie może to być HTML — przeglądarka próbowałaby go sparsować jako arkusz. */
function failedAsset() {
  return new Response('', {
    status: 504,
    statusText: 'offline',
    headers: { 'cache-control': 'no-store' }
  });
}

function trim(cacheName, max) {
  return safe(
    caches.open(cacheName).then(function (cache) {
      return cache.keys().then(function (keys) {
        if (keys.length <= max) return undefined;
        var drop = keys.slice(0, keys.length - max);
        return Promise.all(drop.map(function (key) { return cache.delete(key).catch(noop); }));
      });
    })
  );
}

function putInto(cacheName, key, response, max) {
  return safe(
    caches.open(cacheName).then(function (cache) {
      return cache.put(key, response).then(function () { return trim(cacheName, max); });
    })
  );
}

/* ---------- strategie ---------- */

function navigationResponse(event, request, url) {
  var isPublic = PUBLIC_NAV.test(url.pathname) && !PRIVATE_NAV.test(url.pathname);
  var key = isPublic ? url.pathname : null;

  var network = fetch(request).then(function (response) {
    if (key && cacheable(response)) {
      event.waitUntil(putInto(HTML_CACHE, key, response.clone(), MAX_HTML));
    }
    return response;
  });

  if (!isPublic) {
    /* Strony prywatne: wyłącznie sieć. Offline dostaje komunikat, nie podgląd
       cudzej sesji z cache. */
    return network.catch(function () { return offlineResponse(); });
  }

  return withTimeout(network, NAV_TIMEOUT_MS).catch(function () {
    return caches
      .open(HTML_CACHE)
      .then(function (cache) { return cache.match(key); })
      .then(function (hit) {
        if (hit) return hit;
        /* Sieć mogła się jeszcze odezwać — czekamy na jej wynik, ale nie
           w nieskończoność (withTimeout już zdążył odrzucić). */
        return safe(network.then(function (response) { return response; })).then(function (response) {
          return response || offlineResponse();
        });
      })
      .catch(function () { return offlineResponse(); });
  });
}

function staleWhileRevalidate(event, request, cacheName, max) {
  return safe(
    caches.open(cacheName).then(function (cache) {
      return cache.match(request).then(function (hit) {
        var network = fetch(request)
          .then(function (response) {
            if (cacheable(response)) {
              event.waitUntil(putInto(cacheName, request, response.clone(), max));
            }
            return response;
          })
          .catch(function () { return null; });

        if (hit) {
          /* Klient dostaje pamięć od razu; sieć dogrywa nowszą wersję po cichu. */
          event.waitUntil(network);
          return hit;
        }
        return network.then(function (response) { return response || failedAsset(); });
      });
    })
  ).then(function (response) { return response || failedAsset(); });
}

function networkFirstAsset(event, request, cacheName, max) {
  return safe(
    caches.open(cacheName).then(function (cache) {
      var network = fetch(request).then(function (response) {
        if (cacheable(response)) {
          event.waitUntil(putInto(cacheName, request, response.clone(), max));
        }
        return response;
      });
      return withTimeout(network, ASSET_TIMEOUT_MS).catch(function () {
        return cache.match(request).then(function (hit) { return hit || failedAsset(); });
      });
    })
  ).then(function (response) { return response || failedAsset(); });
}

function cacheFirstFont(request) {
  return safe(
    caches.open(FONT_CACHE).then(function (cache) {
      return cache.match(request).then(function (hit) {
        if (hit) return hit;
        return fetch(request).then(function (response) {
          /* Fonty są niezmienne (adres zawiera hash), więc zapisujemy je na stałe. */
          if (cacheable(response)) {
            return cache.put(request, response.clone()).then(function () {
              return trim(FONT_CACHE, MAX_FONTS);
            }).then(function () { return response; });
          }
          return response;
        });
      });
    })
  ).then(function (response) { return response || failedAsset(); });
}

function isAssetPath(pathname) {
  if (pathname.indexOf('/api/') === 0) return false;
  /* Dokument HTML nigdy nie jest „zasobem” — inaczej trafiłby do strategii
     cache-first i zamarzł w starej wersji. */
  if (/\.html?$/i.test(pathname)) return false;
  if (pathname.indexOf('/hub/') === 0) return true;
  return ASSET_EXT.test(pathname);
}

/* ---------- cykl życia ---------- */

self.addEventListener('install', function (event) {
  event.waitUntil(
    safe(
      caches.open(ASSET_CACHE).then(function (cache) {
        return Promise.all(
          PRECACHE.map(function (url) {
            /* Ścieżki względne rozwiązuje sam worker (względem swojego scope). */
            return safe(cache.add(url));
          })
        );
      })
    ).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    safe(
      caches.keys().then(function (names) {
        return Promise.all(
          names.map(function (name) {
            if (name.indexOf(PREFIX) !== 0) return undefined;
            if (CURRENT_CACHES.indexOf(name) !== -1) return undefined;
            return caches.delete(name).catch(noop);
          })
        );
      })
    ).then(function () { return self.clients.claim(); })
  );
});

/* ---------- ruch ---------- */

self.addEventListener('fetch', function (event) {
  try {
    var request = event.request;
    if (!request || request.method !== 'GET') return;
    if (request.headers && request.headers.has && request.headers.has('authorization')) return;
    if (request.headers && request.headers.has && request.headers.has('range')) return;

    var url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    var sameOrigin = url.origin === self.location.origin;

    if (sameOrigin && PRIVATE_NAV.test(url.pathname)) return;

    if (sameOrigin && (request.mode === 'navigate' || request.destination === 'document')) {
      event.respondWith(navigationResponse(event, request, url));
      return;
    }

    if (sameOrigin && isAssetPath(url.pathname)) {
      if (url.searchParams.has('v')) {
        event.respondWith(staleWhileRevalidate(event, request, ASSET_CACHE, MAX_ASSETS));
      } else {
        event.respondWith(networkFirstAsset(event, request, ASSET_CACHE, MAX_ASSETS));
      }
      return;
    }

    if (!sameOrigin && FONT_HOSTS[url.hostname]) {
      event.respondWith(cacheFirstFont(request));
      return;
    }

    /* Wszystko inne (Supabase, API GitHuba, podglądy projektów) idzie prosto
       do sieci. Ten worker nie dotyka cudzych danych. */
  } catch (error) {
    /* Brak respondWith = zwykłe żądanie. Nigdy nie blokujemy strony. */
  }
});

/* ---------- sterowanie z karty (ciepłe ładowanie nowej wersji) ---------- */

function reply(event, payload) {
  try {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(payload);
      return;
    }
    if (event.source && event.source.postMessage) event.source.postMessage(payload);
  } catch (error) { /* kanał mógł już zniknąć */ }
}

function warmUrls(urls) {
  var list = [];
  urls.forEach(function (raw) {
    if (typeof raw !== 'string' || !raw) return;
    var target;
    try {
      target = new URL(raw, self.location.origin);
    } catch (error) {
      return;
    }
    if (target.origin !== self.location.origin) return;
    if (PRIVATE_NAV.test(target.pathname)) return;
    if (!isAssetPath(target.pathname)) return;
    list.push(target.pathname + target.search);
  });

  list = list.slice(0, MAX_WARM_URLS);

  return caches.open(ASSET_CACHE).then(function (cache) {
    var saved = 0;
    return Promise.all(
      list.map(function (url) {
        return cache.match(url).then(function (hit) {
          if (hit) return undefined; /* już jest — nie pobieramy drugi raz */
          return safe(
            fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (response) {
              if (!cacheable(response)) return undefined;
              saved += 1;
              return cache.put(url, response);
            })
          );
        });
      })
    ).then(function () { return saved; });
  }).catch(function () { return 0; });
}

self.addEventListener('message', function (event) {
  var data = event.data;
  if (!data || typeof data !== 'object' || !data.type) return;

  /* Test z panelu powiadomień: pokazujemy powiadomienie dokładnie tak, jak
     zrobi to push z serwera. Odpowiedź wraca do strony, więc użytkownik
     dostaje potwierdzenie także wtedy, gdy system ukryje baner. */
  if (data.type === 'RJ_NOTIFY_TEST') {
    event.waitUntil(
      self.registration.showNotification('RejHub — powiadomienia działają', {
        body: 'To powiadomienie testowe. Jeśli je widzisz, zgoda i subskrypcja są w porządku.',
        icon: '/hub/brand-mark.svg',
        badge: '/hub/brand-mark.svg',
        tag: 'rejhub:test',
        renotify: true,
        data: { url: '/rejchat' },
        vibrate: [40, 30, 40]
      }).then(function () {
        reply(event, { type: 'RJ_NOTIFY_TEST_DONE', ok: true });
      }).catch(function (error) {
        reply(event, { type: 'RJ_NOTIFY_TEST_DONE', ok: false, error: String((error && error.message) || error).slice(0, 200) });
      })
    );
    return;
  }

  if (data.type === 'RJ_SHELL_CACHE_WARM' && Array.isArray(data.urls)) {
    event.waitUntil(
      warmUrls(data.urls).then(function (saved) {
        reply(event, { type: 'RJ_SHELL_CACHE_WARM_DONE', saved: saved, version: VERSION });
      })
    );
    return;
  }

  if (data.type === 'RJ_SHELL_CACHE_STATE') {
    event.waitUntil(
      safe(
        Promise.all(
          CURRENT_CACHES.map(function (name) {
            return safe(caches.open(name).then(function (cache) { return cache.keys(); }))
              .then(function (keys) { return [name, keys ? keys.length : 0]; });
          })
        ).then(function (rows) {
          var entries = {};
          rows.forEach(function (row) { entries[row[0]] = row[1]; });
          reply(event, { type: 'RJ_SHELL_CACHE_STATE', version: VERSION, entries: entries });
        })
      )
    );
    return;
  }

  if (data.type === 'RJ_SHELL_CACHE_CLEAR') {
    event.waitUntil(
      safe(
        caches.keys().then(function (names) {
          return Promise.all(
            names.map(function (name) {
              if (name.indexOf(PREFIX) !== 0) return undefined;
              return caches.delete(name).catch(noop);
            })
          );
        })
      ).then(function () { reply(event, { type: 'RJ_SHELL_CACHE_CLEARED', version: VERSION }); })
    );
  }
});

/* ---------- powiadomienia (bez zmian względem wersji 2) ---------- */

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { body: event.data && event.data.text() };
  }
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

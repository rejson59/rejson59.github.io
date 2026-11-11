/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/*!
 * RejHub 2.0 — lokalna pamięć powłoki, strona klienta (v1).
 *
 * Co robi:
 *   1. rejestruje service worker `/push-sw.js` (cache + push) na domenie RejHuba,
 *   2. co 15 minut (i po powrocie do karty, i po odzyskaniu sieci) sprawdza
 *      po cichu, czy jest nowa wersja — bez pytania użytkownika i bez przeładowania,
 *   3. raz na 6 godzin „dogrzewa” cache: pobiera świeży HTML strony głównej,
 *      odczytuje z niego adresy skryptów i stylów i każe workerowi zapisać je
 *      lokalnie, żeby następne wejście nie czekało na sieć.
 *
 * Czego nie robi: nie przeładowuje strony, nie pokazuje banerów, nie dotyka
 * GitHub Pages (tam działa inny worker — tracker projektów).
 *
 * Wszystko jest opakowane w try/catch: brak workera, prywatny tryb Safari,
 * blokada storage — strona ma działać dokładnie tak samo jak bez tego pliku.
 */
(function () {
  'use strict';

  var SW_URL = '/push-sw.js';
  var STAMP_KEY = 'rj_shell_warm_v1';
  var UPDATE_INTERVAL_MS = 15 * 60 * 1000;
  var WARM_INTERVAL_MS = 6 * 60 * 60 * 1000;
  var FIRST_UPDATE_MS = 8000;
  var FIRST_WARM_MS = 20000;
  var MAX_URLS = 40;

  var state = {
    supported: false,
    registration: null,
    lastUpdate: 0,
    warming: false,
    version: ''
  };

  function noop() {}

  function hostAllowed() {
    /* Worker powłoki leży tylko na rejhub.vercel.app. Na rejson59.github.io
       w scope „/” pracuje inny service worker (tracker projektów) — rejestracja
       tutaj podmieniłaby tamten i zepsuła zliczanie wejść. */
    return /(^|\.)rejhub\.vercel\.app$/i.test(location.hostname) ||
      /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  }

  function changeStamp() {
    try {
      return Number(window.localStorage.getItem(STAMP_KEY)) || 0;
    } catch (error) {
      return 0;
    }
  }

  function saveStamp() {
    try {
      window.localStorage.setItem(STAMP_KEY, String(Date.now()));
    } catch (error) { /* prywatny tryb — trudno, dogrzewanie będzie częstsze */ }
  }

  function refreshStamp() {
    try {
      return Number(window.localStorage.getItem('rj_shell_refresh_v1')) || 0;
    } catch (error) {
      return 0;
    }
  }

  function saveRefreshStamp() {
    try {
      window.localStorage.setItem('rj_shell_refresh_v1', String(Date.now()));
    } catch (error) { /* ignorujemy */ }
  }

  function send(message) {
    var worker = null;
    try {
      worker = navigator.serviceWorker.controller ||
        (state.registration && (state.registration.active || state.registration.waiting));
    } catch (error) {
      worker = null;
    }
    if (!worker || typeof worker.postMessage !== 'function') return Promise.resolve(null);

    return new Promise(function (resolve) {
      var done = false;
      var channel = null;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(null);
      }, 4000);

      function finish(value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }

      try {
        if (typeof MessageChannel === 'function') {
          channel = new MessageChannel();
          channel.port1.onmessage = function (event) { finish(event.data); };
          worker.postMessage(message, [channel.port2]);
        } else {
          worker.postMessage(message);
          finish(null);
        }
      } catch (error) {
        finish(null);
      }
    });
  }

  /* Adresy skryptów/stylów z bieżącego dokumentu. */
  function urlsFromDocument() {
    var out = [];
    function add(value) {
      if (!value) return;
      try {
        var url = new URL(value, location.href);
        if (url.origin !== location.origin) return;
        if (!/\.(?:css|m?js)$/i.test(url.pathname)) return;
        out.push(url.pathname + url.search);
      } catch (error) { /* pomijamy */ }
    }
    try {
      document.querySelectorAll('script[src]').forEach(function (node) {
        add(node.getAttribute('src'));
      });
      document.querySelectorAll('link[rel="stylesheet"][href], link[rel="preload"][href]').forEach(function (node) {
        add(node.getAttribute('href'));
      });
    } catch (error) { /* brak DOM — trudno */ }
    return out;
  }

  /* Adresy z pobranego HTML-a — to jest „nowa wersja”, która dopiero wejdzie. */
  function urlsFromHtml(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var out = [];
    function add(value) {
      if (!value) return;
      try {
        var url = new URL(value, location.href);
        if (url.origin !== location.origin) return;
        if (!/\.(?:css|m?js|webp|png|svg|woff2?)$/i.test(url.pathname)) return;
        out.push(url.pathname + url.search);
      } catch (error) { /* pomijamy */ }
    }
    doc.querySelectorAll('script[src]').forEach(function (node) {
      add(node.getAttribute('src'));
    });
    doc.querySelectorAll('link[rel="stylesheet"][href], link[rel="preload"][href]').forEach(function (node) {
      add(node.getAttribute('href'));
    });
    return out;
  }

  function unique(list) {
    var seen = Object.create(null);
    var out = [];
    list.forEach(function (value) {
      if (!value || seen[value]) return;
      seen[value] = true;
      out.push(value);
    });
    return out.slice(0, MAX_URLS);
  }

  function connectionAllowsBackgroundWork() {
    try {
      var connection = navigator.connection;
      if (!connection) return true;
      if (connection.saveData) return false;
      if (/(^|-)2g$/i.test(connection.effectiveType || '')) return false;
      if (navigator.onLine === false) return false;
    } catch (error) { /* brak API — zakładamy, że wolno */ }
    return true;
  }

  function warm(force) {
    if (state.warming) return Promise.resolve(0);
    if (!state.registration) return Promise.resolve(0);
    if (!force && changeStamp() > Date.now() - WARM_INTERVAL_MS) return Promise.resolve(0);
    if (!connectionAllowsBackgroundWork()) return Promise.resolve(0);

    state.warming = true;

    var local = urlsFromDocument();
    var remote = [];

    return fetch('/', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) {
        if (!response || !response.ok) return '';
        return response.text();
      })
      .then(function (html) {
        if (html) remote = urlsFromHtml(html);
      })
      .catch(noop)
      .then(function () {
        var list = unique(local.concat(remote));
        if (!list.length) return 0;
        return send({ type: 'RJ_SHELL_CACHE_WARM', urls: list }).then(function (reply) {
          if (reply && typeof reply.version === 'string') state.version = reply.version;
          return reply && typeof reply.saved === 'number' ? reply.saved : 0;
        });
      })
      .catch(function () { return 0; })
      .then(function (saved) {
        state.warming = false;
        saveStamp();
        return saved;
      });
  }

  function checkForUpdate(force) {
    var registration = state.registration;
    if (!registration) return Promise.resolve(false);
    var now = Date.now();
    if (!force && now - state.lastUpdate < UPDATE_INTERVAL_MS) return Promise.resolve(false);
    state.lastUpdate = now;
    try {
      return registration.update().then(function () { return true; }, function () { return false; });
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  /* Po cichu: nowy worker instaluje się sam (skipWaiting w sw), przejmuje
     kontrolę i kasuje stare cache. Strona NIE jest przeładowywana — użytkownik
     nic nie traci, a następne wejście dostaje nową wersję. */
  function watchUpdates(registration) {
    try {
      registration.addEventListener('updatefound', function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          if (worker.state === 'activated') {
            state.version = '';
            try {
              window.dispatchEvent(new CustomEvent('rj-shell-updated'));
            } catch (error) { /* starsze przeglądarki — bez zdarzenia */ }
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        /* Nic nie przeładowujemy — samo odświeżenie cache jest wystarczające. */
        try {
          window.dispatchEvent(new CustomEvent('rj-shell-updated'));
        } catch (error) { /* ignorujemy */ }
      });
    } catch (error) { /* ignorujemy */ }
  }

  function register() {
    if (state.registration) return Promise.resolve(state.registration);
    if (!state.supported) return Promise.resolve(null);

    var promise;
    try {
      promise = navigator.serviceWorker.register(SW_URL, {
        scope: '/',
        /* Wersja pracownika nie może siedzieć w cache HTTP — inaczej nowa
           wersja czekałaby do 24 h na zwykłe odświeżenie. */
        updateViaCache: 'none'
      });
    } catch (error) {
      return Promise.resolve(null);
    }

    return promise.then(function (registration) {
      state.registration = registration;
      watchUpdates(registration);
      /* Sprawdzenie tuż po starcie: łapie wdrożenie, które wyszło, gdy karta
         była otwarta. */
      setTimeout(function () { checkForUpdate(true); }, FIRST_UPDATE_MS);
      return registration;
    }).catch(function () {
      state.registration = null;
      return null;
    });
  }

  function bindLifecycle() {
    try {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        checkForUpdate(false);
        if (refreshStamp() < Date.now() - 30 * 60 * 1000) {
          saveRefreshStamp();
          warm(false);
        }
      });
    } catch (error) { /* ignorujemy */ }

    try {
      window.addEventListener('online', function () {
        checkForUpdate(true);
        warm(false);
      });
    } catch (error) { /* ignorujemy */ }

    try {
      setInterval(function () {
        if (document.visibilityState === 'visible') checkForUpdate(false);
      }, UPDATE_INTERVAL_MS);
    } catch (error) { /* ignorujemy */ }
  }

  function start() {
    state.supported = hostAllowed() &&
      'serviceWorker' in navigator &&
      typeof Promise === 'function' &&
      (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/i.test(location.hostname));

    if (!state.supported) return;

    /* Trwałe przechowywanie: przeglądarka nie usunie cache przy braku miejsca.
       Bez zgody użytkownika i bez żadnego okna — albo się uda, albo nie. */
    try {
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        var persisted = navigator.storage.persisted && navigator.storage.persisted();
        if (persisted && typeof persisted.then === 'function') {
          persisted.then(function (already) {
            if (!already) navigator.storage.persist().catch(noop);
          }).catch(noop);
        } else {
          navigator.storage.persist().catch(noop);
        }
      }
    } catch (error) { /* ignorujemy */ }

    register().then(function () {
      if (!state.registration) return;
      bindLifecycle();
      setTimeout(function () { warm(false); }, FIRST_WARM_MS);
    }).catch(noop);

    /* Pierwsza wizyta w tej karcie: rejestracja i tak startuje od razu,
       ale „dogrzewanie” czeka, aż strona będzie w pełni spokojna. */
  }

  window.RJShellCache = {
    get supported() { return state.supported; },
    get version() { return state.version; },
    ready: function () { return register(); },
    update: function () { return checkForUpdate(true); },
    warm: function () { return warm(true); },
    clear: function () { return send({ type: 'RJ_SHELL_CACHE_CLEAR' }); },
    state: function () { return send({ type: 'RJ_SHELL_CACHE_STATE' }); }
  };

  /* Rejestracja nie może konkurować z pierwszą klatką: czekamy na `load`,
     a potem oddajemy pracę wolnemu momentowi. */
  function boot() {
    try {
      start();
    } catch (error) { /* strona ma działać nawet bez cache */ }
  }

  function scheduleBoot() {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(boot, { timeout: 2500 });
    } else {
      setTimeout(boot, 1200);
    }
  }

  try {
    if (document.readyState === 'complete') {
      scheduleBoot();
    } else {
      window.addEventListener('load', scheduleBoot, { once: true });
    }
  } catch (error) {
    scheduleBoot();
  }
})();

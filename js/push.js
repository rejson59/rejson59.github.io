/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/* Powiadomienia push na telefon — RejHub 2.0 (v4)

   Zasada: jedno kliknięcie „Włącz”, zero pytań przy każdym wejściu.
   Subskrypcja trafia do bazy (push_subscriptions), a wysyłką zajmuje się
   /api/push-send.

   Wersja 3 naprawia najczęstszy problem zgłaszany na telefonie: po włączeniu
   nie było żadnego potwierdzenia, więc nie dało się poznać, czy zgoda,
   subskrypcja i service worker naprawdę zadziałały. Teraz:
     - po udanym włączeniu od razu leci powiadomienie testowe,
     - przy włączonych powiadomieniach jest przycisk „Wyślij test”,
     - każdy błąd mówi, co dokładnie zawiodło (zgoda, HTTPS, klucz, sieć),
     - iPhone dowiaduje się, że push działa dopiero po dodaniu RejHuba do
       ekranu głównego (iOS 16.4+).

   Wersja 4 dodaje drugą drogę: w aplikacji na Androida WebView nie ma
   Push API, więc powiadomienia idą przez Firebase Cloud Messaging
   (PushNotifications) — działają też przy zamkniętym RejHubie, a dotknięcie
   powiadomienia otwiera właściwe miejsce w aplikacji. Ten sam panel
   obsługuje obie drogi, więc użytkownik widzi jedno „Włącz”.

   Gdy przeglądarka nie wspiera push albo użytkownik odmówił zgody, panel
   pokazuje spokojną informację zamiast błędu. */
(function (window, document) {
  'use strict';

  var SW_PATH = '/push-sw.js';
  var BUTTON_ID = 'rj-push-toggle';
  var TEST_ID = 'rj-push-test';
  var state = { supported: false, subscribed: false, busy: false, devices: 0, error: '', test: '', nativePermission: 'default' };

  /* --------------------------------------------------- aplikacja Android */
  /* WebView nie ma Push API — w aplikacji korzystamy z FCM przez natywny
     plugin. Wszystko poniżej działa tylko wtedy, gdy mostek Capacitora
     istnieje; w przeglądarce zostaje dotychczasowa droga (VAPID). */
  var cap = window.Capacitor;
  var isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  var PN = isNative && cap.Plugins ? cap.Plugins.PushNotifications : null;
  var LN = isNative && cap.Plugins ? cap.Plugins.LocalNotifications : null;
  var CHANNEL = 'rejhub';
  var tokenTimer = 0;

  function noop() {}

  function safe(promise) {
    if (promise && typeof promise.catch === 'function') promise.catch(noop);
    return promise;
  }

  function nativeReady() { return Boolean(PN); }

  function ensureChannel() {
    if (!PN) return Promise.resolve();
    return PN.createChannel({
      id: CHANNEL,
      name: 'RejHub',
      description: 'Wiadomości, odpowiedzi i pliki z RejHubu',
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#8BBDFF'
    }).catch(noop);
  }

  function nativePermission() {
    if (!PN) return Promise.resolve('denied');
    return PN.checkPermissions()
      .then(function (result) { return (result && result.receive) || 'denied'; })
      .catch(function () { return 'denied'; });
  }

  function registerNativeToken(token) {
    var client = api();
    if (!client) return Promise.reject(new Error('Sesja wygasła — zaloguj się ponownie.'));
    return client.rpc('push_subscribe_native', {
      p_token: client.token,
      p_endpoint: 'fcm:' + token,
      p_agent: String(navigator.userAgent || '').slice(0, 300)
    });
  }

  function subscribeNative() {
    return ensureChannel()
      .then(function () { return PN.requestPermissions(); })
      .then(function (result) {
        var granted = Boolean(result && result.receive === 'granted');
        state.nativePermission = granted ? 'granted' : 'denied';
        if (!granted) throw new Error('Powiadomienia zablokowane w ustawieniach telefonu.');
        return new Promise(function (resolve, reject) {
          var settled = false;
          function finish(fn, value) {
            if (settled) return;
            settled = true;
            window.clearTimeout(tokenTimer);
            fn(value);
          }
          PN.addListener('registration', function (token) {
            var value = token && token.value;
            if (!value) return finish(reject, new Error('Telefon nie zwrócił tokenu powiadomień.'));
            registerNativeToken(value).then(
              function (result) { finish(resolve, result); },
              function (error) { finish(reject, error); }
            );
          });
          PN.addListener('registrationError', function (error) {
            finish(reject, new Error((error && error.error) || 'Telefon nie mógł zarejestrować powiadomień.'));
          });
          PN.register();
          tokenTimer = window.setTimeout(function () {
            finish(reject, new Error('Telefon nie odpowiedział w sprawie powiadomień. Spróbuj ponownie.'));
          }, 15000);
        });
      });
  }

  function unsubscribeNative() {
    return Promise.resolve(PN ? PN.unregister() : null).catch(noop).then(function () {
      if (PN) safe(PN.removeAllDeliveredNotifications());
      var client = api();
      if (!client) return null;
      return client.rpc('push_unsubscribe_native', { p_token: client.token });
    });
  }

  function refreshNative() {
    state.supported = true;
    var client = api();
    state.subscribed = false;
    if (!client) { paint(); return Promise.resolve(); }

    return Promise.all([
      nativePermission(),
      client.rpc('push_devices', { p_token: client.token }).catch(function () { return []; })
    ]).then(function (values) {
      state.nativePermission = values[0];
      var devices = Array.isArray(values[1]) ? values[1] : [];
      /* Starsza baza nie zna kolumny `kind` — wtedy liczymy wszystkie urządzenia. */
      var hasKind = devices.some(function (item) { return item && typeof item.kind === 'string'; });
      var nativeDevices = hasKind
        ? devices.filter(function (item) { return item && item.kind === 'fcm'; })
        : devices;

      state.devices = nativeDevices.length;
      state.subscribed = state.nativePermission === 'granted' && nativeDevices.length > 0;
      paint();
    }).catch(function (error) {
      state.error = (error && error.message) || '';
      paint();
    });
  }

  function sendNativeTest() {
    if (!LN) return Promise.resolve(false);
    state.test = 'Wysyłam powiadomienie testowe…';
    state.error = '';
    paint();

    return ensureChannel()
      .then(function () { return LN.requestPermissions(); })
      .then(function () {
        return LN.schedule({
          notifications: [{
            id: Math.floor((Date.now() % 100000) + 1),
            title: 'RejHub — powiadomienia działają',
            body: 'To powiadomienie testowe. Jeśli je widzisz, wszystko jest gotowe.',
            smallIcon: 'rj_notification',
            iconColor: '#8BBDFF',
            channelId: CHANNEL,
            autoCancel: true,
            /* `allowWhileIdle` — nawet bez zgody na dokładne alarmy (Android 12+)
               system pokaże test w kilka sekund, a nie dopiero po wyjściu z Doze. */
            schedule: { at: new Date(Date.now() + 1200), allowWhileIdle: true }
          }]
        });
      })
      .then(function () {
        state.test = 'Test wysłany. Sprawdź powiadomienia systemowe.';
        paint();
        return true;
      })
      .catch(function (error) {
        state.test = '';
        state.error = (error && error.message) || 'Nie udało się pokazać powiadomienia testowego.';
        paint();
        return false;
      });
  }

  function nativeBoot() {
    if (!PN) return;
    ensureChannel();
    safe(PN.addListener('pushNotificationActionPerformed', function (action) {
      var data = action && action.notification && action.notification.data;
      var url = data && data.url;
      if (!url) return;
      try {
        var parsed = new URL(url, location.origin);
        if (parsed.origin === location.origin) {
          location.href = parsed.pathname + parsed.search + parsed.hash;
        } else if (window.RejNative && window.RejNative.openExternal) {
          window.RejNative.openExternal(url);
        } else {
          window.open(url, '_blank', 'noopener');
        }
      } catch (error) { /* niepoprawny adres w powiadomieniu */ }
    }));
    safe(PN.addListener('pushNotificationReceived', function (notification) {
      /* Gdy RejHub jest otwarty, FCM nie pokazuje powiadomienia w pasku —
         zamiast tego dyskretna pigułka na dole ekranu. */
      if (notification && window.RejNative && window.RejNative.toast) {
        var title = notification.title || 'RejHub';
        var body = notification.body ? ' — ' + notification.body : '';
        window.RejNative.toast(String(title + body).slice(0, 140));
      }
      try {
        document.dispatchEvent(new CustomEvent('rj:push', { detail: notification }));
      } catch (error) { /* starsze WebView bez CustomEvent */ }
    }));
  }

  function isIos() {
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function standalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    } catch (error) { return navigator.standalone === true; }
  }

  function supported() {
    if (nativeReady()) return true;
    if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) return false;
    /* Worker powiadomień leży tylko na domenie RejHuba — na starym adresie
       GitHub Pages rejestracja kończyłaby się błędem 404. */
    return /(^|\.)?rejhub\.vercel\.app$/.test(location.hostname) || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  function api() {
    var profiles = window.RJProfiles;
    if (!profiles || typeof profiles.rpc !== 'function' || typeof profiles.session !== 'function') return null;
    var session = profiles.session();
    if (!session || !session.token) return null;
    return { rpc: profiles.rpc, token: session.token };
  }

  /* Bezpieczny odczyt zgody: w przeglądarkach bez Notification (albo w trybie
     prywatnym z wyłączonym API) samo `Notification.permission` rzuca wyjątek. */
  function permission() {
    if (nativeReady()) return state.nativePermission || 'default';
    try { return Notification.permission || 'default'; }
    catch (error) { return 'denied'; }
  }

  function b64ToBytes(value) {
    var padding = '='.repeat((4 - (value.length % 4)) % 4);
    var raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function registerWorker() {
    return navigator.serviceWorker.register(SW_PATH, { scope: '/', updateViaCache: 'none' });
  }

  function publicKey() {
    var client = api();
    if (!client) return Promise.reject(new Error('Sesja wygasła — zaloguj się ponownie.'));
    return client.rpc('push_config_public', {}).then(function (config) {
      if (!config || !config.publicKey) throw new Error('Serwer nie ma jeszcze klucza powiadomień (VAPID).');
      return config.publicKey;
    });
  }

  function subscribe() {
    if (nativeReady()) return subscribeNative();
    return registerWorker()
      .then(function (registration) {
        return registration.pushManager.getSubscription().then(function (existing) {
          if (existing) return existing;
          return publicKey().then(function (key) {
            return registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: b64ToBytes(key)
            });
          });
        });
      })
      .then(function (subscription) {
        var json = subscription.toJSON();
        var client = api();
        if (!client) throw new Error('Sesja wygasła — zaloguj się ponownie.');
        return client.rpc('push_subscribe', {
          p_token: client.token,
          p_endpoint: subscription.endpoint,
          p_p256dh: json.keys && json.keys.p256dh,
          p_auth: json.keys && json.keys.auth,
          p_agent: navigator.userAgent
        });
      });
  }

  function unsubscribe() {
    if (nativeReady()) return unsubscribeNative();
    return navigator.serviceWorker.ready
      .then(function (registration) { return registration.pushManager.getSubscription(); })
      .then(function (subscription) {
        if (!subscription) return null;
        var endpoint = subscription.endpoint;
        return subscription.unsubscribe().then(function () {
          var client = api();
          if (client) return client.rpc('push_unsubscribe', { p_token: client.token, p_endpoint: endpoint });
          return null;
        });
      });
  }

  function label() {
    if (nativeReady()) {
      if (state.error) return state.error;
      if (state.test) return state.test;
      if (permission() === 'denied') return 'Powiadomienia zablokowane w ustawieniach telefonu.';
      if (state.subscribed) return 'Włączone w aplikacji — powiadomienia przyjdą też przy zamkniętym RejHubie.';
      return 'Powiadomienia systemowe w aplikacji, także gdy RejHub jest zamknięty.';
    }
    if (!state.supported) {
      if (isIos() && !standalone()) {
        return 'Na iPhonie powiadomienia działają po dodaniu RejHub do ekranu głównego (iOS 16.4+).';
      }
      return 'Ta przeglądarka nie obsługuje powiadomień push.';
    }
    if (permission() === 'denied') {
      return 'Powiadomienia zablokowane w przeglądarce — odblokuj je w ustawieniach witryny.';
    }
    if (state.error) return state.error;
    if (state.test) return state.test;
    if (state.subscribed) return state.devices > 1 ? 'Włączone na ' + state.devices + ' urządzeniach' : 'Włączone na tym urządzeniu. Możesz wysłać test.';
    return 'Otrzymuj powiadomienia w telefonie, nawet gdy karta jest zamknięta.';
  }

  function paint() {
    var button = document.getElementById(BUTTON_ID);
    if (!button) return;
    var text = button.querySelector('.rj-push-label');
    var note = button.querySelector('.rj-push-note');
    if (text) text.textContent = state.busy ? 'Chwilę…' : state.subscribed ? 'Wyłącz powiadomienia na telefon' : 'Włącz powiadomienia na telefon';
    if (note) note.textContent = label();
    button.disabled = state.busy || !state.supported || permission() === 'denied';
    button.classList.toggle('is-on', state.subscribed);
    button.setAttribute('aria-pressed', state.subscribed ? 'true' : 'false');

    var test = document.getElementById(TEST_ID);
    if (test) {
      test.hidden = !state.subscribed;
      test.disabled = state.busy;
    }
  }

  function refresh() {
    if (nativeReady()) return refreshNative();
    if (!supported()) { state.supported = false; paint(); return Promise.resolve(); }
    state.supported = true;
    var client = api();
    if (!client) { state.subscribed = false; paint(); return Promise.resolve(); }
    return navigator.serviceWorker.register(SW_PATH, { scope: '/', updateViaCache: 'none' })
      .then(function (registration) { return registration.pushManager.getSubscription(); })
      .then(function (subscription) {
        state.subscribed = Boolean(subscription) && permission() === 'granted';
        return client.rpc('push_devices', { p_token: client.token }).catch(function () { return []; });
      })
      .then(function (devices) {
        state.devices = Array.isArray(devices) ? devices.length : 0;
        paint();
      })
      .catch(function () { paint(); });
  }

  /* Powiadomienie testowe. Nie idzie przez serwer — service worker pokazuje
     je od razu, więc testuje dokładnie to, co widzi użytkownik: zgodę,
     rejestrację workera i warstwę systemową. */
  function sendTest() {
    if (nativeReady()) return sendNativeTest();
    if (!state.subscribed) {
      state.error = 'Najpierw włącz powiadomienia.';
      paint();
      return Promise.resolve(false);
    }
    state.test = 'Wysyłam powiadomienie testowe…';
    state.error = '';
    paint();
    return navigator.serviceWorker.ready.then(function (registration) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var finish = function (ok, message) {
          if (settled) return;
          settled = true;
          state.test = ok ? 'Test wysłany. Sprawdź powiadomienia systemowe.' : '';
          if (!ok) state.error = message || 'Nie udało się pokazać powiadomienia testowego.';
          paint();
          resolve(ok);
        };
        var timer = window.setTimeout(function () { finish(true, ''); }, 2500);
        var onMessage = function (event) {
          var data = event.data;
          if (!data || data.type !== 'RJ_NOTIFY_TEST_DONE') return;
          window.clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('message', onMessage);
          finish(Boolean(data.ok), data.error ? 'Test nie doszedł: ' + data.error : '');
        };
        navigator.serviceWorker.addEventListener('message', onMessage);

        if (registration.active) {
          registration.active.postMessage({ type: 'RJ_NOTIFY_TEST' });
        } else {
          /* Starszy worker albo brak aktywnego — pokazujemy powiadomienie
             bezpośrednio z rejestracji. */
          registration.showNotification('RejHub — powiadomienia działają', {
            body: 'To powiadomienie testowe. Jeśli je widzisz, wszystko jest gotowe.',
            icon: '/hub/brand-mark.svg',
            badge: '/hub/brand-mark.svg',
            tag: 'rejhub:test',
            data: { url: '/rejchat' }
          }).then(function () { finish(true, ''); }).catch(function (error) {
            finish(false, (error && error.message) || '');
          });
        }
      });
    }).catch(function (error) {
      state.test = '';
      state.error = (error && error.message) || 'Nie udało się pokazać testu.';
      paint();
      return false;
    });
  }

  function toggle() {
    if (state.busy) return;
    state.busy = true;
    state.error = '';
    state.test = '';
    paint();
    var job;
    if (nativeReady()) {
      /* W aplikacji zgodę i token załatwia natywny plugin — nie ma
         `Notification.requestPermission()` w WebView. */
      job = state.subscribed
        ? unsubscribe().then(refresh)
        : subscribe().then(refresh).then(function () {
            return new Promise(function (resolve) {
              window.setTimeout(resolve, 700);
            }).then(sendTest);
          });
    } else {
      job = state.subscribed
        ? unsubscribe().then(refresh)
        : requestPermission().then(function (permission) {
            if (permission !== 'granted') throw new Error('Bez zgody przeglądarki nie da się wysłać powiadomienia.');
            return subscribe().then(refresh).then(function () {
              /* Chwila oddechu, żeby panel zdążył się przerysować, i test. */
              return new Promise(function (resolve) {
                window.setTimeout(resolve, 700);
              }).then(sendTest);
            });
          });
    }
    job.catch(function (error) {
      state.error = (error && error.message) || 'Nie udało się włączyć powiadomień.';
    }).then(function () {
      state.busy = false;
      paint();
    });
  }

  /* Safari bywa oporne na obiecanki z requestPermission — obsługujemy oba
     warianty, żeby „Włącz” nie kończyło się cichym niczym. */
  function requestPermission() {
    if (permission() === 'granted') return Promise.resolve('granted');
    if (permission() === 'denied') return Promise.resolve('denied');
    try {
      var result = Notification.requestPermission();
      if (result && typeof result.then === 'function') return result;
    } catch (error) { /* starsze Safari */ }
    return new Promise(function (resolve) {
      Notification.requestPermission(resolve);
    });
  }

  function mount() {
    var panel = document.querySelector('.rj-chat-alert-panel');
    if (!panel || document.getElementById(BUTTON_ID)) return Boolean(panel);
    var box = document.createElement('div');
    box.className = 'rj-push-box';
    box.innerHTML = '<button type="button" id="' + BUTTON_ID + '" class="rj-push-toggle" aria-pressed="false">' +
      '<span class="rj-push-dot" aria-hidden="true"></span>' +
      '<span class="rj-push-copy"><span class="rj-push-label">Włącz powiadomienia na telefon</span>' +
      '<span class="rj-push-note">Otrzymuj powiadomienia także przy zamkniętej karcie.</span></span></button>' +
      '<button type="button" id="' + TEST_ID + '" class="rj-push-test" hidden>Wyślij powiadomienie testowe</button>';
    var foot = panel.querySelector('.rj-chat-alert-foot');
    if (foot && foot.parentNode) foot.parentNode.insertBefore(box, foot);
    else panel.appendChild(box);
    document.getElementById(BUTTON_ID).addEventListener('click', toggle);
    var test = document.getElementById(TEST_ID);
    if (test) test.addEventListener('click', function () { sendTest(); });
    refresh();
    return true;
  }

  function boot() {
    nativeBoot();
    var tries = 0;
    (function attempt() {
      if (mount() || tries > 40) { refresh(); return; }
      tries += 1;
      setTimeout(attempt, 250);
    })();
  }

  window.RejPush = {
    refresh: refresh,
    enable: function () { if (!state.subscribed) return toggle(); return Promise.resolve(); },
    test: sendTest,
    status: function () { return Object.assign({}, state); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);

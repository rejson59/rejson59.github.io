/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Powiadomienia push na telefon — RejHub 2.0

   Zasada: jedno kliknięcie „Włącz”, zero pytań przy każdym wejściu.
   Subskrypcja trafia do bazy (push_subscriptions), a wysyłką zajmuje się
   /api/push-send. Gdy przeglądarka nie wspiera push albo użytkownik
   odmówił zgody, panel pokazuje spokojną informację zamiast błędu. */
(function (window, document) {
  'use strict';

  var SW_PATH = '/push-sw.js';
  var BUTTON_ID = 'rj-push-toggle';
  var state = { supported: false, subscribed: false, busy: false, devices: 0, error: '' };

  function supported() {
    if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) return false;
    /* Worker powiadomień leży tylko na domenie RejHuba — na starym adresie
       GitHub Pages rejestracja kończyłaby się błędem 404. */
    return /(^|\.)?rejhub\.vercel\.app$/.test(location.hostname) || location.hostname === 'localhost';
  }

  function api() {
    var profiles = window.RJProfiles;
    if (!profiles || typeof profiles.rpc !== 'function' || typeof profiles.session !== 'function') return null;
    var session = profiles.session();
    if (!session || !session.token) return null;
    return { rpc: profiles.rpc, token: session.token };
  }

  function b64ToBytes(value) {
    var padding = '='.repeat((4 - (value.length % 4)) % 4);
    var raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function registerWorker() {
    return navigator.serviceWorker.register(SW_PATH, { scope: '/' });
  }

  function publicKey() {
    var client = api();
    if (!client) return Promise.reject(new Error('Sesja wygasła.'));
    return client.rpc('push_config_public', {}).then(function (config) {
      if (!config || !config.publicKey) throw new Error('Brak klucza powiadomień.');
      return config.publicKey;
    });
  }

  function subscribe() {
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
        if (!client) throw new Error('Sesja wygasła.');
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
    if (!state.supported) return 'Ta przeglądarka nie obsługuje powiadomień push.';
    if (Notification.permission === 'denied') return 'Powiadomienia zablokowane w przeglądarce — włącz je w ustawieniach witryny.';
    if (state.subscribed) return state.devices > 1 ? 'Włączone na ' + state.devices + ' urządzeniach' : 'Włączone na tym urządzeniu';
    return 'Otrzymuj powiadomienia w telefonie, nawet gdy karta jest zamknięta.';
  }

  function paint() {
    var button = document.getElementById(BUTTON_ID);
    if (!button) return;
    var text = button.querySelector('.rj-push-label');
    var note = button.querySelector('.rj-push-note');
    if (text) text.textContent = state.busy ? 'Chwilę…' : state.subscribed ? 'Wyłącz powiadomienia na telefon' : 'Włącz powiadomienia na telefon';
    if (note) note.textContent = state.error || label();
    button.disabled = state.busy || !state.supported || Notification.permission === 'denied';
    button.classList.toggle('is-on', state.subscribed);
    button.setAttribute('aria-pressed', state.subscribed ? 'true' : 'false');
  }

  function refresh() {
    if (!supported()) { state.supported = false; paint(); return Promise.resolve(); }
    state.supported = true;
    var client = api();
    if (!client) { state.subscribed = false; paint(); return Promise.resolve(); }
    return navigator.serviceWorker.register(SW_PATH, { scope: '/' })
      .then(function (registration) { return registration.pushManager.getSubscription(); })
      .then(function (subscription) {
        state.subscribed = Boolean(subscription) && Notification.permission === 'granted';
        return client.rpc('push_devices', { p_token: client.token }).catch(function () { return []; });
      })
      .then(function (devices) {
        state.devices = Array.isArray(devices) ? devices.length : 0;
        paint();
      })
      .catch(function () { paint(); });
  }

  function toggle() {
    if (state.busy) return;
    state.busy = true;
    state.error = '';
    paint();
    var job = state.subscribed
      ? unsubscribe().then(refresh)
      : Notification.requestPermission().then(function (permission) {
          if (permission !== 'granted') throw new Error('Bez zgody przeglądarki nie da się wysłać powiadomienia.');
          return subscribe().then(refresh);
        });
    job.catch(function (error) {
      state.error = (error && error.message) || 'Nie udało się włączyć powiadomień.';
    }).then(function () {
      state.busy = false;
      paint();
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
      '<span class="rj-push-note">Otrzymuj powiadomienia także przy zamkniętej karcie.</span></span></button>';
    var foot = panel.querySelector('.rj-chat-alert-foot');
    if (foot && foot.parentNode) foot.parentNode.insertBefore(box, foot);
    else panel.appendChild(box);
    document.getElementById(BUTTON_ID).addEventListener('click', toggle);
    refresh();
    return true;
  }

  function boot() {
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
    status: function () { return Object.assign({}, state); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);

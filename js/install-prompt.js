/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * Zachęta do dodania RejHuba do ekranu głównego (v1).
 *
 * Zasady:
 *  - nie pokazujemy się, gdy aplikacja już działa jako zainstalowana,
 *  - „Później” chowa zachętę na 30 dni (localStorage),
 *  - na Androidzie/Chrome korzystamy z prawdziwego `beforeinstallprompt`,
 *  - na iPhonie/iPadzie Safari pokazujemy krótką instrukcję (Udostępnij →
 *    Do ekranu początkowego), bo Apple nie udostępnia takiego zdarzenia.
 *
 * Cały wygląd jest wstrzykiwany razem ze skryptem (shadow DOM), więc baner
 * nie zależy od arkuszy podstrony i nie może zepsuć istniejącego układu.
 */
(function (window, document) {
  'use strict';

  var DISMISS_KEY = 'rj_install_dismissed_v1';
  var DONE_KEY = 'rj_install_done_v1';
  var DAY = 24 * 60 * 60 * 1000;
  var deferred = null;
  var host = null;
  var shown = false;

  function storage(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }
  function store(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* tryb prywatny */ }
  }
  function standalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.navigator.standalone === true;
    } catch (error) { return window.navigator.standalone === true; }
  }
  function isIos() {
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function phoneWidth() {
    try { return window.matchMedia('(max-width: 900px)').matches; }
    catch (error) { return window.innerWidth <= 900; }
  }

  function dismissed() {
    if (storage(DONE_KEY) === '1') return true;
    var raw = Number(storage(DISMISS_KEY) || 0);
    return raw > 0 && Date.now() - raw < 30 * DAY;
  }

  function styles() {
    return [
      ':host{all:initial}',
      '.wrap{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147482900;display:flex;justify-content:center;pointer-events:none;font:400 13px/1.45 "Inter",system-ui,-apple-system,sans-serif}',
      '.card{pointer-events:auto;display:flex;align-items:flex-start;gap:12px;width:min(460px,100%);padding:14px 14px 14px 16px;border:1px solid rgba(178,205,245,.28);border-radius:20px;background:linear-gradient(150deg,rgba(30,44,68,.94),rgba(12,19,32,.96));box-shadow:0 24px 60px -22px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.14);color:#eef5ff;-webkit-backdrop-filter:blur(22px) saturate(1.6);backdrop-filter:blur(22px) saturate(1.6)}',
      '.mark{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:13px;border:1px solid rgba(190,214,255,.26);background:rgba(140,180,255,.16);font-weight:800;font-size:16px;color:#dcebff}',
      '.copy{flex:1 1 auto;min-width:0}',
      '.copy b{display:block;font:700 13.5px/1.3 inherit;color:#f4f9ff}',
      '.copy p{margin:3px 0 0;color:rgba(205,222,244,.76);font:400 12px/1.45 inherit}',
      '.copy ol{margin:6px 0 0;padding-left:18px;color:rgba(205,222,244,.82);font-size:12px}',
      '.copy li{margin:2px 0}',
      '.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
      'button{font:650 12px/1 inherit;border-radius:999px;min-height:38px;padding:0 14px;cursor:pointer;border:1px solid transparent}',
      '.add{background:linear-gradient(180deg,#a9ccff,#7fb2ff);color:#071527}',
      '.later{background:rgba(255,255,255,.07);border-color:rgba(178,205,245,.24);color:#e8f2ff}',
      'button:focus-visible{outline:2px solid #cfe3ff;outline-offset:2px}',
      '@media(max-width:420px){.card{padding:12px 12px 12px 13px;gap:10px}.mark{width:34px;height:34px}}'
    ].join('');
  }

  function build() {
    if (host || !document.body) return;
    host = document.createElement('div');
    host.id = 'rj-install-prompt';
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Dodaj RejHub do ekranu głównego');
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>' + styles() + '</style>' +
      '<div class="wrap"><div class="card">' +
      '<span class="mark" aria-hidden="true">R</span>' +
      '<div class="copy"><b>Miej RejHub pod ręką</b>' +
      '<p data-text>Dodaj skrót do ekranu głównego — otworzysz go jednym dotknięciem, jak zwykłą aplikację.</p>' +
      '<div class="actions"><button type="button" class="add" data-add>Dodaj do ekranu</button>' +
      '<button type="button" class="later" data-later>Później</button></div></div></div></div>';
    document.body.appendChild(host);
    shown = true;

    var add = shadow.querySelector('[data-add]');
    var later = shadow.querySelector('[data-later]');
    var text = shadow.querySelector('[data-text]');

    if (isIos()) {
      add.textContent = 'Jak to zrobić?';
      add.addEventListener('click', function () {
        text.innerHTML = 'W Safari dotknij <b>Udostępnij</b> (kwadrat ze strzałką), przewiń i wybierz <b>Do ekranu początkowego</b>, a potem <b>Dodaj</b>.';
        var list = document.createElement('ol');
        list.innerHTML = '<li>Dotknij przycisku Udostępnij.</li><li>Wybierz „Do ekranu początkowego”.</li><li>Potwierdź przyciskiem „Dodaj”.</li>';
        text.replaceWith(list);
        add.disabled = true;
      });
    } else {
      add.addEventListener('click', function () {
        if (!deferred) {
          text.textContent = 'Skrót dodaje się z menu przeglądarki: ⋮ → „Dodaj do ekranu głównego” (albo „Zainstaluj aplikację”).';
          add.disabled = true;
          return;
        }
        var event = deferred;
        deferred = null;
        event.prompt();
        event.userChoice.then(function (choice) {
          if (choice && choice.outcome === 'accepted') hide(true);
          else hide(false);
        }).catch(function () { hide(false); });
      });
    }

    later.addEventListener('click', function () { hide(false); });
  }

  function hide(installed) {
    if (installed) store(DONE_KEY, '1');
    else store(DISMISS_KEY, String(Date.now()));
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  function maybeShow() {
    if (shown || dismissed() || standalone()) return;
    /* Zachęta jest dla telefonów i tabletów — na desktopie instalacja i tak
       kończy się ikoną w pasku przeglądarki, więc nie zawracamy głowy. */
    if (!isIos() && !phoneWidth()) return;
    if (isIos() || deferred) build();
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferred = event;
    maybeShow();
  });
  window.addEventListener('appinstalled', function () { hide(true); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.setTimeout(maybeShow, 2200); });
  } else {
    window.setTimeout(maybeShow, 2200);
  }

  window.RejInstall = {
    show: function () { maybeShow(); },
    hide: function () { hide(false); }
  };
})(window, document);

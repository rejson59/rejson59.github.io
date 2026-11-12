/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * Aplikacja Android — informacja o nowej wersji (v1).
 *
 * Aplikacja RejHuba to cienka powłoka, która zawsze ładuje aktualny
 * rejhub.vercel.app. Treść i funkcje serwisu aktualizują się więc same.
 * Nowy APK jest potrzebny tylko wtedy, gdy zmienia się sama powłoka —
 * i o tym mówi ten skrypt:
 *
 *  - czyta `/app/latest.json` (wydanie zapisuje GitHub Actions),
 *  - rozpoznaje aplikację po User-Agencie „RejHubApp/<wersja> (<kod>)”,
 *  - gdy w aplikacji działa starsza wersja, pokazuje dyskretny baner
 *    „Nowa wersja RejHuba” z przyciskiem pobierania i „Później” (24 h),
 *  - na stronie /pobierz wypełnia wersję, rozmiar, datę i SHA-256.
 *
 * Baner mieszka w shadow DOM (jak zachęta do instalacji PWA), więc żaden
 * arkusz podstrony nie może zmienić jego wyglądu ani zepsuć układu.
 * Zero zieleni: akcent jest błękitny, tło czarne jak wyspa.
 */
(function (window, document) {
  'use strict';

  var LATEST_URL = '/app/latest.json';
  var SNOOZE_KEY = 'rj_app_update_snooze_v1';
  var DAY = 24 * 60 * 60 * 1000;
  var FALLBACK_APK = 'https://github.com/rejson59/rejson59.github.io/releases/latest/download/RejHub.apk';
  var host = null;
  var latest = null;
  var installed = null;

  function storage(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }

  function store(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* tryb prywatny */ }
  }

  function snoozed() {
    var raw = Number(storage(SNOOZE_KEY) || 0);
    return raw > 0 && Date.now() - raw < DAY;
  }

  /** Wersja aplikacji z User-Agenta albo null, gdy to zwykła przeglądarka. */
  function installedApp() {
    var ua = '';
    try { ua = String(window.navigator.userAgent || ''); } catch (error) { ua = ''; }
    var match = /RejHubApp\/([\d.]+)(?:\s*\((\d+)\))?/.exec(ua);
    if (!match) return null;
    return {
      versionName: match[1],
      versionCode: Number(match[2] || 0)
    };
  }

  function newer(next, current) {
    if (!next) return false;
    if (next.versionCode && current.versionCode) {
      return Number(next.versionCode) > Number(current.versionCode);
    }
    var a = String(next.versionName || '').split('.').map(Number);
    var b = String(current.versionName || '').split('.').map(Number);
    for (var i = 0; i < Math.max(a.length, b.length); i += 1) {
      var left = a[i] || 0;
      var right = b[i] || 0;
      if (left > right) return true;
      if (left < right) return false;
    }
    return false;
  }

  function formatSize(bytes) {
    var value = Number(bytes);
    if (!isFinite(value) || value <= 0) return '—';
    if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB';
    return (value / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    try {
      return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function text(id, value) {
    var node = document.getElementById(id);
    if (node && value != null) node.textContent = value;
  }

  /* ------------------------------------------------------------- baner */

  function styles() {
    return [
      ':host{all:initial}',
      '.wrap{position:fixed;left:12px;right:12px;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:2147481000;display:flex;justify-content:center;pointer-events:none;font:400 13px/1.45 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
      '.card{pointer-events:auto;display:flex;align-items:flex-start;gap:12px;width:min(440px,100%);padding:13px 14px 13px 16px;border:1px solid rgba(178,205,245,.26);border-radius:20px;background:linear-gradient(150deg,rgba(30,44,68,.95),rgba(10,16,27,.97));box-shadow:0 24px 60px -24px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.12);color:#eef5ff;-webkit-backdrop-filter:blur(20px) saturate(1.5);backdrop-filter:blur(20px) saturate(1.5)}',
      '.mark{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:12px;border:1px solid rgba(190,214,255,.26);background:radial-gradient(circle at 30% 20%,rgba(159,196,255,.34),rgba(77,141,246,.16));color:#dcebff;font:800 15px/1 "Space Grotesk",system-ui,sans-serif}',
      '.copy{flex:1 1 auto;min-width:0}',
      '.title{display:block;font:650 13px/1.3 "Inter",system-ui,sans-serif;color:#f2f7ff}',
      '.sub{display:block;margin-top:2px;font:400 11.5px/1.4 "Inter",system-ui,sans-serif;color:rgba(214,228,247,.62)}',
      '.actions{display:flex;gap:6px;margin-top:9px}',
      '.btn{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 14px;border:1px solid transparent;border-radius:999px;background:linear-gradient(180deg,#a9ccff,#7fb2ff);color:#071527;font:700 12px/1 "Inter",system-ui,sans-serif;text-decoration:none;cursor:pointer}',
      '.btn.ghost{background:rgba(255,255,255,.06);border-color:rgba(178,205,245,.22);color:#e8f2ff}',
      '.btn:focus-visible{outline:2px solid #cfe3ff;outline-offset:2px}',
      '@media (max-width:400px){.card{gap:10px;padding:12px 12px 12px 14px}.sub{display:none}}'
    ].join('');
  }

  function show(next, current) {
    if (host) return;
    try {
      host = document.createElement('div');
      host.id = 'rj-app-update';
      host.setAttribute('data-rj-app-update', '');
      var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
      var style = document.createElement('style');
      style.textContent = styles();

      var wrap = document.createElement('div');
      wrap.className = 'wrap';
      var card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('role', 'status');

      var mark = document.createElement('span');
      mark.className = 'mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = 'R';

      var copy = document.createElement('div');
      copy.className = 'copy';
      var title = document.createElement('strong');
      title.className = 'title';
      title.textContent = 'Nowa wersja RejHuba: ' + (next.versionName || '');
      var sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = 'Masz ' + (current.versionName || '?') + '. Aktualizacja zachowuje konto i ustawienia.';
      var actions = document.createElement('div');
      actions.className = 'actions';

      var download = document.createElement('a');
      download.className = 'btn';
      download.href = next.apk || FALLBACK_APK;
      download.rel = 'noopener';
      download.textContent = 'Pobierz';

      var later = document.createElement('button');
      later.className = 'btn ghost';
      later.type = 'button';
      later.textContent = 'Później';
      later.addEventListener('click', function () {
        store(SNOOZE_KEY, String(Date.now()));
        remove();
      });

      actions.appendChild(download);
      actions.appendChild(later);
      copy.appendChild(title);
      copy.appendChild(sub);
      copy.appendChild(actions);
      card.appendChild(mark);
      card.appendChild(copy);
      wrap.appendChild(card);
      (shadow || host).appendChild(style);
      (shadow || host).appendChild(wrap);
      document.body.appendChild(host);
    } catch (error) {
      host = null;
    }
  }

  function remove() {
    if (!host) return;
    if (host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  /* ------------------------------------------------- strona /pobierz */

  function page() {
    var path = String(window.location.pathname || '').replace(/\/+$/, '');
    return /\/pobierz(\.html)?$/.test(path);
  }

  function paintPage() {
    if (!latest) return;
    var link = document.getElementById('apk-download');
    if (link) link.href = latest.apk || FALLBACK_APK;

    text('apk-version', latest.versionName ? latest.versionName : '—');
    text('apk-size', formatSize(latest.size));
    text('apk-date', formatDate(latest.published));
    text('apk-sha', latest.sha256 || '—');
    if (latest.minAndroid) text('apk-android', latest.minAndroid + '+');

    var release = document.getElementById('apk-release');
    if (release && latest.page) release.href = latest.page;

    var status = document.getElementById('pobierz-status');
    if (!status) return;
    if (installed) {
      status.textContent = newer(latest, installed)
        ? 'Masz wersję ' + installed.versionName + ' — dostępna jest nowsza (' + latest.versionName + ').'
        : 'Masz najnowszą wersję (' + installed.versionName + '). Dziękuję!';
    } else {
      status.textContent = 'Najnowsza wersja: ' + (latest.versionName || '') + ' · ' + formatSize(latest.size);
    }
  }

  /* ----------------------------------------------------------- start */

  function start() {
    if (typeof window.fetch !== 'function') return;
    installed = installedApp();
    window.RjApp = { latest: null, installed: installed, newer: newer };

    /* Samo pobranie pliku jest lekkie, ale nie może blokować strony. */
    fetch(LATEST_URL, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) {
        if (!response || !response.ok) throw new Error('brak metadanych');
        return response.json();
      })
      .then(function (data) {
        if (!data || typeof data !== 'object') return;
        latest = data;
        window.RjApp.latest = data;
        document.dispatchEvent(new CustomEvent('rj:app-latest', { detail: data }));
        paintPage();
        if (installed && newer(latest, installed) && !snoozed() && !page()) {
          show(latest, installed);
        }
      })
      .catch(function () {
        /* Brak pliku (pierwsze wydanie) albo offline — strona działa dalej. */
        var status = document.getElementById('pobierz-status');
        if (status && !status.textContent) {
          status.textContent = 'Nie udało się sprawdzić wersji — link poniżej nadal działa.';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window, document);

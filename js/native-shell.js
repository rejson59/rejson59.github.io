/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * Warstwa natywna aplikacji Android — RejHub (v1).
 *
 * Ta sama strona działa w przeglądarce i w aplikacji. Tutaj mieszka wyłącznie
 * to, czego przeglądarka nie potrafi, a co sprawia, że RejHub czuje się
 * aplikacją, a nie schowaną przeglądarką:
 *
 *  1. pasek stanu i nawigacji w kolorze wybranego motywu (jasny/ciemny),
 *  2. krótkie wibracje przy wyspie, menu i wysłaniu wiadomości,
 *  3. własne menu długiego dotknięcia linku: Udostępnij / Kopiuj / Przeglądarka,
 *  4. linki zewnętrzne w karcie w aplikacji (Custom Tabs), nie w Chrome,
 *  5. „Udostępnij do RejHub” z innych aplikacji → treść w polu RejChatu,
 *  6. zapis plików pobieranych jako blob (RejSejf, RejFile) przez systemowy
 *     arkusz „Zapisz lub wyślij”, bo WebView nie umie pobierać blob:,
 *  7. zdjęcia z aparatu/galerii w miejsce systemowego wyboru pliku,
 *  8. aktualizacja APK bez wychodzenia z aplikacji (postęp + SHA-256),
 *  9. blokada RejSejfu odciskiem palca,
 * 10. dyskretny pasek „brak połączenia” z ponowieniem.
 *
 * W przeglądarce skrypt kończy pracę w pierwszej linii — nic nie podmienia
 * i nie dokłada żadnych elementów.
 */
(function (window, document) {
  'use strict';

  var cap = window.Capacitor;
  var native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  if (!native) return;

  var plugins = cap.Plugins || {};
  function plugin(name) { return plugins[name] || null; }

  var StatusBar = plugin('StatusBar');
  var SplashScreen = plugin('SplashScreen');
  var Haptics = plugin('Haptics');
  var Share = plugin('Share');
  var Browser = plugin('Browser');
  var Clipboard = plugin('Clipboard');
  var Network = plugin('Network');
  var Camera = plugin('Camera');
  var Filesystem = plugin('Filesystem');
  var Updater = plugin('RejUpdater');
  var Biometric = plugin('RejBiometric');

  var LIGHT_BG = '#f7f8fb';
  var DARK_BG = '#0b0e13';

  /* --------------------------------------------------------------- pomocnicze */

  function noop() {}

  /* Metody pluginów zwracają obietnice; bez tego przeglądarka logowałaby
     nieobsłużone odrzucenia, gdy plugin nie jest dostępny. */
  function safe(promise) {
    if (promise && typeof promise.catch === 'function') promise.catch(noop);
    return promise;
  }

  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function appVersion() {
    var match = /RejHubApp\/([\d.]+)(?:\s*\((\d+)\))?/.exec(String(navigator.userAgent || ''));
    if (!match) return { name: '1.0.0', code: 0 };
    return { name: match[1], code: Number(match[2] || 0) };
  }

  function later(fn, ms) {
    return window.setTimeout(fn, ms || 0);
  }

  /* ------------------------------------------------------------------ motyw */

  /* Pasek stanu ma dokładnie ten kolor, co tło strony — inaczej jasny motyw
     od razu zdradza, że to WebView z czarnym paskiem systemowym. */
  function paintSystemBars() {
    if (!StatusBar) return;
    var light = isLight();
    safe(StatusBar.setStyle({ style: light ? 'DARK' : 'LIGHT' }));
    safe(StatusBar.setBackgroundColor({ color: light ? LIGHT_BG : DARK_BG }));
  }

  paintSystemBars();
  try {
    new MutationObserver(paintSystemBars).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  } catch (error) { /* starsze WebView bez MutationObserver */ }

  if (SplashScreen) {
    /* SplashScreen plugin i tak chowa się sam; chowamy od razu po wczytaniu,
       żeby nie zasłaniał gotowej strony. */
    var hideSplash = function () { later(function () { safe(SplashScreen.hide()); }, 120); };
    if (document.readyState === 'complete') hideSplash();
    else window.addEventListener('load', hideSplash);
  }

  /* --------------------------------------------------------------- wibracje */

  function haptic(kind) {
    if (!Haptics) return;
    if (kind === 'selection') safe(Haptics.selectionChanged());
    else if (kind === 'success') safe(Haptics.notification({ type: 'SUCCESS' }));
    else if (kind === 'medium') safe(Haptics.impact({ style: 'MEDIUM' }));
    else safe(Haptics.impact({ style: 'LIGHT' }));
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-island], #menu-toggle, .nav-more > summary, .rjapps-tile')) {
      haptic('light');
    }
  }, true);

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (form && form.id && (form.id === 'chat-form' || form.id === 'dm-send-form')) haptic('light');
  }, true);

  /* ------------------------------------------------------------------ toast */

  var toastHost = null;
  var toastTimer = 0;

  function toast(message) {
    if (!message) return;
    try {
      if (!toastHost) {
        toastHost = document.createElement('div');
        toastHost.id = 'rj-native-toast';
        toastHost.setAttribute('role', 'status');
        toastHost.setAttribute('aria-live', 'polite');
        var shadow = toastHost.attachShadow ? toastHost.attachShadow({ mode: 'open' }) : toastHost;
        var style = document.createElement('style');
        style.textContent =
          ':host{all:initial}' +
          '.pill{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);' +
          'max-width:min(440px,calc(100vw - 32px));padding:11px 16px;border-radius:999px;' +
          'border:1px solid rgba(178,205,245,.24);background:rgba(11,17,26,.94);color:#eef5ff;' +
          'font:600 12.5px/1.4 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
          'box-shadow:0 18px 40px -18px rgba(0,0,0,.9);text-align:center;' +
          '-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);' +
          'opacity:0;transform-origin:center;transition:opacity .18s ease,translate .18s ease}' +
          '.pill.is-on{opacity:1;translate:0 -4px}' +
          '@media (prefers-reduced-motion:reduce){.pill{transition:none}}';
        var pill = document.createElement('div');
        pill.className = 'pill';
        (shadow || toastHost).appendChild(style);
        (shadow || toastHost).appendChild(pill);
        toastHost._rjPill = pill;
        document.body.appendChild(toastHost);
      }
      var node = toastHost._rjPill;
      node.textContent = message;
      node.classList.add('is-on');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () { node.classList.remove('is-on'); }, 2600);
    } catch (error) { /* brak DOM — trudno, komunikat nie jest krytyczny */ }
  }

  /* ------------------------------------------------------------- schowek itd. */

  function copyText(text) {
    if (Clipboard) {
      return safe(Clipboard.write({ string: text })).then(function () { return true; }, function () { return false; });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  function shareLink(url, title) {
    if (!Share) return Promise.resolve(false);
    return Share.share({
      title: title || document.title || 'RejHub',
      text: title ? title + ' — RejHub' : 'Zobacz w RejHubie',
      url: url,
      dialogTitle: 'Udostępnij link'
    }).then(function () { return true; }, function () { return false; });
  }

  function openExternal(url) {
    if (Browser) {
      return safe(Browser.open({
        url: url,
        toolbarColor: isLight() ? LIGHT_BG : DARK_BG,
        presentationStyle: 'popover'
      }));
    }
    window.open(url, '_blank', 'noopener');
    return null;
  }

  /* Linki zewnętrzne otwieramy w karcie w aplikacji (Custom Tabs). Dzięki temu
     z RejHuba nie „wypada się” do Chrome, a pasek wrócić prowadzi do aplikacji. */
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('download')) return;
    if (link.hasAttribute('data-rj-native-skip')) return;

    var href = link.href || '';
    if (!/^https?:/i.test(href)) return;
    if (href.indexOf(location.origin + '/') === 0 || href === location.origin) return;

    event.preventDefault();
    openExternal(href);
  });

  /* ------------------------------------------- długie dotknięcie linku (menu) */

  var sheetHost = null;

  function closeSheet() {
    if (!sheetHost) return;
    if (sheetHost.parentNode) sheetHost.parentNode.removeChild(sheetHost);
    sheetHost = null;
  }

  function openLinkSheet(url, label) {
    closeSheet();
    try {
      var host = document.createElement('div');
      host.id = 'rj-native-sheet';
      var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

      var style = document.createElement('style');
      style.textContent =
        ':host{all:initial}' +
        '.scrim{position:fixed;inset:0;z-index:2147482000;background:rgba(3,7,12,.62);' +
        '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;' +
        'padding:16px 12px calc(16px + env(safe-area-inset-bottom,0px))}' +
        '.card{width:min(460px,100%);border:1px solid rgba(178,205,245,.24);border-radius:26px;' +
        'background:linear-gradient(155deg,rgba(28,41,62,.98),rgba(10,16,27,.99));color:#eef5ff;' +
        'box-shadow:0 30px 70px -30px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.1);padding:14px;' +
        'font:400 13px/1.4 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
        'animation:rj-sheet-in .2s ease-out}' +
        '@keyframes rj-sheet-in{from{transform:translateY(16px);opacity:.4}to{transform:none;opacity:1}}' +
        '.host{margin:2px 8px 10px;font:600 11px/1.3 "Inter",system-ui,sans-serif;letter-spacing:.08em;' +
        'text-transform:uppercase;color:rgba(159,196,255,.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.row{display:flex;flex-direction:column;gap:2px}' +
        '.act{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:0 12px;border:0;border-radius:16px;' +
        'background:transparent;color:#eef5ff;font:600 13.5px/1.2 "Inter",system-ui,sans-serif;text-align:left;cursor:pointer}' +
        '.act:active{background:rgba(159,196,255,.12)}' +
        '.act .ico{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;' +
        'background:rgba(159,196,255,.14);color:#cfe3ff;font-size:14px;flex:none}' +
        '.cancel{margin-top:6px;justify-content:center;background:rgba(255,255,255,.05);min-height:46px}' +
        '.cancel .ico{display:none}' +
        '@media (prefers-reduced-motion:reduce){.card{animation:none}}';

      var scrim = document.createElement('div');
      scrim.className = 'scrim';
      var card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Link');

      var hostLine = document.createElement('p');
      hostLine.className = 'host';
      try { hostLine.textContent = new URL(url).hostname.replace(/^www\./, ''); }
      catch (error) { hostLine.textContent = 'Link'; }

      var title = document.createElement('p');
      title.className = 'host';
      title.style.color = '#f2f7ff';
      title.style.textTransform = 'none';
      title.style.letterSpacing = '0';
      title.style.fontSize = '13px';
      title.textContent = (label || url).trim().slice(0, 90) || url;

      var row = document.createElement('div');
      row.className = 'row';

      function action(icon, text, handler) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'act';
        var badge = document.createElement('span');
        badge.className = 'ico';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = icon;
        var span = document.createElement('span');
        span.textContent = text;
        button.appendChild(badge);
        button.appendChild(span);
        button.addEventListener('click', function () { closeSheet(); handler(); });
        return button;
      }

      row.appendChild(action('↗', 'Udostępnij', function () {
        shareLink(url, label);
      }));
      row.appendChild(action('⧉', 'Kopiuj link', function () {
        copyText(url).then(function (ok) {
          toast(ok ? 'Link skopiowany.' : 'Nie udało się skopiować linku.');
        });
      }));
      row.appendChild(action('◱', 'Otwórz w przeglądarce', function () {
        openExternal(url);
      }));

      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'act cancel';
      cancel.textContent = 'Anuluj';
      cancel.addEventListener('click', closeSheet);

      card.appendChild(hostLine);
      card.appendChild(title);
      card.appendChild(row);
      card.appendChild(cancel);
      scrim.appendChild(card);
      scrim.addEventListener('click', function (event) {
        if (event.target === scrim) closeSheet();
      });

      (shadow || host).appendChild(style);
      (shadow || host).appendChild(scrim);
      document.body.appendChild(host);
      sheetHost = host;
    } catch (error) {
      sheetHost = null;
    }
  }

  /* Android WebView pokazuje własne menu linku, zanim strona dostanie
     `contextmenu` — dlatego MainActivity przy długim dotknięciu linku wysyła
     zdarzenie `rj:longpress`, a systemowe menu jest wtedy wyłączone. */
  window.addEventListener('rj:longpress', function (event) {
    var detail = event && event.detail;
    var url = detail && detail.url;
    if (!url || !/^https?:/i.test(url)) return;
    haptic('medium');
    openLinkSheet(url, '');
  });

  document.addEventListener('contextmenu', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;
    var url = link.href || '';
    if (!/^https?:/i.test(url)) return;

    /* Zaznaczanie tekstu ma pierwszeństwo — menu linku tylko przy pustym zaznaczeniu. */
    var selection = '';
    try { selection = String(window.getSelection ? window.getSelection() : ''); } catch (error) { selection = ''; }
    if (selection && selection.length > 1) return;

    event.preventDefault();
    haptic('medium');
    openLinkSheet(url, (link.textContent || '').trim());
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeSheet();
  });

  /* ------------------------------------------ „Udostępnij do RejHub” → RejChat */

  function composerReady(input) {
    if (!input || input.disabled) return false;
    /* `hidden` na rodzicu oznacza, że czat jest schowany (np. przed logowaniem). */
    if (input.closest && input.closest('[hidden]')) return false;
    return true;
  }

  function fillComposer(text, attempt) {
    if (!text) return;
    var input = document.getElementById('chat-input');
    if (!composerReady(input)) {
      /* Czat bywa schowany do czasu sprawdzenia sesji — czekamy do ~14 s. */
      if ((attempt || 0) < 40) {
        later(function () { fillComposer(text, (attempt || 0) + 1); }, 350);
        return;
      }
      copyText(text).then(function (ok) {
        toast(ok ? 'Skopiowano treść — wklej ją po zalogowaniu.' : 'Zaloguj się, żeby wysłać tę treść.');
      });
      return;
    }
    if (input.value && input.value !== text) {
      /* Ktoś już coś pisze — dopisujemy w nowej linii, nie kasujemy. */
      if (input.value.indexOf(text) === -1) {
        input.value = input.value.replace(/\s*$/, '') + '\n' + text;
      }
    } else {
      input.value = text;
    }
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length);
    } catch (error) { /* starsze WebView */ }
    toast('Treść dodana do wiadomości.');
  }

  function handleShare(text) {
    if (!text) return;
    haptic('success');
    if (document.getElementById('chat-input')) {
      fillComposer(text, 0);
      return;
    }
    if (/^\/rejchat(\/|$)/.test(location.pathname)) {
      /* Czat jest otwarty, ale nie ma pola wiadomości — najpewniej brak konta. */
      copyText(text).then(function (ok) {
        toast(ok ? 'Skopiowano treść — zaloguj się, żeby ją wysłać.' : 'Zaloguj się, żeby wysłać tę treść.');
      });
      return;
    }
    location.href = '/rejchat?share=' + encodeURIComponent(text);
  }

  window.addEventListener('rj:share', function (event) {
    var detail = event && event.detail;
    handleShare(detail && typeof detail.text === 'string' ? detail.text : '');
  });

  /* Adres /rejchat?share=… z zimnego startu: od razu czyścimy pasek adresu,
     żeby treść nie została w historii przeglądarki ani w linku do udostępnienia. */
  (function consumeShareParam() {
    var text = null;
    try {
      var params = new URLSearchParams(location.search);
      if (!params.has('share')) return;
      text = params.get('share');
      params.delete('share');
      var query = params.toString();
      history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
    } catch (error) {
      return;
    }
    later(function () { fillComposer(text, 0); }, 120);
  })();

  /* ---------------------------------------- pobieranie blobów (RejSejf, RejFile) */

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () { reject(new Error('Nie udało się odczytać pliku.')); };
      reader.readAsDataURL(blob);
    });
  }

  function safeName(name) {
    var value = String(name || 'plik').replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '').slice(0, 120);
    return value || 'plik';
  }

  function saveBlobLink(link) {
    var href = link.getAttribute('href') || '';
    var name = safeName(link.getAttribute('download') || link.textContent || 'plik');
    var folder = 'RejHub';
    var path = folder + '/' + name;

    if (!FetchAvailable()) {
      toast('Pobieranie plików wymaga nowszej wersji WebView.');
      return;
    }

    window.fetch(href).then(function (response) { return response.blob(); })
      .then(function (blob) {
        return blobToBase64(blob).then(function (data) {
          return Filesystem.writeFile({
            path: path,
            data: data,
            directory: 'CACHE',
            encoding: 'base64',
            recursive: true
          });
        });
      })
      .then(function () {
        return Filesystem.getUri({ path: path, directory: 'CACHE' });
      })
      .then(function (result) {
        var uri = result && result.uri;
        if (!uri) throw new Error('Brak adresu pliku.');
        if (!Share) {
          toast('Plik gotowy: ' + name);
          return null;
        }
        return Share.share({
          title: name,
          text: name + ' — z RejHuba',
          files: [uri],
          dialogTitle: 'Zapisz lub wyślij plik'
        }).then(noop, noop);
      })
      .catch(function (error) {
        toast((error && error.message) || 'Nie udało się zapisać pliku.');
      });
  }

  function FetchAvailable() {
    return typeof window.fetch === 'function' && Filesystem;
  }

  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[download]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (href.indexOf('blob:') !== 0) return;
    if (!FetchAvailable()) return;
    event.preventDefault();
    saveBlobLink(link);
  });

  /* ---------------------------------------------------- zdjęcia bez wyboru pliku */

  function dataUrlToFile(dataUrl, name) {
    var parts = String(dataUrl).split(',');
    var mime = /data:([^;]+)/.exec(parts[0]);
    var binary = atob(parts[1] || '');
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type: (mime && mime[1]) || 'image/jpeg' });
  }

  /* Czy WebView umie wstawić zdjęcie do <input type=file>? Potrzebny jest
     DataTransfer (Chrome 60+). Bez niego zostawiamy systemowy wybór pliku —
     lepszy stary picker niż zablokowany przycisk. */
  var canAttachFiles = (function () {
    try {
      return typeof DataTransfer === 'function' && Boolean(new DataTransfer().items);
    } catch (error) {
      return false;
    }
  })();

  function pickPhoto(input) {
    if (!Camera) return;
    Camera.getPhoto({
      resultType: 'dataUrl',
      source: 'PROMPT',
      quality: 82,
      width: 1800,
      correctOrientation: true,
      saveToGallery: false,
      promptLabelHeader: 'Dodaj zdjęcie',
      promptLabelPhoto: 'Z galerii',
      promptLabelPicture: 'Zrób zdjęcie',
      promptLabelCancel: 'Anuluj'
    }).then(function (photo) {
      if (!photo || !photo.dataUrl) return;
      var extension = photo.format || 'jpeg';
      var file = dataUrlToFile(photo.dataUrl, 'zdjecie-' + Date.now() + '.' + extension);
      var transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(function (error) {
      var message = String((error && error.message) || '');
      if (/cancel/i.test(message)) return;
      toast('Nie udało się otworzyć zdjęcia.');
    });
  }

  document.addEventListener('click', function (event) {
    var input = event.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'file') return;
    if (input.multiple) return;
    if (!/image\//i.test(String(input.accept || ''))) return;
    if (!Camera || !canAttachFiles) return;
    event.preventDefault();
    pickPhoto(input);
  }, true);

  /* ------------------------------------------------------ brak połączenia */

  var offlineHost = null;

  function showOffline() {
    if (offlineHost) return;
    try {
      offlineHost = document.createElement('div');
      offlineHost.id = 'rj-native-offline';
      var shadow = offlineHost.attachShadow ? offlineHost.attachShadow({ mode: 'open' }) : offlineHost;
      var style = document.createElement('style');
      style.textContent =
        ':host{all:initial}' +
        '.bar{position:fixed;left:12px;right:12px;top:calc(10px + env(safe-area-inset-top,0px));z-index:2147481900;' +
        'display:flex;align-items:center;gap:10px;justify-content:center;padding:10px 14px;border-radius:999px;' +
        'border:1px solid rgba(255,196,140,.28);background:rgba(26,18,10,.94);color:#ffe7c9;' +
        'font:600 12px/1.3 "Inter",system-ui,sans-serif;box-shadow:0 16px 40px -20px rgba(0,0,0,.9);' +
        '-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}' +
        '.dot{width:7px;height:7px;border-radius:50%;background:#ffc485;flex:none}' +
        'button{border:1px solid rgba(255,205,160,.4);border-radius:999px;background:transparent;color:#ffe7c9;' +
        'font:600 11.5px/1 "Inter",system-ui,sans-serif;padding:7px 12px;cursor:pointer}';
      var bar = document.createElement('div');
      bar.className = 'bar';
      var dot = document.createElement('span');
      dot.className = 'dot';
      var label = document.createElement('span');
      label.textContent = 'Brak połączenia — RejHub spróbuje sam.';
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Spróbuj';
      retry.addEventListener('click', function () { location.reload(); });
      bar.appendChild(dot);
      bar.appendChild(label);
      bar.appendChild(retry);
      (shadow || offlineHost).appendChild(style);
      (shadow || offlineHost).appendChild(bar);
      document.body.appendChild(offlineHost);
    } catch (error) { offlineHost = null; }
  }

  function hideOffline(announce) {
    if (offlineHost && offlineHost.parentNode) offlineHost.parentNode.removeChild(offlineHost);
    offlineHost = null;
    if (announce) toast('Połączenie wróciło.');
  }

  if (Network) {
    safe(Network.addListener('networkStatusChange', function (status) {
      if (status && status.connected) hideOffline(true);
      else if (status) showOffline();
    }));
    safe(Network.getStatus().then(function (status) {
      if (status && status.connected === false) showOffline();
    }, noop));
  }

  /* ----------------------------------------------------- aktualizacja w aplikacji */

  var update = {
    available: Boolean(Updater),
    installed: appVersion(),
    status: function () {
      if (!Updater) return Promise.resolve({ supported: false, allowed: false });
      return Updater.status();
    },
    install: function (latest, onProgress) {
      if (!Updater) return Promise.reject(new Error('Aktualizacja w aplikacji jest niedostępna.'));
      if (latest && typeof latest === 'object' && latest.apk) {
        var listener = null;
        if (typeof onProgress === 'function') {
          listener = Updater.addListener('progress', function (event) {
            onProgress(Math.max(0, Math.min(100, Number(event && event.percent) || 0)));
          });
        }
        return Promise.resolve(listener)
          .then(function () {
            return Updater.install({
              url: latest.apk,
              sha256: latest.sha256 || '',
              versionName: latest.versionName || ''
            });
          })
          .then(function (result) {
            if (listener && listener.remove) safe(listener.remove());
            return result;
          }, function (error) {
            if (listener && listener.remove) safe(listener.remove());
            throw error;
          });
      }
      return Updater.install(latest);
    },
    openSettings: function () {
      if (Updater) safe(Updater.settings());
    }
  };

  /* ------------------------------------------------------ blokada RejSejfu */

  var LOCK_KEY = 'rj_sejf_lock_v1';
  var UNLOCKED_KEY = 'rj_sejf_unlocked_v1';
  var gateHost = null;

  function sejfLocked() {
    try { return window.localStorage.getItem(LOCK_KEY) === 'on'; } catch (error) { return false; }
  }

  function setSejfLock(on) {
    try {
      if (on) window.localStorage.setItem(LOCK_KEY, 'on');
      else window.localStorage.removeItem(LOCK_KEY);
      if (!on) window.sessionStorage.removeItem(UNLOCKED_KEY);
    } catch (error) { /* tryb prywatny */ }
  }

  function sejfUnlocked() {
    try { return window.sessionStorage.getItem(UNLOCKED_KEY) === '1'; } catch (error) { return false; }
  }

  function markSejfUnlocked() {
    try { window.sessionStorage.setItem(UNLOCKED_KEY, '1'); } catch (error) { /* ignorujemy */ }
  }

  function closeGate() {
    if (gateHost && gateHost.parentNode) gateHost.parentNode.removeChild(gateHost);
    gateHost = null;
  }

  function openGate() {
    if (gateHost) return;
    try {
      gateHost = document.createElement('div');
      gateHost.id = 'rj-sejf-gate';
      var shadow = gateHost.attachShadow ? gateHost.attachShadow({ mode: 'open' }) : gateHost;
      var style = document.createElement('style');
      style.textContent =
        ':host{all:initial}' +
        '.scrim{position:fixed;inset:0;z-index:2147482100;display:grid;place-items:center;padding:24px;' +
        'background:radial-gradient(120% 90% at 50% 0%,#101a29 0%,#070b11 60%,#04070b 100%);color:#eef5ff;' +
        'font:400 14px/1.55 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
        '.card{width:min(360px,100%);padding:26px 22px;border:1px solid rgba(178,205,245,.2);border-radius:26px;' +
        'background:linear-gradient(150deg,rgba(255,255,255,.08),rgba(255,255,255,.025));text-align:center;' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 30px 70px -30px rgba(0,0,0,.9)}' +
        '.mark{display:grid;place-items:center;width:56px;height:56px;margin:0 auto 14px;border-radius:18px;' +
        'border:1px solid rgba(159,196,255,.32);background:rgba(159,196,255,.12);font-size:24px}' +
        'h2{margin:0 0 6px;font:650 19px/1.25 "Space Grotesk",system-ui,sans-serif}' +
        'p{margin:0 0 18px;color:rgba(214,228,247,.7);font-size:12.5px}' +
        'button{display:block;width:100%;min-height:46px;border-radius:999px;cursor:pointer;' +
        'font:700 13px/1 "Inter",system-ui,sans-serif}' +
        '.primary{border:0;background:linear-gradient(180deg,#a9ccff,#7fb2ff);color:#071527}' +
        '.ghost{margin-top:8px;border:1px solid rgba(178,205,245,.24);background:transparent;color:#dbe9ff;font-weight:600}' +
        '.note{margin-top:14px;font-size:11px;color:rgba(214,228,247,.45)}';

      var scrim = document.createElement('div');
      scrim.className = 'scrim';
      var card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'RejSejf jest zablokowany');

      var mark = document.createElement('div');
      mark.className = 'mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '⌾';

      var title = document.createElement('h2');
      title.textContent = 'RejSejf jest zablokowany';

      var copy = document.createElement('p');
      copy.textContent = 'Potwierdź odciskiem palca, że to Ty. Hasło do konta zostaje bez zmian.';

      var unlock = document.createElement('button');
      unlock.type = 'button';
      unlock.className = 'primary';
      unlock.textContent = 'Odblokuj odciskiem';

      var disable = document.createElement('button');
      disable.type = 'button';
      disable.className = 'ghost';
      disable.textContent = 'Wyłącz blokadę';

      var note = document.createElement('p');
      note.className = 'note';
      note.textContent = 'Blokada działa tylko na tym telefonie.';

      function unlockNow() {
        if (!Biometric) {
          toast('Biometria jest niedostępna na tym telefonie.');
          return;
        }
        unlock.disabled = true;
        unlock.textContent = 'Czekam na odcisk…';
        Biometric.authenticate({
          title: 'Odblokuj RejSejf',
          subtitle: 'Potwierdź tożsamość, żeby zobaczyć swoje rzeczy.',
          cancel: 'Anuluj'
        }).then(function () {
          markSejfUnlocked();
          closeGate();
          haptic('success');
        }, function (error) {
          unlock.disabled = false;
          unlock.textContent = 'Odblokuj odciskiem';
          var code = String((error && error.code) || '');
          if (code !== 'cancelled') toast((error && error.message) || 'Nie udało się odblokować.');
        });
      }

      unlock.addEventListener('click', unlockNow);
      disable.addEventListener('click', function () {
        setSejfLock(false);
        closeGate();
        paintLockToggle();
        toast('Blokada RejSejfu wyłączona.');
      });

      card.appendChild(mark);
      card.appendChild(title);
      card.appendChild(copy);
      card.appendChild(unlock);
      card.appendChild(disable);
      card.appendChild(note);
      scrim.appendChild(card);
      (shadow || gateHost).appendChild(style);
      (shadow || gateHost).appendChild(scrim);
      document.body.appendChild(gateHost);
      later(unlockNow, 380);
    } catch (error) {
      gateHost = null;
    }
  }

  var lockButton = null;

  function paintLockToggle() {
    if (!lockButton) return;
    var on = sejfLocked();
    lockButton.textContent = on ? 'Blokada: wł.' : 'Blokada: wył.';
    lockButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    lockButton.title = on ? 'RejSejf pyta o odcisk palca' : 'Włącz blokadę odciskiem palca';
  }

  function mountLockToggle() {
    if (!Biometric) return;
    var heading = document.querySelector('.safe-list-heading');
    if (!heading || document.getElementById('rj-sejf-lock-toggle')) return;

    var button = document.createElement('button');
    button.id = 'rj-sejf-lock-toggle';
    button.type = 'button';
    button.className = 'secondary';
    button.style.marginLeft = '8px';
    button.addEventListener('click', function () {
      var next = !sejfLocked();
      setSejfLock(next);
      paintLockToggle();
      haptic('selection');
      if (next) {
        markSejfUnlocked();
        toast('Blokada włączona — zadziała przy następnym wejściu.');
      } else {
        toast('Blokada RejSejfu wyłączona.');
      }
    });
    heading.appendChild(button);
    lockButton = button;
    paintLockToggle();
  }

  if (/^\/rejsejf(\/|$)/.test(location.pathname)) {
    mountLockToggle();
    later(mountLockToggle, 900);
    if (sejfLocked() && !sejfUnlocked()) openGate();
  }

  /* ------------------------------------------------------------- publiczne API */

  window.RejNative = {
    isNative: true,
    platform: 'android',
    version: appVersion(),
    haptic: haptic,
    toast: toast,
    copy: copyText,
    share: shareLink,
    openExternal: openExternal,
    saveBlobLink: saveBlobLink,
    pickPhoto: pickPhoto,
    update: update,
    biometric: {
      available: function () {
        return Biometric ? Biometric.available() : Promise.resolve({ available: false, reason: 'Brak pluginu.' });
      },
      authenticate: function (options) {
        return Biometric ? Biometric.authenticate(options || {}) : Promise.reject(new Error('Brak biometrii.'));
      }
    },
    sejf: {
      locked: sejfLocked,
      lock: function () { setSejfLock(true); markSejfUnlocked(); paintLockToggle(); },
      unlock: function () { setSejfLock(false); paintLockToggle(); }
    }
  };
})(window, document);

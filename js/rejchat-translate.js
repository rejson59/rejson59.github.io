/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja
   ----------------------------------------------------------------------------
   Tłumaczenie wiadomości RejChat na polski.

   Zasady:
   - obca wiadomość tłumaczy się SAMA, gdy pojawia się na ekranie — bez
     klikania. Kolejka ma limit dwóch równoległych zapytań, żeby nie zalewać
     tłumacza i nie zamulać czatu,
   - przełącznik ⇄ w nagłówku pokoju włącza lub wyłącza automatyzację
     (wybór pamiętany w localStorage). Przy wyłączonej zostaje przycisk
     „Przetłumacz na polski” przy wiadomości,
   - każdy wynik — także ten z pamięci podręcznej — przechodzi przez ten sam
     filtr treści co tekst wpisywany (`text_filter_check`). Zamaskowane frazy
     zastępujemy „•••”; jeśli tłumaczenie nadal łamie filtr, nie pokazujemy go
     w ogóle, tylko krótką notkę. Taki wynik nie trafia do pamięci jako czysty,
   - najpierw wbudowany translator przeglądarki (Chrome, bez sieci), potem
     publiczne API MyMemory (CORS, bez klucza),
   - wynik trafia do localStorage, żeby odświeżenie czatu nie tłumaczyło
     drugi raz,
   - błąd jest komunikatem przy wiadomości, nie wyjątkiem w konsoli.

   Ten plik nie zmienia HTML-u wiadomości: dokłada przycisk i panel obok
   istniejącego .chat-text, więc linki, zdjęcia i menu zostają bez zmian.
   ========================================================================== */
(function () {
  'use strict';
  if (window.RJChatTranslate) return;

  var TARGET = 'pl';
  var CACHE_KEY = 'rejchat_translate_cache_v2';
  var AUTO_KEY = 'rejchat_translate_auto_v1';
  var OFF_KEY = 'rejchat_translate_off_v1';
  var CACHE_LIMIT = 400;
  var OFF_LIMIT = 250;
  var MAX_CHUNK = 450;
  var AUTO_MAX_CHARS = 700;
  var AUTO_BUDGET = 30;   /* na jedno otwarcie strony — chroni limit tłumacza */
  var CONCURRENCY = 2;
  var FILTER_URL = 'https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/text_filter_check';
  var FILTER_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';

  var cache = readCache();
  var autoOn = readAuto();
  var offIds = readList(OFF_KEY);
  var inFlight = Object.create(null);
  var blockedKeys = Object.create(null);
  var queue = [];
  var active = 0;
  var autoCount = 0;
  var busy = Object.create(null);
  var observers = Object.create(null);

  /* ------------------------------------------------------------- pamięć --- */

  function readJSON(key, fallback) {
    try {
      var raw = JSON.parse(localStorage.getItem(key) || 'null');
      return raw && typeof raw === 'object' ? raw : fallback;
    } catch (e) { return fallback; }
  }

  function readCache() { return readJSON(CACHE_KEY, {}); }
  function readList(key) {
    var list = readJSON(key, []);
    return Array.isArray(list) ? list : [];
  }

  function saveCache() {
    try {
      var keys = Object.keys(cache);
      if (keys.length > CACHE_LIMIT) {
        keys.slice(0, keys.length - CACHE_LIMIT).forEach(function (k) { delete cache[k]; });
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* brak miejsca — tłumaczymy dalej, tylko bez pamięci */ }
  }

  function readAuto() {
    try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch (e) { return true; }
  }

  function rememberOff(id) {
    if (!id || offIds.indexOf(id) !== -1) return;
    offIds.push(id);
    if (offIds.length > OFF_LIMIT) offIds = offIds.slice(-OFF_LIMIT);
    try { localStorage.setItem(OFF_KEY, JSON.stringify(offIds)); } catch (e) { /* ignorujemy */ }
  }

  function forgetOff(id) {
    var index = offIds.indexOf(id);
    if (index === -1) return;
    offIds.splice(index, 1);
    try { localStorage.setItem(OFF_KEY, JSON.stringify(offIds)); } catch (e) { /* ignorujemy */ }
  }

  function cacheKey(text, from) { return (from || 'autodetect') + '|' + text; }

  /* ------------------------------------------------------- wykrywanie --- */

  var WORDS = {
    pl: 'jest nie się że na do jak ale czy tylko bardzo dziękuję cześć witam proszę tak już jeszcze można będzie zrobić dla przez który która tego ten mam masz dobrze dzień',
    en: 'the and you is are not this that with have for what how thanks hello please from was will just about they there here your',
    de: 'ich du nicht und das ist mit für habe wie was aber sehr danke hallo bitte wir sie ein auch auf',
    es: 'el la de que no es y en un por con para hola gracias pero muy como está los las del',
    fr: 'le la les de et est pas que pour avec bonjour merci mais très vous nous dans des une',
    uk: 'що не це як для але дуже дякую привіт будь ласка мене тобі цей ця є бути',
    ru: 'что не это как для но очень спасибо привет пожалуйста меня тебе этот эта есть быть'
  };
  var WORD_SETS = {};
  Object.keys(WORDS).forEach(function (code) {
    WORD_SETS[code] = WORDS[code].split(' ');
  });

  /* Pisma, których nie da się pomylić z polskim — wystarczy jeden znak. */
  function scriptOf(text) {
    if (/[\u3040-\u30ff]/.test(text)) return 'ja';              /* hiragana, katakana */
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) return 'ko'; /* hangul */
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh';              /* CJK bez kany */
    if (/[\u0400-\u04ff]/.test(text)) return /[іїєґ]/i.test(text) ? 'uk' : 'ru';
    if (/[\u0370-\u03ff]/.test(text)) return 'el';
    if (/[\u0600-\u06ff]/.test(text)) return 'ar';
    if (/[\u0590-\u05ff]/.test(text)) return 'he';
    if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
    if (/[\u0900-\u097f]/.test(text)) return 'hi';
    return '';
  }

  function detectLang(raw) {
    var text = String(raw || '');
    if (!text.trim()) return { code: '', score: 0 };
    var script = scriptOf(text);
    if (script) return { code: script, score: 4 };
    if (/[ąćęłńóśźż]/i.test(text)) return { code: 'pl', score: 4 };
    var lower = ' ' + text.toLowerCase().replace(/[^a-zà-ÿąćęłńóśźż\s']/gi, ' ').replace(/\s+/g, ' ') + ' ';
    var best = { code: '', score: 0 };
    Object.keys(WORD_SETS).forEach(function (code) {
      var score = 0;
      WORD_SETS[code].forEach(function (word) {
        if (lower.indexOf(' ' + word + ' ') !== -1) score += 1;
      });
      if (score > best.score) best = { code: code, score: score };
    });
    return best;
  }

  /* Czy warto to tłumaczyć: pewne pismo obce albo co najmniej dwa słowa-klucze.
     Jedno słowo to za mało, żeby zamieniać polskie zdanie. */
  function foreign(text) {
    var guess = detectLang(text);
    if (!guess.code || guess.code === TARGET || guess.score < 2) return null;
    return guess;
  }

  /* ---------------------------------------------------------- filtr --- */

  /* Ten sam filtr co przy wysyłaniu. Gdy filtr jest niedostępny (sieć),
     przepuszczamy tekst — inaczej chwilowa awaria zabrałaby wszystkie
     tłumaczenia. Wynik filtru nie jest nigdy udawany. */
  function filterCheck(text) {
    var local = window.RejTextFilter;
    if (local && typeof local.check === 'function') {
      try {
        return Promise.resolve(local.check(text)).catch(function () { return { ok: true }; });
      } catch (e) { /* niżej: własne zapytanie */ }
    }
    return fetch(FILTER_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: { apikey: FILTER_KEY, Authorization: 'Bearer ' + FILTER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_text: String(text || '').slice(0, 4000) })
    }).then(function (response) {
      if (!response.ok) return { ok: true };
      return response.json();
    }).catch(function () { return { ok: true }; });
  }

  function escapeRe(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* Tłumaczenie nie może przemycić słów, które filtr blokuje przy wysyłaniu.
     Najpierw maskujemy dokładnie te frazy, które wskazał filtr; jeśli po
     maskowaniu filtr nadal protestuje — tłumaczenia nie pokazujemy. */
  function sanitize(text) {
    return filterCheck(text).then(function (result) {
      if (!result || result.ok !== false) return { ok: true, text: text, masked: false };
      var phrases = Array.isArray(result.matches) ? result.matches : [];
      var masked = text;
      var hits = 0;
      phrases.forEach(function (phrase) {
        var clean = String(phrase || '').trim();
        if (clean.length < 3) return;
        masked = masked.replace(new RegExp(escapeRe(clean), 'gi'), function () {
          hits += 1;
          return '•••';
        });
      });
      if (!hits) return { ok: false, text: text, masked: false };
      return filterCheck(masked).then(function (second) {
        if (second && second.ok === false) return { ok: false, text: text, masked: false };
        return { ok: true, text: masked, masked: true };
      });
    });
  }

  /* ---------------------------------------------------------- tłumaczenie --- */

  function chunks(text) {
    var out = [];
    var rest = text.replace(/\s+/g, ' ').trim();
    while (rest.length > MAX_CHUNK) {
      var cut = rest.lastIndexOf('. ', MAX_CHUNK);
      if (cut < MAX_CHUNK * 0.4) cut = rest.lastIndexOf(' ', MAX_CHUNK);
      if (cut < 1) cut = MAX_CHUNK;
      out.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
    return out;
  }

  function decodeEntities(value) {
    var box = document.createElement('textarea');
    box.innerHTML = value;
    return box.value;
  }

  function viaBrowserTranslator(text, from, target) {
    if (!from || from === target) return Promise.resolve('');
    var api = window.Translator;
    if (!api || typeof api.create !== 'function' || typeof api.availability !== 'function') {
      return Promise.resolve('');
    }
    return Promise.resolve()
      .then(function () { return api.availability({ sourceLanguage: from, targetLanguage: target }); })
      .then(function (state) {
        if (state !== 'available' && state !== 'readily') return '';
        return api.create({ sourceLanguage: from, targetLanguage: target })
          .then(function (translator) { return translator.translate(text); })
          .then(function (value) { return typeof value === 'string' ? value : ''; });
      })
      .catch(function () { return ''; });
  }

  function viaMyMemory(chunk, from, target) {
    var pair = (from || 'autodetect') + '|' + target;
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) +
      '&langpair=' + encodeURIComponent(pair);
    return fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) throw new Error('translator-http-' + response.status);
        return response.json();
      })
      .then(function (data) {
        var status = Number(data && data.responseStatus);
        var value = data && data.responseData && data.responseData.translatedText;
        if (status !== 200 || !value || typeof value !== 'string') {
          throw new Error('translator-status-' + (status || 0));
        }
        if (/^MYMEMORY WARNING/i.test(value) || /PLEASE SELECT TWO DISTINCT/i.test(value)) {
          throw new Error('translator-refused');
        }
        return decodeEntities(value);
      });
  }

  /* Surowe tłumaczenie — bez pamięci i bez filtru (te dokłada translationFor). */
  function translateText(text, from, target) {
    var lang = target || TARGET;
    return viaBrowserTranslator(text, from, lang).then(function (local) {
      if (local) return local;
      var parts = chunks(text);
      var done = [];
      return parts.reduce(function (chain, part) {
        return chain.then(function () {
          return viaMyMemory(part, from, lang).then(function (value) { done.push(value); });
        });
      }, Promise.resolve()).then(function () { return done.join(' '); });
    }).then(function (value) {
      var clean = String(value || '').trim();
      if (!clean) throw new Error('translator-empty');
      return clean;
    });
  }

  function sameText(a, b) {
    function norm(value) {
      return String(value || '').toLowerCase()
        .replace(/[^0-9a-zà-ÿąćęłńóśźżа-яіїєґ]+/gi, ' ').trim();
    }
    return norm(a) === norm(b);
  }

  /* Tłumaczenie + filtr + pamięć. Zwraca {ok, text, masked, same}.
     Wynik z pamięci jest sprawdzany ponownie — lista słów mogła się zmienić. */
  function translationFor(text, from, target) {
    var lang = target || TARGET;
    var key = cacheKey(text, from);
    var hit = cache[key];
    if (hit && typeof hit === 'object' && typeof hit.text === 'string') {
      return sanitize(hit.text).then(function (checked) {
        if (!checked.ok) {
          blockedKeys[key] = true;
          delete cache[key];
          saveCache();
          return { ok: false, text: '', masked: false };
        }
        hit.text = checked.text;
        hit.masked = checked.masked;
        /* Do pamięci trafia wersja po filtrze — nigdy tekst z zabronioną frazą. */
        if (checked.masked) saveCache();
        return hit;
      });
    }
    return translateText(text, from, lang).then(function (value) {
      var entry = { ok: true, text: value, masked: false };
      if (sameText(value, text)) entry.same = true;
      return sanitize(value).then(function (checked) {
        if (!checked.ok) {
          blockedKeys[key] = true;
          return { ok: false, text: '', masked: false };
        }
        entry.text = checked.text;
        entry.masked = checked.masked;
        cache[key] = entry;
        saveCache();
        return entry;
      });
    });
  }

  /* ------------------------------------------------------------- widok --- */

  function elementText(el) {
    var node = el.querySelector('.chat-text');
    if (!node) return '';
    return (node.textContent || '').trim();
  }

  function messageId(el) {
    return el.getAttribute('data-chat-id') || el.getAttribute('data-dm-message') || '';
  }

  function bubbleOf(el) { return el.querySelector('.chat-bubble') || el; }

  function render(el, entry) {
    var bubble = bubbleOf(el);
    var body = bubble.querySelector('.chat-text');
    if (!body) return;
    var panel = bubble.querySelector('.rj-tr-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'rj-tr-panel';
      panel.innerHTML = '<p class="rj-tr-text" lang="' + TARGET + '"></p>' +
        '<div class="rj-tr-foot">' +
          '<span class="rj-tr-note">Tłumaczenie automatyczne</span>' +
          '<button class="rj-tr-toggle" type="button">Pokaż oryginał</button>' +
        '</div>';
      panel.querySelector('.rj-tr-toggle').addEventListener('click', function () {
        var hidden = panel.classList.toggle('is-original');
        this.textContent = hidden ? 'Pokaż tłumaczenie' : 'Pokaż oryginał';
        body.classList.toggle('rj-tr-original-hidden', !hidden);
        if (hidden) rememberOff(messageId(el));
        else forgetOff(messageId(el));
      });
      body.parentNode.insertBefore(panel, body.nextSibling);
    }
    panel.querySelector('.rj-tr-text').textContent = entry.text;
    panel.querySelector('.rj-tr-note').textContent = entry.masked
      ? 'Tłumaczenie automatyczne · filtr zamaskował niedozwolone słowa'
      : 'Tłumaczenie automatyczne';
    panel.classList.remove('is-original');
    body.classList.add('rj-tr-original-hidden');
    el.classList.add('rj-tr-on');
    var btn = bubble.querySelector('.rj-tr-btn');
    if (btn) btn.hidden = true;
    var notice = bubble.querySelector('.rj-tr-blocked');
    if (notice) notice.remove();
  }

  function showOriginal(el) {
    var bubble = bubbleOf(el);
    var body = bubble.querySelector('.chat-text');
    var panel = bubble.querySelector('.rj-tr-panel');
    if (panel) panel.remove();
    if (body) body.classList.remove('rj-tr-original-hidden');
    el.classList.remove('rj-tr-on');
  }

  function clearError(el) {
    var note = el.querySelector('.rj-tr-error');
    if (note) note.remove();
    var notice = el.querySelector('.rj-tr-blocked');
    if (notice) notice.remove();
  }

  function showError(el, message) {
    var bubble = bubbleOf(el);
    var note = bubble.querySelector('.rj-tr-error');
    if (!note) {
      note = document.createElement('p');
      note.className = 'rj-tr-error';
      note.setAttribute('role', 'status');
      bubble.appendChild(note);
    }
    note.textContent = message;
  }

  /* Tłumaczenie złamało filtr — pokazujemy oryginał i krótką notkę,
     żadnego przetłumaczonego tekstu. */
  function showBlocked(el) {
    var bubble = bubbleOf(el);
    var body = bubble.querySelector('.chat-text');
    var panel = bubble.querySelector('.rj-tr-panel');
    if (panel) panel.remove();
    if (body) body.classList.remove('rj-tr-original-hidden');
    el.classList.remove('rj-tr-on');
    var btn = bubble.querySelector('.rj-tr-btn');
    if (btn) btn.remove();
    var note = bubble.querySelector('.rj-tr-blocked');
    if (!note) {
      note = document.createElement('p');
      note.className = 'rj-tr-blocked';
      note.setAttribute('role', 'status');
      note.textContent = 'Tłumaczenie wstrzymane — filtr treści wykrył niedozwolone słowa.';
      bubble.appendChild(note);
    }
  }

  function manualButton(el) {
    var bubble = bubbleOf(el);
    var existing = bubble.querySelector('.rj-tr-btn');
    if (existing) return existing;
    var body = bubble.querySelector('.chat-text');
    if (!body) return null;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'rj-tr-btn';
    button.textContent = 'Przetłumacz na polski';
    button.title = 'Przetłumacz tę wiadomość';
    button.addEventListener('click', function () { request(el, button); });
    body.parentNode.insertBefore(button, body.nextSibling);
    return button;
  }

  function request(el, button) {
    var text = elementText(el);
    if (!text) return Promise.resolve();
    var guess = detectLang(text);
    var from = guess.score >= 2 ? guess.code : '';
    var key = cacheKey(text, from);
    if (busy[key]) return busy[key];
    if (blockedKeys[key]) { showBlocked(el); return Promise.resolve(); }
    clearError(el);
    if (button) { button.disabled = true; button.textContent = 'Tłumaczę…'; }
    var job = translationFor(text, from).then(function (entry) {
      if (!el.isConnected) return;
      if (!entry || !entry.ok) { showBlocked(el); return; }
      if (entry.same) { if (button) button.remove(); return; }
      render(el, entry);
      if (button) button.hidden = true;
    }).catch(function () {
      if (!el.isConnected) return;
      if (button) {
        showError(el, 'Nie udało się przetłumaczyć tej wiadomości. Spróbuj ponownie później.');
        button.disabled = false;
        button.textContent = 'Przetłumacz na polski';
      } else {
        /* Automat nie zaśmieca czatu błędami — zostawia dyskretny przycisk. */
        manualButton(el);
      }
    }).then(function () {
      busy[key] = null;
    });
    busy[key] = job;
    return job;
  }

  /* ------------------------------------------------------------- kolejka --- */

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      var el = queue.shift();
      if (!el.isConnected || !autoOn) continue;
      if (autoCount >= AUTO_BUDGET) { queue = []; return; }
      if (el.querySelector('.rj-tr-panel') || el.querySelector('.rj-tr-blocked')) continue;
      if (!foreign(elementText(el))) continue;
      active += 1;
      autoCount += 1;
      (function (node) {
        request(node).then(function () {
          active -= 1;
          pump();
        });
      })(el);
    }
  }

  function observerFor(box) {
    var key = box.id || 'box';
    if (key in observers) return observers[key];
    if (!('IntersectionObserver' in window)) {
      observers[key] = null;
      return null;
    }
    observers[key] = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observers[key].unobserve(entry.target);
        queue.push(entry.target);
        pump();
      });
    }, { root: box, rootMargin: '240px 0px' });
    return observers[key];
  }

  /* Tłumaczymy dopiero to, co widać (albo prawie widać) — długie wątki nie
     wystrzeliwują naraz kilkudziesięciu zapytań do tłumacza. */
  function enqueue(el, box) {
    if (el.dataset.rjTrQueued === '1') return;
    el.dataset.rjTrQueued = '1';
    var observer = box ? observerFor(box) : null;
    if (observer) observer.observe(el);
    else { queue.push(el); pump(); }
  }

  function decorate(el) {
    var body = el.querySelector('.chat-text');
    if (!body) return;
    var bubble = bubbleOf(el);
    if (bubble.querySelector('.rj-tr-panel') || bubble.querySelector('.rj-tr-blocked')) return;
    if (body.classList.contains('rj-tr-original-hidden')) return;
    var text = (body.textContent || '').trim();
    if (!text || text.length < 4) return;
    var guess = detectLang(text);
    if (!guess.code || guess.code === TARGET) {
      var stale = bubble.querySelector('.rj-tr-btn');
      if (stale) stale.remove();
      return;
    }
    var id = messageId(el);
    var key = cacheKey(text, guess.score >= 2 ? guess.code : 'autodetect');
    var hit = cache[key];
    /* Własnych wiadomości nie tłumaczymy — ani automatycznie, ani przyciskiem. */
    if (el.classList.contains('is-mine')) return;
    /* Jeden sygnał językowy to za mało na automat — ale ręcznie można zawsze. */
    if (guess.score < 2) { manualButton(el); return; }
    if (hit && typeof hit === 'object' && hit.same) return;
    if (offIds.indexOf(id) !== -1) { manualButton(el); return; }
    if (blockedKeys[key]) { showBlocked(el); return; }
    if (!autoOn || text.length > AUTO_MAX_CHARS || autoCount >= AUTO_BUDGET) { manualButton(el); return; }
    /* Także wpis z pamięci przechodzi przez filtr — lista słów mogła się zmienić. */
    var box = el.closest ? el.closest('#chat-list, #dm-messages') : null;
    enqueue(el, box);
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('.chat-msg[data-chat-id], [data-dm-message]');
    for (var i = 0; i < nodes.length; i += 1) decorate(nodes[i]);
  }

  /* --------------------------------------------------- przełącznik auto --- */

  function autoLabel() {
    return autoOn
      ? 'Automatyczne tłumaczenie obcych wiadomości: włączone'
      : 'Automatyczne tłumaczenie obcych wiadomości: wyłączone';
  }

  function updateAutoButtons() {
    var buttons = document.querySelectorAll('.rj-tr-auto');
    for (var i = 0; i < buttons.length; i += 1) {
      var button = buttons[i];
      button.setAttribute('aria-pressed', autoOn ? 'true' : 'false');
      button.classList.toggle('is-off', !autoOn);
      button.title = autoLabel();
    }
  }

  function setAuto(value) {
    autoOn = Boolean(value);
    try { localStorage.setItem(AUTO_KEY, autoOn ? '1' : '0'); } catch (e) { /* ignorujemy */ }
    updateAutoButtons();
    if (autoOn) {
      document.querySelectorAll('.chat-msg, [data-dm-message]').forEach(function (el) {
        delete el.dataset.rjTrQueued;
      });
      scan(document);
    } else {
      queue = [];
      document.querySelectorAll('.chat-msg .rj-tr-btn, [data-dm-message] .rj-tr-btn').forEach(function (button) { button.remove(); });
    }
  }

  function wireAuto() {
    var hosts = document.querySelectorAll('.rc-room-actions');
    for (var i = 0; i < hosts.length; i += 1) {
      var host = hosts[i];
      if (host.querySelector('.rj-tr-auto')) continue;
      var search = host.querySelector('.rc-search-toggle');
      if (!search) continue; /* gość bez przycisków — nie dokładamy nic */
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rj-tr-auto';
      button.textContent = '⇄';
      button.setAttribute('aria-label', 'Automatyczne tłumaczenie obcych wiadomości');
      button.setAttribute('aria-pressed', autoOn ? 'true' : 'false');
      button.title = autoLabel();
      if (!autoOn) button.classList.add('is-off');
      button.addEventListener('click', function () { setAuto(!autoOn); });
      host.insertBefore(button, search);
    }
  }

  /* --------------------------------------------------- tłumaczenie szkicu --- */

  function translateDraft(field, button, status) {
    var text = (field.value || '').trim();
    if (!text) {
      status.textContent = 'Najpierw napisz wiadomość.';
      return;
    }
    button.disabled = true;
    var original = button.textContent;
    button.textContent = 'Tłumaczę…';
    status.textContent = '';
    var guess = detectLang(text);
    var target = guess.code === TARGET ? 'en' : TARGET;
    var from = guess.code === target ? '' : (guess.score >= 2 ? guess.code : '');
    var key = cacheKey(text, from);
    if (blockedKeys[key]) {
      status.textContent = 'Tłumaczenie zawiera niedozwolone słowa — nie wstawiam go.';
      button.disabled = false;
      button.textContent = original;
      return;
    }
    translationFor(text, from, target).then(function (entry) {
      if (!entry || !entry.ok) {
        status.textContent = 'Tłumaczenie zawiera niedozwolone słowa — nie wstawiam go.';
        return;
      }
      field.value = entry.text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      status.textContent = 'Tłumaczenie automatyczne na ' + (target === TARGET ? 'polski' : 'angielski') +
        (entry.masked ? ' · filtr zamaskował niedozwolone słowa' : '') +
        '. Możesz je poprawić przed wysłaniem.';
    }).catch(function () {
      status.textContent = 'Nie udało się przetłumaczyć szkicu. Spróbuj ponownie później.';
    }).then(function () {
      button.disabled = false;
      button.textContent = original;
    });
  }

  /* --------------------------------------------------------------- start --- */

  /* Przycisk siedzi w pasku narzędzi composera (obok emotek), a komunikat —
     w linii licznika. Dzięki temu ukrycie licznika na małym ekranie nie zabiera
     możliwości przetłumaczenia szkicu. */
  function wireDraft() {
    [['chat-input', 'chat-length', 'chat-form'], ['dm-input', 'dm-length', 'dm-send-form']].forEach(function (parts) {
      var field = document.getElementById(parts[0]);
      var line = document.getElementById(parts[1]);
      var form = document.getElementById(parts[2]);
      var tools = form && form.querySelector('.rc-compose-tools');
      if (!field || !line || !tools || tools.querySelector('.rj-tr-draft')) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rj-tr-draft';
      button.textContent = '⇄';
      button.title = 'Przetłumacz to, co piszesz (polski ⇄ angielski)';
      button.setAttribute('aria-label', 'Przetłumacz szkic wiadomości');
      var status = document.createElement('span');
      status.className = 'rj-tr-draft-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      button.addEventListener('click', function () { translateDraft(field, button, status); });
      var send = form.querySelector('#chat-send, #dm-send');
      if (send && send.parentNode === tools) tools.insertBefore(button, send);
      else tools.appendChild(button);
      line.appendChild(status);
    });
  }

  function start() {
    wireAuto();
    wireDraft();
    ['chat-list', 'dm-messages'].forEach(function (id) {
      var box = document.getElementById(id);
      if (!box) return;
      scan(box);
      var timer = null;
      new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(function () { scan(box); }, 120);
      }).observe(box, { childList: true, subtree: true });
    });
  }

  window.RJChatTranslate = {
    detect: detectLang,
    foreign: foreign,
    translate: translateText,
    sanitize: sanitize,
    auto: function () { return autoOn; },
    setAuto: setAuto,
    cache: cache
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

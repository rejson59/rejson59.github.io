/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja
   ----------------------------------------------------------------------------
   Tłumaczenie wiadomości RejChat na polski.

   Zasady:
   - nic nie wychodzi z przeglądarki, dopóki użytkownik nie kliknie „Przetłumacz”,
   - najpierw wbudowany translator przeglądarki (Chrome, bez sieci),
   - potem publiczne API MyMemory (CORS, bez klucza),
   - wynik trafia do localStorage, żeby odświeżenie czatu nie tłumaczyło drugi raz,
   - błąd jest komunikatem przy wiadomości, nie wyjątkiem w konsoli.

   Ten plik nie zmienia HTML-u wiadomości: dokłada przycisk i panel obok
   istniejącego .chat-text, więc linki, zdjęcia i menu zostają bez zmian.
   ========================================================================== */
(function () {
  'use strict';
  if (window.RJChatTranslate) return;

  var TARGET = 'pl';
  var CACHE_KEY = 'rejchat_translate_cache_v1';
  var CACHE_LIMIT = 320;
  var MAX_CHUNK = 450;
  var cache = readCache();
  var busy = Object.create(null);

  /* ------------------------------------------------------------- pamięć --- */

  function readCache() {
    try {
      var raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) { return {}; }
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

  function cacheKey(text, from) { return from + '|' + text; }

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

  function detectLang(raw) {
    var text = String(raw || '');
    if (!text.trim()) return { code: '', score: 0 };
    if (/[\u0400-\u04FF]/.test(text)) {
      if (/[іїєґ]/i.test(text)) return { code: 'uk', score: 4 };
      return { code: 'ru', score: 3 };
    }
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

  function viaBrowserTranslator(text, from) {
    if (!from || from === TARGET) return Promise.resolve('');
    var api = window.Translator;
    if (!api || typeof api.create !== 'function' || typeof api.availability !== 'function') {
      return Promise.resolve('');
    }
    return Promise.resolve()
      .then(function () { return api.availability({ sourceLanguage: from, targetLanguage: TARGET }); })
      .then(function (state) {
        if (state !== 'available' && state !== 'readily') return '';
        return api.create({ sourceLanguage: from, targetLanguage: TARGET })
          .then(function (translator) { return translator.translate(text); })
          .then(function (value) { return typeof value === 'string' ? value : ''; });
      })
      .catch(function () { return ''; });
  }

  function viaMyMemory(chunk, from) {
    var pair = (from || 'autodetect') + '|' + TARGET;
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

  function translateText(text, from) {
    var key = cacheKey(text, from || 'autodetect');
    if (cache[key]) return Promise.resolve(cache[key]);
    return viaBrowserTranslator(text, from).then(function (local) {
      if (local) return local;
      var parts = chunks(text);
      var done = [];
      return parts.reduce(function (chain, part) {
        return chain.then(function () {
          return viaMyMemory(part, from).then(function (value) { done.push(value); });
        });
      }, Promise.resolve()).then(function () { return done.join(' '); });
    }).then(function (value) {
      var clean = String(value || '').trim();
      if (!clean) throw new Error('translator-empty');
      cache[key] = clean;
      saveCache();
      return clean;
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

  function stateKey(el, text) { return messageId(el) + '|' + text.slice(0, 60); }

  function render(el, text) {
    var bubble = el.querySelector('.chat-bubble') || el;
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
      });
      body.parentNode.insertBefore(panel, body.nextSibling);
    }
    panel.querySelector('.rj-tr-text').textContent = text;
    panel.classList.remove('is-original');
    body.classList.add('rj-tr-original-hidden');
    el.classList.add('rj-tr-on');
    var btn = bubble.querySelector('.rj-tr-btn');
    if (btn) btn.hidden = true;
  }

  function clearError(el) {
    var note = el.querySelector('.rj-tr-error');
    if (note) note.remove();
  }

  function showError(el, message) {
    var bubble = el.querySelector('.chat-bubble') || el;
    var note = bubble.querySelector('.rj-tr-error');
    if (!note) {
      note = document.createElement('p');
      note.className = 'rj-tr-error';
      note.setAttribute('role', 'status');
      bubble.appendChild(note);
    }
    note.textContent = message;
  }

  function request(el, button) {
    var text = elementText(el);
    var guess = detectLang(text);
    var from = guess.score >= 2 ? guess.code : '';
    var key = stateKey(el, text);
    if (!text || busy[key]) return;
    busy[key] = true;
    clearError(el);
    if (button) { button.disabled = true; button.textContent = 'Tłumaczę…'; }
    translateText(text, from).then(function (value) {
      render(el, value);
      if (button) button.hidden = true;
    }).catch(function () {
      showError(el, 'Nie udało się przetłumaczyć tej wiadomości. Spróbuj ponownie później.');
      if (button) { button.disabled = false; button.textContent = 'Przetłumacz na polski'; }
    }).then(function () {
      busy[key] = false;
    });
  }

  function decorate(el) {
    var body = el.querySelector('.chat-text');
    if (!body || body.classList.contains('rj-tr-original-hidden')) return;
    var text = (body.textContent || '').trim();
    if (!text || text.length < 4) return;
    var bubbleForPanel = el.querySelector('.chat-bubble') || el;
    if (bubbleForPanel.querySelector('.rj-tr-panel')) return;
    var bubble = el.querySelector('.chat-bubble') || el;
    var guess = detectLang(text);
    var foreign = guess.code && guess.code !== TARGET;
    if (!foreign || guess.score < 1) {
      var stale = bubble.querySelector('.rj-tr-btn');
      if (stale) stale.remove();
      return;
    }
    if (bubble.querySelector('.rj-tr-btn')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'rj-tr-btn';
    button.textContent = 'Przetłumacz na polski';
    button.title = 'Przetłumacz tę wiadomość automatycznie';
    button.addEventListener('click', function () { request(el, button); });
    body.parentNode.insertBefore(button, body.nextSibling);
    /* Jeśli użytkownik już raz otworzył tłumaczenie tej wiadomości, pokazujemy je od razu
       (klucz musi być ten sam, którego używa request(): bez pewności języka — autodetect). */
    var key = cacheKey(text, guess.score >= 2 ? guess.code : 'autodetect');
    if (cache[key]) render(el, cache[key]);
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('.chat-msg[data-chat-id], [data-dm-message]');
    for (var i = 0; i < nodes.length; i += 1) decorate(nodes[i]);
  }

  /* --------------------------------------------------- tłumaczenie szkicu --- */

  function draftTarget(text) {
    var guess = detectLang(text);
    return guess.code === TARGET ? 'en' : TARGET;
  }

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
    var target = draftTarget(text);
    var key = 'draft|' + target + '|' + text;
    var run = cache[key] ? Promise.resolve(cache[key]) :
      (target === TARGET ? translateText(text, detectLang(text).score >= 2 ? detectLang(text).code : '')
        : translateTo(text, target));
    run.then(function (value) {
      cache[key] = value;
      saveCache();
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      status.textContent = 'Tłumaczenie automatyczne na ' + (target === TARGET ? 'polski' : 'angielski') + '. Możesz je poprawić przed wysłaniem.';
    }).catch(function () {
      status.textContent = 'Nie udało się przetłumaczyć szkicu. Spróbuj ponownie później.';
    }).then(function () {
      button.disabled = false;
      button.textContent = original;
    });
  }

  function translateTo(text, target) {
    var from = detectLang(text);
    var source = from.score >= 2 ? from.code : '';
    return viaBrowserTranslatorTo(text, source, target).then(function (local) {
      if (local) return local;
      return chunks(text).reduce(function (chain, part) {
        return chain.then(function (acc) {
          return viaMyMemoryTo(part, source, target).then(function (value) { acc.push(value); return acc; });
        });
      }, Promise.resolve([])).then(function (parts) { return parts.join(' '); });
    });
  }

  function viaBrowserTranslatorTo(text, from, target) {
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

  function viaMyMemoryTo(chunk, from, target) {
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
        if (status !== 200 || !value) throw new Error('translator-status-' + (status || 0));
        return decodeEntities(value);
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
    translate: translateText,
    cache: cache
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

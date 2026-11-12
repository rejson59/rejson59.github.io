/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * RejAsystent — asystent RejHuba (v1).
 *
 * Dwie warstwy, żeby działał zawsze:
 *  1. LOKALNA — rozumie polecenia po polsku: otwiera strony, przełącza motyw,
 *     dodaje zadania do RejPlannera, szuka w serwisie i odpowiada na pytania
 *     o RejHub. Nie potrzebuje internetu ani klucza.
 *  2. MODEL AI (opcjonalnie) — jeśli w ustawieniach podasz własny klucz
 *     dostawcy zgodnego z OpenAI, trudniejsze pytania trafią do modelu.
 *     Klucz zostaje w localStorage tej przeglądarki i jest wysyłany tylko
 *     do wybranego przez Ciebie adresu API. Bez klucza nic nie wychodzi.
 */
(function (window, document) {
  'use strict';

  var AI_KEY = 'rj_assistant_ai_v1';
  var PLANNER_KEY = 'rj_planner_v1';
  var HISTORY_LIMIT = 10;

  var PAGES = [
    { title: 'Strona główna', url: '/', aliases: ['start', 'glowna', 'home', 'rejhub'], desc: 'Projekty, statystyki i skróty.' },
    { title: 'RejChat', url: '/rejchat', aliases: ['czat', 'chat', 'rozmowy', 'rejchat'], desc: 'Czat publiczny i prywatne rozmowy.' },
    { title: 'RejFile', url: '/rejfile', aliases: ['pliki', 'rejfile', 'file'], desc: 'Wysyłanie i udostępnianie plików.' },
    { title: 'RejSejf', url: '/rejsejf', aliases: ['sejf', 'hasla', 'rejsejf'], desc: 'Prywatne notatki i sejf.' },
    { title: 'RejTools', url: '/rejtools', aliases: ['narzedzia', 'tools', 'rejtools'], desc: 'PDF, konwersje, QR i obliczenia.' },
    { title: 'RejClass', url: '/rejclass', aliases: ['lekcje', 'nauka', 'rejclass'], desc: 'Lekcje i materiały do nauki.' },
    { title: 'Aplikacje', url: '/aplikacje', aliases: ['aplikacje', 'apps', 'narzedzia rejhuba'], desc: 'Planer, gry, muzyka, memy i asystent.' },
    { title: 'RejPlanner', url: '/rejplanner', aliases: ['planer', 'kalendarz', 'planner', 'zadania'], desc: 'Kalendarz, wydarzenia i zadania.' },
    { title: 'RejGames', url: '/rejgames', aliases: ['gry', 'games', 'rejgames'], desc: 'Wszystkie gry w jednym miejscu.' },
    { title: 'RejMusic', url: '/rejmusic', aliases: ['muzyka', 'music', 'rejmusic', 'spotify'], desc: 'Odtwarzacz i playlista.' },
    { title: 'RejMeme', url: '/rejmeme', aliases: ['memy', 'mem', 'meme', 'rejmeme'], desc: 'Galeria memów z moderacją i wgrywaniem.' },
    { title: 'RejAsystent', url: '/rejasystent', aliases: ['asystent', 'assistant', 'ai'], desc: 'Ten asystent.' },
    { title: 'Profil', url: '/profil', aliases: ['profil', 'konto', 'avatar'], desc: 'Twój profil i ustawienia konta.' },
    { title: 'Panel admina', url: '/admin', aliases: ['admin', 'panel', 'statystyki'], desc: 'Statystyki i zgłoszenia (tylko administrator).' },
    { title: 'Partnerstwo', url: '/partnerstwo', aliases: ['partnerstwo', 'wspolpraca', 'propozycja'], desc: 'Współpraca i zgłoszenia.' },
    { title: 'Tworzenie stron', url: '/uslugi', aliases: ['uslugi', 'strona', 'strony'], desc: 'Zamówienie własnej strony.' },
    { title: 'Licencja', url: '/licencja', aliases: ['licencja', 'prawa', 'copyright'], desc: 'Zasady korzystania z treści.' }
  ];

  var el = {};
  var settings = { base: '', model: '', key: '' };
  var history = [];

  function $(id) { return document.getElementById(id); }
  function normalize(text) {
    return String(text || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function todayKey(offset) {
    var d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function longDate(key) {
    var names = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
    var parts = key.split('-');
    return Number(parts[2]) + ' ' + names[Number(parts[1]) - 1] + ' ' + parts[0];
  }

  function bubble(text, who, links) {
    if (!el.log) return;
    var message = document.createElement('div');
    message.className = 'ai-msg ai-msg--' + who;
    String(text || '').split('\n').forEach(function (line) {
      var p = document.createElement('p');
      p.textContent = line;
      message.appendChild(p);
    });
    (links || []).forEach(function (item) {
      var p = document.createElement('p');
      var link = document.createElement('a');
      link.href = item.url;
      link.textContent = item.title;
      p.appendChild(link);
      message.appendChild(p);
    });
    el.log.appendChild(message);
    el.log.scrollTop = el.log.scrollHeight;
    return message;
  }

  function reply(text, links) {
    bubble(text, 'bot', links);
    history.push({ role: 'assistant', content: text });
    if (history.length > HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem('theme', theme); } catch (error) { /* tryb prywatny */ }
    return theme === 'light' ? 'Jasny motyw włączony.' : 'Ciemny motyw włączony.';
  }

  function addTask(title, date) {
    if (!title) return null;
    var items = [];
    try {
      var raw = window.localStorage.getItem(PLANNER_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) items = parsed;
    } catch (error) { items = []; }
    items.push({
      id: Math.random().toString(36).slice(2),
      title: title.slice(0, 140),
      date: date,
      time: '',
      kind: 'task',
      note: 'Dodane przez RejAsystenta',
      done: false
    });
    try { window.localStorage.setItem(PLANNER_KEY, JSON.stringify(items)); }
    catch (error) { return null; }
    return items.length;
  }

  function findPages(query) {
    var q = normalize(query);
    if (!q) return [];
    return PAGES.filter(function (page) {
      return normalize(page.title + ' ' + page.aliases.join(' ') + ' ' + page.desc).indexOf(q) >= 0
        || q.indexOf(normalize(page.title)) >= 0;
    }).slice(0, 4);
  }

  function helpText() {
    return 'Umiem:\n' +
      '• otwierać strony — np. „otwórz RejChat”, „pokaż gry”,\n' +
      '• przełączać motyw — „włącz jasny motyw”,\n' +
      '• dodawać zadania — „dodaj zadanie kupić kawę na jutro”,\n' +
      '• szukać w serwisie — „szukaj sejf”,\n' +
      '• odpowiadać na pytania o RejHub i podpowiadać, gdzie co jest.\n' +
      'Trudniejsze pytania obsłuży model AI, gdy dodasz własny klucz w ustawieniach obok.';
  }

  function localReply(raw) {
    var text = normalize(raw);
    var page;

    if (!text) return;
    if (/^(czesc|hej|siema|dzien dobry|hello|hi)\b/.test(text)) {
      return reply('Cześć! Jestem RejAsystentem. Powiedz, co chcesz zrobić — mogę otworzyć stronę, dodać zadanie albo podpowiedzieć, gdzie co jest.');
    }
    if (/(pomoc|co potrafisz|co umiesz|jak dzialasz|help)/.test(text)) {
      return reply(helpText());
    }
    if (/(ciemny|dark)/.test(text) && /(motyw|theme|tryb)/.test(text)) {
      return reply(setTheme('dark'));
    }
    if (/(jasny|light)/.test(text) && /(motyw|theme|tryb)/.test(text)) {
      return reply(setTheme('light'));
    }
    if (/(ktora godzina|jaka godzina|czas)/.test(text)) {
      return reply('Teraz jest ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) + '.');
    }
    if (/(jaka data|dzisiaj jest|jaki dzien)/.test(text)) {
      return reply('Dzisiaj jest ' + new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.');
    }
    if (/(co nowego|nowosci|co dodano)/.test(text)) {
      return reply('Ostatnio w RejHubie:\n• RejPlanner — kalendarz i zadania,\n• RejGames — wszystkie gry w jednym miejscu,\n• RejMusic — wyszukiwarka Deezer i Apple Music oraz odtwarzacze Spotify, YouTube i SoundCloud,\n• RejMeme — galeria memów z kolejką moderacji,\n• powiadomienia push mają test, więc od razu wiadomo, czy działają,\n• na telefonie można dodać RejHub do ekranu głównego.');
    }
    if (/(powiadomien|push|notyfikac)/.test(text)) {
      return reply('Powiadomienia włączysz w RejChacie: panel „Powiadomienia” → „Włącz powiadomienia na telefon”. Po włączeniu możesz wysłać powiadomienie testowe. Na iPhonie wymaga to dodania RejHub do ekranu głównego (iOS 16.4+).',
        [{ title: 'Przejdź do RejChatu', url: '/rejchat' }]);
    }
    if (/(co to rejhub|czym jest rejhub|o rejhubie)/.test(text)) {
      return reply('RejHub to moja strona i miejsce na projekty: czat, pliki, sejf, narzędzia, lekcje oraz nowe aplikacje — planer, gry, muzykę, memy i asystenta. Wszystko w jednym miejscu, w jednym stylu.');
    }
    if (/(kim jest rejson|kto to rejson|o autorze)/.test(text)) {
      return reply('Rejson59 to autor RejHuba. Tworzy aplikacje, gry i eksperymenty z AI — od Minecrafta w przeglądarce po własny czat i planer.');
    }
    if (/(bezpiecz|prywatn|dane|rodo)/.test(text)) {
      return reply('Planer, muzyka i memy działają lokalnie: dane zostają w tej przeglądarce, dopóki sam ich nie wyślesz. Czat i profil korzystają z Supabase. Klucz do modelu AI (jeśli go dodasz) zostaje wyłącznie na tym urządzeniu.');
    }

    /* Tytuł bierzemy z ORYGINALNEGO tekstu, nie z wersji bez ogonków —
       inaczej „kupić kawę” zapisałoby się jako „kupic kawe”. */
    var task = /^\s*(?:dodaj|zaplanuj|przypomnij)(?:\s+mi)?(?:\s+(?:zadanie|wydarzenie))?[:\s]+(.+)$/i.exec(String(raw || ''));
    if (task) {
      var title = task[1];
      var date = todayKey(0);
      var when = /\sna\s+(dziś|dzisiaj)\b/i.test(' ' + title) ? 'dziś' : '';
      if (/\sna\s+jutro\b/i.test(' ' + title)) { date = todayKey(1); when = 'jutro'; }
      var iso = /\sna\s+(\d{4}-\d{2}-\d{2})/.exec(' ' + title);
      if (iso) { date = iso[1]; when = longDate(date); }
      title = title.replace(/\s+na\s+(dziś|dzisiaj|jutro|\d{4}-\d{2}-\d{2}).*$/i, '').trim();
      if (title.length < 2) return reply('Podaj, co mam dodać — np. „dodaj zadanie kupić kawę na jutro”.');
      var total = addTask(title, date);
      if (total === null) return reply('Nie udało się zapisać zadania — przeglądarka blokuje pamięć lokalną.', [{ title: 'Otwórz planer', url: '/rejplanner' }]);
      return reply('Dodane do RejPlannera: „' + title + '”' + (when ? ' na ' + when : ' na dziś') + '.', [{ title: 'Otwórz planer', url: '/rejplanner' }]);
    }

    var search = /(szukaj|znajdz|gdzie jest|gdzie sa)[:\s]+(.+)/.exec(text);
    if (search) {
      var found = findPages(search[2]);
      if (!found.length) return reply('Nie znalazłem tego w RejHubie. Spróbuj „gry”, „muzyka”, „sejf” albo „planer”.');
      return reply('Znalazłem ' + (found.length === 1 ? 'jedno miejsce' : found.length + ' miejsca') + ':', found.map(function (page) {
        return { title: page.title + ' — ' + page.desc, url: page.url };
      }));
    }

    var open = /(otworz|open|przejdz do|pokaz|wejdź|wejdz)[:\s]*(.*)/.exec(text);
    if (open) {
      var target = open[2] || '';
      var matches = findPages(target);
      if (!matches.length) matches = findPages(target.replace(/^(do|na|strona|strone)\s+/, ''));
      if (matches.length) {
        page = matches[0];
        reply('Otwieram: ' + page.title + '.', [{ title: page.title, url: page.url }]);
        window.setTimeout(function () { window.location.assign(page.url); }, 650);
        return;
      }
      return reply('Nie wiem, którą stronę otworzyć. Dostępne: RejChat, RejFile, RejSejf, RejTools, RejClass, Aplikacje, Planer, Gry, Muzyka, Memy.');
    }

    var direct = findPages(text);
    if (direct.length === 1) {
      page = direct[0];
      return reply(page.title + ' — ' + page.desc, [{ title: 'Otwórz ' + page.title, url: page.url }]);
    }

    return null;
  }

  function loadSettings() {
    settings = { base: '', model: '', key: '' };
    try {
      var raw = window.localStorage.getItem(AI_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          settings.base = String(parsed.base || '').slice(0, 300);
          settings.model = String(parsed.model || '').slice(0, 100);
          settings.key = String(parsed.key || '').slice(0, 300);
        }
      }
    } catch (error) { /* brak ustawień */ }
    paintSettings();
  }

  function paintSettings() {
    if (el.base) el.base.value = settings.base;
    if (el.model) el.model.value = settings.model;
    if (el.key) el.key.value = settings.key;
    if (el.aiState) {
      el.aiState.textContent = settings.key && settings.base && settings.model
        ? 'Model podłączony: ' + settings.model
        : 'Model niepodłączony — odpowiadam lokalnie.';
    }
  }

  function saveSettings() {
    settings.base = String(el.base && el.base.value || '').trim().replace(/\/+$/, '');
    settings.model = String(el.model && el.model.value || '').trim();
    settings.key = String(el.key && el.key.value || '').trim();
    if (settings.base && !/^https:\/\//i.test(settings.base)) {
      reply('Adres API musi zaczynać się od https:// — inaczej klucz mógłby wyciec.');
      return;
    }
    if (!settings.base || !settings.model || !settings.key) {
      reply('Podaj adres API, nazwę modelu i klucz — albo wyczyść pola, żeby wrócić do trybu lokalnego.');
      return;
    }
    try {
      window.localStorage.setItem(AI_KEY, JSON.stringify(settings));
      reply('Model podłączony. Klucz zostaje w tej przeglądarce i jest wysyłany tylko na podany adres.');
    } catch (error) {
      reply('Nie udało się zapisać ustawień (pamięć przeglądarki zablokowana).');
    }
    paintSettings();
  }

  function clearSettings() {
    settings = { base: '', model: '', key: '' };
    try { window.localStorage.removeItem(AI_KEY); } catch (error) { /* nic */ }
    paintSettings();
    reply('Wyczyszczono ustawienia modelu — znów odpowiadam lokalnie.');
  }

  function askModel(question) {
    var endpoint = settings.base.replace(/\/+$/, '') + '/chat/completions';
    var messages = [{
      role: 'system',
      content: 'Jesteś RejAsystentem w serwisie RejHub (rejhub.vercel.app). Odpowiadaj po polsku, krótko i konkretnie. ' +
        'Strony serwisu: /rejchat, /rejfile, /rejsejf, /rejtools, /rejclass, /aplikacje, /rejplanner, /rejgames, /rejmusic, /rejmeme, /rejasystent, /profil, /uslugi, /partnerstwo. ' +
        'Nie wymyślaj funkcji, których nie ma. Jeśli czegoś nie wiesz, powiedz to wprost.'
    }].concat(history.slice(-6)).concat([{ role: 'user', content: question }]);

    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.key },
      body: JSON.stringify({ model: settings.model, messages: messages, max_tokens: 500, temperature: 0.6 })
    }).then(function (response) {
      if (!response.ok) throw new Error('API odpowiedziało ' + response.status + '.');
      return response.json();
    }).then(function (data) {
      var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error('Pusta odpowiedź modelu.');
      return String(content).slice(0, 4000);
    });
  }

  function send() {
    if (!el.input) return;
    var value = el.input.value.trim();
    if (!value) return;
    bubble(value, 'user');
    history.push({ role: 'user', content: value });
    el.input.value = '';
    var local = localReply(value);
    if (local !== null) return;
    if (settings.key && settings.base && settings.model) {
      var pending = bubble('Myślę…', 'bot');
      askModel(value).then(function (answer) {
        if (pending && pending.parentNode) pending.parentNode.removeChild(pending);
        reply(answer);
      }).catch(function (error) {
        if (pending && pending.parentNode) pending.parentNode.removeChild(pending);
        reply('Nie udało się połączyć z modelem: ' + ((error && error.message) || 'nieznany błąd') + '. Spróbuj „pomoc”, żebym pokazał, co umiem lokalnie.');
      });
    } else {
      reply('Tego jeszcze nie umiem bez modelu AI. Spróbuj „pomoc” — pokażę, co potrafię lokalnie. Możesz też dodać własny klucz API w ustawieniach obok.');
    }
  }

  function boot() {
    el = {
      log: $('ai-log'),
      input: $('ai-input'),
      form: $('ai-form'),
      chips: $('ai-chips'),
      base: $('ai-base'),
      model: $('ai-model'),
      key: $('ai-key'),
      aiState: $('ai-state'),
      settings: $('ai-settings')
    };
    if (!el.log) return;
    loadSettings();
    reply('Cześć! Jestem RejAsystentem. Mogę otwierać strony RejHuba, przełączać motyw, dodawać zadania do planera i podpowiadać, gdzie co jest. Od czego zaczynamy?');

    if (el.form) el.form.addEventListener('submit', function (event) { event.preventDefault(); send(); });
    if (el.chips) el.chips.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-ask]');
      if (!chip) return;
      if (el.input) el.input.value = chip.getAttribute('data-ask');
      send();
    });
    var toggle = $('ai-settings-toggle');
    if (toggle) toggle.addEventListener('click', function () {
      if (!el.settings) return;
      var open = el.settings.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Ukryj ustawienia modelu' : 'Ustawienia modelu AI';
      if (open && el.base) el.base.focus();
    });
    var save = $('ai-save');
    if (save) save.addEventListener('click', saveSettings);
    var clear = $('ai-clear');
    if (clear) clear.addEventListener('click', clearSettings);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.RejAssistant = {
    ask: function (text) {
      if (el.input) { el.input.value = text; send(); }
    }
  };
})(window, document);

/* © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
   ==========================================================================
   Wspólna warstwa sieciowa RejHuba.

   Problem, który to rozwiązuje: każdy moduł (czat, wpisy, prywatne rozmowy,
   powiadomienia, reakcje, liczniki) odpytywał Supabase własnym `setInterval`,
   bez limitu czasu, bez ponowień i bez koordynacji. Kilka otwartych kart
   potrafiło wysłać kilkanaście żądań w sekundę, a pojedynczy błąd sieci
   zostawiał pusty ekran do ręcznego odświeżenia.

   Tutaj jest jedno miejsce, które:
   - ogranicza liczbę równoczesnych żądań (kolejka),
   - nadaje limit czasu każdemu żądaniu (AbortController),
   - ponawia tylko to, co ma sens (sieć, 408, 425, 429, 5xx) z losowym
     opóźnieniem rosnącym wykładniczo; błędy reguł biznesowych (4xx) wracają
     od razu, bez zbędnych prób,
   - skleja identyczne żądania wysłane w tej samej chwili (np. dwie sekcje
     proszące o ten sam profil),
   - daje harmonogram `every()`, który nie nakłada żądań, zatrzymuje się przy
     ukrytej karcie i sam zwalnia po błędach (do 60 s), a po sukcesie wraca,
   - informuje stronę zdarzeniem `rj:net-state`, żeby pokazać „ponawiam…”.
   ========================================================================== */
(function (window, document) {
  'use strict';
  if (!window || window.RJNet) return;

  var MAX_PARALLEL = 6;
  var TIMEOUT_MS = 15000;
  var RETRY_BASE = 700;
  var RETRY_MAX = 20000;

  var active = 0;
  var queue = [];
  var inFlight = Object.create(null);
  var state = { status: 'ok', message: '', since: 0 };
  var timers = Object.create(null);
  var seq = 0;

  function now() { return Date.now(); }

  function emit(status, message) {
    var next = status || 'ok';
    if (state.status === next && !message) return;
    state = { status: next, message: message || '', since: now() };
    try {
      window.dispatchEvent(new CustomEvent('rj:net-state', { detail: { status: state.status, message: state.message } }));
    } catch (e) { /* starsze silniki */ }
  }

  function jitter(ms) { return Math.round(ms * (0.75 + Math.random() * 0.5)); }

  function retryable(err) {
    if (!err) return true;
    if (err.name === 'AbortError' || err.name === 'TypeError') return true;
    var s = Number(err.status) || 0;
    if (!s) return true;                              /* brak odpowiedzi = sieć */
    if (s === 408 || s === 425 || s === 429) return true;
    return s >= 500;
  }

  function online() {
    return !(typeof navigator !== 'undefined' && navigator.onLine === false);
  }

  function pump() {
    while (active < MAX_PARALLEL && queue.length) {
      var job = queue.shift();
      active++;
      job();
    }
  }

  function release() {
    active = Math.max(0, active - 1);
    pump();
  }

  /* Jedno żądanie z limitem czasu. `keepalive` zostaje dla zdarzeń pagehide. */
  function attempt(url, init, timeout, label) {
    return new Promise(function (resolve, reject) {
      if (!online()) {
        var off = new Error('Brak połączenia z internetem.');
        off.status = 0;
        off.offline = true;
        reject(off);
        return;
      }
      if (typeof fetch !== 'function') { reject(new Error('Brak obsługi fetch.')); return; }
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = 0;
      if (controller && !init.keepalive) {
        timer = window.setTimeout(function () {
          try { controller.abort(); } catch (e) { /* ignorujemy */ }
        }, timeout);
      }
      var options = Object.assign({}, init);
      if (controller && !init.keepalive) options.signal = controller.signal;
      fetch(url, options).then(function (res) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        var parse = res.status === 204 ? Promise.resolve(null) : res.text().then(function (raw) {
          if (!raw) return null;
          try { return JSON.parse(raw); } catch (e) { return raw; }
        }).catch(function () { return null; });
        parse.then(function (body) {
          if (!res.ok) {
            var err = new Error((body && (body.message || body.hint || body.error_description || body.error)) || ('Serwer odpowiedział ' + res.status + '.'));
            err.status = res.status;
            err.body = body;
            err.label = label;
            reject(err);
            return;
          }
          resolve(body);
        });
      }).catch(function (err) {
        if (timer) { window.clearTimeout(timer); timer = 0; }
        if (err && err.name === 'AbortError') {
          var timeoutErr = new Error('Serwer nie odpowiedział na czas.');
          timeoutErr.status = 0;
          timeoutErr.timeout = true;
          timeoutErr.label = label;
          reject(timeoutErr);
          return;
        }
        err = err || new Error('Błąd sieci.');
        err.label = label;
        reject(err);
      });
    });
  }

  function enqueue(job) {
    queue.push(job);
    pump();
  }

  /**
   * Żądanie JSON z ponowieniami.
   * @param {string} url
   * @param {Object} init  opcje fetch (method/body/headers/keepalive…)
   * @param {Object} [opts] {timeout, retries, dedupe, quiet, label}
   */
  function request(url, init, opts) {
    opts = opts || {};
    var timeout = opts.timeout || TIMEOUT_MS;
    var retries = opts.retries == null ? 2 : opts.retries;
    var label = opts.label || url;
    var dedupeKey = opts.dedupe ? (init.method || 'GET') + ' ' + url + ' ' + (typeof init.body === 'string' ? init.body : '') : '';
    if (dedupeKey && inFlight[dedupeKey]) return inFlight[dedupeKey];

    var promise = new Promise(function (resolve, reject) {
      var tries = 0;

      function finishOk(data) {
        release();
        if (state.status !== 'ok') emit('ok');
        resolve(data);
      }

      function finishErr(err, job) {
        release();
        tries++;
        if (tries <= retries && retryable(err)) {
          if (!opts.quiet) emit('retry', 'Ponawiam połączenie…');
          var wait = jitter(Math.min(RETRY_MAX, RETRY_BASE * Math.pow(2, tries - 1)));
          window.setTimeout(function () { enqueue(job); }, wait);
          return;
        }
        if (!opts.quiet) {
          emit(err && err.offline ? 'offline' : 'error', (err && err.message) || 'Nie udało się połączyć.');
        }
        reject(err);
      }

      function job() {
        attempt(url, init, timeout, label).then(finishOk, function (err) { finishErr(err, job); });
      }

      /* Żądanie trafia do kolejki od razu — `pump()` pilnuje limitu. */
      enqueue(job);
    });

    if (dedupeKey) {
      inFlight[dedupeKey] = promise;
      var clear = function () { delete inFlight[dedupeKey]; };
      promise.then(clear, clear);
    }
    return promise;
  }

  /**
   * Harmonogram bez nakładania: zadanie startuje dopiero po zakończeniu
   * poprzedniego. Przy błędzie odstęp rośnie (max 60 s), przy sukcesie wraca
   * do wartości bazowej. Ukryta karta wstrzymuje pracę.
   */
  function every(name, ms, task, opts) {
    opts = opts || {};
    var id = name || ('task-' + (++seq));
    if (timers[id]) window.clearTimeout(timers[id]);
    var base = Math.max(500, Number(ms) || 5000);
    var current = base;
    var fails = 0;
    var running = false;
    var stopped = false;

    function schedule(delay) {
      if (stopped) return;
      window.clearTimeout(timers[id]);
      timers[id] = window.setTimeout(tick, Math.max(250, delay));
    }

    function tick() {
      if (stopped) return;
      if (document.hidden && !opts.hidden) { schedule(base); return; }
      if (opts.when && !opts.when()) { schedule(base); return; }
      if (navigator.onLine === false) { schedule(Math.max(base, 5000)); return; }
      if (running) { schedule(current); return; }
      running = true;
      var out;
      try { out = task(); } catch (e) { out = Promise.reject(e); }
      Promise.resolve(out).then(function () {
        running = false;
        fails = 0;
        current = base;
        schedule(base);
      }, function () {
        running = false;
        fails++;
        current = Math.min(60000, jitter(base * Math.pow(2, Math.min(fails, 4))));
        schedule(current);
      });
    }

    /* Rozrzut startu: wszyscy otwierają czat o pełnej sekundzie i odpytywali
       by równo co 4,5 s. Losowe 0–1,2 s rozkłada ruch między klientami. */
    var startDelay = typeof opts.delay === 'number' ? opts.delay : base + Math.random() * Math.min(1200, base * 0.25);
    schedule(startDelay);
    return {
      id: id,
      start: function (delay) { stopped = false; schedule(delay || base); },
      stop: function () { stopped = true; window.clearTimeout(timers[id]); },
      poke: function (delay) { if (!stopped) schedule(typeof delay === 'number' ? delay : 200); },
      interval: function () { return current; },
      setInterval: function (next) { base = Math.max(500, Number(next) || base); current = base; }
    };
  }

  /* Nazwy funkcji tylko czytających. Tylko one mogą być ponawiane:
     powtórzone „wyślij”, „polub”, „zareaguj” albo „wgraj” zrobiłoby to
     drugi raz po zerwanym połączeniu. */
  var READ_ONLY = /(?:^|_)(?:list|lists|get|profile|profiles|inbox|history|overview|status|whoami|details|online|search|check|count|usage|breakdown|notifications?|warnings?|reaction_inbox)(?:$|_)/i;

  function readOnly(name) {
    return READ_ONLY.test(String(name || '').replace(/^https?:.*\/rpc\//i, ''));
  }

  function idle(fn) {
    if (typeof window.requestIdleCallback === 'function') return window.requestIdleCallback(fn, { timeout: 2000 });
    return window.setTimeout(fn, 1);
  }

  window.RJNet = {
    request: request,
    rpc: function (url, body, opts) {
      return request(url, {
        method: 'POST',
        headers: (opts && opts.headers) || { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        cache: 'no-store'
      }, Object.assign({ dedupe: true, label: url }, opts || {}));
    },
    every: every,
    idle: idle,
    readOnly: readOnly,
    state: function () { return { status: state.status, message: state.message, since: state.since }; },
    online: online,
    /* Do testów: ile żądań realnie wisi. */
    pending: function () { return active + queue.length; }
  };

  window.addEventListener('online', function () {
    emit('ok');
    document.dispatchEvent(new CustomEvent('rj:net-online'));
  });
  window.addEventListener('offline', function () {
    emit('offline', 'Brak połączenia z internetem.');
  });
})(window, document);

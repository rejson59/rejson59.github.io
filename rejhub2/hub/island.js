/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   ============================================================================
   Dynamiczna wyspa RejHub
   ----------------------------------------------------------------------------
   Jedna czarna wyspa na dole ekranu zamiast pigułki do zgłoszeń. Sprężyna w
   JavaScript animuje wyłącznie width/height/border-radius (jedna pętla rAF),
   więc nie ma tu ani rozmywania tła, ani przeliczania layoutu strony.

   Funkcje: zgłoszenie błędu/pomysłu (prawdziwy submit_feedback), wyszukiwanie
   stron i akcji, powiadomienia RejChat/RejFile + push, sterowanie tym, co gra
   na stronie, szybkie akcje, profil i status, motyw i animacje, zadania oraz
   autodestrukcja (prawdziwy RejPanic).
   ========================================================================== */
(function (window, document) {
  "use strict";

  if (window.__RJ_ISLAND__) return;
  window.__RJ_ISLAND__ = true;

  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

  var VOTER_KEY = "rejson_widgets_voter_id_v1";
  var COLLAPSE_KEY = "rj_island_collapsed_v1";
  var CORNER_KEY = "rj_island_corner_v1";
  /* Układ wyspy i drobne zachowania — wszystkie zapamiętywane w przeglądarce. */
  var ORIENT_KEY = "rj_island_orientation_v1";
  var HAPTIC_KEY = "rj_island_haptics_v1";
  var QUIET_KEY = "rj_island_quiet_until_v1";
  var QUEUE_KEY = "rj_island_offline_queue_v1";
  var TASKS_KEY = "rj_island_tasks_v1";
  var STATUS_KEY = "rj_island_status_v1";

  var scriptEl = document.currentScript || document.querySelector('script[src*="hub/island.js"]');
  var projectSlug = (scriptEl && scriptEl.getAttribute("data-project")) || "rejhub";
  var projectName = (scriptEl && scriptEl.getAttribute("data-project-name")) || "RejHub";

  /* ------------------------------------------------------------------ ikony */

  var ICONS = {
    report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 8v5M12 16.5h.01"/><path d="M10.3 3.6 2.4 18a1.9 1.9 0 0 0 1.7 2.8h15.8A1.9 1.9 0 0 0 21.6 18L13.7 3.6a1.9 1.9 0 0 0-3.4 0Z"/></svg>',
    idea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.7v.5h5.6v-.5c0-.7.3-1.3.8-1.7A6 6 0 0 0 12 3Z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 8l-4 4 4 4M6 12h9"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
    alerts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9M10 20h4"/></svg>',
    now: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="16.5" cy="16" r="2.6"/></svg>',
    quick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L19 10h-6.5Z"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.09A1.7 1.7 0 0 0 20.86 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12 20 4.5 15.6 20l-3.5-5.7L4.5 12Z"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 15v4.5h15V15"/></svg>',
    panic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.5 6.5a7.5 7.5 0 1 0 11 0"/></svg>',
    close: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5 12 15.5l6-6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14.5 12 8.5l6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM19 5v14L9 12z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l11 7-11 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5 5v14l10-7z"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M21 12.5 12.6 21a5 5 0 0 1-7-7l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h14v15H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 9h8M8 12h5"/></svg>',
    /* RejAsystent — iskra, ta sama, co na kartach aplikacji. */
    assistant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3.5c.7 4.2 2 5.5 6.2 6.2-4.2.7-5.5 2-6.2 6.2-.7-4.2-2-5.5-6.2-6.2 4.2-.7 5.5-2 6.2-6.2Z"/><path d="M17.8 15.2c.35 2 .95 2.6 2.95 2.95-2 .35-2.6.95-2.95 2.95-.35-2-.95-2.6-2.95-2.95 2-.35 2.6-.95 2.95-2.95Z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 15v4.5h15V15"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 13 4.5a4.2 4.2 0 0 1 6 6l-2 2"/><path d="M13 17.5 11 19.5a4.2 4.2 0 0 1-6-6l2-2"/></svg>'
  };

  /* ----------------------------------------------------------- narzędzia */

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, function (c) {
        return { "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z" }[c];
      });
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
      return value;
    } catch (e) {
      return null;
    }
  }

  function storeJson(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      return null;
    }
    return value;
  }

  var SESSION_KEY = "rejson_community_session_v1";

  function session() {
    if (window.RJProfiles && typeof window.RJProfiles.session === "function") return window.RJProfiles.session();
    try {
      var raw = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return raw && typeof raw.token === "string" && raw.token.length >= 16 ? raw : null;
    } catch (e) {
      return null;
    }
  }

  function rpc(name, body) {
    return fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    }).then(function (response) {
      return response.json().catch(function () {
        return null;
      }).then(function (payload) {
        if (!response.ok) throw new Error((payload && payload.message) || "Błąd połączenia.");
        return payload;
      });
    });
  }

  function voterId() {
    var id = store(VOTER_KEY);
    if (id && id.length >= 16) return id;
    id = "rjv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 14);
    store(VOTER_KEY, id);
    return id;
  }

  function fpId() {
    try {
      var screen = window.screen || {};
      var parts = [
        navigator.userAgent || "", navigator.language || "", (navigator.languages || []).join(","),
        navigator.platform || "", screen.width || 0, screen.height || 0,
        screen.availWidth || 0, screen.availHeight || 0, screen.colorDepth || 0,
        window.devicePixelRatio || 1, new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0, navigator.deviceMemory || 0,
        navigator.maxTouchPoints || 0, navigator.cookieEnabled ? 1 : 0
      ].join("|");
      var hash = 0x811c9dc5;
      for (var i = 0; i < parts.length; i += 1) {
        hash ^= parts.charCodeAt(i);
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
      }
      return String(1000 + (hash % 9000));
    } catch (e) {
      return "";
    }
  }

  function diagnostics() {
    var ua = navigator.userAgent || "";
    return {
      browser: (/Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Inna"),
      viewport: window.innerWidth + "x" + window.innerHeight,
      ratio: window.devicePixelRatio || 1,
      language: navigator.language || "",
      platform: navigator.platform || "",
      path: window.location.pathname,
      theme: document.documentElement.dataset.theme || "dark"
    };
  }

  function fmtWhen(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return "";
    var diff = Date.now() - date.getTime();
    if (diff < 60000) return "teraz";
    if (diff < 3600000) return Math.round(diff / 60000) + " min";
    if (diff < 86400000) return Math.round(diff / 3600000) + " godz.";
    return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  }

  /* ------------------------------------------------------------- rozmiary */

  var SIZES = {
    /* Schowana wyspa to mały uchwyt przyklejony do dolnej krawędzi ekranu —
       wciąż widoczny (żeby dało się ją przywrócić), ale nie zasłania treści. */
    min: { w: 132, h: 28, r: 14 },
    /* Schowany uchwyt pokazujący, co gra — szerszy i wyższy, żeby zmieścił
       tytuł, pasek postępu i pauzę. */
    minPlay: { w: 244, h: 34, r: 17 },
    idle: { w: 216, h: 46, r: 23 },
    dock: { w: 448, h: 52, r: 26 },
    report: { w: 384, h: 236, r: 24 },
    chat: { w: 396, h: 440, r: 24 },
    assistant: { w: 396, h: 470, r: 24 },
    alerts: { w: 384, h: 296, r: 24 },
    now: { w: 384, h: 112, r: 24 },
    profile: { w: 384, h: 158, r: 24 },
    quick: { w: 384, h: 250, r: 24 },
    theme: { w: 384, h: 470, r: 24 },
    tasks: { w: 384, h: 208, r: 24 },
    panic: { w: 320, h: 160, r: 24 }
  };

  var state = "idle";
  var box = { w: 172, h: 46, r: 23, vw: 0, vh: 0, vr: 0, tw: 172, th: 46, tr: 23 };
  var raf = 0;
  var lastTs = 0;
  var SPRING = 700;
  var DAMP = 62;

  /* Margines od krawędzi ekranu i miejsce pod wyspą (pasek przeglądarki,
     bezpieczny obszar iPhone'a). Bez tego panel 384 px na telefonie 360 px
     wystawał poza ekran i przycisk zamykania był ucięty. */
  var EDGE = 12;
  var BOTTOM_RESERVE = 34;
  var RESET_GUARD = 0;
  var vpRaf = 0;

  /* Rozmiar liczymy z pudełka samej wyspy, nie z window.innerWidth ani
     visualViewport. Na Brave/Android te dwa potrafią podać inną liczbę niż
     ta, której używa CSS (100vw), i wtedy wyspa była szersza niż ekran albo
     niższa niż jej własna treść. Pudełko `position: fixed; inset: 0` ma
     dokładnie ten sam rozmiar, co 100vw × 100vh. */
  function viewport() {
    var rect = null;
    try {
      rect = root && root.getBoundingClientRect ? root.getBoundingClientRect() : null;
    } catch (e) { rect = null; }
    var docEl = document.documentElement || {};
    var w = Math.round((rect && rect.width) || docEl.clientWidth || window.innerWidth || 360);
    var h = Math.round((rect && rect.height) || docEl.clientHeight || window.innerHeight || 640);
    return {
      w: Math.max(220, w),
      h: Math.max(260, h),
      kb: keyboardOffset(h)
    };
  }

  /* Klawiatura podnosi wyspę tylko wtedy, gdy naprawdę piszemy w wyspie.
     Dzięki temu dziwne wartości visualViewport (zoom, pasek adresu) nie
     przesuwają jej bez powodu. */
  function keyboardOffset(viewHeight) {
    var vv = window.visualViewport || null;
    if (!vv || !focusedInside()) return 0;
    if (vv.scale && vv.scale > 1.01) return 0;
    var innerH = Number(window.innerHeight) || 0;
    if (!innerH) return 0;
    var delta = Math.round(innerH - (vv.height + (vv.offsetTop || 0)));
    /* Kilkadziesiąt pikseli to chowający się pasek adresu, nie klawiatura. */
    if (delta < 90) return 0;
    /* Wyspa staje dokładnie nad klawiaturą — cała jej wysokość jest wtedy
       liczona od widocznego obszaru, nie od całego okna. */
    return Math.min(delta, Math.round(viewHeight * 0.6));
  }

  function focusedInside() {
    if (!island) return false;
    var active = (shadow && shadow.activeElement) || document.activeElement;
    if (!active || active === document.body || active === host) return false;
    return island.contains(active);
  }

  function finite(value, fallback) {
    return typeof value === "number" && isFinite(value) ? value : fallback;
  }

  /* ------------------------------------------------------------ sieć */

  function online() {
    try {
      return navigator.onLine !== false;
    } catch (e) {
      return true;
    }
  }

  /* --------------------------------------------------------- cisza */

  function quietUntil() {
    var value = Number(store(QUIET_KEY));
    return isFinite(value) && value > 0 ? value : 0;
  }

  function isQuiet() {
    return quietUntil() > Date.now();
  }

  /* Ile zostało ciszy — w milisekundach (0 = cisza nie trwa). */
  function quietLeft() {
    return Math.max(0, quietUntil() - Date.now());
  }

  function quietLabel(ms) {
    var total = Math.ceil(ms / 1000);
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    return "cisza " + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  /* Pigułka „Wróć teraz” — jedyne wyjście z ciszy i jedyny ślad, że wyspa
     w ogóle istnieje. Widoczna od pierwszej sekundy ciszy do jej końca. */
  function syncQuietPill() {
    var pill = within("[data-unquiet]");
    if (!pill) return;
    var left = quietLeft();
    var on = left > 0;
    pill.hidden = !on;
    if (!on) {
      clearInterval(syncQuietPill._timer);
      return;
    }
    var label = pill.querySelector("[data-unquiet-left]");
    if (label) label.textContent = quietLabel(left);
    pill.setAttribute("aria-label", "Wróć teraz — wyspa ukryta jeszcze przez " + quietLabel(left).replace("cisza ", ""));
    clearInterval(syncQuietPill._timer);
    syncQuietPill._timer = setInterval(function () {
      var rest = quietLeft();
      var text = pill.querySelector("[data-unquiet-left]");
      if (!pill.isConnected) { clearInterval(syncQuietPill._timer); return; }
      if (rest <= 0) {
        pill.hidden = true;
        clearInterval(syncQuietPill._timer);
        return;
      }
      if (text) text.textContent = quietLabel(rest);
    }, 1000);
  }

  function quiet(minutes) {
    var ms = Math.max(1, Number(minutes) || 30) * 60000;
    store(QUIET_KEY, String(Date.now() + ms));
    if (island) island.classList.add("is-quiet");
    syncQuietPill();
    toast("Cisza na " + Math.round(ms / 60000) + " min — wróć przyciskiem u dołu albo Alt+Shift+R");
    clearTimeout(quiet._timer);
    quiet._timer = setTimeout(function () {
      store(QUIET_KEY, "0");
      if (!island) return;
      island.classList.remove("is-quiet");
      syncQuietPill();
      resetToIdle(true);
      toast("Wyspa wróciła");
    }, ms);
  }

  /* Koniec ciszy — wołane przez pigułkę, skrót i API. Wyspa wraca od razu,
     w tym samym miejscu, w którym była (bez przeładowania strony). */
  function endQuiet(options) {
    var wasQuiet = isQuiet();
    store(QUIET_KEY, "0");
    clearTimeout(quiet._timer);
    if (island) island.classList.remove("is-quiet");
    syncQuietPill();
    if (!wasQuiet) return false;
    apply(isCollapsed() ? "min" : "idle");
    if (!options || !options.silent) toast("Wyspa wróciła — miłego!");
    return true;
  }

  /* -------------------------------------------------- kolejka offline */

  function queue() {
    var list = storeJson(QUEUE_KEY);
    return Array.isArray(list) ? list : [];
  }

  function queueSave(list) {
    storeJson(QUEUE_KEY, list.slice(-20));
    syncNetBadge();
  }

  function queueReport(payload) {
    var list = queue();
    list.push({ payload: payload, at: Date.now() });
    queueSave(list);
    saveTask({ label: "Zgłoszenie czeka na internet · " + String(payload.p_title || "").slice(0, 40), at: Date.now() });
  }

  function flushQueue() {
    var list = queue();
    if (!list.length || !online() || report.busy) return;

    var next = list[0];
    report.busy = true;
    rpc("submit_feedback", next.payload).then(function () {
      report.busy = false;
      queueSave(queue().filter(function (item) { return item.at !== next.at; }));
      saveTask({ label: "Wysłano zaległe zgłoszenie · " + String(next.payload.p_title || "").slice(0, 40), at: Date.now() });
      toast("Wysłano zgłoszenie sprzed chwili");
      if (queue().length) setTimeout(flushQueue, 400);
    }).catch(function () {
      report.busy = false;
      /* Sieć nadal nie działa — spróbujemy przy następnej okazji. */
    });
  }

  /* Wyspa żyje we własnym drzewie (shadow DOM), więc szukamy w nim, a nie
     w całym dokumencie — inaczej trafilibyśmy na obcy element o tym samym id. */
  function byId(id) {
    if (island && island.querySelector) {
      var hit = island.querySelector("#" + id);
      if (hit) return hit;
    }
    return (shadow || document).querySelector("#" + id);
  }

  function within(selector) {
    return (shadow || document).querySelector(selector);
  }

  function withinAll(selector) {
    return Array.prototype.slice.call((shadow || document).querySelectorAll(selector));
  }

  var root = null;
  var island = null;
  var shadow = null;
  var host = null;
  var toastEl = null;
  /* Zgłoszenie ma dwa kroki: najpierw świadomy wybór „błąd czy pomysł”,
     dopiero potem pole tekstowe. Dzięki temu nikt nie zapomni wybrać typu. */
  var report = { type: "", stage: "choose", chosen: false, shot: null, project: "", busy: false };
  var pendingUpload = null;
  var alertsCache = null;

  function sizeFor(name) {
    /* Uchwyt rośnie, gdy pokazuje odtwarzacz. */
    if (name === "min" && handlePlaying()) name = "minPlay";
    var vp = viewport();
    var size = SIZES[name] || SIZES.idle;
    /* Pionowa wyspa: zamiast szerokiej pigułki wąska kolumna przy krawędzi.
       Panel (zgłoszenie, czat, powiadomienia) zostaje szeroki — inaczej
       treść nie miałaby gdzie się zmieścić. */
    if (vertical() && name === "idle") size = { w: 58, h: 96, r: 29 };
    if (vertical() && name === "dock") {
      /* Dziewięć przycisków po 40 px + odstępy + marginesy. Gdy ekran jest
         niższy (np. telefon w poziomie), wyspa kurczy się do widocznego
         obszaru, a kolumna staje się przewijana. */
      var needed = 9 * 40 + 8 * 2 + 14;
      size = { w: 58, h: Math.max(210, Math.min(needed, vp.h - vp.kb - 70)), r: 29 };
    }
    var minW = vertical() && (name === "idle" || name === "dock") ? 0 : 200;
    var w = Math.min(size.w, Math.max(minW, vp.w - EDGE * 2));
    var h = Math.min(size.h, Math.max(120, vp.h - vp.kb - BOTTOM_RESERVE));
    return { w: Math.round(w), h: Math.round(h), r: Math.min(size.r, Math.round(h / 2)) };
  }

  /* ------------------------------------------------------- układ wyspy */

  function vertical() {
    return store(ORIENT_KEY) === "column";
  }

  function haptics() {
    return store(HAPTIC_KEY) !== "0";
  }

  /* Krótkie muśnięcie tylko wtedy, gdy użytkownik go chce — nie każdy lubi
     wibracje przy każdym schowaniu wyspy. */
  function buzz(ms) {
    if (!haptics()) return;
    try {
      if (navigator.vibrate) navigator.vibrate(ms || 8);
    } catch (e) { /* trudno */ }
  }

  /* Każde wpisanie rozmiaru przechodzi przez ten pilnik: NaN albo wartość
     z kosmosu nie może już rozciągnąć czarnej wyspy na cały ekran. */
  function corner() {
    var value = store(CORNER_KEY);
    if (value === "left" || value === "right") return value;
    /* Pionowa wyspa nie staje na środku — zasłaniałaby treść i nie miała
       do czego przylegać. Domyślnie ląduje przy prawej krawędzi. */
    return vertical() ? "right" : "center";
  }

  function applyCorner() {
    if (!island) return;
    var where = corner();
    island.classList.toggle("is-left", where === "left");
    island.classList.toggle("is-right", where === "right");
    /* Pionowa wyspa trzyma się krawędzi — na środku wyglądałaby jak słupek
       postawiony na drodze do treści. */
    island.classList.toggle("is-vertical", vertical());
    island.setAttribute("data-island-orientation", vertical() ? "column" : "row");
    /* Uwaga na nazwę: `data-corner` należy do przycisków wyboru pozycji.
       Gdyby wyspa miała ten sam atrybut, `closest("[data-corner]")` łapałby
       ją przy każdym kliknięciu i przełączał pozycję zamiast motywu. */
    island.setAttribute("data-island-corner", where);
  }

  function setCorner(where, silent) {
    if (where !== "left" && where !== "right" && where !== "center") return;
    if (vertical() && where === "center") where = "right";
    store(CORNER_KEY, where);
    applyCorner();
    resetBox();
    try { writeBox(); } catch (e) { /* trudno */ }
    springTo(state);
    syncCornerButtons();
    if (!silent) {
      toast(where === "left" ? "Wyspa po lewej" : where === "right" ? "Wyspa po prawej" : "Wyspa na środku");
    }
  }

  function setOrientation(value, silent) {
    var next = value === "column" ? "column" : "row";
    store(ORIENT_KEY, next);
    if (next === "column" && corner() === "center") setCorner("right", true);
    applyCorner();
    resetBox();
    try { writeBox(); } catch (e) { /* trudno */ }
    springTo(state);
    syncCornerButtons();
    syncSwitches();
    if (!silent) {
      toast(next === "column" ? "Pionowa wyspa przy krawędzi" : "Wyspa pozioma");
    }
  }

  /* Powrót do ustawień fabrycznych — bez ruszania motywu strony, ciszy
     i zapisanych zadań. */
  function resetIslandPrefs() {
    store(ORIENT_KEY, "row");
    store(CORNER_KEY, "center");
    store(HAPTIC_KEY, "1");
    store(COLLAPSE_KEY, "0");
    applyCorner();
    resetBox();
    try { writeBox(); } catch (e) { /* trudno */ }
    apply("idle");
    syncCornerButtons();
    syncSwitches();
    toast("Ustawienia wyspy przywrócone");
  }

  function writeBox() {
    if (!island) return;
    var vp = viewport();
    var availH = Math.max(120, vp.h - vp.kb);
    /* Schowany uchwyt jest niższy niż dolny limit zwykłej wyspy. */
    var floorH = state === "min" ? 18 : 40;
    var w = Math.min(Math.max(finite(box.w, 172), 40), vp.w);
    var h = Math.min(Math.max(finite(box.h, 46), floorH), availH);
    var r = Math.min(Math.max(finite(box.r, 23), 8), h / 2);
    island.style.width = w.toFixed(2) + "px";
    island.style.height = h.toFixed(2) + "px";
    island.style.borderRadius = r.toFixed(2) + "px";
    /* Przyklejona do boku nie jest wyśrodkowana — margines liczony od lewej
       krawędzi byłby przesunięciem o połowę szerokości. */
    island.style.marginLeft = corner() === "center" ? (-w / 2).toFixed(2) + "px" : "0px";
  }

  function resetBox() {
    var size = sizeFor(state);
    box = { w: size.w, h: size.h, r: size.r, vw: 0, vh: 0, vr: 0, tw: size.w, th: size.h, tr: size.r };
    lastTs = 0;
  }

  function tick(ts) {
    raf = 0;
    if (!island) return;

    var dt = lastTs ? Math.min(Math.max((ts - lastTs) / 1000, 0), 0.05) : 1 / 60;
    lastTs = ts;
    var steps = Math.max(1, Math.min(16, Math.ceil(dt / (1 / 240))));
    var step = dt / steps;
    var moving = false;

    try {
      for (var i = 0; i < steps; i += 1) {
        ["w", "h", "r"].forEach(function (key) {
          var target = box["t" + key];
          var value = box[key];
          var velocity = box["v" + key];
          if (!isFinite(target) || !isFinite(value) || !isFinite(velocity)) {
            throw new Error("sprężyna: nieliczba");
          }
          var force = (target - value) * SPRING - velocity * DAMP;
          velocity += force * step;
          value += velocity * step;
          box["v" + key] = velocity;
          box[key] = value;
        });
      }

      ["w", "h", "r"].forEach(function (key) {
        if (Math.abs(box["t" + key] - box[key]) < 0.35 && Math.abs(box["v" + key]) < 0.35) {
          box[key] = box["t" + key];
          box["v" + key] = 0;
        } else {
          moving = true;
        }
      });

      writeBox();
    } catch (e) {
      /* Jeden zły klatka nie może zostawić wyspy w połowie animacji. */
      resetBox();
      try { writeBox(); } catch (ignored) { /* trudno */ }
      moving = false;
    }

    if (moving) {
      raf = window.requestAnimationFrame(tick);
    } else {
      lastTs = 0;
    }
  }

  function springTo(name) {
    if (!island) return;
    var size = sizeFor(name);
    box.tw = size.w;
    box.th = size.h;
    box.tr = size.r;
    if (!raf) {
      lastTs = 0;
      raf = window.requestAnimationFrame(tick);
    }
  }

  /* Panel musi zmieścić się w wyspie: jeśli treść jest wyższa niż założony
     rozmiar (np. dłuższy tekst na wąskim ekranie), wyspa rośnie — ale nigdy
     ponad widoczny ekran. W drugą stronę nie kurczymy: mniejsza treść nie
     może zostawić czarnej pustki, bo wysokości są dobrane do zawartości. */
  function fit() {
    if (!island) return;
    if (state === "idle" || state === "dock") return;
    var view = island.querySelector(".rj-view--" + state);
    var panel = view && view.querySelector(".rj-panel");
    if (!panel) return;

    var need = panel.scrollHeight;
    var have = Math.round(box.th);
    if (!isFinite(need) || need <= 0) return;
    /* scrollHeight panelu rozciągniętego do wyspy = wysokość treści,
       gdy treść nie mieści się w środku. */
    if (need <= panel.clientHeight + 2) return;

    var vp = viewport();
    var target = Math.min(Math.round(need + 2), vp.h - vp.kb - BOTTOM_RESERVE);
    if (target > have) {
      box.th = target;
      box.tr = Math.min(box.tr, Math.round(target / 2));
      if (!raf) {
        lastTs = 0;
        raf = window.requestAnimationFrame(tick);
      }
    }
  }

  /* Reaguje na obrót telefonu, schowanie paska i klawiaturę. Bez tego wyspa
     zostawała w rozmiarze z poprzedniej orientacji i wychodziła za ekran. */
  function syncViewport() {
    if (!island) return;
    if (vpRaf) return;
    vpRaf = window.requestAnimationFrame(function () {
      vpRaf = 0;
      try {
        if (root) root.style.setProperty("--rj-kb", viewport().kb + "px");
        syncAdsOffset();
        springTo(state);
      } catch (e) { /* trudno */ }
    });
  }

  /* ---------------------------------------------------------------- HTML */

  function buildHtml() {
    return (
      '<div class="rj-island" role="region" aria-label="Wyspa RejHub" data-state="idle" tabindex="0">' +
        '<div class="rj-view rj-view--idle">' +
          '<span class="rj-orb" aria-hidden="true"><img src="/hub/brand-mark.svg?v=1" alt=""></span>' +
          "<span class=\"rj-title\">" + esc(projectName) + "<small>dotknij, żeby rozwinąć</small></span>" +
          '<button class="rj-collapse" type="button" data-collapse title="Schowaj wyspę" aria-label="Schowaj wyspę">' + ICONS.down + "</button>" +
        "</div>" +

        /* Schowana: uchwyt przy dolnej krawędzi. Pokazuje, co się właśnie
           stało (4 s), liczbę nieprzeczytanych, a gdy coś gra — tytuł
           z pauzą i paskiem postępu. */
        '<div class="rj-view rj-view--min">' +
          '<button class="rj-handle-play" type="button" data-media="play" data-handle-play hidden aria-label="Pauza">' + ICONS.pause + "</button>" +
          '<button class="rj-handle" type="button" data-expand aria-label="Pokaż wyspę" title="Pokaż wyspę">' +
            '<span class="rj-handle-up" aria-hidden="true">' + ICONS.up + "</span>" +
            '<span class="rj-handle-text" data-handle-text>' + esc(projectName) + "</span>" +
            '<span class="rj-handle-badge" data-handle-badge hidden aria-hidden="true"></span>' +
          "</button>" +
          '<span class="rj-handle-net" data-net title="Internet działa" aria-hidden="true"></span>' +
          '<span class="rj-handle-bar" data-handle-bar hidden aria-hidden="true"><i data-handle-progress></i></span>' +
        "</div>" +
        '<div class="rj-view rj-view--dock">' +
          '<button class="rj-dock-btn is-primary" type="button" data-open="report" title="Zgłoś błąd lub pomysł" aria-label="Zgłoś błąd lub pomysł">' + ICONS.report + "</button>" +
          '<button class="rj-dock-btn rj-dock-btn--chat" type="button" data-open="chat" title="RejChat" aria-label="RejChat">' + ICONS.chat + '<span class="rj-chat-dot" data-chat-dot hidden aria-hidden="true"></span>' + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="assistant" title="RejAsystent" aria-label="RejAsystent">' + ICONS.assistant + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="alerts" title="Powiadomienia" aria-label="Powiadomienia">' + ICONS.alerts + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="now" title="Teraz gra" aria-label="Teraz gra">' + ICONS.now + "</button>" +
          '<span class="rj-dock-sep" aria-hidden="true"></span>' +
          '<button class="rj-dock-btn" type="button" data-open="quick" title="Szybkie akcje" aria-label="Szybkie akcje">' + ICONS.quick + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="profile" title="Profil i status" aria-label="Profil i status">' + ICONS.profile + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="theme" title="Ustawienia" aria-label="Ustawienia">' + ICONS.theme + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="panic" title="Autodestrukcja" aria-label="Autodestrukcja">' + ICONS.panic + "</button>" +
          '<button class="rj-dock-btn rj-dock-btn--collapse" type="button" data-collapse title="Schowaj wyspę" aria-label="Schowaj wyspę">' + ICONS.down + "</button>" +
        "</div>" +

        '<div class="rj-view rj-view--report" data-stage="choose">' +
          '<div class="rj-panel">' +
            '<div class="rj-panel-head">' +
              '<button class="rj-back" type="button" data-choose-back aria-label="Zmień rodzaj zgłoszenia" title="Zmień rodzaj zgłoszenia" hidden>' + ICONS.back + "</button>" +
              '<span class="rj-panel-title"><span data-report-title>Co zgłaszasz?</span><small data-report-sub>Błąd czy pomysł — najpierw wybierz</small></span>' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="rj-choose" role="group" aria-label="Rodzaj zgłoszenia">' +
              '<button class="rj-choose-btn" type="button" data-kind="bug">' +
                '<span class="rj-choose-icon" aria-hidden="true">' + ICONS.report + "</span>" +
                '<span class="rj-choose-text"><b>Błąd</b><small>Coś nie działa albo wygląda źle</small></span>' +
                '<span class="rj-choose-go" aria-hidden="true">→</span>' +
              "</button>" +
              '<button class="rj-choose-btn" type="button" data-kind="idea">' +
                '<span class="rj-choose-icon" aria-hidden="true">' + ICONS.idea + "</span>" +
                '<span class="rj-choose-text"><b>Pomysł</b><small>Coś, co warto dodać albo zmienić</small></span>' +
                '<span class="rj-choose-go" aria-hidden="true">→</span>' +
              "</button>" +
            "</div>" +
            '<div class="rj-report-form" hidden>' +
              '<textarea class="rj-input" id="rj-island-text" maxlength="4000" placeholder="Co się stało? Im konkrety, tym szybciej naprawię." data-rj-filter-off></textarea>' +
              '<div class="rj-row">' +
                '<button class="rj-ghost" type="button" data-shot aria-pressed="false" hidden>' + ICONS.photo + ' Zdjęcie</button>' +
                '<span class="rj-hintline" data-report-project hidden></span>' +
                '<button class="rj-send" type="button" data-send>Wyślij</button>' +
              "</div>" +
            "</div>" +
          "</div>" +
        "</div>" +

        '<div class="rj-view rj-view--chat">' +
          '<div class="rj-panel rj-panel--chat">' +
            '<div class="rj-panel-head">' +
              '<button class="rj-back" type="button" data-chat-back aria-label="Wróć do listy rozmów" title="Wróć do listy rozmów" hidden>' + ICONS.back + "</button>" +
              '<span class="rj-chat-badge" aria-hidden="true">#</span>' +
              '<span class="rj-panel-title" data-chat-heading>RejChat <small id="rj-island-chat-sub">czat ogólny</small></span>' +
              '<a class="rj-link-btn" id="rj-island-chat-open" href="/rejchat">Otwórz <span aria-hidden="true">↗</span></a>' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="rj-chat-rooms" role="tablist" aria-label="Rozmowy RejChat">' +
              '<button class="rj-chat-room" type="button" role="tab" data-chat-room="general" aria-selected="true">Ogólny</button>' +
              '<button class="rj-chat-room" type="button" role="tab" data-chat-room="links" aria-selected="false">Linki</button>' +
              '<button class="rj-chat-room" type="button" role="tab" data-chat-room="dm" aria-selected="false">Prywatne</button>' +
            "</div>" +
            '<div class="rj-chat-list" id="rj-island-chat" role="log" aria-live="polite" aria-label="Ostatnie wiadomości"></div>' +
            '<div class="rj-chat-dms" id="rj-island-dms" aria-label="Prywatne rozmowy" hidden></div>' +
            '<form class="rj-chat-form" id="rj-island-chat-form" hidden>' +
              '<input class="rj-field" id="rj-island-chat-input" type="text" maxlength="2000" placeholder="Napisz wiadomość…" aria-label="Wiadomość na czat" autocomplete="off">' +
              '<button class="rj-chat-send" type="submit" data-chat-send aria-label="Wyślij wiadomość">' + ICONS.send + "</button>" +
            "</form>" +
            '<p class="rj-chat-note" id="rj-island-chat-note" role="status"></p>' +
          "</div>" +
        "</div>" +

        /* RejAsystent mieszka w wyspie — nie ma już osobnej podstrony.
           Panel jest bliźniakiem mini czatu (te same klasy), a odpowiedzi
           powstają lokalnie: otwieranie stron, motyw, zadania do planera
           i podpowiedzi, gdzie co jest. Nic nie wychodzi z przeglądarki. */
        '<div class="rj-view rj-view--assistant">' +
          '<div class="rj-panel rj-panel--chat rj-panel--assistant">' +
            '<div class="rj-panel-head">' +
              '<span class="rj-chat-badge rj-chat-badge--ai" aria-hidden="true">✦</span>' +
              '<span class="rj-panel-title">RejAsystent <small>asystent RejHuba</small></span>' +
              '<a class="rj-link-btn" href="/aplikacje">Aplikacje <span aria-hidden="true">↗</span></a>' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="rj-ai-chips" role="group" aria-label="Podpowiedzi dla asystenta">' +
              '<button type="button" class="rj-ai-chip" data-ask="Co potrafisz?">Co potrafisz?</button>' +
              '<button type="button" class="rj-ai-chip" data-ask="Co nowego w RejHubie?">Co nowego?</button>' +
              '<button type="button" class="rj-ai-chip" data-ask="Otwórz planer">Otwórz planer</button>' +
            "</div>" +
            '<div class="rj-chat-list rj-ai-list" id="rj-island-ai" role="log" aria-live="polite" aria-label="Rozmowa z RejAsystentem"></div>' +
            '<form class="rj-chat-form" id="rj-island-ai-form">' +
              '<input class="rj-field" id="rj-island-ai-input" type="text" maxlength="500" placeholder="Napisz do asystenta…" aria-label="Pytanie do RejAsystenta" autocomplete="off">' +
              '<button class="rj-chat-send" type="submit" data-ai-send aria-label="Wyślij pytanie">' + ICONS.send + "</button>" +
            "</form>" +
            '<p class="rj-chat-note" id="rj-island-ai-note" role="status"></p>' +
          "</div>" +
        "</div>" +

        '<div class="rj-view rj-view--alerts">' +
          '<div class="rj-panel">' +
            '<div class="rj-panel-head">' +
              '<span class="rj-panel-title">Powiadomienia <small data-alerts-count></small></span>' +
              '<button class="rj-link-btn" type="button" data-read-all style="margin-left:auto;padding-right:6px" hidden>Przeczytane</button>' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="rj-list" id="rj-island-alerts"></div>' +
            '<div class="rj-row" id="rj-island-push-row"></div>' +
          "</div>" +
        "</div>" +

        '<div class="rj-view rj-view--now">' +
          '<div class="rj-panel">' +
            '<div class="rj-panel-head">' +
              '<span class="rj-panel-title">Teraz gra</span>' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="rj-now" id="rj-island-now"></div>' +
          "</div>" +
        "</div>" +

        '<div class="rj-view rj-view--profile">' +
          '<div class="rj-panel" id="rj-island-profile"></div>' +
        "</div>" +

        '<div class="rj-view rj-view--quick">' +
          '<div class="rj-panel">' +
            '<div class="rj-panel-head">' +
              '<span class="rj-panel-title">Szybkie akcje</span>' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="rj-quick-context" data-quick-context></div>' +
            '<div class="rj-quick">' +
              '<a href="/rejtools" data-quick="tools">' + ICONS.note + "Narzędzia</a>" +
              '<a href="/rejchat" data-quick="chat">' + ICONS.chat + "Czat</a>" +
              '<a href="/rejfile" data-quick="file">' + ICONS.file + "Plik</a>" +
              '<button type="button" data-quick="link">' + ICONS.link + "Kopiuj link</button>" +
            "</div>" +
          "</div>" +
        "</div>" +

        '<div class="rj-view rj-view--theme">' +
          '<div class="rj-panel rj-panel--settings">' +
            '<div class="rj-panel-head">' +
              '<span class="rj-panel-title">Ustawienia <small>wyspa i wygląd</small></span>' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +

            '<span class="rj-settings-title">Wygląd</span>' +
            '<div class="rj-switches">' +
              '<button class="rj-switch-row" type="button" data-switch="theme" aria-pressed="false"><span class="rj-label">Jasny motyw</span><span class="rj-switch" aria-hidden="true"></span></button>' +
              '<button class="rj-switch-row" type="button" data-switch="motion" aria-pressed="true"><span class="rj-label">Animacje zawsze</span><span class="rj-switch" aria-hidden="true"></span></button>' +
              '<button class="rj-switch-row" type="button" data-switch="potato" aria-pressed="false"><span class="rj-label">Tryb ziemniaka<small data-potato-state>czuwa w tle</small></span><span class="rj-switch" aria-hidden="true"></span></button>' +
            "</div>" +
            '<p class="rj-hintline">Animacje omijają systemowe blokady ruchu — tak, jak w Szklanym studiu.</p>' +

            '<span class="rj-settings-title">Układ</span>' +
            '<div class="rj-switches">' +
              '<button class="rj-switch-row" type="button" data-switch="vertical" aria-pressed="false">' +
                '<span class="rj-label">Pionowa wyspa<small>wąska kolumna przy krawędzi</small></span>' +
                '<span class="rj-switch" aria-hidden="true"></span>' +
              "</button>" +
            "</div>" +
            '<div class="rj-corner" role="group" aria-label="Pozycja wyspy">' +
              '<button type="button" data-corner="left" aria-pressed="false">Lewo</button>' +
              '<button type="button" data-corner="center" aria-pressed="true">Środek</button>' +
              '<button type="button" data-corner="right" aria-pressed="false">Prawo</button>' +
            "</div>" +
            '<p class="rj-hintline" data-orient-hint>Pionowa wyspa trzyma się krawędzi — na środku zasłaniałaby treść.</p>' +

            '<span class="rj-settings-title">Zachowanie</span>' +
            '<div class="rj-switches">' +
              '<button class="rj-switch-row" type="button" data-switch="start" aria-pressed="false"><span class="rj-label">Zaczynaj schowana</span><span class="rj-switch" aria-hidden="true"></span></button>' +
              '<button class="rj-switch-row" type="button" data-switch="haptics" aria-pressed="true"><span class="rj-label">Wibracje<small>krótkie muśnięcie przy schowaniu</small></span><span class="rj-switch" aria-hidden="true"></span></button>' +
              '<button class="rj-switch-row" type="button" data-quiet><span class="rj-label">Cisza na 30 minut</span><span class="rj-quiet-hint">ukryj</span></button>' +
            "</div>" +
            '<p class="rj-hintline">Ciszę cofniesz od razu: przycisk „Wróć teraz” u dołu ekranu albo skrót Alt+Shift+R.</p>' +
            '<button class="rj-ghost rj-reset-island" type="button" data-reset-island>Przywróć domyślne</button>' +
          "</div>" +
        "</div>" +

        '<div class="rj-view rj-view--tasks">' +
          '<div class="rj-panel">' +
            '<div class="rj-panel-head">' +
              '<span class="rj-panel-title">Zadania</span>' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="rj-list" id="rj-island-tasks"></div>' +
          "</div>" +
        "</div>" +

        '<div class="rj-view rj-view--panic">' +
          '<div class="rj-panic-wrap">' +
            "<b>Zamknąć wszystkie karty?</b>" +
            "<p>RejHub zniknie z tego urządzenia razem z podglądami.</p>" +
            '<div class="rj-panic-actions">' +
              '<button type="button" data-close>Zostaw</button>' +
              '<button type="button" class="is-danger" data-panic>Zamknij</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      /* Cisza nie może być pułapką: dopóki trwa, na dole ekranu wisi
         pigułka „Wróć teraz” z odliczaniem. Mieszka poza .rj-island,
         bo tamten element jest w ciszy ukrywany. */
      '<button class="rj-unquiet" type="button" data-unquiet hidden>' +
        '<span class="rj-unquiet-ico" aria-hidden="true">' + ICONS.up + "</span>" +
        '<span class="rj-unquiet-text"><b>Wróć teraz</b><small data-unquiet-left>cisza 30 min</small></span>' +
      "</button>" +
      '<div class="rj-toast" role="status" aria-live="polite"></div>' +
      /* Niewidoczny, ale czytany przez czytniki — informuje o schowaniu,
         rozwinięciu i o tym, co wyspa właśnie zrobiła. */
      '<span class="rj-sr" role="status" aria-live="polite" data-live></span>'
    );
  }

  /* Ile miejsca zajmuje dolny pasek mini reklam (telefon). Wyspa jest
     w shadow DOM, więc nie widzi klas na <html> — wysokość przekazujemy
     zmienną --rj-ads ustawianą na hoście. */
  function syncAdsOffset() {
    if (!root) return;
    var height = 0;
    var bar = document.getElementById("rj-mobile-ads");
    if (bar) {
      var rect = bar.getBoundingClientRect();
      /* Mini reklamy stoją POD GÓRNYM paskiem, więc nie zabierają miejsca
         przy dolnej krawędzi. Wcześniej liczyliśmy samą wysokość paska bez
         patrzenia, gdzie on jest — wyspa unosiła się o 60 px i „lewitowała”
         nad dołem ekranu. Teraz odstęp liczy się tylko wtedy, gdy pasek
         naprawdę jest przyklejony do dołu. */
      var dockedBottom = rect.top > (window.innerHeight || 0) / 2;
      if (dockedBottom && rect.height > 0) height = Math.round(rect.height);
    }
    root.style.setProperty("--rj-ads", height ? height + "px" : "0px");
  }

  /* ------------------------------------------------------------- widoki */

  function toast(text) {
    if (text) {
      announce(text);
      /* Schowany uchwyt też mówi, co się stało — inaczej po schowaniu wyspy
         użytkownik nie wie, czy akcja doszła do skutku. */
      if (state === "min") handleText(text);
    }
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("is-on");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toastEl.classList.remove("is-on");
    }, 2600);
  }

  /* Czytniki ekranu: jedna linia na wszystko, co wyspa komunikuje. */
  function announce(text) {
    var live = within("[data-live]");
    if (!live || !text) return;
    live.textContent = "";
    setTimeout(function () {
      if (live.isConnected) live.textContent = String(text);
    }, 30);
  }

  /* ------------------------------------------------------------ uchwyt */

  function handlePlaying() {
    var media = currentMedia();
    return Boolean(media && !media.paused && !media.ended);
  }

  /* Krótka informacja na uchwycie (np. „Zgłoszenie wysłane”). Po 4 s wraca
     nazwa projektu albo tytuł tego, co gra. */
  function handleText(text, ms) {
    var label = within("[data-handle-text]");
    if (!label) return;
    label.textContent = text;
    label.classList.add("is-flash");
    clearTimeout(handleText._timer);
    handleText._timer = setTimeout(function () {
      if (!label.isConnected) return;
      label.classList.remove("is-flash");
      syncHandle();
    }, ms || 4000);
  }

  function syncHandle() {
    if (!island) return;
    var media = currentMedia();
    var playing = Boolean(media && !media.paused && !media.ended);

    var label = within("[data-handle-text]");
    var playBtn = within("[data-handle-play]");
    var bar = within("[data-handle-bar]");
    var fill = within("[data-handle-progress]");

    if (label && !label.classList.contains("is-flash")) {
      label.textContent = playing ? mediaTitle(media) : projectName;
    }
    if (playBtn) {
      playBtn.hidden = !playing;
      playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
      playBtn.setAttribute("aria-label", playing ? "Pauza" : "Odtwórz");
    }
    if (bar && fill) {
      bar.hidden = !playing;
      var duration = media && isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
      var percent = duration ? Math.min(100, (media.currentTime / duration) * 100) : 0;
      fill.style.width = percent.toFixed(1) + "%";
    }
    if (state === "min") springTo("min");
  }

  function syncNetBadge() {
    var dot = within("[data-net]");
    if (!dot) return;
    var waiting = queue().length;
    var ok = online();
    dot.classList.toggle("is-offline", !ok);
    dot.classList.toggle("has-queue", waiting > 0);
    dot.title = ok
      ? (waiting ? "Internet działa — " + waiting + " zgłoszeń w kolejce" : "Internet działa")
      : (waiting ? "Brak internetu — " + waiting + " zgłoszeń wyśle się później" : "Brak internetu");
  }

  /* ------------------------------------------------------- pozycja */

  function syncCornerButtons() {
    var where = corner();
    withinAll("[data-corner]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-corner") === where));
    });
  }

  /* --------------------------------------------------- kontekst strony */

  /* Akcje dobrane do tego, gdzie jest użytkownik. Każda ma selektor, który
     naprawdę istnieje na danej stronie — klikamy go zamiast zgadywać. */
  function contextActions() {
    var path = (location.pathname || "/").replace(/\/+$/, "") || "/";
    var map = {
      "/": [
        { label: "Przeglądaj projekty", icon: "quick", selector: "#projekty", href: "/#projekty" },
        { label: "Zgłoś błąd", icon: "report", state: "report" }
      ],
      "/rejfile": [
        { label: "Wgraj plik", icon: "file", selector: "#file-input", href: "/rejfile#upload" },
        { label: "Powiadomienia o plikach", icon: "alerts", state: "alerts" }
      ],
      "/rejchat": [
        { label: "Nowy wpis", icon: "chat", selector: "#post-content", focus: true, href: "/rejchat#composer-card" },
        { label: "Powiadomienia czatu", icon: "alerts", state: "alerts" }
      ],
      "/rejclass": [
        { label: "Kontynuuj lekcję", icon: "note", selector: "#nauka", href: "/rejclass#nauka" },
        { label: "Zgłoś błąd w pytaniu", icon: "report", state: "report" }
      ],
      "/rejsejf": [
        { label: "Nowa notatka", icon: "note", selector: "#mode-note", href: "/rejsejf#notatka" },
        { label: "Moje pliki", icon: "file", selector: "#mode-file", href: "/rejsejf#pliki" }
      ],
      "/rejtools": [
        { label: "Przelicz plik", icon: "file", selector: "#convert-file", href: "/rejtools#konwersja" },
        { label: "Różnica dat", icon: "note", selector: "#date-from", href: "/rejtools#daty" }
      ],
      "/rejhub2": [
        { label: "Przeglądaj projekty", icon: "quick", selector: "#projekty", href: "/#projekty" }
      ]
    };
    return (map[path] || []).map(function (item, index) {
      return {
        label: item.label,
        icon: item.icon,
        hint: index === 0 ? "tu" : "",
        kind: "context",
        selector: item.selector,
        focus: item.focus,
        href: item.href,
        state: item.state
      };
    });
  }

  function renderQuickContext() {
    var host = within("[data-quick-context]");
    if (!host) return;
    var items = contextActions();
    if (!items.length) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML =
      '<p class="rj-context-title">Dla tej strony</p>' +
      items.map(function (item, index) {
        return '<button class="rj-context-btn" type="button" data-context="' + index + '">' +
          '<span class="rj-ico" aria-hidden="true">' + (item.icon === "file" ? "↑" : item.icon === "chat" ? "✎" : "→") + "</span>" +
          esc(item.label) + "</button>";
      }).join("");
  }

  function runContext(item) {
    if (!item) return;
    close();
    var target = null;
    try {
      target = item.selector ? document.querySelector(item.selector) : null;
    } catch (e) {
      target = null;
    }
    if (target) {
      try {
        if (!item.focus && typeof target.click === "function") target.click();
        if (typeof target.focus === "function") target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      } catch (e) { /* spróbujemy przez adres */ }
    }
    if (item.state) {
      apply(item.state);
      return;
    }
    if (item.href) window.location.href = item.href;
  }

  /* ---------------------------------------------- dostępność: fokus */

  var FOCUSABLE = "button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])";

  function trapFocus(event) {
    if (event.key !== "Tab") return;
    if (state === "idle" || state === "min") return;
    /* Tylko bieżący panel — ukryte widoki nie mogą łapać Tab. */
    var view = island.querySelector(".rj-view--" + state);
    if (!view) return;
    var nodes = Array.prototype.slice.call(view.querySelectorAll(FOCUSABLE)).filter(function (node) {
      if (node.hidden || node.disabled) return false;
      if (node.getAttribute("aria-hidden") === "true") return false;
      if (node.closest("[hidden]")) return false;
      var style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    var active = (shadow && shadow.activeElement) || document.activeElement;
    if (event.shiftKey && (active === first || !island.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  var VIEWS = {
    min: 1, idle: 1, dock: 1, report: 1, chat: 1, assistant: 1, alerts: 1,
    now: 1, profile: 1, quick: 1, theme: 1, tasks: 1, panic: 1
  };

  /* Czy wyspa jest schowana do uchwytu przy dolnej krawędzi. Pamiętane
     w przeglądarce, więc zostaje schowana także na kolejnych podstronach. */
  function isCollapsed() {
    return store(COLLAPSE_KEY) === "1";
  }

  function collapse() {
    if (!island) return;
    store(COLLAPSE_KEY, "1");
    apply("min");
    announce("Wyspa schowana. Strzałka w górę albo przesunięcie palcem w górę przywraca ją.");
    /* Krótkie muśnięcie na Androidzie — informacja bez patrzenia. */
    buzz(8);
  }

  function expand() {
    if (!island) return;
    endQuiet();
    store(COLLAPSE_KEY, "0");
    apply("idle");
    announce("Wyspa rozwinięta.");
    buzz(8);
  }

  function apply(name) {
    if (!island) return;
    if (!VIEWS[name]) name = "idle";
    if (name !== "chat") stopChatPoll();
    state = name;
    island.dataset.state = name;
    /* Rysowanie paneli jest w osłonie: wyjątek w danych nie może zostawić
       czarnej wyspy bez treści i bez wyjścia. */
    island.classList.toggle("is-min", name === "min");
    island.setAttribute("aria-expanded", String(name !== "min"));
    applyCorner();
    try {
      paint(name);
    } catch (error) {
      /* Najpierw stan, potem sprzątanie — inaczej panel zostałby pusty. */
      state = "idle";
      island.dataset.state = "idle";
      resetToIdle(true);
      toast("Nie udało się otworzyć panelu — spróbuj jeszcze raz");
      return;
    }
    springTo(name);
    syncViewport();
    /* Fokus w polu potrafi przewinąć wyspę (overflow jest kontenerem
       przewijania), a wtedy treść ucieka z widoku. */
    island.scrollTop = 0;
    window.requestAnimationFrame(function () {
      island.scrollTop = 0;
      try { fit(); } catch (e) { /* trudno */ }
      try { syncHandle(); } catch (e) { /* trudno */ }
      setTimeout(function () { try { fit(); } catch (e) { /* trudno */ } }, 220);
    });
  }

  function paint(name) {
    if (name === "chat") {
      stopChatPoll();
      /* Każde otwarcie zaczyna od wybranej zakładki, ale bez starej rozmowy —
         inaczej po powrocie widać cudzą nitkę bez kontekstu. */
      chatThread = null;
      chatThreadName = "";
      chatSignature = "";
      syncChatHeader();
      loadIslandChat(true);
      startChatPoll();
    }
    if (name === "report") {
      setReportStage(report.chosen ? "form" : "choose", true);
      var label = island.querySelector("[data-report-project]");
      if (label) {
        label.textContent = report.project ? report.project : "";
        label.hidden = !report.project;
      }
    }
    if (name === "assistant") renderAssistant();
    if (name === "alerts") loadAlerts();
    if (name === "now") renderNow();
    if (name === "profile") renderProfile();
    if (name === "theme") { syncSwitches(); syncCornerButtons(); }
    if (name === "quick") renderQuickContext();
    if (name === "tasks") renderTasks();
  }

  /* Awaryjny powrót do spoczynku. Nie rzuca wyjątków i nie zależy od
     żadnego panelu, więc działa nawet gdy właśnie coś się wysypało. */
  function resetToIdle(force) {
    var now = Date.now();
    if (!force && now - RESET_GUARD < 400) return;
    RESET_GUARD = now;
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    stopChatPoll();
    if (!island) return;
    var back = isCollapsed() ? "min" : "idle";
    state = back;
    island.dataset.state = back;
    island.classList.toggle("is-min", back === "min");
    island.style.display = "";
    resetBox();
    try { writeBox(); } catch (e) { /* trudno */ }
    try { syncSwitches(); } catch (e) { /* trudno */ }
  }

  /* Krótka diagnoza: czy wyspa jest cała, widoczna i ma treść. */
  function health() {
    if (!island || !island.isConnected) return "missing";
    if (!VIEWS[state]) return "state";
    /* Atrybut steruje CSS-em. Gdy rozjedzie się ze stanem, żaden widok nie
       jest widoczny — czyli dokładnie „czarna wyspa”. */
    if (island.dataset.state !== state) return "state";
    if (!island.querySelector(".rj-view--" + state)) return "view";
    var w = parseFloat(island.style.width);
    var h = parseFloat(island.style.height);
    var minHeight = state === "min" ? 20 : 40;
    if (!isFinite(w) || !isFinite(h) || w < 40 || h < minHeight) return "size";
    if (state !== "idle" && state !== "dock") {
      var view = island.querySelector(".rj-view--" + state);
      var content = view && view.querySelector("button, a, input, textarea, .rj-list, .rj-switches, .rj-now, .rj-panic-wrap, .rj-empty");
      if (!content) return "empty";
    }
    return "ok";
  }

  /* Odbudowa znaczników wyspy — ratunek, gdy drzewo zostało uszkodzone. */
  function rebuild() {
    if (!root || !root.isConnected) { island = null; toastEl = null; root = null; mount(); return; }
    try {
      root.innerHTML = buildHtml();
      island = root.querySelector(".rj-island");
      toastEl = root.querySelector(".rj-toast");
      var shot = island.querySelector("[data-shot]");
      if (shot) shot.hidden = !(window.RJMedia && window.RJMedia.captureDom);
      RESET_GUARD = 0;
      resetToIdle();
    } catch (e) { /* nic więcej nie zrobimy */ }
  }

  function watchdog() {
    if (!island) return;
    if (document.documentElement.classList.contains("rj-booting")) return;
    var status = health();
    if (status === "ok") return;
    if (status === "missing" || status === "view") { rebuild(); return; }
    /* Uszkodzony stan naprawiamy od razu — czekanie nic tu nie da. */
    resetToIdle(true);
  }

  function close() {
    apply("idle");
    var active = document.activeElement;
    if (active && island.contains(active)) active.blur();
  }

  function toggleDock() {
    apply(state === "dock" ? "idle" : "dock");
  }

  /* Wylogowanie z wyspy: czyści tę samą sesję co strona logowania, więc po
     powrocie na kartę wszystko zgadza się z serwerem i innymi zakładkami. */
  function logout() {
    var me = session();
    try { localStorage.removeItem(SESSION_KEY); } catch (error) { /* tryb prywatny */ }
    try { window.dispatchEvent(new Event("rj:session-change")); } catch (error) { /* trudno */ }
    if (window.RJProfiles && typeof window.RJProfiles.refreshHeader === "function") {
      try { window.RJProfiles.refreshHeader(); } catch (error) { /* trudno */ }
    }
    report.chosen = false;
    report.type = "";
    if (state === "profile") renderProfile();
    toast(me ? "Wylogowano. Do zobaczenia, " + me.username + "!" : "Wylogowano.");
  }

  /* Krok 1 → wybór rodzaju. Krok 2 → pole tekstowe dla wybranej rzeczy.
     Typ podany wprost (np. z przyszłego linku „?feedback=idea”) pomija pytanie. */
  function setReportStage(stage, focus) {
    var view = island && island.querySelector(".rj-view--report");
    if (!view) return;
    var wanted = stage === "form" && report.chosen ? "form" : "choose";
    report.stage = wanted;
    view.setAttribute("data-stage", wanted);

    var choose = view.querySelector(".rj-choose");
    var form = view.querySelector(".rj-report-form");
    var back = view.querySelector("[data-choose-back]");
    var title = view.querySelector("[data-report-title]");
    var sub = view.querySelector("[data-report-sub]");
    var idea = report.type === "idea";

    if (choose) choose.hidden = wanted !== "choose";
    if (form) form.hidden = wanted !== "form";
    if (back) back.hidden = wanted !== "form";
    if (title) title.textContent = wanted === "choose" ? "Co zgłaszasz?" : (idea ? "Pomysł" : "Błąd");
    if (sub) {
      sub.textContent = wanted === "choose"
        ? "Błąd czy pomysł — najpierw wybierz"
        : (idea ? "Co warto dodać albo zmienić?" : "Co się stało? Im konkrety, tym szybciej naprawię.");
    }

    var text = byId("rj-island-text");
    if (text) {
      text.placeholder = idea
        ? "Co warto dodać albo zmienić?"
        : "Co się stało? Im konkrety, tym szybciej naprawię.";
      /* Treść z poprzedniego typu nie może wyciec do innego zgłoszenia. */
      if (wanted === "choose") text.value = "";
    }

    if (!focus) return;
    setTimeout(function () {
      if (!island || report.stage !== wanted) return;
      if (wanted === "form") {
        if (text) { try { text.focus(); } catch (error) { /* trudno */ } }
        return;
      }
      var card = view.querySelector('.rj-choose-btn[data-kind="' + (idea ? "idea" : "bug") + '"]') ||
        view.querySelector(".rj-choose-btn");
      if (card) { try { card.focus(); } catch (error) { /* trudno */ } }
    }, 90);
  }

  function openReport(project, type) {
    report.project = project || "";
    report.type = type === "idea" ? "idea" : type === "bug" ? "bug" : "";
    report.chosen = !!report.type;
    apply("report");
  }

  /* ---------------------------------------------------------- wyszukiwanie */

  var ACTIONS = [
    { label: "Zgłoś błąd albo pomysł", hint: "!", icon: "report", state: "report" },
    { label: "Powiadomienia", hint: "N", icon: "alerts", state: "alerts" },
    { label: "Motyw i animacje", hint: "M", icon: "theme", state: "theme" },
    { label: "Profil i status", hint: "A", icon: "profile", state: "profile" },
    { label: "Zadania", hint: "Z", icon: "tasks", state: "tasks" },
    { label: "Autodestrukcja", hint: "X", icon: "panic", state: "panic" }
  ];

  /* ----------------------------------------------------------- zgłoszenia */

  function saveTask(task) {
    var list = storeJson(TASKS_KEY) || [];
    list.unshift(task);
    storeJson(TASKS_KEY, list.slice(0, 8));
  }

  function renderTasks() {
    var host = byId("rj-island-tasks");
    if (!host) return;
    var tasks = storeJson(TASKS_KEY) || [];
    var rows = [];

    if (pendingUpload) {
      rows.push(
        '<div class="rj-task">' +
          '<div class="rj-task-row"><b>' + esc(pendingUpload.label) + "</b><span>" + pendingUpload.percent + "%</span></div>" +
          '<div class="rj-progress"><span style="width:' + pendingUpload.percent + '%"></span></div>' +
        "</div>"
      );
    }

    tasks.forEach(function (task) {
      rows.push(
        '<div class="rj-task-row"><b>' + esc(task.label) + "</b><span>" + esc(fmtWhen(task.at)) + "</span></div>"
      );
    });

    host.innerHTML = rows.length
      ? rows.join("")
      : '<p class="rj-empty">Brak zadań. Tu pojawi się wysyłka zgłoszenia, zdjęcia albo pliku.</p>';
  }

  function submitReport() {
    if (report.busy) return;
    /* Bez świadomego wyboru „błąd czy pomysł” nic nie wychodzi. */
    if (!report.chosen) {
      setReportStage("choose", true);
      toast("Najpierw wybierz: błąd czy pomysł?");
      return;
    }
    var text = byId("rj-island-text");
    var value = (text && text.value || "").trim();
    if (value.length < 4) {
      toast("Napisz choć kilka słów");
      if (text) text.focus();
      return;
    }

    var title = value.split("\n")[0].trim().slice(0, 96);
    var profile = session();
    var payload = {
      p_project_slug: report.project ? report.project.toLowerCase().replace(/[^a-z0-9]+/g, "-") : projectSlug,
      p_project_name: report.project || projectName,
      p_type: report.type,
      p_title: title,
      p_description: value,
      p_category: report.type === "bug" ? "bug" : "feature",
      p_severity: "normal",
      p_is_public: false,
      p_author_name: (profile && profile.username) || "Anonim",
      p_author_contact: null,
      p_page_url: location.origin + location.pathname,
      p_diagnostics: report.type === "bug" ? diagnostics() : {},
      p_voter_key: voterId(),
      p_fp: fpId()
    };

    /* Brak internetu nie może zgubić zgłoszenia: odkładamy je lokalnie
       i wyślemy samo, gdy sieć wróci (także po zamknięciu karty). */
    if (!online()) {
      queueReport(payload);
      if (text) text.value = "";
      report.shot = null;
      close();
      toast("Zapisane — wyśle się po powrocie internetu");
      return;
    }

    report.busy = true;
    var send = island.querySelector("[data-send]");
    if (send) {
      send.disabled = true;
      send.textContent = "Wysyłam…";
    }

    rpc("submit_feedback", payload).then(function (created) {
      var id = created && created.id;
      saveTask({ label: (report.type === "bug" ? "Zgłoszenie błędu" : "Pomysł") + " · " + title.slice(0, 48), at: Date.now() });
      if (text) text.value = "";
      report.busy = false;
      if (send) {
        send.disabled = false;
        send.textContent = "Wyślij";
      }

      if (report.shot && window.RJMedia && id) {
        uploadShot(id);
      } else {
        close();
        toast("Zgłoszenie zapisane — dzięki!");
      }
      report.shot = null;
      var shotButton = island.querySelector("[data-shot]");
      if (shotButton) shotButton.setAttribute("aria-pressed", "false");
    }).catch(function (error) {
      report.busy = false;
      if (send) {
        send.disabled = false;
        send.textContent = "Wyślij";
      }
      /* Zerwane połączenie w trakcie wysyłki = to samo co brak internetu:
         chowamy zgłoszenie do kolejki zamiast kazać pisać od nowa. */
      if (!online()) {
        queueReport(payload);
        if (text) text.value = "";
        report.shot = null;
        close();
        toast("Zapisane — wyśle się po powrocie internetu");
        return;
      }
      toast((error && error.message) || "Nie udało się wysłać. Spróbuj jeszcze raz.");
    });
  }

  function uploadShot(submissionId) {
    var media = window.RJMedia;
    if (!media || !media.upload) return;
    pendingUpload = { label: "Wysyłam zdjęcie", percent: 8 };
    apply("tasks");
    media.upload(report.shot).then(function (path) {
      pendingUpload.percent = 70;
      renderTasks();
      return rpc("attach_feedback_media", {
        p_submission_id: submissionId,
        p_fingerprint_id: fpId(),
        p_kind: report.shot.kind || "screenshot",
        p_storage_path: path,
        p_mime: report.shot.mime,
        p_bytes: report.shot.bytes,
        p_duration_ms: report.shot.durationMs || null
      });
    }).then(function () {
      pendingUpload = null;
      saveTask({ label: "Zdjęcie dołączone do zgłoszenia", at: Date.now() });
      renderTasks();
      toast("Zgłoszenie wysłane ze zdjęciem");
      setTimeout(close, 900);
    }).catch(function () {
      pendingUpload = null;
      renderTasks();
      toast("Zgłoszenie zapisane, zdjęcia nie udało się dołączyć");
      setTimeout(close, 900);
    });
  }

  /* --------------------------------------------------------- powiadomienia */

  function loadAlerts() {
    var host = byId("rj-island-alerts");
    var pushRow = byId("rj-island-push-row");
    if (!host) return;

    var me = session();
    renderPushRow(pushRow, me);

    if (!me) {
      host.innerHTML = '<p class="rj-empty">Zaloguj się, żeby dostawać powiadomienia o czacie, plikach i odpowiedziach. <a href="/logowanie">Konto</a></p>';
      setUnread(0);
      return;
    }

    host.innerHTML = '<p class="rj-empty">Wczytuję…</p>';
    var list = window.RJProfiles && window.RJProfiles.rpc ? window.RJProfiles.rpc : rpc;

    Promise.all([
      list("rejchat_notifications_list", { p_token: me.token, p_limit: 6 }).catch(function () { return null; }),
      list("rejfile_notifications_list", { p_token: me.token }).catch(function () { return null; })
    ]).then(function (result) {
      var chat = result[0] || { items: [], unread: 0 };
      var files = Array.isArray(result[1]) ? result[1] : [];
      alertsCache = { chat: chat, files: files };
      setUnread((chat.unread || 0) + files.length);
      paintAlerts();
    }).catch(function () {
      host.innerHTML = '<p class="rj-empty">Nie udało się wczytać powiadomień. Spróbuj za chwilę.</p>';
    });
  }

  function paintAlerts() {
    var host = byId("rj-island-alerts");
    if (!host || !alertsCache) return;
    var rows = [];

    (alertsCache.chat.items || []).forEach(function (item) {
      var action = item.kind === "like" ? "polubił(a) Twój wpis"
        : item.kind === "reply" ? "odpowiedział(a) na komentarz"
        : "skomentował(a) Twój wpis";
      rows.push(
        '<a class="rj-alert' + (item.read_at ? " is-read" : "") + '" href="/rejchat#powiadomienie=' + esc(item.id) + '" data-notification="' + esc(item.id) + '">' +
          "<i aria-hidden=\"true\"></i><div><b>" + esc(item.actor_name || "Ktoś") + " " + action + "</b>" +
          "<small>RejChat · " + esc(fmtWhen(item.created_at)) + "</small></div></a>"
      );
    });

    (alertsCache.files || []).forEach(function (item) {
      rows.push(
        '<a class="rj-alert' + (item.read_at ? " is-read" : "") + '" href="/rejfile" data-file-notification="' + esc(item.id) + '">' +
          "<i aria-hidden=\"true\"></i><div><b>" + esc(item.filename || "Nowy plik") + " gotowy do pobrania</b>" +
          "<small>RejFile · " + esc(fmtWhen(item.created_at)) + "</small></div></a>"
      );
    });

    host.innerHTML = rows.length
      ? rows.join("")
      : '<p class="rj-empty">Cisza. Tu pojawią się odpowiedzi, reakcje i gotowe pliki.</p>';

    var readAll = island.querySelector("[data-read-all]");
    if (readAll) readAll.hidden = !rows.length;
  }

  function setUnread(count) {
    var value = Math.max(0, Number(count) || 0);
    var dot = island.querySelector('.rj-dock-btn[data-open="alerts"]');
    if (dot) dot.classList.toggle("has-dot", value > 0);
    var label = island.querySelector("[data-alerts-count]");
    if (label) label.textContent = value > 0 ? value + " nowe" : "";
    island.setAttribute("data-unread", String(value));

    /* Licznik widać też na schowanym uchwycie — inaczej trzeba by rozwinąć
       wyspę, żeby sprawdzić, czy coś przyszło. */
    var badge = within("[data-handle-badge]");
    if (badge) {
      badge.hidden = value === 0;
      badge.textContent = value > 9 ? "9+" : String(value);
    }

    /* Wibracja tylko przy pierwszej nowej rzeczy, nie przy każdej zmianie. */
    if (value > 0 && !setUnread._had && navigator.vibrate) {
      try { navigator.vibrate(12); } catch (e) { /* trudno */ }
    }
    setUnread._had = value > 0;
  }

  function renderPushRow(host, me) {
    if (!host) return;
    var push = window.RejPush;
    if (!push || typeof push.status !== "function") {
      host.innerHTML = "";
      return;
    }
    var status = push.status() || {};
    var enabled = Boolean(status.subscribed);
    if (!me) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML =
      '<button class="rj-ghost" type="button" data-push aria-pressed="' + (enabled ? "true" : "false") + '">' +
        (enabled ? "Powiadomienia na telefon: włączone" : "Włącz powiadomienia na telefon") +
      "</button>";
  }

  function togglePush(button) {
    var push = window.RejPush;
    if (!push || typeof push.enable !== "function") {
      toast("Powiadomienia push nie są dostępne na tej stronie");
      return;
    }
    button.disabled = true;
    push.enable().then(function () {
      if (push.refresh) push.refresh();
      var status = push.status() || {};
      var enabled = Boolean(status.subscribed);
      button.setAttribute("aria-pressed", String(enabled));
      button.textContent = enabled ? "Powiadomienia na telefon: włączone" : "Włącz powiadomienia na telefon";
      toast(enabled ? "Powiadomienia włączone" : "Nie udało się włączyć powiadomień");
    }).catch(function (error) {
      toast((error && error.message) || "Nie udało się włączyć powiadomień");
    }).then(function () {
      button.disabled = false;
    });
  }

  /* ------------------------------------------------------------- mini czat */

  /* Mini RejChat w wyspie: KAŻDY czat jest osiągalny bez opuszczania strony.
     Trzy zakładki:
       - Ogólny  (publiczny pokój „general”),
       - Linki   (publiczny pokój „links”),
       - Prywatne (skrzynka rozmów konta + dowolnie wybrana rozmowa).
     Odczyt i wysyłanie korzystają z tych samych RPC co /rejchat, więc nic
     nie jest duplikowane po stronie serwera.

     Wcześniej wyspa pokazywała wyłącznie pokój ogólny — nie dało się zajrzeć
     ani do linków, ani do prywatnych rozmów bez przechodzenia na /rejchat. */

  var CHAT_ROOMS = {
    general: { title: "czat ogólny", empty: "Cisza w pokoju. Napisz pierwszą wiadomość." },
    links: { title: "linki i zdjęcia", empty: "Nikt nic jeszcze nie podrzucił. Wrzuć pierwszy link." }
  };
  var CHAT_SEEN_KEY = "rj_island_chat_seen_v1";
  var chatTab = "general";
  var chatThread = null;
  var chatThreadName = "";
  var chatPoll = 0;
  var chatIdlePoll = 0;
  var chatBusy = false;
  var chatSignature = "";

  function chatApi() {
    return window.RJProfiles && typeof window.RJProfiles.rpc === "function"
      ? window.RJProfiles.rpc
      : rpc;
  }

  function stopChatPoll() {
    if (chatPoll) { clearInterval(chatPoll); chatPoll = 0; }
  }

  function startChatPoll() {
    stopChatPoll();
    chatPoll = setInterval(function () {
      if (state !== "chat" || document.hidden) return;
      loadIslandChat(false);
    }, 6000);
  }

  function chatSeen() {
    var value = Number(store(CHAT_SEEN_KEY) || 0);
    return isFinite(value) ? value : 0;
  }

  function markChatSeen(rows) {
    var newest = 0;
    (rows || []).forEach(function (row) {
      var time = Date.parse(row.created_at) || 0;
      if (time > newest) newest = time;
    });
    if (newest) store(CHAT_SEEN_KEY, String(newest));
    var dot = within("[data-chat-dot]");
    if (dot) dot.hidden = true;
  }

  function chatLine(row, me) {
    var mine = row.mine != null ? Boolean(row.mine) : Boolean(me && me.username === row.author_name);
    var text = String(row.content || "").replace(/\s+/g, " ").trim();
    if (text.length > 240) text = text.slice(0, 239) + "…";
    return '<div class="rj-chat-row' + (mine ? " is-mine" : "") + '">' +
      '<span class="rj-chat-who">' + esc(row.author_name || "Ktoś") + "</span>" +
      '<span class="rj-chat-when">' + esc(fmtWhen(row.created_at)) + "</span>" +
      (text ? '<p class="rj-chat-text">' + esc(text) + "</p>" : "") +
      (row.photo ? '<span class="rj-chat-photo">zdjęcie</span>' : "") +
      "</div>";
  }

  /* Wspólny nagłówek i zakładki: podpis, strzałka powrotu, aktywna zakładka
     i to, czy widać listę rozmów, skrzynkę czy pole pisania. */
  function syncChatHeader() {
    var sub = byId("rj-island-chat-sub");
    var back = within("[data-chat-back]");
    var list = byId("rj-island-chat");
    var dms = byId("rj-island-dms");
    var form = byId("rj-island-chat-form");
    var inbox = chatTab === "dm" && !chatThread;
    if (sub) {
      sub.textContent = chatTab === "dm"
        ? (chatThread ? "rozmowa z " + chatThreadName : "wybierz rozmowę")
        : CHAT_ROOMS[chatTab].title;
    }
    if (back) back.hidden = !(chatTab === "dm" && !!chatThread);
    if (list) list.hidden = inbox;
    if (dms) dms.hidden = !inbox;
    if (form) form.hidden = inbox || !session();
    var open = byId("rj-island-chat-open");
    if (open) open.href = chatTab === "dm" ? "/rejchat#rozmowy" : "/rejchat";
    Array.prototype.forEach.call(island.querySelectorAll("[data-chat-room]"), function (button) {
      var on = button.getAttribute("data-chat-room") === chatTab;
      button.setAttribute("aria-selected", String(on));
      button.classList.toggle("is-on", on);
    });
  }

  function setChatTab(tab) {
    if (tab !== "general" && tab !== "links" && tab !== "dm") return;
    chatTab = tab;
    chatThread = null;
    chatThreadName = "";
    chatSignature = "";
    var note = byId("rj-island-chat-note");
    if (note) note.textContent = "";
    syncChatHeader();
    loadIslandChat(true);
    startChatPoll();
  }

  function openChatThread(id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return;
    chatThread = id;
    chatSignature = "";
    syncChatHeader();
    loadIslandChat(true);
  }

  function closeChatThread() {
    chatThread = null;
    chatThreadName = "";
    chatSignature = "";
    syncChatHeader();
    loadIslandChat(true);
  }

  function loadIslandChat(initial) {
    if (chatTab === "dm") {
      return chatThread ? loadDmThread(initial) : loadDmInbox(initial);
    }
    return loadRoomChat(initial);
  }

  function loadRoomChat(initial) {
    var host = byId("rj-island-chat");
    var note = byId("rj-island-chat-note");
    var me = session();
    if (!host) return;
    syncChatHeader();

    if (!me) {
      chatSignature = "";
      host.innerHTML = '<p class="rj-empty">Zaloguj się, żeby czytać i pisać w czacie.<br><a href="/logowanie">Przejdź do logowania →</a></p>';
      if (note) note.textContent = "";
      return;
    }
    if (initial && !host.querySelector(".rj-chat-row")) {
      host.innerHTML = '<p class="rj-empty">Wczytuję rozmowę…</p>';
    }

    var room = chatTab;
    chatApi()("rejchat_room_list_v3", {
      p_token: me.token, p_room: room, p_after_id: null, p_limit: 18
    }).then(function (rows) {
      if (state !== "chat" || chatTab !== room || chatThread) return;
      rows = Array.isArray(rows) ? rows : [];
      rows.sort(function (a, b) {
        return (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0);
      });
      var signature = room + "|" + rows.map(function (row) {
        return row.id + ":" + (row.content || "").length + ":" + (row.edited_at || "");
      }).join("|");
      if (signature === chatSignature && host.querySelector(".rj-chat-row")) {
        markChatSeen(rows);
        return;
      }
      chatSignature = signature;
      host.innerHTML = rows.length
        ? rows.map(function (row) { return chatLine(row, me); }).join("")
        : '<p class="rj-empty">' + esc(CHAT_ROOMS[room].empty) + "</p>";
      if (note) note.textContent = "";
      host.scrollTop = host.scrollHeight;
      markChatSeen(rows);
    }).catch(function () {
      if (note) note.textContent = "Nie udało się wczytać rozmowy. Spróbuj za chwilę.";
      if (!host.querySelector(".rj-chat-row")) {
        host.innerHTML = '<p class="rj-empty">Brak połączenia z czatem.</p>';
      }
    });
  }

  function dmRowHtml(row) {
    var unread = Math.max(0, Number(row.unread) || 0);
    var name = String(row.username || "");
    var initials = name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
    return '<button class="rj-chat-dm" type="button" data-chat-thread="' + esc(row.id) + '" data-thread-name="' + esc(name) + '">' +
      '<span class="rj-chat-dm-avatar" aria-hidden="true">' + esc(initials) + "</span>" +
      '<span class="rj-chat-dm-name">' + esc(name || "Rozmowa") + "</span>" +
      (unread
        ? '<span class="rj-chat-dm-badge" title="Nieprzeczytane">' + (unread > 99 ? "99+" : unread) + "</span>"
        : '<span class="rj-chat-dm-go" aria-hidden="true">›</span>') +
      "</button>";
  }

  function loadDmInbox(initial) {
    var host = byId("rj-island-dms");
    var note = byId("rj-island-chat-note");
    var me = session();
    if (!host) return;
    syncChatHeader();
    if (!me) {
      host.innerHTML = '<p class="rj-empty">Zaloguj się, żeby zobaczyć prywatne rozmowy.<br><a href="/logowanie">Przejdź do logowania →</a></p>';
      if (note) note.textContent = "";
      return;
    }
    if (initial) host.innerHTML = '<p class="rj-empty">Wczytuję rozmowy…</p>';
    chatApi()("rejchat_dm_inbox", { p_token: me.token }).then(function (rows) {
      if (state !== "chat" || chatTab !== "dm" || chatThread) return;
      rows = Array.isArray(rows) ? rows : [];
      host.innerHTML = rows.length
        ? rows.map(dmRowHtml).join("")
        : '<p class="rj-empty">Brak prywatnych rozmów. <a href="/rejchat#rozmowy">Zacznij na /rejchat</a></p>';
      if (note) note.textContent = "";
    }).catch(function () {
      if (state !== "chat" || chatTab !== "dm" || chatThread) return;
      host.innerHTML = '<p class="rj-empty">Nie udało się wczytać rozmów.</p>';
      if (note) note.textContent = "Sprawdź połączenie i spróbuj jeszcze raz.";
    });
  }

  function loadDmThread(initial) {
    var host = byId("rj-island-chat");
    var note = byId("rj-island-chat-note");
    var me = session();
    if (!host || !me || !chatThread) return;
    syncChatHeader();
    if (initial) host.innerHTML = '<p class="rj-empty">Wczytuję rozmowę…</p>';
    var thread = chatThread;
    chatApi()("rejchat_dm_list_v2", { p_token: me.token, p_thread_id: thread }).then(function (data) {
      if (state !== "chat" || chatTab !== "dm" || chatThread !== thread) return;
      var rows = data && Array.isArray(data.messages) ? data.messages.slice() : [];
      rows.sort(function (a, b) {
        return (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0);
      });
      if (data && data.username) chatThreadName = String(data.username);
      var sub = byId("rj-island-chat-sub");
      if (sub) sub.textContent = "rozmowa z " + chatThreadName;
      var signature = thread + "|" + rows.map(function (row) {
        return row.id + ":" + (row.content || "").length + ":" + (row.edited_at || "");
      }).join("|");
      if (signature === chatSignature && host.querySelector(".rj-chat-row")) return;
      chatSignature = signature;
      host.innerHTML = rows.length
        ? rows.map(function (row) { return chatLine(row, me); }).join("")
        : '<p class="rj-empty">Napisz pierwszą wiadomość w tej rozmowie.</p>';
      if (note) note.textContent = "";
      host.scrollTop = host.scrollHeight;
    }).catch(function () {
      if (state !== "chat" || chatTab !== "dm" || chatThread !== thread) return;
      if (note) note.textContent = "Nie udało się wczytać rozmowy. Spróbuj za chwilę.";
      if (!host.querySelector(".rj-chat-row")) {
        host.innerHTML = '<p class="rj-empty">Nie udało się wczytać rozmowy.</p>';
      }
    });
  }

  function sendIslandChat(form) {
    var input = byId("rj-island-chat-input");
    var note = byId("rj-island-chat-note");
    var me = session();
    if (!input || !me || chatBusy) return;
    var text = String(input.value || "").trim();
    if (!text) return;
    if (chatTab === "dm" && !chatThread) return;

    chatBusy = true;
    var button = form && form.querySelector("[data-chat-send]");
    if (button) button.disabled = true;
    var request = chatTab === "dm"
      ? chatApi()("rejchat_dm_send_v2", { p_token: me.token, p_thread_id: chatThread, p_content: text, p_reply_to: null })
      : chatApi()("rejchat_room_send_v2", { p_token: me.token, p_room: chatTab, p_content: text, p_reply_to: null });
    request.then(function () {
      input.value = "";
      chatSignature = "";
      if (note) note.textContent = "";
      return loadIslandChat(false);
    }).catch(function (error) {
      if (note) note.textContent = (error && error.message) || "Wiadomość nie została wysłana.";
    }).then(function () {
      chatBusy = false;
      if (button) button.disabled = false;
    });
  }


  /* ------------------------------------------------------- RejAsystent */

  /* Strony, o których asystent wie. Kolejność = kolejność w odpowiedziach.
     RejAsystent nie ma już własnego adresu — mieszka w tej wyspie, więc
     zamiast linku dostaje krótką odpowiedź „jestem tutaj”. */
  var AI_PAGES = [
    { title: "RejChat", url: "/rejchat", aliases: ["czat", "chat", "rozmowy", "rejchat"], desc: "Czat publiczny i prywatne rozmowy." },
    { title: "RejFile", url: "/rejfile", aliases: ["pliki", "rejfile", "file"], desc: "Wysyłanie i udostępnianie plików." },
    { title: "RejSejf", url: "/rejsejf", aliases: ["sejf", "hasla", "rejsejf"], desc: "Prywatne notatki i sejf." },
    { title: "RejTools", url: "/rejtools", aliases: ["narzedzia", "tools", "rejtools"], desc: "PDF, konwersje, QR i obliczenia." },
    { title: "RejClass", url: "/rejclass", aliases: ["lekcje", "nauka", "rejclass"], desc: "Lekcje i materiały do nauki." },
    { title: "Aplikacje", url: "/aplikacje", aliases: ["aplikacje", "apps", "wszystkie aplikacje"], desc: "Wszystkie aplikacje RejHuba w jednym miejscu." },
    { title: "RejPlanner", url: "/rejplanner", aliases: ["planer", "kalendarz", "planner", "zadania"], desc: "Kalendarz, wydarzenia i zadania." },
    { title: "RejGames", url: "/rejgames", aliases: ["gry", "games", "rejgames"], desc: "Wszystkie gry w jednym miejscu." },
    { title: "RejMusic", url: "/rejmusic", aliases: ["muzyka", "music", "rejmusic", "spotify"], desc: "Wyszukiwarka utworów i odtwarzacze." },
    { title: "RejMeme", url: "/rejmeme", aliases: ["memy", "mem", "meme", "rejmeme"], desc: "Galeria memów z moderacją i wgrywaniem." },
    { title: "Profil", url: "/profil", aliases: ["profil", "konto", "avatar"], desc: "Twój profil i ustawienia konta." },
    { title: "Panel admina", url: "/admin", aliases: ["admin", "panel", "statystyki"], desc: "Statystyki i zgłoszenia (tylko administrator)." },
    { title: "Partnerstwo", url: "/partnerstwo", aliases: ["partnerstwo", "wspolpraca", "propozycja"], desc: "Współpraca i zgłoszenia." },
    { title: "Tworzenie stron", url: "/uslugi", aliases: ["uslugi", "strona", "strony"], desc: "Zamówienie własnej strony." },
    { title: "Licencja", url: "/licencja", aliases: ["licencja", "prawa", "copyright"], desc: "Zasady korzystania z treści." }
  ];

  var AI_PLANNER_KEY = "rj_planner_v1";
  var aiGreeted = false;

  function aiPad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function aiDayKey(offset) {
    var d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + "-" + aiPad(d.getMonth() + 1) + "-" + aiPad(d.getDate());
  }

  function aiLongDate(key) {
    var months = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
      "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
    var parts = String(key || "").split("-");
    if (parts.length !== 3) return key;
    return Number(parts[2]) + " " + (months[Number(parts[1]) - 1] || "") + " " + parts[0];
  }

  /* Jedna wiadomość w panelu: akapit (albo kilka) plus linki do stron.
     Wszystko przez textContent — treść od użytkownika nigdy nie trafia do
     HTML-a, więc nie da się wstrzyknąć znaczników. */
  function aiPush(who, text, links) {
    var list = byId("rj-island-ai");
    if (!list) return null;
    var row = document.createElement("div");
    row.className = "rj-ai-msg rj-ai-msg--" + (who === "user" ? "user" : "bot");
    String(text == null ? "" : text).split("\n").forEach(function (line) {
      var p = document.createElement("p");
      p.textContent = line;
      row.appendChild(p);
    });
    (links || []).forEach(function (item) {
      if (!item || !item.title) return;
      var a = document.createElement("a");
      a.className = "rj-ai-link";
      a.href = item.url;
      a.textContent = item.title;
      row.appendChild(a);
    });
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
    return row;
  }

  function aiReply(text, links) {
    return aiPush("bot", text, links);
  }

  function aiNote(text) {
    var note = byId("rj-island-ai-note");
    if (note) note.textContent = text || "";
  }

  function aiPagesFor(query) {
    var q = String(query || "").trim().toLowerCase();
    q = norm(q).replace(/\s+/g, " ");
    if (!q) return [];
    return AI_PAGES.filter(function (page) {
      var haystack = norm(page.title + " " + page.aliases.join(" ") + " " + page.desc);
      return haystack.indexOf(q) >= 0 || q.indexOf(norm(page.title)) >= 0;
    }).slice(0, 4);
  }

  function aiHelp() {
    return "Umiem:\n" +
      "• otwierać strony — np. „otwórz RejChat”, „pokaż gry”,\n" +
      "• przełączać motyw — „włącz jasny motyw”,\n" +
      "• dodawać zadania — „dodaj zadanie kupić kawę na jutro”,\n" +
      "• szukać w serwisie — „szukaj sejf”,\n" +
      "• odpowiadać na pytania o RejHub i podpowiadać, gdzie co jest.\n" +
      "Wszystko liczy się w tej przeglądarce — nic nie wychodzi na serwer.";
  }

  function aiSetTheme(theme) {
    document.documentElement.dataset.theme = theme;
    store("theme", theme);
    syncSwitches();
    return theme === "light" ? "Jasny motyw włączony." : "Ciemny motyw włączony.";
  }

  /* Zadanie trafia tam, gdzie reszta planera. Na stronie planera używamy
     jego własnego API (od razu odświeży widok), a poza nią zapisujemy ten
     sam format w localStorage. */
  function aiAddTask(title, date) {
    var item = {
      id: Math.random().toString(36).slice(2),
      title: String(title || "").slice(0, 140),
      date: date,
      time: "",
      kind: "task",
      note: "Dodane przez RejAsystenta",
      done: false
    };
    if (window.RejPlanner && typeof window.RejPlanner.add === "function") {
      try {
        window.RejPlanner.add(item.title, item.date, "", "task");
        return true;
      } catch (error) { /* niżej zapis bezpośredni */ }
    }
    try {
      var raw = localStorage.getItem(AI_PLANNER_KEY);
      var items = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(items)) items = [];
      items.push(item);
      localStorage.setItem(AI_PLANNER_KEY, JSON.stringify(items));
      return true;
    } catch (error) {
      return false;
    }
  }

  /* Warstwa lokalna: rozumie polskie polecenia bez żadnego klucza i bez
     internetu. Zwraca true, gdy odpowiedź została dodana. */
  function aiLocalReply(raw) {
    var text = norm(String(raw || "")).replace(/\s+/g, " ").trim();
    var page;

    if (!text) return true;
    if (/^(czesc|hej|siema|dzien dobry|hello|hi)\b/.test(text)) {
      aiReply("Cześć! Jestem RejAsystentem. Powiedz, co chcesz zrobić — mogę otworzyć stronę, dodać zadanie albo podpowiedzieć, gdzie co jest.");
      return true;
    }
    if (/(pomoc|co potrafisz|co umiesz|jak dzialasz|help)/.test(text)) {
      aiReply(aiHelp());
      return true;
    }
    if (/(co to|czym jest|kto to|what is)/.test(text) && /(asystent|assistant)/.test(text)) {
      aiReply("RejAsystent to asystent RejHuba: otwiera strony, przełącza motyw, dodaje zadania do planera i podpowiada, gdzie co jest. Mieszka w wyspie — iskra w docku, bez osobnej podstrony.");
      return true;
    }
    if (/(asystent|assistant)\b/.test(text) && text.length < 40) {
      aiReply("Jestem tutaj — w wyspie, na każdej stronie RejHuba. Nie ma osobnej podstrony: dotknij iskry w docku, a potem napisz, czego szukasz.");
      return true;
    }
    if (/(ciemny|dark)/.test(text) && /(motyw|theme|tryb)/.test(text)) {
      aiReply(aiSetTheme("dark"));
      return true;
    }
    if (/(jasny|light)/.test(text) && /(motyw|theme|tryb)/.test(text)) {
      aiReply(aiSetTheme("light"));
      return true;
    }
    if (/(ktora godzina|jaka godzina|czas)/.test(text)) {
      aiReply("Teraz jest " + new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) + ".");
      return true;
    }
    if (/(jaka data|dzisiaj jest|jaki dzien)/.test(text)) {
      aiReply("Dzisiaj jest " + new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + ".");
      return true;
    }
    if (/(co nowego|nowosci|co dodano)/.test(text)) {
      aiReply("Ostatnio w RejHubie:\n• wszystkie podstrony to jedna rodzina aplikacji — od czatu po planer,\n• RejAsystent mieszka w wyspie, obok mini RejChatu,\n• RejMusic szuka utworów w Deezer i Apple Music,\n• RejMeme to galeria memów z kolejką moderacji,\n• powiadomienia push mają test, więc od razu wiadomo, czy działają.");
      return true;
    }
    if (/(powiadomien|push|notyfikac)/.test(text)) {
      aiReply("Powiadomienia włączysz w RejChacie: panel „Powiadomienia” → „Włącz powiadomienia na telefon”. Po włączeniu możesz wysłać powiadomienie testowe. Na iPhonie wymaga to dodania RejHub do ekranu głównego (iOS 16.4+).",
        [{ title: "Przejdź do RejChatu", url: "/rejchat" }]);
      return true;
    }
    if (/(co to rejhub|czym jest rejhub|o rejhubie)/.test(text)) {
      aiReply("RejHub to moja strona i miejsce na aplikacje: czat, pliki, sejf, narzędzia, lekcje, planer, gry, muzykę, memy i asystenta. Wszystko w jednym miejscu i w jednym stylu.");
      return true;
    }
    if (/(kim jest rejson|kto to rejson|o autorze)/.test(text)) {
      aiReply("RejHub tworzy rejson59 — jedna osoba od kodu, wyglądu i tekstów. Wszystkie prawa zastrzeżone; szczegóły są na stronie licencji.",
        [{ title: "Licencja", url: "/licencja" }]);
      return true;
    }

    /* Zadanie: tytuł bierzemy z oryginału (nie z norm()), żeby polskie
       znaki zostały — inaczej „kupić kawę” zapisałoby się „kupic kawe”. */
    var task = /^\s*(?:dodaj|zaplanuj|przypomnij)(?:\s+mi)?(?:\s+(?:zadanie|wydarzenie))?[:\s]+(.+)$/i.exec(String(raw || ""));
    if (task) {
      var title = task[1];
      var date = aiDayKey(0);
      var when = "";
      if (/\sna\s+(dziś|dzisiaj)\b/i.test(" " + title)) when = "dziś";
      if (/\sna\s+jutro\b/i.test(" " + title)) { date = aiDayKey(1); when = "jutro"; }
      var iso = /\sna\s+(\d{4}-\d{2}-\d{2})/.exec(" " + title);
      if (iso) { date = iso[1]; when = aiLongDate(date); }
      title = title.replace(/\s+na\s+(dziś|dzisiaj|jutro|\d{4}-\d{2}-\d{2}).*$/i, "").trim();
      if (title.length < 2) {
        aiReply("Podaj, co mam dodać — np. „dodaj zadanie kupić kawę na jutro”.");
        return true;
      }
      if (!aiAddTask(title, date)) {
        aiReply("Nie udało się zapisać zadania — przeglądarka blokuje pamięć lokalną.",
          [{ title: "Otwórz planer", url: "/rejplanner" }]);
        return true;
      }
      aiReply("Dodane do RejPlannera: „" + title + "”" + (when ? " na " + when : " na dziś") + ".",
        [{ title: "Otwórz planer", url: "/rejplanner" }]);
      return true;
    }

    var search = /(szukaj|znajdz|gdzie jest|gdzie sa)[:\s]+(.+)/.exec(text);
    if (search) {
      var found = aiPagesFor(search[2]);
      if (!found.length) {
        aiReply("Nie znalazłem tego w RejHubie. Spróbuj „gry”, „muzyka”, „sejf” albo „planer”.");
        return true;
      }
      aiReply("Znalazłem " + (found.length === 1 ? "jedno miejsce" : found.length + " miejsca") + ":",
        found.map(function (item) { return { title: item.title + " — " + item.desc, url: item.url }; }));
      return true;
    }

    var open = /(otworz|open|przejdz do|pokaz|wejdź|wejdz)[:\s]*(.*)/.exec(text);
    if (open) {
      var target = open[2] || "";
      var matches = aiPagesFor(target);
      if (!matches.length) matches = aiPagesFor(target.replace(/^(do|na|strona|strone)\s+/, ""));
      if (matches.length) {
        page = matches[0];
        aiReply("Otwieram: " + page.title + ".", [{ title: page.title, url: page.url }]);
        window.setTimeout(function () { window.location.assign(page.url); }, 650);
        return true;
      }
      aiReply("Nie wiem, którą stronę otworzyć. Wszystkie aplikacje są na jednej liście — od czatu po planer, gry i muzykę.",
        [{ title: "Wszystkie aplikacje", url: "/aplikacje" }]);
      return true;
    }

    var direct = aiPagesFor(text);
    if (direct.length === 1) {
      page = direct[0];
      aiReply(page.title + " — " + page.desc, [{ title: "Otwórz " + page.title, url: page.url }]);
      return true;
    }

    return false;
  }

  function aiSendText(value) {
    var text = String(value || "").trim();
    if (!text) return;
    aiNote("");
    aiPush("user", text);
    if (!aiLocalReply(text)) {
      aiReply("Tego jeszcze nie umiem. Spróbuj „pomoc” — pokażę, co potrafię, albo napisz „otwórz aplikacje”, żeby zobaczyć wszystkie aplikacje RejHuba.",
        [{ title: "Wszystkie aplikacje", url: "/aplikacje" }]);
    }
  }

  function aiSendForm(form) {
    var input = byId("rj-island-ai-input");
    if (!input) return;
    var text = String(input.value || "").trim();
    if (!text) return;
    input.value = "";
    if (form) {
      var button = form.querySelector("[data-ai-send]");
      if (button) {
        button.disabled = true;
        window.setTimeout(function () { button.disabled = false; }, 160);
      }
    }
    aiSendText(text);
  }

  /* Pierwsze otwarcie: powitanie i podpowiedzi. Kolejne otwarcia zostawiają
     rozmowę — wracasz do niej bez zaczynania od zera. */
  function renderAssistant() {
    var list = byId("rj-island-ai");
    if (!list) return;
    /* Po odbudowie wyspy (`rebuild`) drzewo jest nowe i puste — wtedy
       witamy się jeszcze raz, zamiast pokazywać pusty panel. */
    if (!aiGreeted || !list.querySelector(".rj-ai-msg")) {
      aiGreeted = true;
      aiReply("Cześć! Jestem RejAsystentem — mieszkam w wyspie. Otworzę stronę, przełączę motyw, dodam zadanie do planera i podpowiem, gdzie co jest. Od czego zaczynamy?");
    }
    list.scrollTop = list.scrollHeight;
  }

  /* Licznik nowych wiadomości na przycisku czatu: pokoje publiczne i skrzynka
     prywatna. Odpytywanie jest rzadkie (30 s) i tylko przy widocznej karcie. */
  function pollChatBadge() {
    if (document.hidden) return;
    var me = session();
    var dot = within("[data-chat-dot]");
    if (!me) { if (dot) dot.hidden = true; return; }
    if (state === "chat") { if (dot) dot.hidden = true; return; }
    var api = chatApi();
    Promise.all([
      api("rejchat_room_list_v3", { p_token: me.token, p_room: "general", p_after_id: null, p_limit: 3 }).catch(function () { return null; }),
      api("rejchat_dm_inbox", { p_token: me.token }).catch(function () { return null; })
    ]).then(function (result) {
      var rows = Array.isArray(result[0]) ? result[0] : [];
      var inbox = Array.isArray(result[1]) ? result[1] : [];
      var newest = rows.reduce(function (max, row) {
        return Math.max(max, Date.parse(row.created_at) || 0);
      }, 0);
      var unread = inbox.reduce(function (sum, row) {
        return sum + Math.max(0, Number(row.unread) || 0);
      }, 0);
      if (dot) dot.hidden = !(newest > chatSeen() || unread > 0);
    }).catch(function () { /* bez połączenia zostawiamy stan */ });
  }

  /* ------------------------------------------------- między kartami: co gra */

  /* Przeglądarka nie pozwala zajrzeć do <audio> w innej karcie, ale karty
     tej samej witryny mogą się dogadać przez BroadcastChannel i localStorage.
     Każda strona RejHuba z wyspą publikuje swój stan odtwarzania; wyspa
     pokazuje to, co gra gdzie indziej, i potrafi wysłać pauzę/play z powrotem.

     Dzięki temu „Teraz gra” nie jest już puste, gdy muzyka leci w innej karcie
     tej samej witryny (np. na rejson59.github.io/Jakuplayer/, jeśli ta strona
     dołączy się do kanału przez window.RejNowPlaying.publish). */

  var NOW_KEY = "rj_now_playing_v1";
  var NOW_CHANNEL = "rj_now_playing";
  var nowTabId = "tab-" + Math.random().toString(36).slice(2, 9);
  var nowChannel = null;
  var lastPublish = 0;

  try {
    if (window.BroadcastChannel) nowChannel = new BroadcastChannel(NOW_CHANNEL);
  } catch (e) { nowChannel = null; }

  function nowPayload(media) {
    if (!media) return null;
    return {
      id: nowTabId,
      title: mediaTitle(media),
      playing: !media.paused && !media.ended,
      position: Math.round((media.currentTime || 0) * 10) / 10,
      duration: isFinite(media.duration) ? Math.round(media.duration * 10) / 10 : 0,
      page: location.pathname,
      at: Date.now()
    };
  }

  function publishNow(media) {
    var payload = nowPayload(media);
    if (!payload) return;
    lastPublish = Date.now();
    try { localStorage.setItem(NOW_KEY, JSON.stringify(payload)); } catch (e) { /* tryb prywatny */ }
    if (nowChannel && nowChannel.postMessage) {
      try { nowChannel.postMessage({ type: "state", payload: payload }); } catch (e) { /* trudno */ }
    }
  }

  function readRemoteNow() {
    var payload = null;
    try { payload = JSON.parse(localStorage.getItem(NOW_KEY) || "null"); } catch (e) { payload = null; }
    if (!payload || payload.id === nowTabId) return null;
    if (!payload.at || Date.now() - payload.at > 3600000) return null;
    return payload;
  }

  function sendMediaCommand(action, position) {
    if (!nowChannel || !nowChannel.postMessage) {
      toast("Sterowanie tylko z karty, w której gra muzyka");
      return;
    }
    try { nowChannel.postMessage({ type: "cmd", action: action, position: position }); } catch (e) { /* trudno */ }
  }

  window.RejNowPlaying = {
    publish: function (meta) {
      if (!meta) return;
      var payload = {
        id: nowTabId,
        title: String(meta.title || "Dźwięk"),
        playing: Boolean(meta.playing),
        position: Number(meta.position) || 0,
        duration: Number(meta.duration) || 0,
        page: meta.page || location.pathname,
        at: Date.now()
      };
      try { localStorage.setItem(NOW_KEY, JSON.stringify(payload)); } catch (e) { /* trudno */ }
      if (nowChannel && nowChannel.postMessage) {
        try { nowChannel.postMessage({ type: "state", payload: payload }); } catch (e) { /* trudno */ }
      }
    },
    latest: readRemoteNow,
    command: sendMediaCommand
  };

  function watchLocalMedia() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll("audio, video"));
    nodes.forEach(function (media) {
      if (media.dataset.rjNowWatched) return;
      media.dataset.rjNowWatched = "1";
      ["play", "pause", "ended", "seeked"].forEach(function (name) {
        media.addEventListener(name, function () { publishNow(media); refreshNowIfOpen(); });
      });
      media.addEventListener("timeupdate", function () {
        if (media.paused) return;
        if (Date.now() - lastPublish < 2000) return;
        publishNow(media);
      });
    });
  }

  function refreshNowIfOpen() {
    if (state === "now") renderNow();
    try { syncHandle(); } catch (e) { /* trudno */ }
  }

  if (nowChannel) {
    nowChannel.addEventListener("message", function (event) {
      var data = event.data || {};
      if (data.type === "cmd") {
        var media = currentMedia();
        if (!media) return;
        if (data.action === "play") {
          if (media.paused) {
            var played = media.play();
            if (played && played.catch) played.catch(function () { /* autoplay */ });
          } else {
            media.pause();
          }
        } else if (data.action === "pause" && !media.paused) {
          media.pause();
        } else if (data.action === "seek" && isFinite(data.position)) {
          media.currentTime = Math.max(0, Number(data.position) || 0);
        }
        publishNow(media);
        return;
      }
      if (data.type === "state") refreshNowIfOpen();
    });
  }

  window.addEventListener("storage", function (event) {
    if (event.key === NOW_KEY) refreshNowIfOpen();
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      watchLocalMedia();
      pollChatBadge();
    }
  });

  /* -------------------------------------------------------------- teraz gra */

  function currentMedia() {
    var list = Array.prototype.slice.call(document.querySelectorAll("audio, video"));
    if (!list.length) return null;
    var playing = list.filter(function (media) { return !media.paused && !media.ended; })[0];
    if (playing) return playing;
    return list.filter(function (media) { return media.currentSrc || media.src; })[0] || null;
  }

  function mediaTitle(media) {
    if (!media) return "";
    return media.getAttribute("data-title") || media.getAttribute("title") ||
      (media.tagName === "VIDEO" ? "Wideo na tej stronie" : "Dźwięk na tej stronie");
  }

  /* Jakuplayer (osobne repozytorium) zapisuje historię w `recentlyPlayed`
     na tej samej witrynie. Nie wiemy, co gra w tamtej karcie — przeglądarka
     tego nie udostępnia — ale możemy pokazać ostatni utwór, żeby panel
     „Teraz gra” nie był pusty, gdy ktoś wraca z odtwarzacza. */
  function readRecentSong() {
    if (location.origin !== "https://rejson59.github.io") return null;
    var rows = null;
    try { rows = JSON.parse(localStorage.getItem("recentlyPlayed") || "null"); } catch (e) { rows = null; }
    if (!Array.isArray(rows) || !rows.length) return null;
    var song = rows[0];
    if (!song || !song.title) return null;
    return { title: String(song.title).slice(0, 90), artist: String(song.artist || "").slice(0, 60) };
  }

  function renderNow() {
    var host = byId("rj-island-now");
    if (!host) return;
    var media = currentMedia();

    if (!media) {
      /* Nic nie gra na tej stronie — sprawdzamy, czy nie gra w innej karcie
         tej samej witryny (patrz kanał „rj_now_playing”). */
      var remote = readRemoteNow();
      if (remote) {
        var remotePlaying = Boolean(remote.playing);
        host.innerHTML =
          '<div class="rj-now"><span class="rj-cover" aria-hidden="true">' + ICONS.now + "</span>" +
          '<span class="rj-now-meta"><b>' + esc(remote.title || "Dźwięk") + "</b><small>" +
            (remotePlaying ? "Gra w innej karcie" : "Zatrzymane w innej karcie") + "</small></span>" +
          '<button class="rj-round is-play" type="button" data-remote-media="play" aria-label="' +
            (remotePlaying ? "Pauza w innej karcie" : "Odtwórz w innej karcie") + '">' +
            (remotePlaying ? ICONS.pause : ICONS.play) + "</button>" +
          "</div>";
        return;
      }
      var recent = readRecentSong();
      if (recent) {
        host.innerHTML =
          '<div class="rj-now"><span class="rj-cover" aria-hidden="true">' + ICONS.now + "</span>" +
          '<span class="rj-now-meta"><b>' + esc(recent.title) + "</b><small>Ostatnio grane w Jakuplayerze · " +
            esc(recent.artist || "ta przeglądarka") + "</small></span>" +
          '<a class="rj-round" href="https://rejson59.github.io/Jakuplayer/" target="_blank" rel="noopener noreferrer" aria-label="Otwórz Jakuplayera">' + ICONS.play + "</a>" +
          "</div>";
        return;
      }
      host.innerHTML =
        '<div class="rj-now"><span class="rj-cover" aria-hidden="true">' + ICONS.now + "</span>" +
        '<span class="rj-now-meta"><b>Nic teraz nie gra</b><small>Odtwórz coś w RejStream albo Jakuplayerze</small></span>' +
        "</div>";
      return;
    }

    var playing = !media.paused;
    host.innerHTML =
      '<div class="rj-now"><span class="rj-cover" aria-hidden="true">' + ICONS.now + "</span>" +
      '<span class="rj-now-meta"><b>' + esc(mediaTitle(media)) + "</b><small>" + (playing ? "Gra teraz na tej stronie" : "Zatrzymane") + "</small></span>" +
      '<button class="rj-round" type="button" data-media="back" aria-label="Przewiń do początku">' + ICONS.back + "</button>" +
      '<button class="rj-round is-play" type="button" data-media="play" aria-label="' + (playing ? "Pauza" : "Odtwórz") + '">' + (playing ? ICONS.pause : ICONS.play) + "</button>" +
      '<button class="rj-round" type="button" data-media="forward" aria-label="Przewiń o 10 sekund">' + ICONS.next + "</button>" +
      "</div>";
  }

  function controlMedia(action) {
    var media = currentMedia();
    if (!media) {
      /* Sterowanie drugą kartą: wysyłamy polecenie kanałem i czekamy na
         nowy stan w localStorage. */
      if (!readRemoteNow()) return;
      if (action === "play") sendMediaCommand("play");
      else if (action === "back") sendMediaCommand("seek", Math.max(0, (readRemoteNow() || {}).position - 10));
      else if (action === "forward") sendMediaCommand("seek", ((readRemoteNow() || {}).position || 0) + 10);
      setTimeout(renderNow, 260);
      return;
    }
    if (action === "play") {
      if (media.paused) {
        var played = media.play();
        if (played && played.catch) played.catch(function () { toast("Przeglądarka zablokowała odtwarzanie"); });
      } else {
        media.pause();
      }
    } else if (action === "forward") {
      media.currentTime = Math.min((media.duration || Infinity), media.currentTime + 10);
    } else if (action === "back") {
      media.currentTime = Math.max(0, media.currentTime - 10);
    }
    setTimeout(renderNow, 120);
  }

  /* ---------------------------------------------------------------- profil */

  function avatarUrl(name) {
    return "/assets/avatars/" + name + ".svg";
  }

  function renderProfile() {
    var host = byId("rj-island-profile");
    if (!host) return;
    var me = session();
    var status = store(STATUS_KEY) || "online";
    var names = { online: "Dostępny", away: "Zaraz wracam", busy: "Zajęty", quiet: "Cichy" };

    if (!me) {
      host.innerHTML =
        '<div class="rj-profile">' +
          '<span class="rj-avatar" aria-hidden="true">?</span>' +
          '<span class="rj-profile-meta"><b>Nie jesteś zalogowany</b><small>RejChat, pliki i powiadomienia czekają</small></span>' +
          '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
        "</div>" +
        '<a class="rj-ghost" style="align-self:flex-start;margin-top:8px;text-decoration:none" href="/logowanie">Zaloguj się</a>';
      return;
    }

    host.innerHTML =
      '<div class="rj-profile">' +
        '<span class="rj-avatar" aria-hidden="true" data-avatar>' + esc(String(me.username).slice(0, 1).toUpperCase()) + "</span>" +
        '<span class="rj-profile-meta"><b>' + esc(me.username) + "</b><small>Konto · " + names[status] + "</small></span>" +
        '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
      "</div>" +
      '<div class="rj-statuses" role="group" aria-label="Status">' +
        ["online", "away", "busy", "quiet"].map(function (key) {
          return '<button class="rj-status' + (key === status ? " is-on" : "") + '" type="button" data-status="' + key + '">' + names[key] + "</button>";
        }).join("") +
      "</div>" +
      '<div class="rj-profile-links">' +
        '<a class="rj-ghost" href="/profil">Otwórz profil</a>' +
        '<button class="rj-ghost rj-ghost--danger" type="button" data-logout>' + ICONS.logout + ' Wyloguj się</button>' +
      "</div>";

    if (window.RJProfiles && typeof window.RJProfiles.getMany === "function") {
      window.RJProfiles.getMany([me.username]).then(function (rows) {
        var profile = rows && rows[0];
        var slot = host.querySelector("[data-avatar]");
        if (!profile || !slot || !slot.isConnected) return;
        slot.innerHTML = '<img src="' + avatarUrl(profile.avatar || "comet") + '" alt="">';
      }).catch(function () {});
    }
  }

  /* ----------------------------------------------------------- motyw/ruch */

  function isLight() {
    return document.documentElement.dataset.theme === "light";
  }

  function motionOn() {
    if (window.RejMotion && typeof window.RejMotion.status === "function") {
      return window.RejMotion.status() === "on";
    }
    return store("rejhub_motion") !== "off";
  }

  function syncSwitches() {
    if (!island) return;
    var themeSwitch = island.querySelector('[data-switch="theme"]');
    var motionSwitch = island.querySelector('[data-switch="motion"]');
    var verticalSwitch = island.querySelector('[data-switch="vertical"]');
    var startSwitch = island.querySelector('[data-switch="start"]');
    var hapticSwitch = island.querySelector('[data-switch="haptics"]');
    if (themeSwitch) themeSwitch.setAttribute("aria-pressed", String(isLight()));
    if (motionSwitch) motionSwitch.setAttribute("aria-pressed", String(motionOn()));
    if (verticalSwitch) verticalSwitch.setAttribute("aria-pressed", String(vertical()));
    if (startSwitch) startSwitch.setAttribute("aria-pressed", String(isCollapsed()));
    if (hapticSwitch) hapticSwitch.setAttribute("aria-pressed", String(haptics()));
    var potatoSwitch = island.querySelector('[data-switch="potato"]');
    if (potatoSwitch && window.RJPotato) {
      potatoSwitch.setAttribute("aria-pressed", String(!!window.RJPotato.on));
      var potatoHint = potatoSwitch.querySelector("[data-potato-state]");
      if (potatoHint) {
        var state = window.RJPotato.status ? window.RJPotato.status() : null;
        potatoHint.textContent = !window.RJPotato.on
          ? (state && state.mode === "off" ? "wyłączony ręcznie" : "czuwa w tle")
          : state && state.reason === "fps" ? "włączony automatycznie (spadki płynności)"
          : state && state.reason === "ręcznie" ? "włączony ręcznie"
          : "włączony dla tego urządzenia";
      }
    }
  }

  function toggleTheme() {
    var next = isLight() ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    store("theme", next);
    syncSwitches();
    toast(next === "light" ? "Jasny motyw" : "Ciemny motyw");
  }

  function toggleMotion() {
    var next = !motionOn();
    if (window.RejMotion) {
      if (next) window.RejMotion.on();
      else window.RejMotion.off();
    } else {
      store("rejhub_motion", next ? "on" : "off");
    }
    syncSwitches();
    toast(next ? "Animacje zawsze włączone" : "Animacje zgodne z systemem");
  }

  /* ------------------------------------------------------- autodestrukcja */

  function runPanic() {
    close();
    if (window.RejPanic && typeof window.RejPanic.run === "function") {
      window.RejPanic.run();
      return;
    }
    toast("Autodestrukcja niedostępna na tej stronie");
  }

  /* ------------------------------------------------------------ montowanie */

  /* Adres arkusza wyspy bierzemy z własnego <script>, więc działa i na
     rejhub.vercel.app, i na GitHub Pages. Wersję dziedziczymy z `?v=` tego
     skryptu — wcześniej była tu zaszyta stała („3”), przez co przeglądarka
     trzymała w cache stary arkusz pod tym samym adresem i nowe elementy
     wyspy (wybór „błąd czy pomysł”) wyświetlały się bez stylów. */
  var CSS_VERSION = "10";

  function scriptVersion(src) {
    var match = /[?&]v=([^&#]+)/.exec(String(src || ""));
    return match ? match[1] : CSS_VERSION;
  }

  function stylesheetUrl() {
    var src = scriptEl && scriptEl.src ? scriptEl.src : "";
    var base = src.split("?")[0].split("#")[0];
    if (!base || !/island\.js$/.test(base)) base = "/hub/island.js";
    return base.replace(/island\.js$/, "island.css") + "?v=" + scriptVersion(src);
  }

  /* Minimalne style, które muszą działać przed wczytaniem arkusza — i które
     ratują sytuację, gdy arkusz się nie wczyta (słabe łącze, blokada, stara
     wersja z cache). Bez nich wyspa była czarnym prostokątem bez treści. */
  var STATES = ["min", "idle", "dock", "report", "chat", "assistant", "alerts",
                "now", "profile", "quick", "theme", "tasks", "panic"];

  var CRITICAL_CSS =
    "#rj-island-root{position:fixed;inset:0;pointer-events:none;contain:layout style;" +
    "color-scheme:dark}" +
    "#rj-island-root .rj-island{position:absolute;left:50%;bottom:16px;background:#000;" +
    "border-radius:23px;overflow:hidden;color:#f4f7fc;pointer-events:auto;" +
    "font:15px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    "width:172px;height:46px;margin-left:-86px;max-width:calc(100vw - 16px)}" +
    "#rj-island-root .rj-view{position:absolute;inset:0;display:flex;align-items:center;" +
    "justify-content:flex-start;flex-direction:row;padding:0 14px;opacity:0;" +
    "pointer-events:none;white-space:normal;box-sizing:border-box;color:#f4f7fc}" +
    "#rj-island-root .rj-panel{position:static;inset:auto;top:auto;right:auto;bottom:auto;" +
    "left:auto;z-index:auto;width:100%;max-width:none;border:0;background:transparent;" +
    "box-shadow:none;display:flex;flex-direction:column;gap:8px;align-self:stretch;" +
    "min-height:0;padding:11px 0 12px;font-size:15px;color:#f4f7fc}" +
    "#rj-island-root .rj-panel-head{display:flex;align-items:center;gap:8px;height:auto;" +
    "padding:0;border:0;background:transparent}" +
    "#rj-island-root .rj-dock-btn{display:grid;place-items:center;width:44px;height:40px;" +
    "padding:0;border-radius:14px;background:transparent;color:#eef5ff}" +
    "#rj-island-root .rj-dock-btn svg{width:19px;height:19px}" +
    "#rj-island-root .rj-list{overflow:auto;display:grid;gap:2px;min-height:0;flex:1 1 auto}" +
    "#rj-island-root .rj-item{display:flex;align-items:center;gap:9px;width:100%;" +
    "padding:7px 8px;border:0;border-radius:9px;background:transparent;" +
    "color:#eef5ff;font:600 12px/1.3 system-ui,sans-serif;text-align:left}" +
    "#rj-island-root .rj-field,#rj-island-root textarea.rj-input{width:100%;" +
    "border:1px solid rgba(255,255,255,.12);border-radius:11px;" +
    "background:rgba(255,255,255,.06);color:#f4f7fc;" +
    "font:12.5px/1.45 system-ui,sans-serif;padding:9px 11px}" +
    "#rj-island-root textarea.rj-input{flex:1 1 auto;min-height:52px}" +
    "#rj-island-root .rj-empty{padding:9px 8px;color:rgba(232,240,252,.55);font-size:11.5px}" +
    /* Bezpiecznik: żadna ikona w panelu nie może rozepchnąć wyspy, nawet gdy
       arkusz się nie wczyta (wcześniej brak rozmiaru robił z ikony wielki
       biały trójkąt zasłaniający treść). */
    "#rj-island-root .rj-panel svg{max-width:22px;max-height:22px}" +
    "#rj-island-root .rj-choose-btn{min-height:52px}" +
    /* Wybór „błąd czy pomysł” musi wyglądać dobrze nawet bez arkusza. */
    "#rj-island-root .rj-choose{display:grid;gap:7px;flex:1 1 auto;min-height:0;align-content:start}" +
    "#rj-island-root .rj-choose-btn{display:flex;align-items:center;gap:10px;width:100%;" +
    "padding:10px;border:1px solid rgba(255,255,255,.13);border-radius:14px;" +
    "background:rgba(255,255,255,.06);color:#f2f6fd;text-align:left;font:inherit}" +
    "#rj-island-root .rj-choose-icon{display:grid;place-items:center;width:30px;height:30px;" +
    "flex:none;border-radius:10px;background:rgba(110,168,255,.18);color:#cfe2ff}" +
    "#rj-island-root .rj-choose-icon svg{width:17px;height:17px}" +
    "#rj-island-root .rj-choose-text{flex:1 1 auto;min-width:0;display:block}" +
    "#rj-island-root .rj-choose-text b{display:block;font-size:12.5px;line-height:1.25}" +
    "#rj-island-root .rj-choose-text small{display:block;margin-top:2px;font-size:10.5px;" +
    "line-height:1.3;color:rgba(232,240,252,.55)}" +
    "#rj-island-root .rj-choose-go{flex:none;color:rgba(232,240,252,.4);font-size:13px}" +
    "#rj-island-root .rj-report-form{display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:0}" +
    "#rj-island-root .rj-back{width:26px;height:26px;flex:none;display:grid;place-items:center;" +
    "padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:#eef5ff}" +
    "#rj-island-root .rj-back svg{width:15px;height:15px}" +
    /* Mini czat: bez tych reguł panel byłby pustym prostokątem, gdy arkusz
       nie zdąży się wczytać. */
    "#rj-island-root .rj-chat-list{flex:1 1 auto;min-height:0;height:220px;overflow:auto;" +
    "display:flex;flex-direction:column;gap:3px}" +
    "#rj-island-root .rj-chat-row{display:flex;flex-wrap:wrap;gap:6px;padding:7px 9px;" +
    "border-radius:10px;background:rgba(255,255,255,.05);align-items:baseline}" +
    "#rj-island-root .rj-chat-who{color:#eaf2ff;font:650 11.5px/1.3 system-ui,sans-serif}" +
    "#rj-island-root .rj-chat-when{color:rgba(232,240,252,.42);font:500 9.5px/1.3 system-ui,sans-serif}" +
    "#rj-island-root .rj-chat-text{flex-basis:100%;margin:1px 0 0;color:rgba(232,240,252,.86);" +
    "font:400 12px/1.45 system-ui,sans-serif;overflow-wrap:anywhere}" +
    "#rj-island-root .rj-chat-form{display:flex;align-items:center;gap:6px}" +
    "#rj-island-root .rj-chat-send{display:grid;place-items:center;width:36px;height:36px;" +
    "flex:none;border:0;border-radius:50%;background:#cfe2ff;color:#071322}" +
    "#rj-island-root .rj-profile-links{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px}" +
    "#rj-island-root .rj-ghost--danger{border-color:rgba(255,138,138,.32);color:#ffc9c9}" +
    "#rj-island-root .rj-collapse{margin-left:auto;display:grid;place-items:center;" +
    "width:26px;height:26px;padding:0;border:0;border-radius:50%;" +
    "background:rgba(255,255,255,.08);color:#eef5ff;flex:none}" +
    "#rj-island-root .rj-collapse svg{width:15px;height:15px}" +
    "#rj-island-root .rj-view--min{justify-content:center;padding:0 8px}" +
    "#rj-island-root .rj-handle{display:inline-flex;align-items:center;gap:6px;padding:0;" +
    "border:0;background:transparent;color:rgba(240,246,255,.85);" +
    "font:600 10px/1 system-ui,sans-serif}" +
    "#rj-island-root .rj-handle svg{width:13px;height:13px}" +
    "#rj-island-root .rj-island.is-min{bottom:0;border-bottom-left-radius:0!important;" +
    "border-bottom-right-radius:0!important}" +
    "#rj-island-root .rj-view--min{display:flex;align-items:center;gap:7px;padding:0 9px}" +
    "#rj-island-root .rj-handle{display:inline-flex;align-items:center;gap:6px;flex:1 1 auto;" +
    "min-width:0;height:100%;padding:0;border:0;background:transparent;color:#eef5ff;" +
    "font:600 10.5px/1 system-ui,sans-serif}" +
    "#rj-island-root .rj-handle-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#rj-island-root .rj-handle svg{width:13px;height:13px}" +
    "#rj-island-root .rj-handle-badge{display:inline-grid;place-items:center;min-width:16px;" +
    "height:16px;padding:0 4px;border-radius:999px;background:#ff453a;color:#fff;" +
    "font:700 9.5px/1 system-ui,sans-serif}" +
    "#rj-island-root .rj-handle-net{width:7px;height:7px;flex:none;border-radius:50%;" +
    "background:#6ea8ff}" +
    "#rj-island-root .rj-handle-net.is-offline{background:#8e8e93}" +
    "#rj-island-root .rj-handle-play{display:grid;place-items:center;width:24px;height:24px;" +
    "flex:none;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff}" +
    "#rj-island-root .rj-handle-play svg{width:12px;height:12px}" +
    "#rj-island-root .rj-handle-bar{position:absolute;left:0;right:0;bottom:0;height:2px;" +
    "background:rgba(255,255,255,.14);overflow:hidden}" +
    "#rj-island-root .rj-handle-bar i{display:block;height:100%;width:0;background:#6ea8ff}" +
    "#rj-island-root .rj-island.is-quiet{display:none}" +
    /* Cisza nie może zostawić użytkownika bez wyjścia — pigułka działa
       nawet wtedy, gdy arkusz wyspy się nie wczyta. */
    "#rj-island-root .rj-unquiet{position:absolute;left:50%;bottom:calc(max(16px,env(safe-area-inset-bottom)) + 12px);" +
    "transform:translateX(-50%);display:inline-flex;align-items:center;gap:9px;min-height:44px;" +
    "padding:6px 15px 6px 7px;border:1px solid rgba(255,255,255,.16);border-radius:999px;" +
    "background:#05070c;color:#f2f7ff;font:600 12px/1.1 system-ui,sans-serif;pointer-events:auto;" +
    "box-shadow:0 18px 44px -20px rgba(0,0,0,.95);z-index:3}" +
    "#rj-island-root .rj-unquiet[hidden]{display:none!important}" +
    "#rj-island-root .rj-unquiet-ico{display:grid;place-items:center;width:30px;height:30px;" +
    "flex:none;border-radius:50%;background:rgba(255,255,255,.1)}" +
    "#rj-island-root .rj-unquiet-ico svg{width:14px;height:14px}" +
    "#rj-island-root .rj-unquiet-text{display:grid;gap:2px;text-align:left}" +
    "#rj-island-root .rj-unquiet-text small{color:rgba(214,228,248,.62);font:600 10px/1 ui-monospace,monospace}" +
    "#rj-island-root .rj-island.is-left{left:10px;margin-left:0!important}" +
    "#rj-island-root .rj-island.is-right{left:auto;right:10px;margin-left:0!important}" +
    "#rj-island-root .rj-corner{display:flex;gap:4px;width:100%}" +
    "#rj-island-root .rj-corner button{flex:1 1 0;padding:7px 6px;border-radius:9px;" +
    "border:1px solid rgba(255,255,255,.12);background:transparent;color:#eef5ff;" +
    "font:600 11px/1 system-ui,sans-serif}" +
    "#rj-island-root .rj-corner button[aria-pressed='true']{background:rgba(110,168,255,.18);" +
    "border-color:rgba(110,168,255,.55);color:#fff}" +
    "#rj-island-root .rj-quick-context{display:grid;gap:4px;width:100%}" +
    "#rj-island-root .rj-context-btn{display:flex;align-items:center;gap:8px;width:100%;" +
    "padding:7px 8px;border:0;border-radius:9px;background:rgba(255,255,255,.06);" +
    "color:#eef5ff;font:600 11.5px/1.3 system-ui,sans-serif;text-align:left}" +
    "#rj-island-root .rj-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;" +
    "clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}" +
    "#rj-island-root .rj-toast{position:absolute;left:50%;bottom:74px;transform:translate(-50%,8px);" +
    "padding:8px 14px;border-radius:999px;background:#000;color:#f4f7fc;" +
    "border:1px solid rgba(255,255,255,.12);opacity:0;pointer-events:none}" +
    "#rj-island-root .rj-toast.is-on{opacity:1}" +
    /* Ustawienia, zakładki czatu i prywatne rozmowy — minimalny wygląd na
       wypadek, gdyby arkusz wyspy nie zdążył się wczytać. */
    "#rj-island-root .rj-chat-rooms{display:flex;gap:3px;padding:2px;border-radius:999px;background:rgba(255,255,255,.07)}" +
    "#rj-island-root .rj-chat-room{flex:1 1 0;min-height:30px;padding:5px 8px;border:0;border-radius:999px;background:transparent;color:rgba(235,243,255,.62);font:650 11px/1 system-ui,sans-serif}" +
    "#rj-island-root .rj-chat-room.is-on{background:rgba(255,255,255,.18);color:#fff}" +
    "#rj-island-root .rj-chat-dms{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:4px}" +
    "#rj-island-root .rj-chat-dm{display:flex;align-items:center;gap:9px;width:100%;min-height:46px;padding:6px 9px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(255,255,255,.04);color:#eef5ff;font:650 12px/1.2 system-ui,sans-serif;text-align:left}" +
    "#rj-island-root .rj-chat-dm-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#rj-island-root .rj-chat-dm-badge{min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#ff453a;color:#fff;font:700 10px/1 system-ui,sans-serif}" +
    "#rj-island-root .rj-chat-dm-avatar{display:grid;place-items:center;width:30px;height:30px;flex:none;border-radius:50%;background:rgba(110,168,255,.2);color:#dcebff;font:700 10.5px/1 system-ui,sans-serif}" +
    "#rj-island-root .rj-settings-title{display:block;margin:4px 0 -2px;color:rgba(206,224,248,.52);font:700 9.5px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}" +
    "#rj-island-root .rj-island.is-vertical[data-state='dock'] .rj-view--dock{flex-direction:column;gap:2px;padding:6px 0}" +
    "#rj-island-root .rj-island.is-vertical .rj-dock-btn{flex:0 0 40px;width:44px;max-width:44px}" +
    STATES.map(function (name) {
      return '#rj-island-root .rj-island[data-state="' + name + '"] .rj-view--' + name +
        '{opacity:1;transform:none;pointer-events:auto}';
    }).join("");

  function mount() {
    if (document.querySelector(".rj-legacy-home")) return;
    if (document.getElementById("rj-island-root")) return;

    /* Wyspa mieszka we własnym drzewie (shadow DOM). Powód jest konkretny:
       na stronie głównej arkusz premium.css ma globalne `.rj-panel`
       (position:absolute; top:calc(100% + 10px); z-index:9000), które
       wypychało nasze panele poza wyspę — stąd czarna, martwa plama.
       W shadow DOM żaden arkusz strony nie sięga do wnętrza wyspy. */
    host = document.createElement("div");
    host.id = "rj-island-root";
    host.setAttribute("data-rj-island-host", "");
    /* `color-scheme: dark` mówi przeglądarce: ten fragment jest już ciemny.
       Bez tego funkcje typu „wymuszony ciemny motyw" (Brave, Chrome na
       Androidzie) potrafią przerobić wnętrze wyspy na czarne na czarnym. */
    host.style.cssText =
      "position:fixed;inset:0;z-index:2147482000;pointer-events:none;" +
      "contain:layout style;color-scheme:dark";
    document.body.appendChild(host);

    if (host.attachShadow) {
      shadow = host.attachShadow({ mode: "open" });
      var boot = document.createElement("style");
      boot.textContent = CRITICAL_CSS;
      shadow.appendChild(boot);
      var sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      sheet.href = stylesheetUrl();
      shadow.appendChild(sheet);
    }

    root = document.createElement("div");
    root.id = "rj-island-root";
    root.innerHTML = buildHtml();
    (shadow || host).appendChild(root);

    island = root.querySelector(".rj-island");
    toastEl = root.querySelector(".rj-toast");

    /* stara pigułka awaryjna nie jest już potrzebna — wyspa ma własne wyjście */
    Array.prototype.forEach.call(document.querySelectorAll(".rjhub-pill"), function (pill) {
      pill.remove();
    });

    document.documentElement.classList.add("has-rj-island");

    var shotButton = island.querySelector("[data-shot]");
    if (shotButton) shotButton.hidden = !(window.RJMedia && window.RJMedia.captureDom);

    /* przycisk „Zgłoś błąd / pomysł” przy projekcie otwiera wyspę */
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-feedback-project]");
      if (!trigger) return;
      event.preventDefault();
      openReport(trigger.getAttribute("data-feedback-project"), trigger.getAttribute("data-feedback-type"));
    });

    /* Karty aplikacji (np. RejAsystent na /aplikacje i stronie głównej)
       otwierają widok wyspy. Asystent nie ma już własnego adresu, więc
       kafelek musi prowadzić do wyspy, a nie do nieistniejącej podstrony. */
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-island]");
      if (!trigger) return;
      event.preventDefault();
      var wanted = trigger.getAttribute("data-island");
      apply(VIEWS[wanted] ? wanted : "assistant");
      if (wanted === "assistant") {
        window.setTimeout(function () {
          var input = byId("rj-island-ai-input");
          if (input && state === "assistant") {
            try { input.focus(); } catch (error) { /* bez fokusu też działa */ }
          }
        }, 260);
      }
    });

    function handleClick(event) {
      var open = event.target.closest("[data-open]");
      if (open) {
        var name = open.getAttribute("data-open");
        if (name === "report") openReport("", "");
        else apply(name);
        return;
      }
      if (event.target.closest("[data-collapse]")) { collapse(); return; }
      if (event.target.closest("[data-expand]")) { expand(); return; }
      if (event.target.closest("[data-close]")) { close(); return; }

      var ask = event.target.closest("[data-ask]");
      if (ask) { aiSendText(ask.getAttribute("data-ask")); return; }

      var roomBtn = event.target.closest("[data-chat-room]");
      if (roomBtn) { setChatTab(roomBtn.getAttribute("data-chat-room")); return; }

      var threadBtn = event.target.closest("[data-chat-thread]");
      if (threadBtn) { openChatThread(threadBtn.getAttribute("data-chat-thread")); return; }

      if (event.target.closest("[data-chat-back]")) { closeChatThread(); return; }
      if (event.target.closest("[data-panic]")) { runPanic(); return; }

      var send = event.target.closest("[data-send]");
      if (send) { submitReport(); return; }

      var shot = event.target.closest("[data-shot]");
      if (shot) { toggleShot(shot); return; }

      var logoutBtn = event.target.closest("[data-logout]");
      if (logoutBtn) { logout(); return; }

      var back = event.target.closest("[data-choose-back]");
      if (back) { setReportStage("choose", true); return; }

      var kind = event.target.closest(".rj-choose-btn[data-kind]");
      if (kind) {
        report.type = kind.getAttribute("data-kind") === "idea" ? "idea" : "bug";
        report.chosen = true;
        announce(report.type === "idea" ? "Zgłaszasz pomysł." : "Zgłaszasz błąd.");
        setReportStage("form", true);
        return;
      }

      var readAll = event.target.closest("[data-read-all]");
      if (readAll) { markAllRead(); return; }

      var push = event.target.closest("[data-push]");
      if (push) { togglePush(push); return; }

      var remoteMedia = event.target.closest("[data-remote-media]");
      if (remoteMedia) { controlMedia(remoteMedia.getAttribute("data-remote-media")); return; }

      var media = event.target.closest("[data-media]");
      if (media) { controlMedia(media.getAttribute("data-media")); return; }

      var status = event.target.closest("[data-status]");
      if (status) {
        var key = status.getAttribute("data-status");
        store(STATUS_KEY, key);
        Array.prototype.forEach.call(island.querySelectorAll("[data-status]"), function (button) {
          button.classList.toggle("is-on", button === status);
        });
        var names = { online: "Dostępny", away: "Zaraz wracam", busy: "Zajęty", quiet: "Cichy" };
        var meta = island.querySelector(".rj-profile-meta small");
        if (meta) meta.textContent = "Konto · " + names[key];
        toast("Status: " + names[key]);
        return;
      }

      var quick = event.target.closest("[data-quick]");
      if (quick && quick.getAttribute("data-quick") === "link") {
        var url = location.origin + location.pathname;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { toast("Link skopiowany"); }, function () { toast(url); });
        } else {
          toast(url);
        }
        return;
      }

      var cornerBtn = event.target.closest("[data-corner]");
      if (cornerBtn) { setCorner(cornerBtn.getAttribute("data-corner")); return; }

      var quietBtn = event.target.closest("[data-quiet]");
      if (quietBtn) { quiet(30); return; }

      if (event.target.closest("[data-unquiet]")) { endQuiet(); return; }

      var ctx = event.target.closest("[data-context]");
      if (ctx) {
        var ctxItems = contextActions();
        runContext(ctxItems[Number(ctx.getAttribute("data-context"))]);
        return;
      }

      var sw = event.target.closest("[data-switch]");
      if (sw) {
        var which = sw.getAttribute("data-switch");
        if (which === "theme") toggleTheme();
        else if (which === "motion") toggleMotion();
        else if (which === "vertical") setOrientation(vertical() ? "row" : "column");
        else if (which === "start") {
          if (isCollapsed()) expand(); else collapse();
          syncSwitches();
        } else if (which === "haptics") {
          var on = !haptics();
          store(HAPTIC_KEY, on ? "1" : "0");
          syncSwitches();
          toast(on ? "Wibracje włączone" : "Wibracje wyłączone");
        } else if (which === "potato") {
          /* Tryb ziemniaka należy do js/potato.js — wyspa tylko go przełącza. */
          if (window.RJPotato && typeof window.RJPotato.toggle === "function") {
            var potatoOn = window.RJPotato.toggle() === "on" || window.RJPotato.on === true;
            toast(potatoOn ? "Tryb ziemniaka włączony" : "Tryb ziemniaka wyłączony");
          }
          syncSwitches();
        }
        return;
      }

      if (event.target.closest("[data-reset-island]")) { resetIslandPrefs(); return; }

      var notification = event.target.closest("[data-notification]");
      if (notification) {
        markRead([notification.getAttribute("data-notification")]);
      }
    }

    /* Osłona: wyjątek w obsłudze kliknięcia nie może zostawić wyspy
       w stanie, w którym nic nie reaguje. */
    root.addEventListener("click", function (event) {
      try {
        handleClick(event);
      } catch (error) {
        toast("Coś poszło nie tak — spróbuj jeszcze raz");
      }
    });

    /* Skrót z każdego miejsca strony: Alt+Shift+R przywraca wyspę z ciszy. */
    document.addEventListener("keydown", function (event) {
      if (!event.altKey || !event.shiftKey) return;
      var key = String(event.key || "");
      if (key.toLowerCase() !== "r" && event.code !== "KeyR") return;
      if (!isQuiet()) return;
      event.preventDefault();
      endQuiet();
    });

    /* kliknięcie w zwiniętą wyspę rozwija dock */
    root.addEventListener("click", function (event) {
      if (state === "idle" && !event.target.closest("button")) toggleDock();
    });

    root.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      /* Sam przycisk (uchwyt, strzałka) obsłuży się jak każdy <button>. */
      if (event.target && event.target.closest && event.target.closest("button")) return;
      if (state !== "idle") return;
      event.preventDefault();
      toggleDock();
    });

    /* Czy kliknięcie wydarzyło się wewnątrz wyspy. Zdarzenia wychodzące
       z shadow DOM są przecelowywane na hosta, więc samo island.contains()
       już nie wystarcza — potrzebna jest cała ścieżka zdarzenia. */
    function clickInsideIsland(event) {
      if (typeof event.composedPath === "function") {
        var path = event.composedPath();
        for (var i = 0; i < path.length; i += 1) {
          if (path[i] === island || path[i] === root || path[i] === host) return true;
        }
        return false;
      }
      return island.contains(event.target);
    }

    /* Czy kliknięcie trafiło w przycisk „Zgłoś błąd / pomysł” przy projekcie. */
    /* Klik w „Zgłoś błąd / pomysł” albo w kartę aplikacji ma otworzyć
       wyspę, a nie ją zamknąć — te przyciski leżą poza wyspą, więc są
       wyjątkiem od zamykania po kliknięciu obok. */
    function islandTrigger(event) {
      var selector = "[data-feedback-project], [data-island]";
      if (event.target && event.target.closest && event.target.closest(selector)) {
        return event.target.closest(selector);
      }
      var path = typeof event.composedPath === "function" ? event.composedPath() : [];
      for (var i = 0; i < path.length; i += 1) {
        if (path[i] && path[i].getAttribute && (path[i].getAttribute("data-feedback-project") || path[i].getAttribute("data-island"))) {
          return path[i];
        }
      }
      return null;
    }

    document.addEventListener("click", function (event) {
      /* Klik w „Zgłoś błąd / pomysł” przy projekcie ma otworzyć wyspę, a nie
         ją zamknąć — ten przycisk leży poza wyspą, więc musi być wyjątkiem. */
      if (islandTrigger(event)) return;
      if (!clickInsideIsland(event) && state !== "idle") close();
    });

    /* Skróty klawiszowe zostały usunięte — wyszukiwanie otwiera
       przycisk w docku. Zostaje tylko Esc, żeby dało się zamknąć panel. */
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state !== "idle") close();
    });

    /* ---------- mini czat: wysyłanie i odświeżanie w tle ---------- */

    root.addEventListener("submit", function (event) {
      if (!event.target) return;
      if (event.target.id === "rj-island-ai-form") {
        event.preventDefault();
        aiSendForm(event.target);
        return;
      }
      if (event.target.id !== "rj-island-chat-form") return;
      event.preventDefault();
      sendIslandChat(event.target);
    });

    root.addEventListener("keydown", function (event) {
      if (!event.target) return;
      if (event.target.id === "rj-island-ai-input") {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          aiSendForm(event.target.closest("form"));
        }
        return;
      }
      if (event.target.id !== "rj-island-chat-input") return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        var form = event.target.closest("form");
        if (form) sendIslandChat(form);
      }
    });

    /* Muzyka na tej stronie trafia do wspólnego kanału „co gra”, a licznik
       nowych wiadomości odświeża się co 30 s (tylko gdy karta jest widoczna). */
    watchLocalMedia();
    pollChatBadge();
    chatIdlePoll = setInterval(function () {
      watchLocalMedia();
      pollChatBadge();
      if (state === "now") renderNow();
    }, 30000);

    /* ---------- gesty: przesunięcie palcem i długie przytrzymanie ---------- */

    var gesture = null;

    /* Nie przechwytujemy gestów zaczętych na liście ani w polu — tam palec
       ma przewijać i pisać. */
    function gestureStartAllowed(target) {
      if (!target || !target.closest) return true;
      return !target.closest(".rj-list, input, textarea, .rj-switch-row, .rj-corner, .rj-seg, .rj-handle-play, .rj-quick, .rj-context-btn");
    }

    root.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse") return;
      if (state !== "idle" && state !== "min") return;
      if (!gestureStartAllowed(event.target)) { gesture = null; return; }
      gesture = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
        longPress: false,
        start: Date.now()
      };
      /* Długie przytrzymanie uchwytu = cisza na 30 minut. */
      clearTimeout(gesture._timer);
      gesture._timer = setTimeout(function () {
        if (!gesture || gesture.moved) return;
        if (state !== "min") return;
        gesture.longPress = true;
        gesture = null;
        quiet(30);
      }, 620);
    }, { passive: true });

    root.addEventListener("pointermove", function (event) {
      if (!gesture) return;
      var dy = Math.abs(event.clientY - gesture.y);
      var dx = Math.abs(event.clientX - gesture.x);
      if (dx > 10 || dy > 10) {
        gesture.moved = true;
        clearTimeout(gesture._timer);
      }
    }, { passive: true });

    function endGesture(event) {
      if (!gesture) return;
      var current = gesture;
      gesture = null;
      clearTimeout(current._timer);
      if (current.longPress) return;
      var dy = event.clientY - current.y;
      var dx = event.clientX - current.x;
      /* Ruch w bok to nie gest wyspy — nie ruszamy niczego. */
      if (Math.abs(dx) > Math.abs(dy) + 14) return;
      if (state === "idle" && dy > 22) { collapse(); return; }
      if (state === "min" && dy < -22) { expand(); return; }
    }

    root.addEventListener("pointerup", endGesture, { passive: true });
    root.addEventListener("pointercancel", function () {
      if (gesture) clearTimeout(gesture._timer);
      gesture = null;
    }, { passive: true });

    /* ---------- sieć ---------- */

    function refreshNet() {
      syncNetBadge();
      if (online()) flushQueue();
    }

    window.addEventListener("online", refreshNet);
    window.addEventListener("offline", refreshNet);

    /* ---------- odtwarzacz ---------- */

    /* Zdarzenia mediów nie bąbelkują, ale faza przechwytywania je widzi. */
    ["play", "pause", "ended", "timeupdate", "loadedmetadata"].forEach(function (type) {
      document.addEventListener(type, function () {
        if (state === "min") syncHandle();
      }, true);
    });

    /* Schowany uchwyt odświeża pasek postępu raz na sekundę — to tanie,
       a media mogą grać w iframe, gdzie nie ma zdarzeń. */
    setInterval(function () {
      if (state === "min") {
        try { syncHandle(); } catch (e) { /* trudno */ }
      }
    }, 1000);

    /* ---------- fokus w panelu (Tab nie ucieka w stronę) ---------- */

    root.addEventListener("keydown", function (event) {
      if (event.key !== "Tab") return;
      try { trapFocus(event); } catch (e) { /* trudno */ }
    });

    /* Klawiatura pojawia się z opóźnieniem — po fokusie w polu sprawdzamy
       widok jeszcze raz, żeby panel zdążył się podnieść. */
    root.addEventListener("focusin", function () {
      setTimeout(syncViewport, 320);
    });

    /* Po wyjściu z pola klawiatura znika — wyspa wraca na dół. */
    root.addEventListener("focusout", function () {
      setTimeout(function () {
        if (!focusedInside()) syncViewport();
      }, 60);
    });

    /* Obrót telefonu, chowanie paska adresu i klawiatura ekranowa. */
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncViewport);
      window.visualViewport.addEventListener("scroll", syncViewport);
    }

    /* Powrót z innej karty albo z pamięci podręcznej — sprężyna mogła
       zatrzymać się w połowie, więc sprawdzamy stan. */
    window.addEventListener("pageshow", function () { syncViewport(); watchdog(); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { syncViewport(); watchdog(); }
    });

    /* Błąd gdziekolwiek na stronie nie może zostawić czarnej wyspy:
       po błędzie sprawdzamy jej stan i w razie potrzeby ją odbudowujemy. */
    window.addEventListener("error", function () { setTimeout(watchdog, 60); });
    window.addEventListener("unhandledrejection", function () { setTimeout(watchdog, 60); });

    /* Lekki pilnowacz — kilka odczytów atrybutów co 2,5 s. */
    setInterval(watchdog, 2500);

    /* Pasek mini reklam pojawia się po swoim skrypcie — obserwujemy DOM,
       żeby wyspa od razu ustąpiła mu miejsca. */
    syncAdsOffset();
    if (window.MutationObserver) {
      new MutationObserver(function () { syncAdsOffset(); })
        .observe(document.body, { childList: true });
    }

    /* stan początkowy: czekamy na koniec loadera, żeby wyspa nie wyskakiwała
       przed resztą strony — chowamy ją tylko na czas `rj-booting`. */
    /* Układ (poziomo/pionowo) musi być znany przed pierwszym pomiarem. */
    try { applyCorner(); } catch (e) { /* trudno */ }
    /* Jeśli użytkownik schował wyspę, zostaje schowana także tutaj. */
    apply(isCollapsed() ? "min" : "idle");
    try { syncSwitches(); } catch (e) { /* trudno */ }
    try { syncCornerButtons(); } catch (e) { /* trudno */ }
    try { syncNetBadge(); } catch (e) { /* trudno */ }
    try { syncHandle(); } catch (e) { /* trudno */ }
    syncViewport();

    /* Cisza z poprzedniej wizyty: wyspa zostaje ukryta do końca odliczania. */
    if (isQuiet()) {
      island.classList.add("is-quiet");
      var left = quietLeft();
      syncQuietPill();
      clearTimeout(quiet._timer);
      quiet._timer = setTimeout(function () {
        store(QUIET_KEY, "0");
        if (!island) return;
        island.classList.remove("is-quiet");
        syncQuietPill();
        resetToIdle(true);
      }, Math.max(1000, left));
    } else {
      syncQuietPill();
    }

    /* Zaległe zgłoszenia z poprzedniej wizyty, gdy sieć już jest. */
    if (online() && queue().length) setTimeout(flushQueue, 1200);
  }

  function toggleShot(button) {
    var media = window.RJMedia;
    if (!media || !media.captureDom) {
      toast("Załączniki nie są dostępne na tej stronie");
      return;
    }
    if (report.shot) {
      report.shot = null;
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = ICONS.photo + " Zdjęcie";
      return;
    }
    button.disabled = true;
    media.captureDom().then(function (shot) {
      report.shot = shot;
      button.setAttribute("aria-pressed", "true");
      button.innerHTML = ICONS.photo + " Zdjęcie dodane";
      toast("Migawka strony dodana do zgłoszenia");
    }).catch(function () {
      toast("Nie udało się zrobić migawki");
    }).then(function () {
      button.disabled = false;
    });
  }

  function markRead(ids) {
    var me = session();
    if (!me || !ids || !ids.length) return;
    var client = window.RJProfiles && window.RJProfiles.rpc ? window.RJProfiles.rpc : rpc;
    client("rejchat_notifications_read", { p_token: me.token, p_ids: ids }).then(function () {
      if (alertsCache && alertsCache.chat && alertsCache.chat.items) {
        alertsCache.chat.items.forEach(function (item) {
          if (ids.indexOf(item.id) !== -1) item.read_at = new Date().toISOString();
        });
        alertsCache.chat.unread = Math.max(0, (alertsCache.chat.unread || 0) - ids.length);
        paintAlerts();
        setUnread(alertsCache.chat.unread + (alertsCache.files || []).length);
      }
    }).catch(function () {});
  }

  function markAllRead() {
    var me = session();
    if (!me) return;
    var client = window.RJProfiles && window.RJProfiles.rpc ? window.RJProfiles.rpc : rpc;
    Promise.all([
      client("rejchat_notifications_read", { p_token: me.token }),
      client("rejfile_notifications_read", { p_token: me.token, p_ids: null })
    ]).then(function () {
      toast("Wszystko przeczytane");
      loadAlerts();
    }).catch(function () {
      toast("Nie udało się oznaczyć powiadomień");
    });
  }

  /* ----------------------------------------------------------------- start */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.RejIsland = {
    open: apply,
    close: close,
    collapse: collapse,
    expand: expand,
    collapsed: isCollapsed,
    quiet: quiet,
    unmute: function () {
      var restored = endQuiet();
      if (!restored) toast("Cisza już nie trwa");
      return restored;
    },
    quietLeft: quietLeft,
    corner: setCorner,
    online: online,
    queueSize: function () { return queue().length; },
    flushQueue: flushQueue,
    sync: syncHandle,
    /* Dla strony: pokaż komunikat także na schowanym uchwycie. */
    notify: function (text, ms) { toast(text); if (ms) handleText(text, ms); },
    health: health,
    check: watchdog,
    reset: resetToIdle,
    status: function () {
      return { state: state, unread: Number(island && island.getAttribute("data-unread")) || 0, project: projectSlug };
    }
  };

  /* media-capture.js może dojść po wyspie — wtedy dopiero odsłaniamy zdjęcie */
  window.addEventListener("rj:media-ready", function () {
    var shot = within("[data-shot]");
    if (shot && window.RJMedia && window.RJMedia.captureDom) shot.hidden = false;
  });
})(window, document);

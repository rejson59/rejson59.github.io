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
  var TASKS_KEY = "rj_island_tasks_v1";
  var STATUS_KEY = "rj_island_status_v1";

  var scriptEl = document.currentScript || document.querySelector('script[src*="hub/island.js"]');
  var projectSlug = (scriptEl && scriptEl.getAttribute("data-project")) || "rejhub";
  var projectName = (scriptEl && scriptEl.getAttribute("data-project-name")) || "RejHub";

  /* ------------------------------------------------------------------ ikony */

  var ICONS = {
    report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 8v5M12 16.5h.01"/><path d="M10.3 3.6 2.4 18a1.9 1.9 0 0 0 1.7 2.8h15.8A1.9 1.9 0 0 0 21.6 18L13.7 3.6a1.9 1.9 0 0 0-3.4 0Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
    alerts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9M10 20h4"/></svg>',
    now: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="16.5" cy="16" r="2.6"/></svg>',
    quick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L19 10h-6.5Z"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4 5.2 18.8"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 15v4.5h15V15"/></svg>',
    panic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.5 6.5a7.5 7.5 0 1 0 11 0"/></svg>',
    close: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM19 5v14L9 12z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l11 7-11 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5 5v14l10-7z"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M21 12.5 12.6 21a5 5 0 0 1-7-7l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h14v15H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 5.5h15v11h-9l-4.5 3.5v-3.5h-1.5z"/></svg>',
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

  function session() {
    if (window.RJProfiles && typeof window.RJProfiles.session === "function") return window.RJProfiles.session();
    try {
      var raw = JSON.parse(localStorage.getItem("rejson_community_session_v1") || "null");
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
    idle: { w: 172, h: 46, r: 23 },
    dock: { w: 436, h: 52, r: 26 },
    report: { w: 384, h: 236, r: 24 },
    search: { w: 384, h: 292, r: 24 },
    alerts: { w: 384, h: 296, r: 24 },
    now: { w: 384, h: 96, r: 24 },
    profile: { w: 384, h: 158, r: 24 },
    quick: { w: 384, h: 152, r: 24 },
    theme: { w: 384, h: 156, r: 24 },
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

  /* Wysokość i szerokość widocznego obszaru. visualViewport kurczy się, gdy
     otwiera się klawiatura — dzięki temu wyspa nigdy nie chowa się pod nią. */
  function viewport() {
    var vv = window.visualViewport || null;
    var innerW = Number(window.innerWidth) || 0;
    var innerH = Number(window.innerHeight) || 0;
    var w = Math.round((vv && vv.width) || innerW || 360);
    var h = Math.round((vv && vv.height) || innerH || 640);
    var kb = 0;
    if (vv && innerH) {
      kb = Math.round(innerH - (vv.height + (vv.offsetTop || 0)));
      /* Kilkadziesiąt pikseli to chowający się pasek adresu, nie klawiatura. */
      if (kb < 90) kb = 0;
    }
    return {
      w: Math.max(220, w),
      h: Math.max(260, h),
      kb: Math.max(0, Math.min(kb, Math.round(h * 0.55)))
    };
  }

  function finite(value, fallback) {
    return typeof value === "number" && isFinite(value) ? value : fallback;
  }

  var root = null;
  var island = null;
  var toastEl = null;
  var report = { type: "bug", shot: null, project: "", busy: false };
  var pendingUpload = null;
  var alertsCache = null;

  function sizeFor(name) {
    var size = SIZES[name] || SIZES.idle;
    var vp = viewport();
    var w = Math.min(size.w, Math.max(200, vp.w - EDGE * 2));
    var h = Math.min(size.h, Math.max(120, vp.h - BOTTOM_RESERVE));
    return { w: Math.round(w), h: Math.round(h), r: Math.min(size.r, Math.round(h / 2)) };
  }

  /* Każde wpisanie rozmiaru przechodzi przez ten pilnik: NaN albo wartość
     z kosmosu nie może już rozciągnąć czarnej wyspy na cały ekran. */
  function writeBox() {
    if (!island) return;
    var vp = viewport();
    var w = Math.min(Math.max(finite(box.w, 172), 40), vp.w);
    var h = Math.min(Math.max(finite(box.h, 46), 40), vp.h);
    var r = Math.min(Math.max(finite(box.r, 23), 8), h / 2);
    island.style.width = w.toFixed(2) + "px";
    island.style.height = h.toFixed(2) + "px";
    island.style.borderRadius = r.toFixed(2) + "px";
    island.style.marginLeft = (-w / 2).toFixed(2) + "px";
  }

  function resetBox() {
    var size = sizeFor("idle");
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

  /* Reaguje na obrót telefonu, schowanie paska i klawiaturę. Bez tego wyspa
     zostawała w rozmiarze z poprzedniej orientacji i wychodziła za ekran. */
  function syncViewport() {
    if (!island) return;
    if (vpRaf) return;
    vpRaf = window.requestAnimationFrame(function () {
      vpRaf = 0;
      try {
        if (root) root.style.setProperty("--rj-kb", viewport().kb + "px");
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
        "</div>" +
        '<div class="rj-view rj-view--dock">' +
          '<button class="rj-dock-btn is-primary" type="button" data-open="report" title="Zgłoś błąd lub pomysł" aria-label="Zgłoś błąd lub pomysł">' + ICONS.report + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="search" title="Szukaj" aria-label="Szukaj">' + ICONS.search + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="alerts" title="Powiadomienia" aria-label="Powiadomienia">' + ICONS.alerts + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="now" title="Teraz gra" aria-label="Teraz gra">' + ICONS.now + "</button>" +
          '<span class="rj-dock-sep" aria-hidden="true"></span>' +
          '<button class="rj-dock-btn" type="button" data-open="quick" title="Szybkie akcje" aria-label="Szybkie akcje">' + ICONS.quick + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="profile" title="Profil i status" aria-label="Profil i status">' + ICONS.profile + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="theme" title="Motyw i animacje" aria-label="Motyw i animacje">' + ICONS.theme + "</button>" +
          '<button class="rj-dock-btn" type="button" data-open="panic" title="Autodestrukcja" aria-label="Autodestrukcja">' + ICONS.panic + "</button>" +
        "</div>" +

        '<div class="rj-view rj-view--report">' +
          '<div class="rj-panel">' +
            '<div class="rj-panel-head">' +
              '<div class="rj-seg" role="tablist" aria-label="Rodzaj zgłoszenia">' +
                '<button type="button" role="tab" aria-selected="true" data-kind="bug">Błąd</button>' +
                '<button type="button" role="tab" aria-selected="false" data-kind="idea">Pomysł</button>' +
              "</div>" +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<textarea class="rj-input" id="rj-island-text" maxlength="4000" placeholder="Co się stało? Im konkrety, tym szybciej naprawię." data-rj-filter-off></textarea>' +
            '<div class="rj-row">' +
              '<button class="rj-ghost" type="button" data-shot aria-pressed="false" hidden>' + ICONS.photo + ' Zdjęcie</button>' +
              '<span class="rj-hintline" data-report-project hidden></span>' +
              '<button class="rj-send" type="button" data-send>Wyślij</button>' +
            "</div>" +
          "</div>" +
        "</div>" +

        '<div class="rj-view rj-view--search">' +
          '<div class="rj-panel">' +
            '<div class="rj-panel-head">' +
              '<input class="rj-field" id="rj-island-search" type="search" placeholder="Szukaj strony albo akcji…" aria-label="Szukaj" autocomplete="off">' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="rj-list" id="rj-island-results" role="listbox" aria-label="Wyniki"></div>' +
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
            '<div class="rj-quick">' +
              '<a href="/rejtools" data-quick="tools">' + ICONS.note + "Narzędzia</a>" +
              '<a href="/rejchat" data-quick="chat">' + ICONS.chat + "Czat</a>" +
              '<a href="/rejfile" data-quick="file">' + ICONS.file + "Plik</a>" +
              '<button type="button" data-quick="link">' + ICONS.link + "Kopiuj link</button>" +
            "</div>" +
          "</div>" +
        "</div>" +

        '<div class="rj-view rj-view--theme">' +
          '<div class="rj-panel">' +
            '<div class="rj-panel-head">' +
              '<span class="rj-panel-title">Wygląd</span>' +
              '<button class="rj-x" type="button" data-close aria-label="Zamknij">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="rj-switches">' +
              '<button class="rj-switch-row" type="button" data-switch="theme" aria-pressed="false"><span class="rj-label">Jasny motyw</span><span class="rj-switch" aria-hidden="true"></span></button>' +
              '<button class="rj-switch-row" type="button" data-switch="motion" aria-pressed="true"><span class="rj-label">Animacje zawsze</span><span class="rj-switch" aria-hidden="true"></span></button>' +
            "</div>" +
            '<p class="rj-hintline">Animacje omijają systemowe blokady ruchu — tak, jak w Szklanym studiu.</p>' +
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
      '<div class="rj-toast" role="status" aria-live="polite"></div>'
    );
  }

  /* ------------------------------------------------------------- widoki */

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("is-on");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toastEl.classList.remove("is-on");
    }, 2600);
  }

  var VIEWS = {
    idle: 1, dock: 1, report: 1, search: 1, alerts: 1, now: 1,
    profile: 1, quick: 1, theme: 1, tasks: 1, panic: 1
  };

  function apply(name) {
    if (!island) return;
    if (!VIEWS[name]) name = "idle";
    state = name;
    island.dataset.state = name;
    /* Rysowanie paneli jest w osłonie: wyjątek w danych nie może zostawić
       czarnej wyspy bez treści i bez wyjścia. */
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
  }

  function paint(name) {
    if (name === "search") {
      renderSearch("");
      setTimeout(function () {
        var input = document.getElementById("rj-island-search");
        if (input) input.focus();
      }, 90);
    }
    if (name === "report") {
      var text = document.getElementById("rj-island-text");
      if (text) setTimeout(function () { text.focus(); }, 90);
      var label = island.querySelector("[data-report-project]");
      if (label) {
        label.textContent = report.project ? report.project : "";
        label.hidden = !report.project;
      }
    }
    if (name === "alerts") loadAlerts();
    if (name === "now") renderNow();
    if (name === "profile") renderProfile();
    if (name === "theme") syncSwitches();
    if (name === "tasks") renderTasks();
  }

  /* Awaryjny powrót do spoczynku. Nie rzuca wyjątków i nie zależy od
     żadnego panelu, więc działa nawet gdy właśnie coś się wysypało. */
  function resetToIdle(force) {
    var now = Date.now();
    if (!force && now - RESET_GUARD < 400) return;
    RESET_GUARD = now;
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    if (!island) return;
    state = "idle";
    island.dataset.state = "idle";
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
    if (!isFinite(w) || !isFinite(h) || w < 40 || h < 40) return "size";
    if (state !== "idle" && state !== "dock") {
      var view = island.querySelector(".rj-view--" + state);
      var content = view && view.querySelector("button, a, input, textarea, .rj-list, .rj-switches, .rj-now, .rj-panic-wrap, .rj-empty");
      if (!content) return "empty";
    }
    return "ok";
  }

  /* Odbudowa znaczników wyspy — ratunek, gdy drzewo zostało uszkodzone. */
  function rebuild() {
    var host = document.getElementById("rj-island-root");
    if (!host) { island = null; toastEl = null; mount(); return; }
    try {
      host.innerHTML = buildHtml();
      island = host.querySelector(".rj-island");
      toastEl = host.querySelector(".rj-toast");
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

  function openReport(project, type) {
    report.project = project || "";
    report.type = type === "idea" ? "idea" : "bug";
    Array.prototype.forEach.call(island.querySelectorAll(".rj-seg button"), function (button) {
      button.setAttribute("aria-selected", String(button.dataset.kind === report.type));
    });
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

  function pageIndex() {
    var seen = Object.create(null);
    var out = [];

    function push(label, href, hint) {
      var key = href.replace(/#.*$/, "");
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ label: label, href: href, hint: hint || "", kind: "page" });
    }

    Array.prototype.forEach.call(document.querySelectorAll("a[href]"), function (link) {
      var url;
      try {
        url = new URL(link.getAttribute("href"), location.href);
      } catch (e) {
        return;
      }
      if (url.origin !== location.origin) return;
      /* własne skróty wyspy nie są „stronami do wyszukania” */
      if (link.closest("#rj-island-root")) return;
      if (/\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|mp3|webm)$/i.test(url.pathname)) return;
      if (url.pathname === location.pathname && !url.search) return;
      var label = String(link.getAttribute("aria-label") || link.textContent || "").replace(/\s+/g, " ").trim();
      if (!label || label.length > 56) return;
      if (link.closest(".rj-shared-header, footer, nav")) return;
      push(label, url.pathname + url.search, "");
    });

    /* stałe wejścia, nawet jeśli strona nie ma do nich linku w treści */
    [
      ["Strona główna", "/", "G"],
      ["RejChat", "/rejchat", "C"],
      ["RejFile", "/rejfile", "F"],
      ["RejSejf", "/rejsejf", "S"],
      ["RejTools", "/rejtools", "T"],
      ["RejClass", "/rejclass", "K"],
      ["Szklane studio", "/szklane-studio", "Z"],
      ["Konto", "/profil", "A"],
      ["Panel administratora", "/admin", "P"]
    ].forEach(function (row) {
      push(row[0], row[1], row[2]);
    });

    return out;
  }

  var searchCursor = -1;
  var searchResults = [];

  function matches(text, query) {
    var haystack = norm(text);
    if (!query) return true;
    if (haystack.indexOf(query) !== -1) return true;
    /* „czat” i „chat” to dla użytkownika to samo słowo */
    var alt = query.replace(/cz/g, "ch");
    return alt !== query && haystack.indexOf(alt) !== -1;
  }

  function renderSearch(query) {
    var q = norm(query).trim();
    var list = pageIndex().filter(function (item) {
      return matches(item.label, q);
    }).slice(0, 5);

    if (!q) {
      searchResults = ACTIONS.slice(0, 5);
    } else {
      searchResults = list.concat(ACTIONS.filter(function (item) {
        return matches(item.label, q);
      })).slice(0, 6);
    }
    searchCursor = -1;

    var host = document.getElementById("rj-island-results");
    if (!host) return;
    if (!searchResults.length) {
      host.innerHTML = '<p class="rj-empty">Nic nie znaleziono. Spróbuj „czat”, „plik” albo „konto”.</p>';
      return;
    }
    var marks = { report: "!", alerts: "●", theme: "◐", profile: "○", tasks: "↑", panic: "✕" };
    host.innerHTML = searchResults.map(function (item, index) {
      var mark = item.kind === "page" ? "↗" : (marks[item.icon] || "•");
      return '<button class="rj-item" type="button" role="option" data-result="' + index + '">' +
        '<span class="rj-ico" aria-hidden="true">' + mark + "</span>" +
        "<span>" + esc(item.label) + "</span>" +
        '<span class="rj-key">' + esc(item.hint || "") + "</span></button>";
    }).join("");
  }

  function openResult(index) {
    var item = searchResults[index];
    if (!item) return;
    if (item.kind === "page") {
      close();
      window.location.href = item.href;
      return;
    }
    if (item.state === "report") openReport("", "bug");
    else if (item.state) apply(item.state);
  }

  function moveSearchCursor(delta) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll("#rj-island-results .rj-item"));
    if (!nodes.length) return;
    searchCursor = (searchCursor + delta + nodes.length) % nodes.length;
    nodes.forEach(function (node, index) {
      node.classList.toggle("is-cursor", index === searchCursor);
    });
    nodes[searchCursor].scrollIntoView({ block: "nearest" });
  }

  /* ----------------------------------------------------------- zgłoszenia */

  function saveTask(task) {
    var list = storeJson(TASKS_KEY) || [];
    list.unshift(task);
    storeJson(TASKS_KEY, list.slice(0, 8));
  }

  function renderTasks() {
    var host = document.getElementById("rj-island-tasks");
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
    var text = document.getElementById("rj-island-text");
    var value = (text && text.value || "").trim();
    if (value.length < 4) {
      toast("Napisz choć kilka słów");
      if (text) text.focus();
      return;
    }

    report.busy = true;
    var send = island.querySelector("[data-send]");
    if (send) {
      send.disabled = true;
      send.textContent = "Wysyłam…";
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
    var host = document.getElementById("rj-island-alerts");
    var pushRow = document.getElementById("rj-island-push-row");
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
    var host = document.getElementById("rj-island-alerts");
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
    var dot = island.querySelector('.rj-dock-btn[data-open="alerts"]');
    if (dot) dot.classList.toggle("has-dot", count > 0);
    var label = island.querySelector("[data-alerts-count]");
    if (label) label.textContent = count > 0 ? count + " nowe" : "";
    island.setAttribute("data-unread", String(count || 0));
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

  function renderNow() {
    var host = document.getElementById("rj-island-now");
    if (!host) return;
    var media = currentMedia();

    if (!media) {
      host.innerHTML =
        '<div class="rj-now"><span class="rj-cover" aria-hidden="true">' + ICONS.now + "</span>" +
        '<span class="rj-now-meta"><b>Nic teraz nie gra</b><small>Otwórz RejStream albo Jakuplayera</small></span>' +
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
    if (!media) return;
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
    var host = document.getElementById("rj-island-profile");
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
      '<a class="rj-ghost" style="align-self:flex-start;margin-top:8px;text-decoration:none" href="/profil">Otwórz profil</a>';

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
    var themeSwitch = island.querySelector('[data-switch="theme"]');
    var motionSwitch = island.querySelector('[data-switch="motion"]');
    if (themeSwitch) themeSwitch.setAttribute("aria-pressed", String(isLight()));
    if (motionSwitch) motionSwitch.setAttribute("aria-pressed", String(motionOn()));
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

  function mount() {
    if (document.querySelector(".rj-legacy-home")) return;
    if (document.getElementById("rj-island-root")) return;

    root = document.createElement("div");
    root.id = "rj-island-root";
    root.innerHTML = buildHtml();
    document.body.appendChild(root);

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

    function handleClick(event) {
      var open = event.target.closest("[data-open]");
      if (open) {
        var name = open.getAttribute("data-open");
        if (name === "report") openReport("", "bug");
        else apply(name);
        return;
      }
      if (event.target.closest("[data-close]")) { close(); return; }
      if (event.target.closest("[data-panic]")) { runPanic(); return; }

      var send = event.target.closest("[data-send]");
      if (send) { submitReport(); return; }

      var shot = event.target.closest("[data-shot]");
      if (shot) { toggleShot(shot); return; }

      var kind = event.target.closest(".rj-seg button");
      if (kind) {
        report.type = kind.dataset.kind;
        Array.prototype.forEach.call(island.querySelectorAll(".rj-seg button"), function (button) {
          button.setAttribute("aria-selected", String(button === kind));
        });
        var field = document.getElementById("rj-island-text");
        if (field) {
          field.placeholder = report.type === "idea"
            ? "Co warto dodać albo zmienić?"
            : "Co się stało? Im konkrety, tym szybciej naprawię.";
          field.focus();
        }
        return;
      }

      var result = event.target.closest("[data-result]");
      if (result) { openResult(Number(result.getAttribute("data-result"))); return; }

      var readAll = event.target.closest("[data-read-all]");
      if (readAll) { markAllRead(); return; }

      var push = event.target.closest("[data-push]");
      if (push) { togglePush(push); return; }

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

      var sw = event.target.closest("[data-switch]");
      if (sw) {
        if (sw.getAttribute("data-switch") === "theme") toggleTheme();
        else toggleMotion();
        return;
      }

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

    /* kliknięcie w zwiniętą wyspę rozwija dock */
    root.addEventListener("click", function (event) {
      if (state === "idle" && !event.target.closest("button")) toggleDock();
    });

    root.addEventListener("keydown", function (event) {
      if (state !== "idle") return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleDock();
      }
    });

    document.addEventListener("click", function (event) {
      /* Klik w „Zgłoś błąd / pomysł” przy projekcie ma otworzyć wyspę, a nie
         ją zamknąć — ten przycisk leży poza wyspą, więc musi być wyjątkiem. */
      if (event.target.closest("[data-feedback-project]")) return;
      if (!island.contains(event.target) && state !== "idle") close();
    });

    /* Delegacja: pole wyszukiwania powstaje na nowo po odbudowie wyspy,
       więc nasłuch nie może wisieć na samym polu. */
    root.addEventListener("input", function (event) {
      if (event.target && event.target.id === "rj-island-search") renderSearch(event.target.value);
    });
    root.addEventListener("keydown", function (event) {
      if (!event.target || event.target.id !== "rj-island-search") return;
      if (event.key === "ArrowDown") { event.preventDefault(); moveSearchCursor(1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); moveSearchCursor(-1); }
      else if (event.key === "Enter") {
        event.preventDefault();
        if (searchCursor >= 0) openResult(searchCursor);
        else if (searchResults[0]) openResult(0);
      }
    });

    /* Skróty klawiszowe zostały usunięte — wyszukiwanie otwiera
       przycisk w docku. Zostaje tylko Esc, żeby dało się zamknąć panel. */
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state !== "idle") close();
    });

    /* Klawiatura pojawia się z opóźnieniem — po fokusie w polu sprawdzamy
       widok jeszcze raz, żeby panel zdążył się podnieść. */
    root.addEventListener("focusin", function () {
      setTimeout(syncViewport, 320);
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

    /* stan początkowy: czekamy na koniec loadera, żeby wyspa nie wyskakiwała
       przed resztą strony — chowamy ją tylko na czas `rj-booting`. */
    apply("idle");
    try { syncSwitches(); } catch (e) { /* trudno */ }
    syncViewport();
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
    health: health,
    check: watchdog,
    reset: resetToIdle,
    status: function () {
      return { state: state, unread: Number(island && island.getAttribute("data-unread")) || 0, project: projectSlug };
    }
  };

  /* media-capture.js może dojść po wyspie — wtedy dopiero odsłaniamy zdjęcie */
  window.addEventListener("rj:media-ready", function () {
    var shot = document.querySelector('[data-shot]');
    if (shot && window.RJMedia && window.RJMedia.captureDom) shot.hidden = false;
  });
})(window, document);

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
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5 12 15.5l6-6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14.5 12 8.5l6 6"/></svg>',
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
    /* Schowana wyspa to mały uchwyt przyklejony do dolnej krawędzi ekranu —
       wciąż widoczny (żeby dało się ją przywrócić), ale nie zasłania treści. */
    min: { w: 132, h: 28, r: 14 },
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
  var report = { type: "bug", shot: null, project: "", busy: false };
  var pendingUpload = null;
  var alertsCache = null;

  function sizeFor(name) {
    var size = SIZES[name] || SIZES.idle;
    var vp = viewport();
    var w = Math.min(size.w, Math.max(200, vp.w - EDGE * 2));
    var h = Math.min(size.h, Math.max(120, vp.h - vp.kb - BOTTOM_RESERVE));
    return { w: Math.round(w), h: Math.round(h), r: Math.min(size.r, Math.round(h / 2)) };
  }

  /* Każde wpisanie rozmiaru przechodzi przez ten pilnik: NaN albo wartość
     z kosmosu nie może już rozciągnąć czarnej wyspy na cały ekran. */
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
    island.style.marginLeft = (-w / 2).toFixed(2) + "px";
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

        /* Schowana: mały uchwyt przy dolnej krawędzi, sama strzałka w górę. */
        '<div class="rj-view rj-view--min">' +
          '<button class="rj-handle" type="button" data-expand aria-label="Pokaż wyspę" title="Pokaż wyspę">' +
            ICONS.up +
            '<span class="rj-handle-label">' + esc(projectName) + "</span>" +
          "</button>" +
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
          '<button class="rj-dock-btn rj-dock-btn--collapse" type="button" data-collapse title="Schowaj wyspę" aria-label="Schowaj wyspę">' + ICONS.down + "</button>" +
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
    min: 1, idle: 1, dock: 1, report: 1, search: 1, alerts: 1, now: 1,
    profile: 1, quick: 1, theme: 1, tasks: 1, panic: 1
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
    /* Krótkie muśnięcie na Androidzie — informacja bez patrzenia. */
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch (e) { /* trudno */ }
  }

  function expand() {
    if (!island) return;
    store(COLLAPSE_KEY, "0");
    apply("idle");
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch (e) { /* trudno */ }
  }

  function apply(name) {
    if (!island) return;
    if (!VIEWS[name]) name = "idle";
    state = name;
    island.dataset.state = name;
    /* Rysowanie paneli jest w osłonie: wyjątek w danych nie może zostawić
       czarnej wyspy bez treści i bez wyjścia. */
    island.classList.toggle("is-min", name === "min");
    island.setAttribute("aria-expanded", String(name !== "min"));
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
      setTimeout(function () { try { fit(); } catch (e) { /* trudno */ } }, 220);
    });
  }

  function paint(name) {
    if (name === "search") {
      renderSearch("");
      setTimeout(function () {
        var input = byId("rj-island-search");
        if (input) input.focus();
      }, 90);
    }
    if (name === "report") {
      var text = byId("rj-island-text");
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

    var host = byId("rj-island-results");
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
    var nodes = withinAll("#rj-island-results .rj-item");
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
    var text = byId("rj-island-text");
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
    var host = byId("rj-island-now");
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

  /* Wersja arkusza wyspy — trzymaj w zgodzie z <script src="hub/island.js?v=…">
     na stronach. Adres bierzemy z własnego <script>, więc działa i na
     rejhub.vercel.app, i na GitHub Pages. */
  var CSS_VERSION = "3";

  function stylesheetUrl() {
    var base = scriptEl && scriptEl.src ? scriptEl.src.split("?")[0].split("#")[0] : "";
    if (!base || !/island\.js$/.test(base)) base = "/hub/island.js";
    return base.replace(/island\.js$/, "island.css") + "?v=" + CSS_VERSION;
  }

  /* Minimalne style, które muszą działać przed wczytaniem arkusza — i które
     ratują sytuację, gdy arkusz się nie wczyta (słabe łącze, blokada, stara
     wersja z cache). Bez nich wyspa była czarnym prostokątem bez treści. */
  var STATES = ["min", "idle", "dock", "report", "search", "alerts", "now",
                "profile", "quick", "theme", "tasks", "panic"];

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
    "#rj-island-root .rj-toast{position:absolute;left:50%;bottom:74px;transform:translate(-50%,8px);" +
    "padding:8px 14px;border-radius:999px;background:#000;color:#f4f7fc;" +
    "border:1px solid rgba(255,255,255,.12);opacity:0;pointer-events:none}" +
    "#rj-island-root .rj-toast.is-on{opacity:1}" +
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

    function handleClick(event) {
      var open = event.target.closest("[data-open]");
      if (open) {
        var name = open.getAttribute("data-open");
        if (name === "report") openReport("", "bug");
        else apply(name);
        return;
      }
      if (event.target.closest("[data-collapse]")) { collapse(); return; }
      if (event.target.closest("[data-expand]")) { expand(); return; }
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
        var field = byId("rj-island-text");
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
    function feedbackTrigger(event) {
      if (event.target && event.target.closest && event.target.closest("[data-feedback-project]")) {
        return event.target.closest("[data-feedback-project]");
      }
      var path = typeof event.composedPath === "function" ? event.composedPath() : [];
      for (var i = 0; i < path.length; i += 1) {
        if (path[i] && path[i].getAttribute && path[i].getAttribute("data-feedback-project")) return path[i];
      }
      return null;
    }

    document.addEventListener("click", function (event) {
      /* Klik w „Zgłoś błąd / pomysł” przy projekcie ma otworzyć wyspę, a nie
         ją zamknąć — ten przycisk leży poza wyspą, więc musi być wyjątkiem. */
      if (feedbackTrigger(event)) return;
      if (!clickInsideIsland(event) && state !== "idle") close();
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

    /* stan początkowy: czekamy na koniec loadera, żeby wyspa nie wyskakiwała
       przed resztą strony — chowamy ją tylko na czas `rj-booting`. */
    /* Jeśli użytkownik schował wyspę, zostaje schowana także tutaj. */
    apply(isCollapsed() ? "min" : "idle");
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
    collapse: collapse,
    expand: expand,
    collapsed: isCollapsed,
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

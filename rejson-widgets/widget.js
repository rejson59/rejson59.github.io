/*!
 * Rejson Liquid Glass Widget v2.0 — Minimalist Morphing Edition
 * Jedna powierzchnia Liquid Glass, która płynnie wyrasta z przycisku w formularz.
 * <script src="https://rejson59.github.io/rejson-widgets/widget.js" defer></script>
 */
(function (window, document) {
  "use strict";

  function isInsideCardThumbnail() {
    if (window.REJSON_WIDGET_ALLOW_IFRAME) return false;
    try {
      if (window.name === "rejson-card-preview") return true;
      if (window.self !== window.top && window.frameElement) {
        var fe = window.frameElement;
        if (
          fe.classList &&
          (fe.classList.contains("card-preview-iframe") || fe.hasAttribute("data-card-preview"))
        ) {
          return true;
        }
        if (fe.closest && fe.closest(".card-preview-frame")) {
          return true;
        }
      }
    } catch (e) {
      /* Cross-origin parent (np. podgląd Live Preview w Arena.ai) — główne okno aplikacji */
      return false;
    }
    return false;
  }

  if (isInsideCardThumbnail()) return;
  if (window.__REJSON_WIDGET_MOUNTED__) return;
  window.__REJSON_WIDGET_MOUNTED__ = true;

  /* ========================================================================
     1. KONFIGURACJA SUPABASE + LOKALNY FALLBACK
     ======================================================================== */
  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

  var VOTER_KEY_NAME = "rejson_widgets_voter_id_v1";
  var PREFS_KEY_PREFIX = "rejson_widget_prefs_v3:";
  var MIRROR_KEY = "rejson_widgets_mirror_v1";

  var DEFAULT_BOARD_FALLBACK = [];

  /* ========================================================================
     2. CICHUTKIE PRZECHWYTYWANIE BŁĘDÓW KONSOLI I DANYCH TECHNICZNYCH
     ======================================================================== */
  var capturedErrors = [];
  var listeners = {};

  function emit(name, detail) {
    var list = listeners[name];
    if (!list) return;
    list.slice().forEach(function (fn) {
      try {
        fn(detail);
      } catch (e) {}
    });
  }

  function pushCapturedError(entry) {
    if (!entry) return;
    var stamp = new Date().toTimeString().slice(0, 8);
    var line = "[" + stamp + "] " + String(entry).slice(0, 300);
    if (capturedErrors[capturedErrors.length - 1] === line) return;
    capturedErrors.push(line);
    if (capturedErrors.length > 8) capturedErrors.shift();
    updateErrorDot();
    emit("error-captured", { count: capturedErrors.length, latest: line });
  }

  window.addEventListener("error", function (ev) {
    var loc = ev.filename
      ? " (" + ev.filename.split("/").pop() + (ev.lineno ? ":" + ev.lineno : "") + ")"
      : "";
    pushCapturedError((ev.message || "Error") + loc);
  });

  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev.reason;
    pushCapturedError("Promise: " + (r && r.message ? r.message : String(r || "Rejection")));
  });

  if (window.console && typeof window.console.error === "function") {
    var origErr = window.console.error;
    window.console.error = function () {
      try {
        var msg = Array.prototype.slice
          .call(arguments)
          .map(function (a) {
            return a instanceof Error ? a.name + ": " + a.message : String(a);
          })
          .join(" ");
        pushCapturedError(msg);
      } catch (e) {}
      return origErr.apply(window.console, arguments);
    };
  }

  /* ========================================================================
     3. AUTO-DETEKCJA STRONY DOCELOWEJ I KONFIGURACJA
     ======================================================================== */
  var scriptEl =
    document.currentScript ||
    document.querySelector('script[src*="widget.js"]') ||
    document.querySelector("script[data-rejson-widget]");

  function detectProject() {
    var host = (window.location.hostname || "").toLowerCase();
    var parts = (window.location.pathname || "/")
      .split("/")
      .filter(function (s) {
        return s && !/\.html?$/i.test(s);
      });

    if (host === "rejson59.github.io") {
      return parts.length
        ? { slug: parts[0], name: parts[0] }
        : { slug: "rejson59.github.io", name: "Rejson59" };
    }
    if (host.endsWith(".vercel.app")) {
      var sub = host.replace(".vercel.app", "").split("-git-")[0];
      return { slug: sub, name: sub };
    }
    if (parts.length && host !== "localhost" && host !== "127.0.0.1") {
      return { slug: parts[0], name: parts[0] };
    }
    var rawTitle = (document.title || "").split(/[—–|-]/)[0].trim();
    if (rawTitle) {
      var slug = rawTitle.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
      return { slug: slug || "rejson-widgets", name: rawTitle };
    }
    return { slug: "rejson59.github.io", name: "Rejson59" };
  }

  var detected = detectProject();
  var ds = (scriptEl && scriptEl.dataset) || {};
  var gCfg = window.REJSON_WIDGET_CONFIG || {};

  var config = {
    project: ds.project || gCfg.project || detected.slug,
    title: ds.title || gCfg.title || "",
    mode: ds.mode || gCfg.mode || "pill", // "pill" | "orb" | "edge"
    position: ds.position || gCfg.position || "bottom-right",
    theme: ds.theme || gCfg.theme || "auto",
    accent: ds.accent || gCfg.accent || "",
    label: ds.label !== undefined ? ds.label : gCfg.label !== undefined ? gCfg.label : "Zgłoś błąd / pomysł",
    shortcut: ds.shortcut !== "false" && gCfg.shortcut !== false,
    gameSafe: ds.gameSafe !== "false" && gCfg.gameSafe !== false
  };

  var KNOWN_PROJECTS = [
    { slug: "rejson59.github.io", name: "rejson59.github.io (Strona główna)" },
    { slug: "mconline", name: "mconline" },
    { slug: "JoyPad", name: "JoyPad" },
    { slug: "Jakuplayer", name: "Jakuplayer" },
    { slug: "VibeAnimations", name: "VibeAnimations" },
    { slug: "zaplecze-resellera", name: "zaplecze-resellera" },
    { slug: "Blessed-Optimizer", name: "Blessed-Optimizer" },
    { slug: "kompi", name: "kompi" },
    { slug: "nimo", name: "nimo" },
    { slug: "AnimationBuilder", name: "AnimationBuilder" },
    { slug: "OffChat", name: "OffChat" },
    { slug: "ClassQuest", name: "ClassQuest" },
    { slug: "RealisticCarNight", name: "RealisticCarNight" },
    { slug: "DreamKnight", name: "DreamKnight" },
    { slug: "NexoAgents", name: "NexoAgents" },
    { slug: "MiniVS-Code", name: "MiniVS-Code" },
    { slug: "SiteStore", name: "SiteStore" },
    { slug: "DiffrentReality", name: "DiffrentReality" },
    { slug: "Private-valut", name: "Private-valut" }
  ];

  function getProjectsList() {
    var map = {};
    var out = [];
    function add(slug, name) {
      if (!slug) return;
      var k = String(slug).toLowerCase();
      if (k === "rejson59") return;
      if (map[k]) return;
      map[k] = true;
      out.push({ slug: slug, name: name || slug });
    }
    add(config.project, config.title || (config.project === "rejson59.github.io" ? "rejson59.github.io (Strona główna)" : config.project));
    KNOWN_PROJECTS.forEach(function (p) { add(p.slug, p.name); });
    if (Array.isArray(window.PROJECTS_FALLBACK)) {
      window.PROJECTS_FALLBACK.forEach(function (r) {
        if (r && r.name) add(r.name, r.name);
      });
    }
    return out;
  }

  function loadPrefs() {
    try {
      var r = localStorage.getItem(PREFS_KEY_PREFIX + config.project);
      return r ? JSON.parse(r) : {};
    } catch (e) {
      return {};
    }
  }

  function savePrefs(patch) {
    try {
      localStorage.setItem(
        PREFS_KEY_PREFIX + config.project,
        JSON.stringify(Object.assign({}, loadPrefs(), patch))
      );
    } catch (e) {}
  }

  var saved = loadPrefs();

  var state = {
    open: false,
    view: "form", // "form" | "board" | "sent"
    type: "bug", // "bug" | "idea"
    scope: "all", // "project" | "all"
    submitting: false,
    boardItems: [],
    mode: saved.mode || config.mode || "pill",
    corner: saved.corner || config.position || "bottom-right",
    themePref: saved.themePref || config.theme || "auto",
    resolvedTheme: "dark",
    pointerLocked: false,
    dragging: false
  };

  var draft = { message: "", author: "" };

  /* ========================================================================
     4. SUBTELNA SOCZEWKA OPTYCZNA LIQUID GLASS
     ======================================================================== */
  function buildLensMap(w, h, r, bevel) {
    try {
      var c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      var ctx = c.getContext("2d");
      if (!ctx) return "";
      var img = ctx.createImageData(w, h);
      var d = img.data;
      var hw = w / 2;
      var hh = h / 2;
      var rad = Math.min(r, hw - 1, hh - 1);
      var iw = hw - rad;
      var ih = hh - rad;

      for (var y = 0; y < h; y++) {
        var py = y + 0.5 - hh;
        var ay = Math.abs(py) - ih;
        for (var x = 0; x < w; x++) {
          var px = x + 0.5 - hw;
          var ax = Math.abs(px) - iw;
          var qx = Math.max(ax, 0);
          var qy = Math.max(ay, 0);
          var outD = Math.hypot(qx, qy);
          var inD = Math.min(Math.max(ax, ay), 0);
          var sdf = outD + inD - rad;

          var nx = 0;
          var ny = 0;
          if (sdf > -bevel && sdf <= 2) {
            var t = Math.min(1, Math.max(0, (sdf + bevel) / bevel));
            var prof = Math.pow(Math.sin(t * Math.PI * 0.5), 1.7);
            var gx = 0;
            var gy = 0;
            if (ax > 0 || ay > 0) {
              var len = Math.max(outD, 0.0001);
              gx = (qx / len) * (px < 0 ? -1 : 1);
              gy = (qy / len) * (py < 0 ? -1 : 1);
            } else if (ax > ay) {
              gx = px < 0 ? -1 : 1;
            } else {
              gy = py < 0 ? -1 : 1;
            }
            nx = -gx * prof;
            ny = -gy * prof;
          }
          var i = (y * w + x) * 4;
          d[i] = Math.round(128 + nx * 127);
          d[i + 1] = Math.round(128 + ny * 127);
          d[i + 2] = 128;
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL("image/png");
    } catch (e) {
      return "";
    }
  }

  var vesselLensURL = buildLensMap(200, 200, 26, 18);

  /* ========================================================================
     5. MINIMALISTYCZNY STYL JEDNEJ MORFUJĄCEJ POWIERZCHNI SZKŁA
     ======================================================================== */
  var CSS_TEXT = [
    ":host {",
    "  all: initial;",
    "  position: fixed;",
    "  inset: 0;",
    "  width: 0;",
    "  height: 0;",
    "  z-index: 2147483000;",
    "  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
    "  color-scheme: dark;",
    "  --rj-accent: #7ab2ff;",
    "  --rj-glass: rgba(16, 20, 28, 0.64);",
    "  --rj-glass-open: rgba(15, 19, 27, 0.74);",
    "  --rj-fill: rgba(255, 255, 255, 0.06);",
    "  --rj-fill-hover: rgba(255, 255, 255, 0.105);",
    "  --rj-line: rgba(255, 255, 255, 0.13);",
    "  --rj-line-soft: rgba(255, 255, 255, 0.075);",
    "  --rj-rim-a: rgba(255, 255, 255, 0.44);",
    "  --rj-rim-b: rgba(255, 255, 255, 0.08);",
    "  --rj-rim-c: rgba(255, 255, 255, 0.22);",
    "  --rj-ink: #f4f7fc;",
    "  --rj-muted: rgba(235, 242, 255, 0.62);",
    "  --rj-faint: rgba(220, 230, 248, 0.38);",
    "  --rj-btn-bg: #f4f7fc;",
    "  --rj-btn-ink: #0b0f17;",
    "  --rj-shadow: 0 18px 48px -10px rgba(0, 0, 0, 0.52), 0 4px 14px rgba(0, 0, 0, 0.24);",
    "  --rj-sheen: rgba(255, 255, 255, 0.13);",
    "  --mx: 50%;",
    "  --my: 15%;",
    "}",
    ":host([data-theme='light']) {",
    "  color-scheme: light;",
    "  --rj-accent: #2563eb;",
    "  --rj-glass: rgba(255, 255, 255, 0.66);",
    "  --rj-glass-open: rgba(252, 253, 255, 0.78);",
    "  --rj-fill: rgba(15, 23, 42, 0.048);",
    "  --rj-fill-hover: rgba(15, 23, 42, 0.085);",
    "  --rj-line: rgba(15, 23, 42, 0.1);",
    "  --rj-line-soft: rgba(15, 23, 42, 0.065);",
    "  --rj-rim-a: rgba(255, 255, 255, 0.95);",
    "  --rj-rim-b: rgba(15, 23, 42, 0.08);",
    "  --rj-rim-c: rgba(255, 255, 255, 0.75);",
    "  --rj-ink: #0f172a;",
    "  --rj-muted: rgba(15, 23, 42, 0.6);",
    "  --rj-faint: rgba(15, 23, 42, 0.38);",
    "  --rj-btn-bg: #0f172a;",
    "  --rj-btn-ink: #ffffff;",
    "  --rj-shadow: 0 20px 50px -12px rgba(15, 23, 42, 0.18), 0 4px 14px rgba(15, 23, 42, 0.06);",
    "  --rj-sheen: rgba(255, 255, 255, 0.65);",
    "}",
    "*, *::before, *::after { box-sizing: border-box; }",
    ".rj-defs { position: fixed; width: 0; height: 0; opacity: 0; pointer-events: none; }",

    /* JEDYNA POWIERZCHNIA SZKŁA — to sam przycisk, który rośnie w formularz! */
    ".rj-vessel {",
    "  position: fixed;",
    "  z-index: 2147483001;",
    "  background: var(--rj-glass);",
    "  color: var(--rj-ink);",
    "  backdrop-filter: blur(26px) saturate(185%);",
    "  -webkit-backdrop-filter: blur(26px) saturate(185%);",
    "  box-shadow: var(--rj-shadow), inset 0 1px 0.5px var(--rj-rim-a);",
    "  overflow: hidden;",
    "  will-change: width, height, border-radius, transform;",
    "  touch-action: none;",
    "  transition: background-color 0.28s ease, box-shadow 0.28s ease, opacity 0.25s ease;",
    "}",
    "@supports (backdrop-filter: url(#rj-vessel-lens)) {",
    "  .rj-vessel.has-lens {",
    "    backdrop-filter: url(#rj-vessel-lens) blur(22px) saturate(190%);",
    "  }",
    "}",
    ".rj-vessel.is-open {",
    "  background: var(--rj-glass-open);",
    "  touch-action: auto;",
    "}",
    ".rj-vessel.is-pointer-locked {",
    "  opacity: 0.14;",
    "  pointer-events: none;",
    "}",
    /* Cieniutki szklany rant 1px */
    ".rj-vessel::before {",
    "  content: '';",
    "  position: absolute;",
    "  inset: 0;",
    "  border-radius: inherit;",
    "  padding: 1px;",
    "  background: linear-gradient(135deg, var(--rj-rim-a) 0%, var(--rj-rim-b) 50%, var(--rj-rim-c) 100%);",
    "  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);",
    "  -webkit-mask-composite: xor;",
    "  mask-composite: exclude;",
    "  pointer-events: none;",
    "  z-index: 4;",
    "}",
    /* Subtelny refleks światła na tafli szkła */
    ".rj-vessel::after {",
    "  content: '';",
    "  position: absolute;",
    "  inset: 0;",
    "  border-radius: inherit;",
    "  background: radial-gradient(220px circle at var(--mx) var(--my), var(--rj-sheen), transparent 70%);",
    "  pointer-events: none;",
    "  z-index: 3;",
    "}",

    /* Warstwa 1: Stan zwinięty (minimalistyczny przycisk) */
    ".rj-closed {",
    "  position: absolute;",
    "  inset: 0;",
    "  width: 100%;",
    "  height: 100%;",
    "  border: none;",
    "  background: transparent;",
    "  color: var(--rj-ink);",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  gap: 7px;",
    "  padding: 0 15px;",
    "  cursor: pointer;",
    "  user-select: none;",
    "  -webkit-user-select: none;",
    "  font: 500 13px/1 'Inter', system-ui, sans-serif;",
    "  letter-spacing: -0.01em;",
    "  white-space: nowrap;",
    "  opacity: 1;",
    "  filter: blur(0px);",
    "  transform: scale(1);",
    "  transition: opacity 0.15s ease, filter 0.16s ease, transform 0.18s ease;",
    "  z-index: 2;",
    "}",
    ".rj-vessel:not(.is-open) {",
    "  background: rgba(18, 24, 36, 0.86);",
    "  box-shadow: 0 14px 36px -6px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(122, 178, 255, 0.32), 0 0 22px -4px rgba(122, 178, 255, 0.28), inset 0 1px 0.5px var(--rj-rim-a);",
    "}",
    ":host([data-theme='light']) .rj-vessel:not(.is-open) {",
    "  background: rgba(255, 255, 255, 0.9);",
    "  box-shadow: 0 14px 34px -6px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(37, 99, 235, 0.24), inset 0 1px 0.5px var(--rj-rim-a);",
    "}",
    ".rj-vessel:not(.is-open):hover { filter: brightness(1.08); }",
    ".rj-vessel.is-open .rj-closed {",
    "  opacity: 0;",
    "  filter: blur(4px);",
    "  transform: scale(0.92);",
    "  pointer-events: none;",
    "}",
    ".rj-closed.is-icon-only { padding: 0; }",
    ".rj-closed.is-icon-only .rj-label-txt { display: none; }",

    ".rj-dot {",
    "  width: 8px;",
    "  height: 8px;",
    "  border-radius: 50%;",
    "  background: var(--rj-accent);",
    "  box-shadow: 0 0 10px var(--rj-accent), 0 0 0 3px rgba(122, 178, 255, 0.18);",
    "  flex: none;",
    "  transition: background-color 0.25s ease, box-shadow 0.25s ease;",
    "}",
    ".rj-dot.has-err {",
    "  background: #fb7185;",
    "  box-shadow: 0 0 10px rgba(251, 113, 133, 0.85);",
    "}",

    /* Warstwa 2: Wnętrze rozwinięte (ten sam kawałek szkła!) */
    ".rj-open {",
    "  position: relative;",
    "  width: min(338px, calc(100vw - 32px));",
    "  padding: 13px;",
    "  opacity: 0;",
    "  filter: blur(6px);",
    "  transform: translateY(4px) scale(0.98);",
    "  pointer-events: none;",
    "  transition: opacity 0.2s ease 0.04s, filter 0.22s ease 0.04s, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1) 0.04s;",
    "  z-index: 2;",
    "}",
    ".rj-vessel.is-open .rj-open {",
    "  opacity: 1;",
    "  filter: blur(0px);",
    "  transform: translateY(0) scale(1);",
    "  pointer-events: auto;",
    "}",
    ".rj-vessel:not(.is-open) .rj-open {",
    "  transition: opacity 0.1s ease, filter 0.1s ease, transform 0.12s ease;",
    "}",

    /* Górny minimalistyczny pasek w jednym wierszu */
    ".rj-top {",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  gap: 8px;",
    "  margin-bottom: 10px;",
    "}",
    ".rj-seg {",
    "  position: relative;",
    "  display: inline-grid;",
    "  grid-template-columns: 1fr 1fr;",
    "  padding: 3px;",
    "  border-radius: 999px;",
    "  background: var(--rj-fill);",
    "  border: 1px solid var(--rj-line-soft);",
    "}",
    ".rj-seg-pill {",
    "  position: absolute;",
    "  top: 3px;",
    "  bottom: 3px;",
    "  left: 3px;",
    "  width: calc(50% - 3px);",
    "  border-radius: 999px;",
    "  background: var(--rj-fill-hover);",
    "  border: 1px solid var(--rj-line);",
    "  box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);",
    "  transition: transform 0.28s cubic-bezier(0.22, 1.15, 0.36, 1);",
    "  pointer-events: none;",
    "}",
    ".rj-seg button {",
    "  position: relative;",
    "  z-index: 1;",
    "  border: none;",
    "  background: none;",
    "  color: var(--rj-muted);",
    "  font: 500 12px/1 'Inter', sans-serif;",
    "  padding: 5.5px 13px;",
    "  border-radius: 999px;",
    "  cursor: pointer;",
    "  transition: color 0.18s ease;",
    "}",
    ".rj-seg button.is-active { color: var(--rj-ink); font-weight: 600; }",

    ".rj-actions-right { display: flex; align-items: center; gap: 4px; }",
    ".rj-ghost-icon {",
    "  width: 28px;",
    "  height: 28px;",
    "  border-radius: 50%;",
    "  border: none;",
    "  background: transparent;",
    "  color: var(--rj-muted);",
    "  display: grid;",
    "  place-items: center;",
    "  cursor: pointer;",
    "  transition: background-color 0.16s ease, color 0.16s ease;",
    "  padding: 0;",
    "}",
    ".rj-ghost-icon:hover, .rj-ghost-icon.is-active {",
    "  background: var(--rj-fill-hover);",
    "  color: var(--rj-ink);",
    "}",

    /* Minimalistyczne pola formularza */
    ".rj-proj-row {",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  gap: 8px;",
    "  margin-bottom: 8px;",
    "  font-size: 11.5px;",
    "  color: var(--rj-muted);",
    "}",
    ".rj-proj-label { white-space: nowrap; font-weight: 500; }",
    ".rj-proj-select {",
    "  flex: 1;",
    "  min-width: 0;",
    "  height: 28px;",
    "  border-radius: 999px;",
    "  border: 1px solid var(--rj-line-soft);",
    "  background: var(--rj-fill);",
    "  color: var(--rj-ink);",
    "  font: 500 11.5px/1 'Inter', system-ui, sans-serif;",
    "  padding: 0 10px;",
    "  outline: none;",
    "  cursor: pointer;",
    "}",
    ".rj-proj-select option { background: #12161f; color: #f4f7fc; }",
    ".rj-row-meta {",
    "  display: inline-block;",
    "  font-size: 10px;",
    "  font-weight: 600;",
    "  color: var(--rj-accent);",
    "  margin-bottom: 2px;",
    "}",
    ".rj-board-foot {",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  margin-top: 8px;",
    "  padding-top: 7px;",
    "  border-top: 1px solid var(--rj-line-soft);",
    "  font-size: 11px;",
    "  color: var(--rj-muted);",
    "}",
    ".rj-board-foot a {",
    "  color: var(--rj-accent);",
    "  text-decoration: none;",
    "  font-weight: 500;",
    "}",
    ".rj-board-foot a:hover { text-decoration: underline; }",
    ".rj-msg {",
    "  display: block;",
    "  width: 100%;",
    "  height: 92px;",
    "  resize: none;",
    "  border-radius: 14px;",
    "  border: 1px solid var(--rj-line-soft);",
    "  background: var(--rj-fill);",
    "  color: var(--rj-ink);",
    "  font: 400 13px/1.5 'Inter', system-ui, sans-serif;",
    "  padding: 10px 12px;",
    "  outline: none;",
    "  transition: border-color 0.18s ease, background-color 0.18s ease;",
    "}",
    ".rj-msg::placeholder, .rj-nick::placeholder { color: var(--rj-faint); }",
    ".rj-msg:focus, .rj-nick:focus {",
    "  border-color: var(--rj-line);",
    "  background: var(--rj-fill-hover);",
    "}",
    ".rj-bottom {",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  gap: 8px;",
    "  margin-top: 8px;",
    "}",
    ".rj-nick {",
    "  flex: 1;",
    "  min-width: 0;",
    "  height: 32px;",
    "  border-radius: 999px;",
    "  border: 1px solid var(--rj-line-soft);",
    "  background: var(--rj-fill);",
    "  color: var(--rj-ink);",
    "  font: 400 12px/1 'Inter', system-ui, sans-serif;",
    "  padding: 0 12px;",
    "  outline: none;",
    "  transition: border-color 0.18s ease, background-color 0.18s ease;",
    "}",
    ".rj-send {",
    "  height: 32px;",
    "  padding: 0 15px;",
    "  border-radius: 999px;",
    "  border: none;",
    "  background: var(--rj-btn-bg);",
    "  color: var(--rj-btn-ink);",
    "  font: 600 12px/1 'Inter', system-ui, sans-serif;",
    "  cursor: pointer;",
    "  flex: none;",
    "  transition: transform 0.16s ease, opacity 0.16s ease;",
    "}",
    ".rj-send:hover { transform: scale(1.03); }",
    ".rj-send:active { transform: scale(0.97); }",
    ".rj-send:disabled { opacity: 0.45; cursor: default; transform: none; }",

    /* Minimalistyczne potwierdzenie wysłania wewnątrz tej samej kropli szkła */
    ".rj-sent {",
    "  padding: 18px 8px 14px;",
    "  text-align: center;",
    "}",
    ".rj-sent-check {",
    "  width: 34px;",
    "  height: 34px;",
    "  margin: 0 auto 8px;",
    "  border-radius: 50%;",
    "  background: rgba(52, 211, 153, 0.16);",
    "  border: 1px solid rgba(52, 211, 153, 0.4);",
    "  color: #34d399;",
    "  display: grid;",
    "  place-items: center;",
    "}",
    ".rj-sent p { margin: 0; font-size: 13px; font-weight: 500; }",
    ".rj-sent span { display: block; margin-top: 3px; font-size: 11.5px; color: var(--rj-muted); }",

    /* Minimalistyczna lista pomysłów (opcjonalny podgląd pod ikonką) */
    ".rj-list {",
    "  display: flex;",
    "  flex-direction: column;",
    "  gap: 6px;",
    "  max-height: 240px;",
    "  overflow-y: auto;",
    "  scrollbar-width: thin;",
    "}",
    ".rj-row {",
    "  display: flex;",
    "  align-items: flex-start;",
    "  gap: 8px;",
    "  padding: 8px 9px;",
    "  border-radius: 12px;",
    "  background: var(--rj-fill);",
    "  border: 1px solid var(--rj-line-soft);",
    "}",
    ".rj-up {",
    "  min-width: 36px;",
    "  height: 34px;",
    "  border-radius: 9px;",
    "  border: 1px solid var(--rj-line-soft);",
    "  background: transparent;",
    "  color: var(--rj-muted);",
    "  font: 600 11px/1 'Inter', sans-serif;",
    "  cursor: pointer;",
    "  display: flex;",
    "  flex-direction: column;",
    "  align-items: center;",
    "  justify-content: center;",
    "  gap: 1px;",
    "  flex: none;",
    "  padding: 0;",
    "  transition: all 0.16s ease;",
    "}",
    ".rj-up:hover { color: var(--rj-ink); background: var(--rj-fill-hover); }",
    ".rj-up-heart { width: 13px; height: 13px; display: block; }",
    ".rj-up.is-voted {",
    "  color: #fb7185;",
    "  border-color: color-mix(in srgb, #fb7185 55%, transparent);",
    "  background: color-mix(in srgb, #fb7185 18%, transparent);",
    "}",
    ".rj-up.is-voted .rj-up-heart { fill: currentColor; }",
    ".rj-row-title { margin: 0; font-size: 12.2px; font-weight: 500; line-height: 1.35; }",
    ".rj-row-reply {",
    "  margin: 4px 0 0;",
    "  font-size: 11px;",
    "  color: var(--rj-muted);",
    "  padding-left: 7px;",
    "  border-left: 2px solid var(--rj-accent);",
    "}",

    "@media (prefers-reduced-motion: reduce) {",
    "  .rj-open, .rj-closed, .rj-seg-pill { transition-duration: 0.08s !important; }",
    "}"
  ].join("\n");

  /* ========================================================================
     6. IKONY WEKTOROWE (CZYSTE I MINIMALISTYCZNE)
     ======================================================================== */
  var SVG_CLOSE =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var SVG_BOARD =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>';
  var SVG_CHECK =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  /* ========================================================================
     7. BUDOWA SHADOW DOM — JEDEN ELEMENT .rj-vessel
     ======================================================================== */
  var hostEl = document.createElement("div");
  hostEl.id = "rejson-liquid-widget-root";
  var shadow = hostEl.attachShadow({ mode: "open" });

  ["keydown", "keyup", "keypress"].forEach(function (evName) {
    hostEl.addEventListener(evName, function (ev) {
      if (!state.open) return;
      if (evName === "keydown" && ev.key === "Escape") {
        closeMorph();
        ev.stopPropagation();
        return;
      }
      ev.stopPropagation();
    });
  });

  shadow.innerHTML =
    "<style>" +
    CSS_TEXT +
    "</style>" +
    (vesselLensURL
      ? '<svg class="rj-defs" aria-hidden="true"><defs>' +
        '<filter id="rj-vessel-lens" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">' +
        '<feImage href="' +
        vesselLensURL +
        '" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="m"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="m" scale="13" xChannelSelector="R" yChannelSelector="G"/>' +
        "</filter></defs></svg>"
      : "") +
    '<div class="rj-vessel has-lens" part="vessel">' +
    '  <button class="rj-closed" type="button" aria-label="Otwórz formularz feedbacku">' +
    '    <span class="rj-dot"></span>' +
    '    <span class="rj-label-txt"></span>' +
    "  </button>" +
    '  <div class="rj-open" role="dialog" aria-label="Feedback">' +
    '    <div class="rj-top">' +
    '      <div class="rj-seg">' +
    '        <div class="rj-seg-pill"></div>' +
    '        <button type="button" data-type="bug" class="is-active">Błąd</button>' +
    '        <button type="button" data-type="idea">Pomysł</button>' +
    "      </div>" +
    '      <div class="rj-actions-right">' +
    '        <button type="button" class="rj-ghost-icon rj-btn-board" title="Tablica pomysłów" aria-label="Tablica pomysłów">' +
    SVG_BOARD +
    "</button>" +
    '        <button type="button" class="rj-ghost-icon rj-btn-close" title="Zwiń (Esc)" aria-label="Zamknij">' +
    SVG_CLOSE +
    "</button>" +
    "      </div>" +
    "    </div>" +
    '    <div class="rj-slot"></div>' +
    "  </div>" +
    "</div>";

  var vesselEl = shadow.querySelector(".rj-vessel");
  var closedBtn = shadow.querySelector(".rj-closed");
  var dotEl = shadow.querySelector(".rj-dot");
  var labelEl = shadow.querySelector(".rj-label-txt");
  var openWrap = shadow.querySelector(".rj-open");
  var segPill = shadow.querySelector(".rj-seg-pill");
  var segButtons = Array.prototype.slice.call(shadow.querySelectorAll(".rj-seg button"));
  var boardBtn = shadow.querySelector(".rj-btn-board");
  var closeBtn = shadow.querySelector(".rj-btn-close");
  var slotEl = shadow.querySelector(".rj-slot");

  function updateErrorDot() {
    if (dotEl) dotEl.classList.toggle("has-err", capturedErrors.length > 0);
  }

  /* ========================================================================
     8. PRAWDZIWA FIZYKA SPRĘŻYNOWA MORFINGU (WIDTH + HEIGHT + BORDER-RADIUS)
     ======================================================================== */
  var morph = {
    w: 112,
    h: 38,
    r: 19,
    tw: 112,
    th: 38,
    tr: 19,
    vw: 0,
    vh: 0,
    vr: 0,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    raf: 0,
    lastTs: 0
  };

  function closedMetrics() {
    if (state.mode === "edge") {
      return { w: 14, h: 52, r: 9 };
    }
    if (state.mode === "orb" || !config.label) {
      return { w: 40, h: 40, r: 20 };
    }
    var txtLen = (config.label || "Feedback").length;
    return { w: Math.max(112, Math.round(48 + txtLen * 7.8)), h: 40, r: 20 };
  }

  function openTargetMetrics() {
    var maxW = Math.min(338, window.innerWidth - 32);
    openWrap.style.width = maxW + "px";
    var naturalH = Math.max(150, openWrap.offsetHeight);
    return { w: maxW, h: naturalH, r: 22 };
  }

  function applyAnchorPosition() {
    var isRight = state.corner.indexOf("right") !== -1;
    var isBottom = state.corner.indexOf("bottom") !== -1;
    var edgeOffset = !state.open && state.mode === "edge" ? 4 : 18;

    vesselEl.style.right = isRight ? edgeOffset + "px" : "auto";
    vesselEl.style.left = isRight ? "auto" : edgeOffset + "px";
    vesselEl.style.bottom = isBottom ? "18px" : "auto";
    vesselEl.style.top = isBottom ? "auto" : "18px";
  }

  function flushMorphFrame() {
    vesselEl.style.width = Math.max(12, morph.w).toFixed(1) + "px";
    vesselEl.style.height = Math.max(24, morph.h).toFixed(1) + "px";
    vesselEl.style.borderRadius = Math.max(8, morph.r).toFixed(1) + "px";
    vesselEl.style.transform =
      Math.abs(morph.dx) > 0.1 || Math.abs(morph.dy) > 0.1
        ? "translate3d(" + morph.dx.toFixed(1) + "px," + morph.dy.toFixed(1) + "px,0)"
        : "translate3d(0,0,0)";
  }

  function kickMorphSpring() {
    var target = state.open ? openTargetMetrics() : closedMetrics();
    morph.tw = target.w;
    morph.th = target.h;
    morph.tr = target.r;
    applyAnchorPosition();

    if (morph.raf) return;
    morph.lastTs = performance.now();

    function tick(now) {
      var dt = Math.min(0.032, Math.max(0.008, (now - morph.lastTs) / 1000));
      morph.lastTs = now;

      /* Krytycznie-sprężyste tłumienie jak w iOS Dynamic Island */
      var k = 330;
      var damp = 27;

      morph.vw += ((morph.tw - morph.w) * k - morph.vw * damp) * dt;
      morph.vh += ((morph.th - morph.h) * k - morph.vh * damp) * dt;
      morph.vr += ((morph.tr - morph.r) * 380 - morph.vr * 30) * dt;

      morph.w += morph.vw * dt;
      morph.h += morph.vh * dt;
      morph.r += morph.vr * dt;

      if (!state.dragging) {
        morph.vx += (-morph.dx * 300 - morph.vx * 25) * dt;
        morph.vy += (-morph.dy * 300 - morph.vy * 25) * dt;
        morph.dx += morph.vx * dt;
        morph.dy += morph.vy * dt;
      }

      flushMorphFrame();

      var settled =
        Math.abs(morph.tw - morph.w) < 0.25 &&
        Math.abs(morph.th - morph.h) < 0.25 &&
        Math.abs(morph.vw) < 0.8 &&
        Math.abs(morph.vh) < 0.8 &&
        (state.dragging || (Math.abs(morph.dx) < 0.25 && Math.abs(morph.dy) < 0.25));

      if (settled) {
        morph.w = morph.tw;
        morph.h = morph.th;
        morph.r = morph.tr;
        if (!state.dragging) {
          morph.dx = 0;
          morph.dy = 0;
        }
        flushMorphFrame();
        morph.raf = 0;
        return;
      }
      morph.raf = requestAnimationFrame(tick);
    }

    morph.raf = requestAnimationFrame(tick);
  }

  /* ========================================================================
     9. RENDEROWANIE MINIMALISTYCZNEGO WNĘTRZA
     ======================================================================== */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderHeaderControls() {
    segPill.style.transform = state.type === "bug" ? "translateX(0%)" : "translateX(100%)";
    segButtons.forEach(function (b) {
      b.classList.toggle("is-active", state.view === "form" && b.dataset.type === state.type);
    });
    boardBtn.classList.toggle("is-active", state.view === "board");
  }

  function renderSlot() {
    renderHeaderControls();

    if (state.view === "sent") {
      slotEl.innerHTML =
        '<div class="rj-sent">' +
        '  <div class="rj-sent-check">' +
        SVG_CHECK +
        "</div>" +
        "  <p>Wysłano — dzięki!</p>" +
        "  <span>Zgłoszenie trafiło do panelu Rejsona.</span>" +
        "</div>";
      kickMorphSpring();
      return;
    }

    if (state.view === "board") {
      var list = state.boardItems.slice(0, 12);
      slotEl.innerHTML = (!list.length
        ? '<p style="margin:14px 0;text-align:center;font-size:12px;color:var(--rj-muted)">Brak wpisów — dodaj pierwszy pomysł.</p>'
        : '<div class="rj-list">' +
          list
            .map(function (it) {
              var pBadge = it.project_slug ? '<span class="rj-row-meta">' + esc(it.project_slug) + " · " + (it.type === "bug" ? "Błąd" : "Pomysł") + "</span>" : "";
              return (
                '<div class="rj-row">' +
                '  <button type="button" class="rj-up ' +
                (it.has_voted ? "is-voted" : "") +
                '" data-up="' +
                esc(it.id) +
                '" title="' +
                (it.has_voted ? "Cofnij polubienie" : "Polub — pokaż, że pomysł Ci się podoba") +
                '" aria-label="' +
                (it.has_voted ? "Cofnij polubienie" : "Polub pomysł") +
                '"><svg class="rj-up-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>' +
                Number(it.upvotes_count || 0) +
                "</span></button>" +
                '  <div style="min-width:0;flex:1">' +
                pBadge +
                '    <p class="rj-row-title">' +
                esc(it.title) +
                "</p>" +
                (it.admin_reply
                  ? '<p class="rj-row-reply">' + esc(it.admin_reply) + "</p>"
                  : "") +
                "  </div>" +
                "</div>"
              );
            })
            .join("") +
          "</div>") +
        '<div class="rj-board-foot">' +
        '  <span>Zgłoszenia i pomysły</span>' +
        '  <a href="/rejson-widgets/board.html" target="_blank" rel="noopener noreferrer">Publiczna tablica ↗</a>' +
        '  <a href="/rejson-widgets/admin.html" target="_blank" rel="noopener noreferrer">Panel ↗</a>' +
        "</div>";
      kickMorphSpring();
      return;
    }

    var isBug = state.type === "bug";
    var projOptions = getProjectsList()
      .map(function (p) {
        var sel = String(p.slug).toLowerCase() === String(config.project).toLowerCase() ? " selected" : "";
        return '<option value="' + esc(p.slug) + '"' + sel + ">" + esc(p.name) + "</option>";
      })
      .join("");

    slotEl.innerHTML =
      '<form id="rj-min-form">' +
      '  <div class="rj-proj-row">' +
      '    <label class="rj-proj-label" for="rj-proj-in">Projekt:</label>' +
      '    <select class="rj-proj-select" id="rj-proj-in">' +
      projOptions +
      "    </select>" +
      "  </div>" +
      '  <textarea class="rj-msg" id="rj-msg-in" maxlength="4000" required placeholder="' +
      (isBug
        ? "Opisz krótko co nie działa lub jaki wystąpił błąd…"
        : "Jaki masz pomysł na update lub ulepszenie tego projektu?") +
      '">' +
      esc(draft.message) +
      "</textarea>" +
      '  <div class="rj-bottom">' +
      '    <input class="rj-nick" id="rj-nick-in" maxlength="50" placeholder="Nick (opcjonalnie)" value="' +
      esc(draft.author) +
      '">' +
      '    <button class="rj-send" type="submit" ' +
      (state.submitting ? "disabled" : "") +
      ">" +
      (state.submitting ? "Wysyłanie…" : "Wyślij") +
      "</button>" +
      "  </div>" +
      "</form>";

    kickMorphSpring();
  }

  /* ========================================================================
     10. KOMUNIKACJA Z CHMURĄ SUPABASE + DIAGNOSTYKA
     ======================================================================== */
  function getVoterId() {
    try {
      var id = localStorage.getItem(VOTER_KEY_NAME);
      if (id && id.length >= 16) return id;
      id = "rjv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 14);
      localStorage.setItem(VOTER_KEY_NAME, id);
      return id;
    } catch (e) {
      return "rjv_mem_" + Math.random().toString(36).slice(2, 14);
    }
  }

  function collectDiagnostics() {
    var ua = navigator.userAgent || "";
    var browser = /Edg\/([\d.]+)/.test(ua)
      ? "Edge " + RegExp.$1
      : /Chrome\/([\d.]+)/.test(ua)
        ? "Chrome " + RegExp.$1
        : /Firefox\/([\d.]+)/.test(ua)
          ? "Firefox " + RegExp.$1
          : /Version\/([\d.]+).*Safari/.test(ua)
            ? "Safari " + RegExp.$1
            : "Browser";
    var os = /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Mac OS X/.test(ua)
            ? "macOS"
            : "Linux";
    return {
      browser: browser,
      os: os,
      viewport: window.innerWidth + " × " + window.innerHeight,
      language: navigator.language || "pl-PL",
      touch: ("ontouchstart" in window) || navigator.maxTouchPoints > 0,
      consoleErrors: capturedErrors.slice()
    };
  }

  /* Trwały 4-cyfrowy identyfikator przeglądarki (odcisk) — ten sam algorytm
     co na stronie głównej, więc tożsamość jest spójna z panelem admina. */
  function fpId() {
    try {
      var scr = window.screen || {};
      var parts = [
        navigator.userAgent || "",
        navigator.language || "",
        (navigator.languages || []).join(","),
        navigator.platform || "",
        scr.width || 0, scr.height || 0,
        scr.availWidth || 0, scr.availHeight || 0,
        scr.colorDepth || 0, scr.pixelDepth || 0,
        window.devicePixelRatio || 1,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
        navigator.maxTouchPoints || 0,
        navigator.cookieEnabled ? 1 : 0,
        navigator.doNotTrack || ""
      ];
      var str = parts.join("|");
      var h = 0x811c9dc5;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      return String(1000 + (h % 9000));
    } catch (e) {
      return "";
    }
  }

  /* Statystyki akcji dla panelu admina (tylko właściciel je widzi) */
  function trackAction(kind, target) {
    try {
      var visitorId = "";
      try {
        visitorId = localStorage.getItem("rejson_views_visitor_id_v1") || "";
      } catch (e) {}
      callRPC("log_activity_event", {
        p_kind: kind,
        p_target: target,
        p_slug: config.project || null,
        p_visitor_id: visitorId || null,
        p_fp: fpId()
      }).catch(function () {});
    } catch (e) { /* ignorujemy */ }
  }

  function callRPC(name, body) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = ctrl
      ? setTimeout(function () {
          ctrl.abort();
        }, 3500)
      : null;
    return fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {}),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .finally(function () {
        if (t) clearTimeout(t);
      });
  }

  function getMirror() {
    try {
      var raw = localStorage.getItem(MIRROR_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && Array.isArray(p.items)) return p;
      }
    } catch (e) {}
    return { items: DEFAULT_BOARD_FALLBACK.slice(), votedIds: {} };
  }

  async function syncBoard() {
    try {
      var rows = await callRPC("list_public_board", {
        p_project_slug: null,
        p_voter_key: getVoterId(),
        p_limit: 40
      });
      if (Array.isArray(rows)) state.boardItems = rows;
    } catch (e) {
      var m = getMirror();
      state.boardItems = m.items.map(function (x) {
        return Object.assign({}, x, { has_voted: Boolean(m.votedIds && m.votedIds[x.id]) });
      });
    }
    if (state.open && state.view === "board") renderSlot();
  }

  async function handleSubmit() {
    var text = draft.message.trim();
    if (text.length < 3 || state.submitting) return;

    state.submitting = true;
    renderSlot();

    var firstLine = text.split("\n")[0].trim();
    var shortTitle = firstLine.length > 96 ? firstLine.slice(0, 93) + "…" : firstLine;

    var payload = {
      p_project_slug: config.project,
      p_project_name: config.title || config.project,
      p_type: state.type,
      p_title: shortTitle,
      p_description: text,
      p_category: state.type === "bug" ? "bug" : "feature",
      p_severity: "normal",
      p_is_public: true,
      p_author_name: draft.author.trim() || "Anonim",
      p_author_contact: null,
      p_page_url: window.location.href,
      p_diagnostics: state.type === "bug" ? collectDiagnostics() : {},
      p_voter_key: getVoterId(),
      p_fp: fpId()
    };

    try {
      var created = await callRPC("submit_feedback", payload);
      if (created) {
        state.boardItems.unshift(created);
        trackAction("submit", (state.type === "bug" ? "zgłoszenie błędu" : "nowy pomysł") + ": „" + shortTitle.slice(0, 80) + "”");
      }
    } catch (err) {
      var m = getMirror();
      var localItem = {
        id: "local-" + Date.now().toString(36),
        project_slug: payload.p_project_slug,
        project_name: payload.p_project_name,
        type: payload.p_type,
        title: payload.p_title,
        description: payload.p_description,
        status: "new",
        is_public: true,
        upvotes_count: 1,
        author_name: payload.p_author_name,
        page_url: payload.p_page_url,
        diagnostics: payload.p_diagnostics,
        created_at: new Date().toISOString(),
        has_voted: true
      };
      m.items.unshift(localItem);
      try {
        localStorage.setItem(MIRROR_KEY, JSON.stringify(m));
      } catch (e2) {}
      state.boardItems.unshift(localItem);
    }

    draft.message = "";
    state.submitting = false;
    state.view = "sent";
    renderSlot();
    emit("submitted", { type: state.type, project: config.project });

    /* Po krótkim potwierdzeniu szkło samo płynnie zwija się z powrotem w kapsułkę */
    setTimeout(function () {
      if (state.open && state.view === "sent") {
        closeMorph();
      }
    }, 1150);
  }

  async function toggleVote(id) {
    var item = state.boardItems.find(function (x) {
      return x.id === id;
    });
    if (!item) return;
    item.has_voted = !item.has_voted;
    item.upvotes_count = Math.max(0, Number(item.upvotes_count || 0) + (item.has_voted ? 1 : -1));
    renderSlot();

    try {
      var res = await callRPC("toggle_upvote", {
        p_submission_id: id,
        p_voter_key: getVoterId(),
        p_fp: fpId()
      });
      if (res && typeof res.upvotes_count === "number") {
        item.has_voted = Boolean(res.voted);
        item.upvotes_count = res.upvotes_count;
        renderSlot();
        trackAction(res.voted ? "like" : "unlike", "❤ pomysł: „" + String(item.title || "").slice(0, 80) + "”");
      }
    } catch (e) {}
  }

  /* ========================================================================
     11. OTWIERANIE / ZWIJANIE MORFINGOWE + PRZECIĄGANIE + MOTYW STRONY
     ======================================================================== */
  function openMorph(target, projectSlug) {
    if (projectSlug) {
      config.project = projectSlug;
      config.title = projectSlug;
    }
    if (target === "bug" || target === "idea") {
      state.type = target;
      state.view = "form";
      trackAction("open", "otworzył formularz: " + (target === "bug" ? "zgłoś błąd" : "zgłoś pomysł"));
    } else if (target === "board") {
      state.view = "board";
      trackAction("open", "otworzył listę pomysłów w pigułce");
    } else if (state.view === "sent") {
      state.view = "form";
    }

    state.open = true;
    vesselEl.classList.add("is-open");
    renderSlot();

    setTimeout(function () {
      var msgEl = shadow.getElementById("rj-msg-in");
      if (msgEl && state.open && state.view === "form") msgEl.focus();
    }, 140);

    syncBoard();
    emit("open", { view: state.view, type: state.type });
  }

  function closeMorph() {
    if (!state.open) return;
    state.open = false;
    vesselEl.classList.remove("is-open");
    kickMorphSpring();
    emit("close", {});
  }

  function toggleMorph() {
    if (state.open) closeMorph();
    else openMorph();
  }

  /* Kliknięcie poza rozwiniętym szkłem płynnie zwija je z powrotem w przycisk */
  document.addEventListener("pointerdown", function (e) {
    if (!state.open) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(vesselEl) !== -1 || e.target === hostEl) return;
    if (
      e.target &&
      e.target.closest &&
      (e.target.closest("[data-rj-keep]") || e.target.closest("[data-feedback-project]"))
    ) {
      return;
    }
    closeMorph();
  });

  /* Otwieranie widżetu dla konkretnego projektu po kliknięciu przycisku z data-feedback-project */
  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var trigger = e.target.closest("[data-feedback-project]");
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();
    var proj = trigger.getAttribute("data-feedback-project");
    var modeType = trigger.getAttribute("data-feedback-type") || "bug";
    openMorph(modeType, proj);
  });

  /* Przeciąganie zamkniętej kapsułki w dowolny róg lub do krawędzi ekranu */
  var drag = null;
  closedBtn.addEventListener("pointerdown", function (e) {
    if (state.open || (e.button !== undefined && e.button !== 0)) return;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
  });

  window.addEventListener(
    "pointermove",
    function (e) {
      var rect = vesselEl.getBoundingClientRect();
      if (rect.width > 0) {
        vesselEl.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
        vesselEl.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
      }
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.sx;
      var dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 6) {
        drag.moved = true;
        state.dragging = true;
        try {
          closedBtn.setPointerCapture(e.pointerId);
        } catch (err) {}
      }
      if (!drag.moved) return;
      morph.dx = dx;
      morph.dy = dy;
      flushMorphFrame();
    },
    { passive: true }
  );

  window.addEventListener("pointerup", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var moved = drag.moved;
    drag = null;
    state.dragging = false;
    if (!moved) return;

    var rect = vesselEl.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var isRight = cx >= window.innerWidth / 2;
    var isBottom = cy >= window.innerHeight / 2;
    state.corner = (isBottom ? "bottom-" : "top-") + (isRight ? "right" : "left");

    if (e.clientX <= 22 || e.clientX >= window.innerWidth - 22) {
      state.mode = "edge";
    } else if (state.mode === "edge") {
      state.mode = config.mode === "orb" ? "orb" : "pill";
    }

    morph.dx = 0;
    morph.dy = 0;
    savePrefs({ corner: state.corner, mode: state.mode });
    syncVisualAppearance();
    kickMorphSpring();
  });

  closedBtn.addEventListener("click", function () {
    if (state.dragging) return;
    openMorph();
  });

  closeBtn.addEventListener("click", closeMorph);

  boardBtn.addEventListener("click", function () {
    state.view = state.view === "board" ? "form" : "board";
    renderSlot();
  });

  segButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.type = btn.dataset.type;
      state.view = "form";
      renderSlot();
    });
  });

  slotEl.addEventListener("input", function (e) {
    if (e.target.id === "rj-msg-in") draft.message = e.target.value;
    else if (e.target.id === "rj-nick-in") draft.author = e.target.value;
  });

  slotEl.addEventListener("change", function (e) {
    if (e.target.id === "rj-proj-in") {
      config.project = e.target.value;
      config.title = e.target.value;
    }
  });

  slotEl.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  });

  slotEl.addEventListener("submit", function (e) {
    if (e.target.id !== "rj-min-form") return;
    e.preventDefault();
    handleSubmit();
  });

  slotEl.addEventListener("click", function (e) {
    var up = e.target.closest("[data-up]");
    if (up) toggleVote(up.dataset.up);
  });

  function detectTheme() {
    if (state.themePref === "dark" || state.themePref === "light") return state.themePref;
    var docEl = document.documentElement;
    var attr = (docEl.getAttribute("data-theme") || docEl.getAttribute("data-bs-theme") || "").toLowerCase();
    if (attr === "light" || attr === "dark") return attr;
    if (docEl.classList.contains("light")) return "light";
    if (docEl.classList.contains("dark")) return "dark";
    try {
      var bg = window.getComputedStyle(document.body || docEl).backgroundColor || "";
      var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        var lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
        return lum > 0.58 ? "light" : "dark";
      }
    } catch (e) {}
    return "dark";
  }

  function syncVisualAppearance() {
    state.resolvedTheme = detectTheme();
    hostEl.setAttribute("data-theme", state.resolvedTheme);
    if (config.accent) hostEl.style.setProperty("--rj-accent", config.accent);
    else hostEl.style.removeProperty("--rj-accent");

    labelEl.textContent = config.label || "Feedback";
    closedBtn.classList.toggle("is-icon-only", state.mode === "orb" || state.mode === "edge" || !config.label);
    applyAnchorPosition();
  }

  window.addEventListener("keydown", function (e) {
    if (config.shortcut && e.altKey && (e.key === "r" || e.key === "R" || e.code === "KeyR")) {
      e.preventDefault();
      toggleMorph();
    }
  });

  document.addEventListener("pointerlockchange", function () {
    if (!config.gameSafe) return;
    state.pointerLocked = Boolean(document.pointerLockElement);
    vesselEl.classList.toggle("is-pointer-locked", state.pointerLocked);
    if (state.pointerLocked && state.open) closeMorph();
  });

  window.addEventListener("resize", function () {
    if (state.open) kickMorphSpring();
  });

  function mount() {
    if (!document.body) return;
    document.body.appendChild(hostEl);
    syncVisualAppearance();
    var m = closedMetrics();
    morph.w = morph.tw = m.w;
    morph.h = morph.th = m.h;
    morph.r = morph.tr = m.r;
    flushMorphFrame();

    new MutationObserver(function () {
      var next = detectTheme();
      if (next !== state.resolvedTheme) {
        state.resolvedTheme = next;
        hostEl.setAttribute("data-theme", next);
      }
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-bs-theme", "class", "style"]
    });

    syncBoard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.RejsonWidget = {
    version: "2.0.0",
    open: openMorph,
    close: closeMorph,
    toggle: toggleMorph,
    dock: function (flag) {
      state.mode = flag === false ? "pill" : "edge";
      savePrefs({ mode: state.mode });
      syncVisualAppearance();
      kickMorphSpring();
    },
    configure: function (opts) {
      if (!opts || typeof opts !== "object") return;
      if (opts.project !== undefined) config.project = opts.project;
      if (opts.title !== undefined) config.title = opts.title;
      if (opts.label !== undefined) config.label = opts.label;
      if (opts.accent !== undefined) config.accent = opts.accent;
      if (opts.mode !== undefined) state.mode = opts.mode;
      if (opts.position !== undefined) state.corner = opts.position;
      if (opts.theme !== undefined) state.themePref = opts.theme;
      syncVisualAppearance();
      if (state.open) renderSlot();
      else kickMorphSpring();
    },
    captureError: pushCapturedError,
    getState: function () {
      return Object.assign({}, state, { config: Object.assign({}, config) });
    },
    on: function (ev, fn) {
      listeners[ev] = listeners[ev] || [];
      listeners[ev].push(fn);
    }
  };
})(window, document);

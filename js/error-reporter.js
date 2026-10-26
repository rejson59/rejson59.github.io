/*!
 * Cichy łapacz błędów — automatyczne raporty techniczne.
 *
 * Zbiera to, co psuje stronę, bez pytania użytkownika o cokolwiek:
 *   1. błędy JS (window.onerror) i odrzucone obietnice (unhandledrejection),
 *   2. błędy sieci (fetch / XHR: zerwane połączenie, HTTP 4xx/5xx),
 *   3. nieudane podglądy projektów (zdarzenie rj:preview-failed z loader.js),
 *   4. bardzo wolne wczytywanie strony (> 4 s).
 *
 * Prywatność:
 *   - wysyłamy wyłącznie adres bez parametrów (?...) i kotwicy,
 *   - ślad kliknięć to sam selektor elementu (tag.klasa[data-*]) — bez tekstu,
 *     bez wartości pól formularzy, bez haseł,
 *   - limit 5 raportów na wczytanie strony i 20 na sesję,
 *   - ten sam błąd raportujemy raz na wczytanie strony (po odcisku).
 *
 * Raporty trafiają do prywatnej tabeli error_reports (RLS + RPC), widzi je
 * tylko administrator w panelu admin.html → zakładka „Błędy".
 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

  var MAX_PER_PAGE = 5;
  var MAX_PER_SESSION = 20;
  var SLOW_LOAD_MS = 4000;
  var RPC_TIMEOUT_MS = 8000;

  if (window.RJ_ERROR_REPORTS_OFF) return;

  var sentThisPage = 0;
  var sentThisSession = 0;
  var seen = Object.create(null);
  var trail = [];
  var startedAt = Date.now();
  var ready = false;

  /* ------------------------------------------------------------------ */
  /*  Pomocnicze                                                         */
  /* ------------------------------------------------------------------ */

  function pageUrlClean() {
    try {
      return (location.origin + location.pathname).slice(0, 500);
    } catch (e) {
      return "";
    }
  }

  function projectSlug() {
    try {
      var p = location.pathname.replace(/^\/+|\/+$/g, "");
      if (!p) return "strona-glowna";
      if (/\.html?$/i.test(p)) return "strona-glowna";
      return p.split("/")[0].toLowerCase().slice(0, 80);
    } catch (e) {
      return "";
    }
  }

  function parseBrowser() {
    var ua = navigator.userAgent || "";
    if (/Edg\/([\d.]+)/.test(ua)) return "Edge " + RegExp.$1;
    if (/OPR\/([\d.]+)/.test(ua)) return "Opera " + RegExp.$1;
    if (/Chrome\/([\d.]+)/.test(ua)) return "Chrome " + RegExp.$1;
    if (/Firefox\/([\d.]+)/.test(ua)) return "Firefox " + RegExp.$1;
    if (/Version\/([\d.]+).*Safari/.test(ua)) return "Safari " + RegExp.$1;
    return "Przeglądarka";
  }

  function parseOs() {
    var ua = navigator.userAgent || "";
    if (/Windows/.test(ua)) return "Windows";
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    if (/Mac OS X/.test(ua)) return "macOS";
    if (/Linux/.test(ua)) return "Linux";
    return "Inny";
  }

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return "rj" + Math.abs(h).toString(36);
  }

  /* Selektor bez treści: tylko tag, klasy i data-atrybuty techniczne */
  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    var tag = el.tagName ? el.tagName.toLowerCase() : "?";
    var cls = "";
    try {
      cls = (el.getAttribute("class") || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(".");
    } catch (e) { /* ignorujemy */ }
    var dataKeys = "";
    try {
      if (el.attributes) {
        for (var i = 0; i < el.attributes.length; i++) {
          var name = el.attributes[i].name;
          if (name.indexOf("data-") === 0 && name.length < 40) {
            dataKeys += "[" + name + "]";
          }
        }
      }
    } catch (e) { /* ignorujemy */ }
    return (tag + (cls ? "." + cls : "") + dataKeys).slice(0, 120);
  }

  function errorsDiagnostics() {
    return {
      browser: parseBrowser(),
      os: parseOs(),
      viewport: window.innerWidth + " × " + window.innerHeight,
      language: navigator.language || "pl-PL",
      online: navigator.onLine !== false,
      connection: (navigator.connection && navigator.connection.effectiveType) || null,
      memoryGb: (navigator.deviceMemory || null),
      msSincePageStart: Date.now() - startedAt,
      visibility: document.visibilityState
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Wysyłka                                                            */
  /* ------------------------------------------------------------------ */

  function canSend() {
    if (sentThisPage >= MAX_PER_PAGE) return false;
    if (sentThisSession >= MAX_PER_SESSION) return false;
    if (navigator.onLine === false) return false;
    return true;
  }

  function send(kind, message, extra) {
    var msg = String(message || "").slice(0, 600);
    if (!msg) return;
    var stack = String((extra && extra.stack) || "").slice(0, 4000);
    var source = String((extra && extra.source) || "").slice(0, 300);
    var fp = hash(kind + "|" + msg + "|" + stack.slice(0, 160) + "|" + source + "|" + (extra && extra.fpSalt ? extra.fpSalt : ""));

    if (seen[fp]) return; /* ten sam problem już zgłoszony w tym wczytaniu */
    if (!canSend()) return;
    seen[fp] = true;
    sentThisPage++;
    sentThisSession++;

    var payload = {
      p_fingerprint: fp,
      p_kind: kind,
      p_message: msg,
      p_stack: stack,
      p_source: source,
      p_page_url: pageUrlClean(),
      p_project_slug: projectSlug(),
      p_browser: parseBrowser(),
      p_os: parseOs(),
      p_viewport: window.innerWidth + " × " + window.innerHeight,
      p_language: navigator.language || "pl-PL",
      p_user_agent: String(navigator.userAgent || "").slice(0, 400),
      p_interactions: trail.slice(-8),
      p_diagnostics: Object.assign(errorsDiagnostics(), (extra && extra.diagnostics) || {})
    };

    var ctrl = null;
    var timer = null;
    try {
      if (window.AbortController) {
        ctrl = new AbortController();
        timer = setTimeout(function () { ctrl.abort(); }, RPC_TIMEOUT_MS);
      }
      fetch(SUPABASE_URL + "/rest/v1/rpc/submit_error_report", {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        keepalive: true,
        signal: ctrl ? ctrl.signal : undefined
      })
        .catch(function () { /* cisza — raportowanie nie może psuć strony */ })
        .then(function () {
          if (timer) clearTimeout(timer);
        });
    } catch (e) {
      /* brak fetch — trudno, zostaje cisza */
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Ślad kliknięć (bez treści i bez wartości pól)                      */
  /* ------------------------------------------------------------------ */

  function pushTrail(kind, el) {
    var d = describe(el);
    if (!d) return;
    trail.push({ t: Date.now() - startedAt, a: kind, el: d });
    if (trail.length > 8) trail.shift();
  }

  document.addEventListener("pointerdown", function (ev) {
    pushTrail("klik", ev.target);
  }, { capture: true, passive: true });

  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (!el || !el.tagName) return;
    /* zapisujemy tylko fakt zmiany, nigdy wartość */
    pushTrail("zmiana", el);
  }, { capture: true, passive: true });

  /* ------------------------------------------------------------------ */
  /*  1. Błędy JS                                                        */
  /* ------------------------------------------------------------------ */

  window.addEventListener("error", function (ev) {
    /* Błąd zasobu (obrazek/skrypt) ma ev.target zamiast ev.message */
    if (ev.target && ev.target !== window && ev.target.tagName) {
      var t = ev.target.tagName.toLowerCase();
      if (t === "img" || t === "script" || t === "link") {
        send("network", "Nie wczytał się zasób: " + t, {
          source: String(ev.target.src || ev.target.href || "").slice(0, 300),
          fpSalt: t
        });
      }
      return;
    }

    var msg = ev.message || "Nieznany błąd";
    send("js", msg, {
      stack: (ev.error && ev.error.stack) || (ev.filename ? ev.filename + ":" + ev.lineno + ":" + ev.colno : ""),
      source: ev.filename || ""
    });
  }, true);

  window.addEventListener("unhandledrejection", function (ev) {
    var reason = ev.reason;
    var msg = reason && reason.message ? reason.message : String(reason || "Odrzucona obietnica");
    send("promise", msg, {
      stack: (reason && reason.stack) || "",
      source: "promise"
    });
  });

  /* ------------------------------------------------------------------ */
  /*  2. Błędy sieci (fetch + XHR)                                       */
  /* ------------------------------------------------------------------ */

  function urlPath(u) {
    try {
      var url = new URL(u, location.href);
      return (url.origin + url.pathname).slice(0, 300);
    } catch (e) {
      return String(u || "").slice(0, 300);
    }
  }

  var nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input, init) {
      var target = typeof input === "string" ? input : (input && input.url) || "";
      /* własnych raportów nie raportujemy — inaczej błąd sieci zapętliłby wysyłkę */
      var isOwnReport = String(target).indexOf("submit_error_report") !== -1;
      return nativeFetch.apply(this, arguments).then(
        function (res) {
          try {
            if (!isOwnReport && res && !res.ok) {
              var p = urlPath(target);
              /* walidacyjne 4xx z RPC potrafią być normalnym zachowaniem aplikacji */
              var isRpc = p.indexOf("/rest/v1/rpc/") !== -1;
              if (res.status >= 500 || (!isRpc && res.status >= 400)) {
                send("network", "HTTP " + res.status + " — żądanie nie powiodło się", {
                  source: p,
                  fpSalt: String(res.status)
                });
              }
            }
          } catch (e) { /* ignorujemy */ }
          return res;
        },
        function (err) {
          try {
            if (!isOwnReport) send("network", "Zerwane połączenie sieciowe", {
              source: urlPath(target),
              fpSalt: "offline"
            });
          } catch (e) { /* ignorujemy */ }
          throw err;
        }
      );
    };
  }

  if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
    var open = window.XMLHttpRequest.prototype.open;
    var sendXhr = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function (method, url) {
      this._rjUrl = url;
      return open.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      xhr.addEventListener("loadend", function () {
        try {
          if (xhr.status === 0 && !xhr._rjSilent) {
            send("network", "Zerwane połączenie sieciowe (XHR)", {
              source: urlPath(xhr._rjUrl),
              fpSalt: "xhr-offline"
            });
          } else if (xhr.status >= 500) {
            send("network", "HTTP " + xhr.status + " — żądanie nie powiodło się (XHR)", {
              source: urlPath(xhr._rjUrl),
              fpSalt: "xhr-" + xhr.status
            });
          }
        } catch (e) { /* ignorujemy */ }
      });
      return sendXhr.apply(this, arguments);
    };
  }

  /* ------------------------------------------------------------------ */
  /*  3. Nieudane podglądy (sygnał z loader.js)                          */
  /* ------------------------------------------------------------------ */

  document.addEventListener("rj:preview-failed", function (ev) {
    var src = (ev.detail && ev.detail.src) || "";
    send("preview", "Podgląd projektu nie wczytał się", {
      source: urlPath(src),
      fpSalt: src ? "" : "brak-src"
    });
  });

  /* ------------------------------------------------------------------ */
  /*  4. Wolne wczytywanie strony                                        */
  /* ------------------------------------------------------------------ */

  function checkSlowLoad() {
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      var ms = nav ? Math.round(nav.duration || 0) : Math.round(performance.now());
      if (ms >= SLOW_LOAD_MS) {
        send("slow", "Strona wczytywała się " + (ms / 1000).toFixed(1) + " s", {
          source: pageUrlClean(),
          fpSalt: "slow",
          diagnostics: { loadMs: ms }
        });
      }
    } catch (e) { /* ignorujemy */ }
  }

  if (document.readyState === "complete") {
    setTimeout(checkSlowLoad, 600);
  } else {
    window.addEventListener("load", function () {
      setTimeout(checkSlowLoad, 600);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  API publiczne (dla widżetu zgłoszeń i testów)                      */
  /* ------------------------------------------------------------------ */

  window.RJErrors = {
    report: function (message, extra) {
      send((extra && extra.kind) || "manual", message, extra || {});
    },
    trail: function () {
      return trail.slice();
    },
    diagnostics: errorsDiagnostics,
    isReady: function () { return ready; }
  };

  ready = true;
})();

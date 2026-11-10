/*!
 * Rejson59 Global View Tracker & Feedback Pill Service Worker (scope: "/", v2.0)
 * Automatycznie zlicza bezpośrednie wejścia na dowolny projekt w domenie
 * https://rejson59.github.io/<NazwaProjektu>/ oraz wstrzykuje pigułkę
 * rejson-widgets bez konieczności ręcznego dopisywania skryptu w każdym repo.
 * Oznaczone ramki podglądu otrzymują ochronę przed dźwiękiem.
 */

var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
var SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

var COOLDOWN_SECONDS = 900; /* 15 minut blokady czasowej */
var recentMemoryCooldown = {}; /* lower(slug) -> timestamp ms */

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

function registerDirectProjectVisit(slug) {
  if (!slug || !/^[A-Za-z0-9._-]+$/.test(slug)) return Promise.resolve();
  var key = slug.toLowerCase();
  var now = Date.now();
  if (recentMemoryCooldown[key] && now - recentMemoryCooldown[key] < COOLDOWN_SECONDS * 1000) {
    return Promise.resolve();
  }
  recentMemoryCooldown[key] = now;

  return fetch(SUPABASE_URL + "/rest/v1/rpc/register_page_view", {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_slug: slug,
      p_visitor_id: null, /* baza użyje skrótu IP + User-Agent z nagłówków żądania */
      p_cooldown_seconds: COOLDOWN_SECONDS
    }),
    cache: "no-store",
    keepalive: true
  }).catch(function () {
    delete recentMemoryCooldown[key];
  });
}

/* Podglądy projektów są uruchamiane na stronie głównej bez dźwięku.
   Znacznik dotyczy tylko iframe; zwykła wizyta w projekcie jest nietknięta. */
self.addEventListener("message", function (event) {
  if (event.data === "rj-silent-preview-v1" && event.ports && event.ports[0]) {
    event.ports[0].postMessage("rj-silent-preview-v1");
  }
});
function silentPreviewFallback() {
  return new Response('<!doctype html><meta charset="utf-8"><style>body{background:#101c2d;color:#d7e7ff;font:16px system-ui;display:grid;place-items:center;min-height:90vh;text-align:center}</style><p>Otwórz projekt, aby zobaczyć podgląd.</p>', {headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}
function serveSilentPreview(request, target) {
  return fetch(target, {credentials:"same-origin"}).then(function (response) {
    if (!response.ok || response.redirected || !/text\/html/i.test(response.headers.get("content-type") || "")) return silentPreviewFallback();
    /* Nie obchodzimy polityk projektów: przy CSP pokazujemy bezpieczny fallback. */
    if (response.headers.has("content-security-policy") || response.headers.has("content-security-policy-report-only")) return silentPreviewFallback();
    return response.text().then(function (html) {
      if (/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/i.test(html) || !/<head\b[^>]*>/i.test(html)) return silentPreviewFallback();
      /* Ochrona musi być gotowa przed pierwszym skryptem projektu. */
      return fetch('/js/preview-silence.js?v=1').then(function (guard) {
        if (!guard.ok) return silentPreviewFallback();
        return guard.text().then(function (code) {
          if (!code || /<\/script/i.test(code)) return silentPreviewFallback();
          /* Adres projektu przywracamy przed skryptami, zachowując względne
             ścieżki i działanie aplikacji. Nawigacja ramki zaczyna się w scope
             głównego workera, nawet gdy projekt ma już własny worker. */
          var restore = 'history.replaceState(null,"",' + JSON.stringify(target).replace(/</g, "\\u003c") + ');';
          var guarded = html.replace(/<head\b[^>]*>/i, function (head) { return head + '<script>' + restore + code + '</script>'; });
          var headers = new Headers(response.headers);
          headers.delete("content-length"); headers.delete("content-encoding");
          headers.set("cache-control", "no-store");
          return new Response(guarded, {status:response.status,statusText:response.statusText,headers:headers});
        });
      }).catch(silentPreviewFallback);
    });
  }).catch(silentPreviewFallback);
}

self.addEventListener("fetch", function (event) {
  /* Zwykłe wizyty zachowują dotychczasowe działanie; oznaczone podglądy
     otrzymują ochronę zanim uruchomi się kod projektu. */
  try {
    var req = event.request;
    if (!req || req.method !== "GET") return;
    if (req.mode !== "navigate") return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (req.destination === "iframe" && url.pathname === "/__rj_silent_preview__") {
      var target;
      try { target = new URL(url.searchParams.get("target"), self.location.origin); } catch (e) {}
      if (!target || target.origin !== self.location.origin || !/^https?:$/.test(target.protocol) || target.pathname === "/__rj_silent_preview__") {
        event.respondWith(Promise.resolve(silentPreviewFallback()));
      } else {
        event.respondWith(serveSilentPreview(req, target.href));
      }
      return;
    }
    /* Zwykłe ramki nie są podglądami ani wizytami projektów. */
    if (req.destination && req.destination !== "document") return;
    /* Konto i strony usługowe nie są projektami: żadnych wstrzykniętych skryptów,
       widgetów ani rejestracji wejścia przez service worker. */
    if (/^\/(?:logowanie|partnerstwo|uslugi|rejfile|rejchat|rejtools|rejsejf|konto-demo|spolecznosc|profil|testy)(?:\.html)?\/?$/i.test(url.pathname) || /^\/(?:portal|podroz)(?:\/|$)/i.test(url.pathname)) return;

    var parts = (url.pathname || "/").split("/").filter(function (s) {
      return s && !/\.html?$/i.test(s);
    });

    /* Dla podstron projektów (np. /mconline/, /JoyPad/, /Jakuplayer/) rejestrujemy
       bezpośrednie wejście w tle oraz automatycznie wstrzykujemy pigułkę rejson-widgets
       i tracker obecności LIVE. */
    if (parts.length > 0) {
      var slug = parts[0];
      event.waitUntil(registerDirectProjectVisit(slug));

      if (slug.toLowerCase() !== "rejson-widgets" && slug.toLowerCase() !== "js" && slug.toLowerCase() !== "css") {
        event.respondWith(
          fetch(req).then(function (res) {
            if (!res || res.redirected || res.status !== 200) {
              if (res && res.redirected && res.url) {
                return Response.redirect(res.url, 302);
              }
              return res;
            }
            var ct = (res.headers && res.headers.get("content-type")) || "";
            if (ct.toLowerCase().indexOf("text/html") === -1) {
              return res;
            }
            return res.text().then(function (html) {
              var safeSlug = slug.replace(/[^A-Za-z0-9._-]/g, "");
              var inject = "";
              if (html.indexOf("view-tracker.js") === -1) {
                inject += '\n<script src="/js/view-tracker.js?v=7" defer></script>';
              }
              // Sam komentarz z przykładem nie oznacza, że skrypt widżetu istnieje.
              var scriptHtml = html.replace(/<!--[\s\S]*?-->/g, "");
              var hasWidgetScript = /<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*rejson-widgets\/widget\.js(?:\?[^"']*)?\1/i.test(scriptHtml);
              if (!/<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*\/js\/rejson-account\.js(?:\?[^"']*)?\1/i.test(scriptHtml)) {
                inject += '\n<script src="/js/rejson-account.js?v=1" defer></script>';
              }
              if (!/<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*\/js\/media-capture\.js(?:\?[^"']*)?\1/i.test(scriptHtml)) {
                inject += '\n<script src="/js/media-capture.js?v=2" defer></script>';
              }
              if (!hasWidgetScript) {
                inject += '\n<script src="/rejson-widgets/widget.js?v=13" data-project="' + safeSlug + '" defer></script>';
              }
              // Efekt wyjścia tylko na dokumentach projektów pod /projekt/.
              // Skrypt działa wyłącznie, jeśli ta karta ma jednorazowy znacznik
              // z podróży rakietą. Nigdy nie dotyczy iframe.
              var portalHead = /^\/[A-Za-z0-9._-]+\//.test(url.pathname) &&
                /<head\b[^>]*>/i.test(html) && /<\/head\s*>/i.test(html) && !/<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*portal-arrival\.js(?:\?[^"']*)?\1/i.test(scriptHtml)
                ? '<link rel="stylesheet" href="/css/portal.css?v=17" data-rj-portal-style><script src="/js/portal-arrival.js?v=16"></script>' : "";
              // Zachowujemy politykę CSP projektu, ale wstawiamy wyjście przed
              // blokującymi skryptami, o ile jest już za wszystkimi meta CSP.
              var upgradedHtml = html.replace(/(<script\b[^>]*\bsrc\s*=\s*["'](?:https:\/\/rejson59\.github\.io)?\/rejson-widgets\/widget\.js)(?:\?v=(?:[0-9]|1[0-2]))?(["'])/gi, "$1?v=13$2");
              upgradedHtml = upgradedHtml.replace(/(<script\b[^>]*\bsrc\s*=\s*["'](?:https:\/\/rejson59\.github\.io)?\/js\/media-capture\.js)(?:\?v=[0-1])?(["'])/gi, "$1?v=2$2");
              // Projekty z własnym bootstrapem dostają nowe wersje bez dublowania.
              upgradedHtml = upgradedHtml.replace(/(<script\b[^>]*\bsrc\s*=\s*["'](?:https:\/\/rejson59\.github\.io)?\/js\/portal-arrival\.js)(?:\?v=[^"']*)?(["'])/gi, "$1?v=16$2");
              upgradedHtml = upgradedHtml.replace(/(<link\b[^>]*\bhref\s*=\s*["'](?:https:\/\/rejson59\.github\.io)?\/css\/portal\.css)(?:\?v=[^"']*)?(["'])/gi, "$1?v=17$2");
              var updatedHtml = upgradedHtml;
              if (portalHead) {
                var headStart = /<head\b[^>]*>/i.exec(updatedHtml);
                var headEnd = /<\/head\s*>/i.exec(updatedHtml);
                if (headStart && headEnd && headStart.index < headEnd.index) {
                  var insertAt = headStart.index + headStart[0].length;
                  var rawHead = updatedHtml.slice(insertAt, headEnd.index);
                  // Usunięcie komentarzy bez zmiany indeksów: nie udają polityki CSP.
                  var scanHead = rawHead.replace(/<!--[\s\S]*?-->/g, function (comment) { return " ".repeat(comment.length); });
                  var metas = /<meta\b[^>]*>/gi, meta;
                  while ((meta = metas.exec(scanHead))) {
                    if (/\bhttp-equiv\s*=\s*(["'])?content-security-policy\1?/i.test(meta[0])) insertAt = headStart.index + headStart[0].length + meta.index + meta[0].length;
                  }
                  updatedHtml = updatedHtml.slice(0, insertAt) + portalHead + updatedHtml.slice(insertAt);
                }
              }
              updatedHtml = /<\/body>/i.test(updatedHtml)
                ? updatedHtml.replace(/<\/body>/i, inject + "\n</body>")
                : updatedHtml + inject;
              var headers = new Headers(res.headers);
              headers.delete("content-length");
              headers.delete("content-encoding");
              // Nie osłabiaj polityki bezpieczeństwa projektu dla animacji.
              return new Response(updatedHtml, {
                status: res.status,
                statusText: res.statusText,
                headers: headers
              });
            });
          }).catch(function () {
            return fetch(req);
          })
        );
      }
    }
  } catch (e) { /* ignorujemy */ }
});

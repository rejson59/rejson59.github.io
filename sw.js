/*!
 * Rejson59 Global View Tracker & Feedback Pill Service Worker (scope: "/", v2.0)
 * Automatycznie zlicza bezpośrednie wejścia na dowolny projekt w domenie
 * https://rejson59.github.io/<NazwaProjektu>/ oraz wstrzykuje pigułkę
 * rejson-widgets bez konieczności ręcznego dopisywania skryptu w każdym repo.
 * Ignoruje ramki podglądu <iframe> (destination === "iframe").
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

self.addEventListener("fetch", function (event) {
  /* Nie wywołujemy event.respondWith() — przeglądarka ładuje stronę
     natywnie z zerowym opóźnieniem i bez ingerencji w cache projektów. */
  try {
    var req = event.request;
    if (!req || req.method !== "GET") return;
    if (req.mode !== "navigate") return;
    /* Wykluczamy podglądy <iframe> na stronie głównej (mają destination === "iframe") */
    if (req.destination && req.destination !== "document") return;

    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    /* Konto i strony usługowe nie są projektami: żadnych wstrzykniętych skryptów,
       widgetów ani rejestracji wejścia przez service worker. */
    if (/^\/(?:logowanie|partnerstwo|rejfile|rejchat|spolecznosc|profil)(?:\.html)?\/?$/i.test(url.pathname) || /^\/portal(?:\/|$)/i.test(url.pathname)) return;

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
                inject += '\n<script src="/js/view-tracker.js?v=5" defer></script>';
              }
              // Sam komentarz z przykładem nie oznacza, że skrypt widżetu istnieje.
              var scriptHtml = html.replace(/<!--[\s\S]*?-->/g, "");
              var hasWidgetScript = /<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*rejson-widgets\/widget\.js(?:\?[^"']*)?\1/i.test(scriptHtml);
              if (!/<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*\/js\/rejson-account\.js(?:\?[^"']*)?\1/i.test(scriptHtml)) {
                inject += '\n<script src="/js/rejson-account.js?v=1" defer></script>';
              }
              if (!hasWidgetScript) {
                inject += '\n<script src="/rejson-widgets/widget.js?v=8" data-project="' + safeSlug + '" defer></script>';
              }
              // Efekt wyjścia tylko na dokumentach projektów pod /projekt/.
              // Skrypt działa wyłącznie, jeśli ta karta ma jednorazowy znacznik
              // z prawdziwego wejścia przez portal. Nigdy nie dotyczy iframe.
              var portalHead = /^\/[A-Za-z0-9._-]+\//.test(url.pathname) &&
                /<head\b[^>]*>/i.test(html) && /<\/head\s*>/i.test(html) && !/<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*portal-arrival\.js(?:\?[^"']*)?\1/i.test(scriptHtml)
                ? '<link rel="stylesheet" href="/css/portal.css?v=11" data-rj-portal-style><script src="/js/portal-arrival.js?v=10"></script>' : "";
              // Zachowujemy politykę CSP projektu, ale wstawiamy wyjście przed
              // blokującymi skryptami, o ile jest już za wszystkimi meta CSP.
              var upgradedHtml = html.replace(/(<script\b[^>]*\bsrc\s*=\s*["'](?:https:\/\/rejson59\.github\.io)?\/rejson-widgets\/widget\.js)(?:\?v=[0-7])?(["'])/gi, "$1?v=8$2");
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

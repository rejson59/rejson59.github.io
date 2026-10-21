/*!
 * Rejson59 Global View Tracker Service Worker (scope: "/")
 * Automatycznie zlicza bezpośrednie wejścia na dowolny projekt w domenie
 * https://rejson59.github.io/<NazwaProjektu>/ bez konieczności ręcznego
 * dopisywania skryptu osobno w każdym repozytorium projektu.
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
    if (url.hostname.toLowerCase() !== "rejson59.github.io") return;

    var parts = (url.pathname || "/").split("/").filter(function (s) {
      return s && !/\.html?$/i.test(s);
    });

    /* Dla podstron projektów (np. /mconline/, /JoyPad/, /Jakuplayer/) rejestrujemy
       bezpośrednie wejście w tle (strona główna rejestruje swoje wejście sama). */
    if (parts.length > 0) {
      event.waitUntil(registerDirectProjectVisit(parts[0]));
    }
  } catch (e) { /* ignorujemy */ }
});

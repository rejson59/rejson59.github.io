/* ============================================================================
   Odblokowanie ruchu — RejHub (wersja 1)
   ----------------------------------------------------------------------------
   Animacje na stronie nie mogą zależeć od ustawień systemu użytkownika ani od
   tego, czy przeglądarka "oszczędza" ruch. Ten plik zdejmuje obie blokady:

     1. CSS  — wyłącza reguły `@media (prefers-reduced-motion: reduce)`
               (ustawia im `not all`, nie kasuje ich), więc animacje, przejścia
               i loadery wracają do stanu projektowego.
     2. JS   — nadpisuje `matchMedia`, żeby zapytanie o ograniczony ruch
               zwracało `false`. Skrypty (loader, app, portal, view-tracker)
               same nie wyłączą wtedy animacji.

   Wyłączniki (świadome, nie systemowe):
     • `?motion=off` w adresie            → ruch zostaje wyłączony na tej wizycie,
     • `localStorage.rejhub_motion='off'` → na stałe w tej przeglądarce,
     • `data-motion-lock` na <html>       → strona sama rezygnuje z odblokowania.

   Kontrola: `window.RejMotion` (on / off / status).
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var QUERY = "(prefers-reduced-motion: reduce)";
  var STORE_KEY = "rejhub_motion";
  var originalMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
  var patched = false;
  var touched = [];

  function stored() {
    try { return localStorage.getItem(STORE_KEY) === "off"; } catch (e) { return false; }
  }

  function paramOff() {
    try { return /(?:^|[?&])motion=off(?:&|$)/.test(location.search); } catch (e) { return false; }
  }

  function allowed() {
    if (!root || root.hasAttribute("data-motion-lock")) return false;
    return !stored() && !paramOff();
  }

  /* --- 1. matchMedia ------------------------------------------------------ */
  function patchMatchMedia() {
    if (patched || !originalMatchMedia) return;
    patched = true;
    window.matchMedia = function (query) {
      var list = originalMatchMedia(query);
      if (!allowed() || String(query).indexOf("prefers-reduced-motion") === -1) return list;
      /* Zwracamy "fałszywy" MediaQueryList: reszta pól (addEventListener,
         addListener, media) zostaje, zmienia się tylko `matches`. */
      try {
        Object.defineProperty(list, "matches", { configurable: true, get: function () { return false; } });
      } catch (e) { /* starsza przeglądarka — zostaje oryginał */ }
      return list;
    };
  }

  /* --- 2. reguły @media w arkuszach --------------------------------------- */
  function muteSheet(sheet) {
    var rules;
    try { rules = sheet.cssRules; } catch (e) { return; } /* obcy origin — nie ruszamy */
    if (!rules) return;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule || !rule.media) continue;
      var text = "";
      try { text = rule.media.mediaText || ""; } catch (e) { continue; }
      if (text.indexOf("prefers-reduced-motion") === -1) continue;
      var before = text;
      try {
        rule.media.mediaText = "not all";
        touched.push({ rule: rule, before: before });
      } catch (e) { /* reguła tylko do odczytu */ }
    }
  }

  function muteAll() {
    if (!allowed()) return;
    var sheets = document.styleSheets || [];
    for (var i = 0; i < sheets.length; i++) muteSheet(sheets[i]);
    root.setAttribute("data-motion-force", "on");
  }

  function restoreAll() {
    for (var i = 0; i < touched.length; i++) {
      try { touched[i].rule.media.mediaText = touched[i].before; } catch (e) {}
    }
    touched = [];
    root.removeAttribute("data-motion-force");
    try { localStorage.setItem(STORE_KEY, "off"); } catch (e) {}
  }

  /* Nowe arkusze (np. doładowane przez skrypt) też mają być odblokowane. */
  function watch() {
    if (!window.MutationObserver || !document.head) return;
    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var nodes = records[i].addedNodes || [];
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (!node || node.nodeType !== 1) continue;
          if (node.tagName === "LINK" || node.tagName === "STYLE") { muteAll(); return; }
        }
      }
    });
    observer.observe(document.head, { childList: true, subtree: true });
  }

  /* Elementy wstawione po starcie mają od razu grać animacje wejścia. */
  function replayNewAnimations() {
    if (!allowed() || !window.MutationObserver || !document.body) return;
    if (!document.getAnimations) return;
    var observer = new MutationObserver(function () {
      if (!document.getAnimations) return;
      var list = document.getAnimations();
      for (var i = 0; i < list.length; i++) {
        try {
          var play = list[i].playState;
          if (play === "paused") list[i].play();
        } catch (e) {}
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.RejMotion = {
    on: function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      patchMatchMedia();
      muteAll();
      return true;
    },
    off: function () {
      restoreAll();
      return false;
    },
    status: function () { return allowed() ? "on" : "off"; }
  };

  patchMatchMedia();
  muteAll();

  /* Arkusze w <head> mogą dojść po tym skrypcie — przez pierwsze ~2 s
     powtarzamy wyłączanie, żeby żadna reguła nie zdążyła zostać włączona. */
  (function retry() {
    var frames = 0;
    function step() {
      muteAll();
      frames += 1;
      if (frames < 120 && window.requestAnimationFrame) window.requestAnimationFrame(step);
    }
    if (window.requestAnimationFrame) window.requestAnimationFrame(step);
  })();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", muteAll);
  }
  window.addEventListener("load", muteAll);
  watch();
  replayNewAnimations();
})();

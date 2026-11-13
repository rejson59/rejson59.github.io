/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja
   ==========================================================================
   „Tryb ziemniaka” — lekki wygląd dla słabszych urządzeń i chwilowych lagów.

   Co robi:
   - wyłącza rozmycia (backdrop-filter), soczewkę, cienie i animacje
     (robota siedzi w css/potato.css, tutaj tylko decyzja),
   - domyślnie działa w trybie AUTO: sam włącza się, gdy urządzenie jest
     słabe (save-data, <=2 GB RAM, <=2 rdzenie) albo gdy strona naprawdę
     gubi klatki — mierzone jest tempo rysowania (rAF), a nie pojedynczy
     zacięty ruch,
   - ręcznie: wyspa → Ustawienia → „Tryb ziemniaka” (włącz/wyłącz)
     albo `RJPotato.set('on'|'off'|'auto')` z konsoli.

   Zasady, których nie łamiemy:
   - mierzenie klatek nie może samo z siebie psuć płynności (jedna pętla,
     dwa okna po 2 s, próg 45 fps, przerwa na start strony),
   - ukryta karta i tryb oszczędzania nie włączają trybu „przypadkiem”
     (przeglądarka dławi rAF w tle),
   - ręczne „wyłącz” wygrywa z automatem do końca sesji i jest pamiętane,
   - przełączenie nie przeładowuje strony i nie gubi stanu formularzy.
   ========================================================================== */
(function (window, document) {
  "use strict";
  if (!document || !document.documentElement) return;

  var KEY = "rj_potato";
  var root = document.documentElement;
  var SLOW_FPS = 45;        /* poniżej tylu klatek uznajemy okno za ciężkie */
  var WINDOW_MS = 2000;     /* długość jednego pomiaru */
  var BAD_WINDOWS = 2;      /* ile ciężkich okien z rzędu włącza tryb */
  var WARMUP_MS = 8000;     /* start strony nigdy nie jest „lagiem” */
  var startedAt = (window.performance && performance.now) ? performance.now() : Date.now();

  function store(value) {
    try {
      if (value === undefined) return localStorage.getItem(KEY);
      localStorage.setItem(KEY, value);
    } catch (e) { /* prywatny tryb / brak localStorage */ }
    return null;
  }

  function normalizeMode(value) {
    return value === "on" || value === "off" ? value : "auto";
  }

  var mode = normalizeMode(store());
  var on = false;
  var reason = "";

  /* Urządzenie, które z góry wiadomo, że jest słabe. Tylko twarde sygnały —
     liczby rdzeni bywają zaniżone, więc <=2 traktujemy jako pewnik, a nie
     każdy telefon. */
  function weakDevice() {
    try {
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && conn.saveData) return "save-data";
    } catch (e) { /* brak API */ }
    try {
      if (navigator.deviceMemory && navigator.deviceMemory <= 2) return "pamięć";
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return "rdzenie";
    } catch (e2) { /* brak API */ }
    return "";
  }

  function paint(next, why) {
    on = !!next;
    reason = why || "";
    root.classList.toggle("rj-potato", on);
    root.setAttribute("data-potato", mode);
    root.setAttribute("data-potato-on", on ? "1" : "0");
    try {
      document.dispatchEvent(new CustomEvent("rj:potato", { detail: { on: on, mode: mode, reason: reason } }));
    } catch (e3) { /* bardzo stare przeglądarki */ }
    if (on) {
      /* Efekty, które same potrafią wyłączyć się w locie, robią to od razu. */
      try { if (window.RJTilt && window.RJTilt.disable) window.RJTilt.disable("potato"); } catch (e4) { /* ignorujemy */ }
    }
    syncSwitch();
  }

  /* ------------------------------------------------------------- pigułka --- */
  var note = null;
  var noteTimer = 0;

  function noteEl() {
    if (note && (note.isConnected || document.documentElement.contains(note))) return note;
    note = document.createElement("div");
    note.id = "rj-potato-note";
    note.className = "rj-potato-note";
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    note.hidden = true;
    var text = document.createElement("span");
    text.className = "rj-potato-note-text";
    var undo = document.createElement("button");
    undo.type = "button";
    undo.className = "rj-potato-note-btn";
    undo.textContent = "Cofnij";
    undo.addEventListener("click", function () { setMode("off"); });
    note.append(text, undo);
    (document.body || root).appendChild(note);
    return note;
  }

  function say(text) {
    var el = noteEl();
    el.querySelector(".rj-potato-note-text").textContent = text;
    el.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { el.hidden = true; }, 9000);
  }

  /* ------------------------------------------------------------- decyzja --- */
  function setMode(value) {
    var next = normalizeMode(value);
    mode = next;
    store(next === "auto" ? "auto" : next);
    if (next === "on") { paint(true, "ręcznie"); say("Tryb ziemniaka włączony — mniej animacji, mniej rozmycia."); }
    else if (next === "off") {
      paint(false, "ręcznie");
      if (note) note.hidden = true;
    } else {
      auto();
    }
    return mode;
  }

  function auto() {
    var weak = weakDevice();
    if (weak) { paint(true, weak); return true; }
    paint(false, "");
    startMonitor();
    return false;
  }

  function toggle() {
    return setMode(on ? "off" : "on");
  }

  /* -------------------------------------------------------------- klatki --- */
  var frameStart = 0;
  var frames = 0;
  var slowRun = 0;
  var measuring = false;
  var watching = false;

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function tick(stamp) {
    var t = typeof stamp === "number" ? stamp : now();
    if (!measuring) { measuring = true; }
    if (document.hidden) {
      /* W tle przeglądarka dławi rAF — to nie jest lag, więc pomiar od nowa. */
      frameStart = t; frames = 0; slowRun = 0;
      return;
    }
    if (!frameStart) { frameStart = t; frames = 0; return; }
    frames++;
    var span = t - frameStart;
    if (span < WINDOW_MS) return;
    var fps = (frames * 1000) / span;
    if (t - startedAt >= WARMUP_MS) {
      if (fps < SLOW_FPS) slowRun++;
      else slowRun = Math.max(0, slowRun - 1);
      if (slowRun >= BAD_WINDOWS) {
        paint(true, "fps");
        say("Włączono tryb ziemniaka: strona gubiła klatki. Wyłączysz go w Ustawieniach wyspy.");
        return; /* pomiar kończy się, gdy tryb jest już włączony */
      }
    }
    frameStart = t; frames = 0;
  }

  function loop(stamp) {
    try { tick(stamp); } catch (e) { /* pomiar nie może psuć strony */ }
    if (!on && mode === "auto") window.requestAnimationFrame(loop);
    else watching = false;
  }

  function startMonitor() {
    if (watching || on || mode !== "auto" || !window.requestAnimationFrame) return;
    watching = true;
    frameStart = 0; frames = 0; slowRun = 0;
    window.requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------- wyspa --- */
  function syncSwitch() {
    var sw = document.querySelector('#rj-island-root [data-switch="potato"]');
    if (!sw) return;
    sw.setAttribute("aria-pressed", on ? "true" : "false");
    var hint = sw.querySelector("[data-potato-state]");
    if (hint) {
      hint.textContent = on
        ? (reason === "fps" ? "włączony automatycznie (spadki płynności)" : reason === "ręcznie" ? "włączony ręcznie" : "włączony dla tego urządzenia")
        : (mode === "off" ? "wyłączony ręcznie" : "czuwa w tle");
    }
  }

  document.addEventListener("rj:island-ready", syncSwitch);
  document.addEventListener("DOMContentLoaded", syncSwitch);

  /* --------------------------------------------------------------- start --- */
  if (mode === "on") paint(true, "ręcznie");
  else if (mode === "off") paint(false, "ręcznie");
  else auto();

  if (mode === "auto" && !on) startMonitor();

  window.RJPotato = {
    get mode() { return mode; },
    get on() { return on; },
    get reason() { return reason; },
    set: setMode,
    toggle: toggle,
    /* Do diagnostyki i testów: pokaż, jak zachowa się przy danym tempie. */
    status: function () { return { mode: mode, on: on, reason: reason }; }
  };
})(window, document);

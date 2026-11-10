/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/* RejHub 2.0 — wspólny loader.

   Zasady (jedne dla całej witryny):
   1. Nakładka jest widoczna MINIMUM 3 sekundy, nawet gdy strona jest gotowa
      w 200 ms — inaczej loader tylko „mrugnie” i wygląda na błąd.
   2. Animacja zmienia się co sekundę: trzy różne znaczniki, jeden na każdą
      sekundę. Zmiana to krótkie przygaszenie (140 ms) i podmiana klasy, więc
      dwie animacje nigdy nie grają naraz i nie ma przeskoku układu.
   3. Treść pod nakładką odsłania się DOPIERO po jej zaniknięciu — animacja
      wejścia nie nachodzi na znikający loader.

   Znaczniki pochodzą z /szklane-studio (loader-mark + mark-*). Na stronach
   ze starym loaderem (data-legacy="1") chowanie zostawiamy js/loader.js,
   żeby nie dublować harmonogramów — tutaj tylko rotacja znaczników.
   ========================================================================== */
(function () {
  "use strict";

  var overlay = document.getElementById("rj-page-loader");
  if (!overlay) return;

  var MARKS = [
    "mark-orbit", "mark-comet", "mark-dots", "mark-bounce",
    "mark-bubbles", "mark-ripple", "mark-prism", "mark-sweep",
    "mark-halo", "mark-droplet", "mark-aurora", "mark-crystal",
    "mark-typing", "mark-wave", "mark-fill", "mark-spark"
  ];

  /* Znaczniki, które słabo czytają się przez sekundę — pomijamy w rotacji. */
  var SKIP = { "mark-fill": 1, "mark-typing": 1 };

  var STAGE_MS = 1000;   /* jedna animacja = jedna sekunda */
  var MIN_MS = 3000;     /* minimum widocznej nakładki */
  var FADE_MS = 320;     /* musi zgadzać się z transition w hub/loader.css */
  var DIP_MS = 140;      /* przygaszenie przy podmianie znacznika */

  var startedAt = (window.performance && performance.now) ? performance.now() : Date.now();
  var hidden = false;
  var stageTimer = 0;
  var swapTimer = 0;
  var stageIndex = 0;
  var stageName = "";
  var rotation = [];

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  /* ---------- losowa, ale bez powtórek: trzy różne animacje ---------- */

  function pickRotation() {
    var pool = MARKS.filter(function (name) { return !SKIP[name]; });
    var picked = [];
    while (picked.length < 3 && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picked;
  }

  function swapMark(name, instant) {
    var mark = overlay.querySelector(".loader-mark");
    if (!mark) return;

    function apply() {
      for (var i = 0; i < MARKS.length; i++) mark.classList.remove(MARKS[i]);
      mark.classList.add(name);
      mark.style.opacity = "";
      stageName = name;
    }

    clearTimeout(swapTimer);
    if (instant) {
      apply();
      return;
    }
    /* przygaszenie → podmiana klasy → rozjaśnienie. Dwie animacje nie grają
       jednocześnie, a wysokość znacznika się nie zmienia (brak skoku). */
    mark.style.opacity = "0";
    swapTimer = setTimeout(apply, DIP_MS);
  }

  function startRotation() {
    rotation = pickRotation();
    stageIndex = 0;
    swapMark(rotation[0], true);

    clearInterval(stageTimer);
    stageTimer = setInterval(function () {
      if (hidden) return;
      stageIndex = (stageIndex + 1) % rotation.length;
      swapMark(rotation[stageIndex], false);
    }, STAGE_MS);
  }

  function stopRotation() {
    clearInterval(stageTimer);
    stageTimer = 0;
    clearTimeout(swapTimer);
    swapTimer = 0;
  }

  startRotation();

  /* ---------- chowanie (tylko strony bez starego loadera) ---------- */

  if (overlay.getAttribute("data-legacy") === "1") {
    /* js/loader.js prowadzi harmonogram; nasłuchujemy tylko końca, żeby
       zatrzymać rotację i nie animować czegoś, czego już nie widać. */
    if (window.MutationObserver) {
      var watcher = new MutationObserver(function () {
        if (overlay.classList.contains("is-hidden") || overlay.style.display === "none") {
          stopRotation();
          hidden = true;
          watcher.disconnect();
        }
      });
      watcher.observe(overlay, { attributes: true, attributeFilter: ["class", "style"] });
    }
    expose();
    return;
  }

  function finish() {
    stopRotation();
    document.documentElement.classList.remove("rj-loading");
    /* Treść odsłania się po zniknięciu nakładki — inaczej animacja wejścia
       grałaby pod gasnącym loaderem i wyglądało to na nałożone warstwy. */
    setTimeout(function () {
      document.documentElement.classList.remove("rj-booting");
    }, FADE_MS);
  }

  function hide() {
    if (hidden) return;
    hidden = true;
    overlay.classList.add("is-hidden");
    finish();
    /* Po zaniknięciu wyjmujemy nakładkę z układu — inaczej jej animacje
       (i warstwa na wierzchu) pracują przez całą wizytę. */
    setTimeout(function () {
      if (hidden) overlay.style.display = "none";
    }, FADE_MS + 120);
  }

  function hideAfterMinimum() {
    var left = MIN_MS - (now() - startedAt);
    setTimeout(hide, Math.max(0, left));
  }

  if (document.readyState === "complete") {
    hideAfterMinimum();
  } else {
    window.addEventListener("load", hideAfterMinimum, { once: true });
  }

  /* Bezpiecznik: gdyby jakieś zdjęcie wisiało, nakładka i tak zejdzie.
     Musi być wyraźnie dłuższy niż minimum, żeby nie ubijać rotacji. */
  setTimeout(hide, 9000);

  /* Powrót z bfcache — strona jest już gotowa, nie ma czego ładować. */
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) hide();
  });

  /* Klik w link wewnętrzny: pokaż nakładkę od razu, żeby przejście nie
     mrugało gołą tapetą. Nowe karty i pliki zostawiamy w spokoju. */
  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link) return;
    if (link.target && link.target !== "_self") return;
    if (link.hasAttribute("download")) return;
    var href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#") return;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;

    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;

    hidden = false;
    overlay.classList.remove("is-hidden");
    overlay.style.display = "";
    document.documentElement.classList.add("rj-loading");
    document.documentElement.classList.add("rj-booting");
    startedAt = now();
    startRotation();
  }, true);

  /* Wstecz/dalej bez pełnego przeładowania — nakładka nie może zostać. */
  window.addEventListener("beforeunload", function () {
    if (!hidden) overlay.classList.add("is-hidden");
  });

  function expose() {
    var api = window.RejLoader || {};
    api.minMs = Math.max(MIN_MS, api.minMs || 0);
    api.stageMs = STAGE_MS;
    api.fadeMs = FADE_MS;
    api.marks = MARKS.slice();
    api.stage = function () { return stageName; };
    api.isHidden = function () { return hidden; };
    window.RejLoader = api;
  }

  expose();
})();

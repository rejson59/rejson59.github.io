/*!
 * Loader „ciastolina" + wydajność strony:
 *
 * 1. #rj-page-loader: nakładka widoczna od razu (statyczny div w HTML),
 *    wygaszana po załadowaniu strony (z minimalnym czasem, żeby kulki
 *    zdążyły się pokazać i przejście było miękkie).
 * 2. Płynne przejścia między podstronami: kliknięcie wewnętrznego linku
 *    nakłada loader, a po ~200 ms przechodzi dalej.
 * 3. Odroczone podglądy projektów: karty mają <iframe data-src="...">,
 *    a prawdziwy src wskakuje dopiero, gdy podgląd zbliża się do viewportu
 *    (IntersectionObserver). Strona ładuje się najpierw, podglądy potem —
 *    i tylko te, które faktycznie dojedziesz.
 * 4. Nowa ramka NIGDY nie startuje w środku przewijania. Wstawienie iframe'a
 *    (nowy dokument, skrypty, kontekst GPU) w trakcie ruchu to gubiona klatka;
 *    kolejka czeka, aż strona się zatrzyma. Na słabszym sprzęcie (oszczędzanie
 *    danych / mało pamięci lub rdzeni / telefon) trzymamy też mniej żywych
 *    ramek i zwalniamy je szybciej — animacje strony zostają bez zmian.
 */
(function () {
  "use strict";

  var overlay = null;
  var ball = '<span class="dough-slot"><i class="ball"></i><i class="shadow"></i></span>' +
             '<span class="dough-slot"><i class="ball"></i><i class="shadow"></i></span>' +
             '<span class="dough-slot"><i class="ball"></i><i class="shadow"></i></span>';

  /* ---------- Animacja kulek przez Web Animations API ----------
     Niezależna od CSS @keyframes (część silników kasuje calc(var) w klatkach,
     inne potrafią wyciszyć CSS animations). Keyframes liczone w px od
     rzeczywistej wysokości kulki. CSS w loader.css zostaje jako fallback. */
  var DOUGH_MS = 1150;

  function doughBallFrames(h) {
    return [
      { transform: "translateY(" + (h * 0.12).toFixed(1) + "px) scale(1.34, 0.6)",  offset: 0,    easing: "cubic-bezier(0.2, 0.8, 0.4, 1)" },
      { transform: "translateY(" + (h * -0.25).toFixed(1) + "px) scale(0.94, 1.1)", offset: 0.20 },
      { transform: "translateY(" + (h * -1.45).toFixed(1) + "px) scale(0.88, 1.16)", offset: 0.40, easing: "ease-in" },
      { transform: "translateY(0px) scale(1, 1)",                                  offset: 0.58 },
      { transform: "translateY(" + (h * 0.18).toFixed(1) + "px) scale(1.38, 0.55)", offset: 0.67 },
      { transform: "translateY(" + (h * -0.12).toFixed(1) + "px) scale(0.95, 1.06)", offset: 0.77 },
      { transform: "translateY(" + (h * 0.06).toFixed(1) + "px) scale(1.1, 0.88)",  offset: 0.87 },
      { transform: "translateY(" + (h * 0.12).toFixed(1) + "px) scale(1.34, 0.6)",  offset: 1 }
    ];
  }

  var DOUGH_SHADOW_FRAMES = [
    { transform: "scaleX(1.3)",  opacity: 0.55, offset: 0 },
    { transform: "scaleX(0.5)",  opacity: 0.18, offset: 0.40 },
    { transform: "scaleX(0.95)", opacity: 0.42, offset: 0.58 },
    { transform: "scaleX(1.35)", opacity: 0.6,  offset: 0.67 },
    { transform: "scaleX(1.3)",  opacity: 0.55, offset: 1 }
  ];

  function animateDough(root) {
    if (!(Element.prototype && Element.prototype.animate)) return;
    var groups = (root || document).querySelectorAll(".rj-dough");
    groups.forEach(function (group) {
      if (group._rjWaapi) return;
      group._rjWaapi = true;
      var small = group.classList.contains("rj-dough--sm");
      var h = small ? 10 : 16;
      var slots = group.querySelectorAll(".dough-slot");
      var started = 0;
      var animations = [];
      slots.forEach(function (slot, i) {
        var delay = i * 130;
        var ballEl = slot.querySelector(".ball");
        var shadowEl = slot.querySelector(".shadow");
        try {
          if (ballEl) {
            animations.push(ballEl.animate(doughBallFrames(h), { duration: DOUGH_MS, iterations: Infinity, delay: delay, fill: "backwards" }));
            started++;
          }
          if (shadowEl) {
            animations.push(shadowEl.animate(DOUGH_SHADOW_FRAMES, { duration: DOUGH_MS, iterations: Infinity, delay: delay, fill: "backwards" }));
            started++;
          }
        } catch (e) { /* zostaje fallback CSS */ }
      });
      /* CSS-owe klatki wyłączamy dopiero, gdy WAAPI faktycznie przejął ruch */
      if (started) { group._rjAnimations = animations; group.classList.add("is-waapi"); }
    });
  }

  /* Tylko małe kulki podglądu — nigdy nie dotykamy animacji nakładki strony. */
  function stopPreviewDough(preview) {
    preview.querySelectorAll('.card-preview-loader .rj-dough').forEach(function (group) {
      (group._rjAnimations || []).forEach(function (animation) {
        try { if (animation && animation.cancel) animation.cancel(); } catch (e) { /* brak WAAPI */ }
      });
      group._rjAnimations = [];
      group._rjWaapi = false;
      group.classList.remove('is-waapi');
    });
  }

  function getOverlay() {
    return overlay || (overlay = document.getElementById("rj-page-loader"));
  }

  /* ---------- 1. Wygaszenie nakładki po starcie strony ---------- */
  var started = performance.now();
  /* Tyle minimum widać loader. MUSI być równe CURVE_S w bootstrapie stron:
     pasek dochodzi do ~94% dokładnie w tym momencie, więc na końcu nie ma skoku.
     3000 ms = trzy zmiany animacji znacznika (jedna na sekundę). */
  var MIN_SHOW_MS = 3000;

  /* Czas zanikania nakładki — musi zgadzać się z transition w CSS loadera. */
  var FADE_MS = 320;

  /* Podglądy (5 iframe-ów, w tym ciężki projekt z wideo) nie mogą startować,
     gdy loader jeszcze gra — zabierały główny wątek i GPU, przez co kulki
     gubiły klatki. Montujemy je dopiero po zdjęciu nakładki. */
  var pageReady = false;
  var pumpTimer = 0;
  var sweepScheduled = false;

  /* ---------- montowanie tylko w spoczynku ----------
     Nowy iframe to nowy dokument, skrypty i kontekst GPU. Wstawienie go
     w środku przewijania zawsze kończy się zgubioną klatką (na telefonie
     kilkoma). Dlatego kolejka podglądów czeka, aż strona przestanie się
     ruszać — 180 ms po ostatnim zdarzeniu przewijania. */
  var SCROLL_SETTLE_MS = 180;
  var scrollQuietUntil = 0;
  var scrollProbeRaf = 0;

  function nowMs() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function noteScroll() {
    if (scrollProbeRaf) return;
    var request = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
    var run = function () {
      scrollProbeRaf = 0;
      scrollQuietUntil = nowMs() + SCROLL_SETTLE_MS;
    };
    scrollProbeRaf = request ? request(run) : window.setTimeout(run, 16);
  }

  window.addEventListener("scroll", noteScroll, { passive: true });
  /* RejChat i inne strony z własnym przewijaniem też muszą być spokojne. */
  document.addEventListener("scroll", noteScroll, { passive: true, capture: true });

  function markPageReady() {
    if (pageReady) return;
    pageReady = true;

    /* Widoczne karty przed tymi, które są dopiero w strefie wyprzedzenia.
       Wspólna kolejka rozkłada starty; nie trzeba czekać dwa razy na timer. */
    var previews = document.querySelectorAll(".card-preview");
    previews.forEach(function (p) {
      if (p._rjWantMount && p._rjNear !== false && p._rjVisible) enqueuePreview(p, true);
    });
    previews.forEach(function (p) {
      if (p._rjWantMount && p._rjNear !== false && !p._rjVisible) enqueuePreview(p);
    });
    scheduleSweep();
  }

  function progressApi() {
    return window.RJProgress || null;
  }

  var HOLD_MS = 320; /* chwila na zobaczenie pełnego paska przed zniknięciem */

  /* Timery chowania nakładki i zerowania paska. Bez tego zdarzała się szarża:
     użytkownik klikał podstronę, nakładka wracała, a spóźniony timer z
     poprzedniego cyklu chował ją albo zerował pasek — widocznie „do tyłu”. */
  var hideTimers = [];
  function later(ms, fn) {
    var id = setTimeout(fn, ms);
    hideTimers.push(id);
    return id;
  }
  function clearHideTimers() {
    for (var i = 0; i < hideTimers.length; i++) clearTimeout(hideTimers[i]);
    hideTimers.length = 0;
  }

  function revealContent() {
    /* page-reveal.js zdejmie klasę sam, w tej samej klatce co pierwsza
       animacja wejścia — bez tego była widoczna „klatka prawdy” i mignięcie. */
    if (window.RejReveal && typeof window.RejReveal.start === "function") return;
    document.documentElement.classList.remove("rj-booting");
  }

  function hideOverlay(inst) {
    var el = getOverlay();
    if (!el || el._done) return;
    el._done = true;

    function doHide() {
      el.classList.remove("is-shown");
      el.classList.add("is-hidden");
      /* Odsłanianie należy do jednego właściciela. Gdy na stronie jest
         page-reveal.js, to on zdejmuje `rj-booting` dokładnie w klatce startu
         animacji wejścia — loader nie może zrobić tego wcześniej, bo treść
         mignie, zniknie i wróci z opóźnieniem. */
      later(FADE_MS, revealContent);
      later(7000, function () {
        /* Bezpiecznik: gdyby page-reveal nie wystartował, treść i tak wraca. */
        document.documentElement.classList.remove("rj-booting");
      });
      markPageReady();
      /* Po zaniknięciu wyjmujemy nakładkę z układu. To twardsze niż pauzowanie
         animacji (i nie ma jak zablokować zanikania): display:none zatrzymuje
         wszystkie animacje w środku, a strona na pewno nie zostaje zakryta. */
      later(600, function () {
        el.style.display = "none";
      });
    }

    /* powrót z bfcache: nie ma czego animować, chowamy natychmiast */
    if (inst) {
      var pi = progressApi();
      if (pi && pi.complete) pi.complete(true);
      doHide();
      return;
    }

    var elapsed = performance.now() - started;
    var remaining = Math.max(0, MIN_SHOW_MS - elapsed);

    /* Przed dobiciem mówimy wprost, że to już koniec. */
    later(Math.max(0, remaining - 450), function () {
      markProgress(0.97, "prawie gotowe");
    });

    /* Pasek dobija do 100% DOKŁADNIE na końcu minimalnego czasu — wtedy jest
       już przy ~94%, więc ostatnie 6% to muśnięcie, nie skok z połowy. */
    later(remaining, function () {
      var p = progressApi();
      if (p && p.complete) p.complete();
    });

    /* przez chwilę widać pełny, rozświetlony pasek — i dopiero wtedy znika */
    later(remaining + HOLD_MS, doHide);
  }

  /* ---------- Realne etapy postępu (bez fejkowego timera) ---------- */
  /* Brama postępu + podpis etapu. Wartość to maksimum, do którego pasek może
     dojść — bez zdarzenia `load` nie udajemy, że jesteśmy dalej niż 55%. */
  function markProgress(v, label) {
    var p = progressApi();
    if (p && p.set) p.set(v);
    if (label && p && p.stage) p.stage(label);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      markProgress(0.55, "składanie widoku");
    });
  } else {
    markProgress(0.55, "składanie widoku");
  }
  window.addEventListener("load", function () {
    markProgress(0.97, "ładowanie projektów");
  });

  /* ---------- Detektor gubionych klatek → tryb oszczędny ----------
     Jeśli urządzenie nie wyrabia ~38 fps, wyłączamy cienie, puls podpisu i pop
     (najdroższe efekty), zostawiając sam skok kulek. Dzięki temu animacja nigdy
     nie „zamarza”, nawet na słabym sprzęcie. */
  (function watchFramePacing() {
    var el = getOverlay();
    if (!el) return;
    /* Pomiarem nie może być sam start strony: parsowanie i pierwsze skrypty
       dają klatki po 80–300 ms i tryb oszczędny włączał się prawie zawsze,
       przez co loader „gubił” animację na normalnym sprzęcie. Interesują nas
       tylko równe klatki animacji, i to dopiero po wczytaniu dokumentu. */

    /* Jedyny wyjątek bez pomiaru: użytkownik sam włączył oszczędzanie danych.
       Liczby rdzeni nie używamy — Chrome zaniża je do 2 przy blokadach
       prywatności, więc „≤2 rdzenie” wyłączyłoby ładne cienie wielu osobom. */
    try {
      if (navigator.connection && navigator.connection.saveData) {
        el.classList.add("rj-loader--lite");
      }
    } catch (e) { /* ignorujemy */ }

    if (!window.requestAnimationFrame) return;

    var last = 0;
    var samples = [];
    var ready = false;

    function tick(ts) {
      if (!ready) { last = ts; window.requestAnimationFrame(tick); return; }
      /* Długie zadanie (parsowanie, GC, wczytywanie obrazka) to nie „słabe GPU”.
         Takie klatki pomijamy, żeby nie karać użytkownika za jeden zryw. */
      if (last) {
        var dt = ts - last;
        if (dt >= 4 && dt <= 60) samples.push(dt);
      }
      last = ts;

      if (el.classList.contains("is-hidden")) return;

      if (samples.length >= 40) {
        var sorted = samples.slice().sort(function (a, b) { return a - b; });
        var p75 = sorted[Math.floor(sorted.length * 0.75)];
        /* Dopiero trwałe < 33 fps (p75 > 30 ms) uzasadnia tryb oszczędny. */
        if (p75 > 30) el.classList.add("rj-loader--lite");
        return;
      }
      window.requestAnimationFrame(tick);
    }

    function begin() { ready = true; last = 0; window.requestAnimationFrame(tick); }
    if (document.readyState === "complete") begin();
    else window.addEventListener("load", begin, { once: true });
  })();

  /* Strona bez nakładki (np. osadzenie loadera gdzie indziej) nie może
     zablokować podglądów na zawsze — od razu zgadzamy się na montowanie. */
  if (!getOverlay()) markPageReady();

  if (document.readyState === "complete") {
    hideOverlay();
  } else {
    window.addEventListener("load", function () { hideOverlay(); });
    later(4000, function () { hideOverlay(); }); /* twardy limit bezpieczeństwa */
  }

  /* Powrót z historii (bfcache): nakładka nie może zostać na ekranie */
  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted) hideOverlay(true);
  });

  /* ---------- 2. Płynne przejścia między podstronami ---------- */
  function shouldIntercept(a) {
    if (!a) return false;
    if (a.target && a.target !== "_self") return false;
    if (a.hasAttribute("download")) return false;
    var href = a.getAttribute("href") || "";
    if (!href) return false;
    if (href.charAt(0) === "#" || /^(javascript:|mailto:|tel:)/i.test(href)) return false;
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return false;
      if (u.pathname === location.pathname && u.hash) return false; /* kotwica na tej stronie */
      return true;
    } catch (e) {
      return false;
    }
  }

  document.addEventListener("click", function (ev) {
    if (ev.defaultPrevented) return;
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!shouldIntercept(a)) return;
    var el = getOverlay();
    if (!el) return;
    ev.preventDefault();
    clearHideTimers();              /* spóźnione chowanie z poprzedniego cyklu — out */
    el._done = false;
    el.style.display = "";          /* nakładka wraca do układu */
    el.classList.add("is-shown");   /* pokazanie NATYCHMIAST (bez delayu visibility) */
    el.classList.remove("is-hidden");
    document.documentElement.classList.add("rj-booting");
    /* Pasek NIE startuje od zera — cofnięcie do 0 wyglądało jak błąd.
       Zostaje pełny, bo przejście na inną stronę to koniec tej strony. */
    var pr = progressApi();
    if (pr && pr.complete) pr.complete();
    var url = new URL(a.getAttribute("href"), location.href).href;
    setTimeout(function () {
      location.href = url;
    }, 400);
  });

  /* ---------- 3. Odroczone podglądy projektów ---------- */

  /* Bezpiecznik #gdyby-nie-było-JS-a jednak jest: loader w podglądzie
     wstrzykujemy tu (app.js generuje karty dynamicznie) */
  function ensurePreviewLoader(preview) {
    if (preview._rjLoaderReady) return;
    preview._rjLoaderReady = true;
    var el = preview.querySelector(".card-preview-loader");
    if (!el) {
      el = document.createElement("div");
      el.className = "card-preview-loader";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = '<div class="rj-dough rj-dough--sm">' + ball + "</div>";
      preview.appendChild(el);
    }

    /* awaryjna plakietka, gdy podgląd nie da się wczytać (żadnych czarnych dziur) */
    if (!preview.querySelector(".card-preview-fallback")) {
      var iframe = preview.querySelector("iframe");
      var raw = iframe ? (iframe.getAttribute("data-src") || iframe.getAttribute("src") || "") : "";
      var label = "live";
      try {
        var u = new URL(raw, location.href);
        label = (u.pathname.replace(/^\/+|\/+$/g, "") || u.hostname);
      } catch (e) { /* zostaje "live" */ }
      var fb = document.createElement("div");
      fb.className = "card-preview-fallback";
      fb.setAttribute("aria-hidden", "true");
      var strong = document.createElement("strong");
      strong.textContent = label;
      var span = document.createElement("span");
      span.className = "rj-fallback-message";
      span.textContent = "Podgląd chwilowo niedostępny";
      var hint = document.createElement("span");
      hint.className = "rj-fallback-hint";
      hint.textContent = "otwórz live ↗";
      var retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "rj-fallback-retry";
      retryBtn.setAttribute("data-rj-retry", "1");
      retryBtn.textContent = "↻ Spróbuj ponownie";
      fb.appendChild(strong);
      fb.appendChild(span);
      fb.appendChild(retryBtn);
      fb.appendChild(hint);
      preview.appendChild(fb);
    }
  }

  /* Profil urządzenia — te same fakty, których używa js/app.js (zamrażanie
     podglądów). Na słabszym sprzęcie: mniejszy zapas wczytywania, krótsze
     trzymanie ramki poza kadrem. Wygląd i animacje się nie zmieniają — zmienia
     się tylko to, ile ramek żyje jednocześnie. */
  var weakDevice = (function () {
    try {
      if (navigator.connection && navigator.connection.saveData) return true;
      if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true;
      if (window.matchMedia && window.matchMedia("(pointer: coarse), (max-width: 820px)").matches) return true;
    } catch (e) { /* brak API — zostaje tryb pełny */ }
    return false;
  })();

  /* ---------- SILNIK SZEREGOWY PODGLĄDÓW ----------
     Każdy podgląd to osobny dokument w <iframe> — własne skrypty, własne
     animacje, często WebGL i wideo. Sześć takich ramek naraz to sześć
     niezależnych pętli animacji w jednej karcie graficznej i to one powodowały
     „straszne lagi” przy przewijaniu.

     Zasady tego silnika (wygląd się nie zmienia — zmienia się tylko kolejność
     i liczba rzeczy dziejących się jednocześnie):
       1. żyje najwyżej MAX_LIVE_PREVIEWS ramek (telefon: 2),
       2. nowa ramka rusza tylko w spoczynku i tylko JEDNA naraz
          (`mountingNow`), z odstępem MOUNT_GAP_MS po poprzedniej,
       3. kolejność wyznacza realna widoczność: najbardziej widoczna karta
          pierwsza, przy remisie — ta bliżej środka ekranu,
       4. ramka, która wyjechała z kadru i z pasa LIVE_RETAIN_PX, jest
          natychmiast zwalniana — `src` znika, więc przeglądarka kasuje
          dokument, jego skrypty i kontekst GPU. Karta pokazuje wtedy swoją
          stałą okładkę (gradient + pasek adresu), nie czarną dziurę,
       5. po zatrzymaniu przewijania kolejna karta „budzi się” sama. */
  var MAX_LIVE_PREVIEWS = weakDevice ? 2 : 3;
  var LIVE_RETAIN_PX = weakDevice ? 220 : 700;
  var MOUNT_GAP_MS = weakDevice ? 650 : 380;
  var FOCUS_MIN_RATIO = 0.3;

  var PREVIEW_RELEASE_DELAY_MS = weakDevice ? 250 : 900;
  var NEAR_MARGIN = weakDevice ? "300px 0px 300px 0px" : "700px 0px 700px 0px";
  var RETAIN_MARGIN = weakDevice ? "500px 0px 500px 0px" : "1100px 0px 1100px 0px";
  var previewObserver = null, visibleObserver = null, retentionObserver = null;

  /* Ramka, która właśnie się wczytuje. Jeden slot na całą stronę — dokładnie
     to, o co chodzi w „ładuj po kolei”. */
  var mountingNow = null;

  var pumpTimer = 0;
  function schedulePump(delay) {
    if (pumpTimer) return;
    pumpTimer = setTimeout(function () {
      pumpTimer = 0;
      if (window.requestIdleCallback) window.requestIdleCallback(pump, { timeout: 400 });
      else pump();
    }, typeof delay === "number" ? delay : 70);
  }

  function scrollBusy() {
    return nowMs() < scrollQuietUntil;
  }

  function measurePreview(preview) {
    var vh = window.innerHeight || 0;
    var r = preview.getBoundingClientRect();
    var top = Math.max(0, r.top);
    var bottom = Math.min(vh, r.bottom);
    var visibleH = Math.max(0, bottom - top);
    return {
      visible: visibleH > 0,
      ratio: r.height ? Math.min(1, visibleH / r.height) : 0,
      dist: Math.abs((r.top + r.bottom) / 2 - vh / 2)
    };
  }

  function livePreviews() {
    var out = [];
    var list = document.querySelectorAll(".card-preview");
    for (var i = 0; i < list.length; i++) {
      if (list[i]._rjMounted) out.push(list[i]);
    }
    return out;
  }

  /* Kandydaci do wczytania. Źródłem prawdy jest IntersectionObserver
     (`_rjVisible`, `_rjRatio`), a pomiar prostokąta służy tylko do kolejności
     (środek ekranu) i do bezpiecznika, gdyby observer nie wystartował. */
  function rankVisible() {
    var list = document.querySelectorAll(".card-preview");
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p._rjObserved || p.classList.contains("is-failed")) continue;
      var m = measurePreview(p);
      var ratio = Math.max(m.ratio, p._rjRatio || 0);
      /* Bez IntersectionObserver (bardzo stare silniki) nie mamy sygnału
         widoczności — wtedy po prostu wczytujemy karty po kolei. */
      var visible = p._rjVisible === true || ratio > 0 || !previewObserver;
      if (!visible) continue;
      out.push({ preview: p, ratio: ratio, dist: m.dist });
    }
    out.sort(function (a, b) { return (b.ratio - a.ratio) || (a.dist - b.dist); });
    return out;
  }

  function pump() {
    if (!pageReady || document.hidden) return;
    if (scrollBusy()) {
      schedulePump(Math.max(90, scrollQuietUntil - nowMs() + 40));
      return;
    }

    var seen = rankVisible();

    /* 1. Co ma żyć: najbardziej widoczne karty. */
    var want = [];
    for (var i = 0; i < seen.length && want.length < MAX_LIVE_PREVIEWS; i++) {
      want.push(seen[i].preview);
    }

    /* 1b. Jedna ramka naraz — chyba że ta, która się właśnie wczytuje,
         przestała być potrzebna (np. użytkownik przewinął dalej). Wtedy
         przerywamy ją i oddajemy slot karcie, którą naprawdę widać. */
    if (mountingNow) {
      if (want.indexOf(mountingNow) !== -1) return;
      releasePreview(mountingNow);
    }

    /* 2. Ramki, które wyjechały poza pas zapasu, oddają zasoby od razu. */
    var live = livePreviews();
    for (var j = 0; j < live.length; j++) {
      var p = live[j];
      if (want.indexOf(p) !== -1) continue;
      if (p._rjRetained !== false) continue;
      releasePreview(p);
    }

    /* 3. Za dużo żywych — miejsce oddaje ta najmniej widoczna. */
    live = livePreviews();
    while (live.length >= MAX_LIVE_PREVIEWS) {
      var victim = null, worstRatio = 2;
      for (var k = 0; k < live.length; k++) {
        if (want.indexOf(live[k]) !== -1) continue;
        var ratio = Math.max(measurePreview(live[k]).ratio, live[k]._rjRatio || 0);
        if (ratio < worstRatio) { victim = live[k]; worstRatio = ratio; }
      }
      if (!victim) break;
      releasePreview(victim);
      live = livePreviews();
    }

    /* 3b. Ręcznie ponowiona karta idzie przed resztą. */
    for (var r = 0; r < want.length; r++) {
      var retried = want[r];
      if (!retried._rjRetryNext) continue;
      if (retried._rjMounted || retried._rjMounting) continue;
      retried._rjRetryNext = false;
      mountPreview(retried);
      return;
    }

    /* 4. Wczytaj pierwszą brakującą kartę z listy „ma żyć”. */
    if (livePreviews().length >= MAX_LIVE_PREVIEWS) return;
    for (var n = 0; n < want.length; n++) {
      var next = want[n];
      if (next._rjMounted || next._rjMounting) continue;
      if (snapshotState(next) === "ok") continue;
      mountPreview(next);
      return;
    }
  }

  if ("IntersectionObserver" in window) {
    previewObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var p = entry.target;
        p._rjNear = !!(entry.isIntersecting || entry.intersectionRatio > 0);
        if (p._rjNear) { p._rjSuspended = false; schedulePump(); }
        else p._rjWantMount = false;
      });
    }, { rootMargin: NEAR_MARGIN, threshold: 0.01 });

    visibleObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var p = entry.target;
        p._rjVisible = !!(entry.isIntersecting || entry.intersectionRatio > 0);
        p._rjRatio = entry.intersectionRatio || 0;
        if (p._rjVisible) { p._rjNear = true; p._rjSuspended = false; schedulePump(); }
        else schedulePump();
      });
    }, { threshold: 0.01 });

    /* Pas zapasu: ramka może jeszcze chwilę żyć poza kadrem (żeby powrót nie
       migał okładką), ale potem natychmiast wraca do systemu. */
    retentionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var p = entry.target;
        p._rjRetained = !!(entry.isIntersecting || entry.intersectionRatio > 0);
        clearTimeout(p._rjReleaseTimer);
        if (!p._rjRetained) {
          p._rjReleaseTimer = setTimeout(function () {
            if (!p._rjRetained) releaseFarPreview(p);
          }, PREVIEW_RELEASE_DELAY_MS);
        }
      });
    }, { rootMargin: RETAIN_MARGIN, threshold: 0 });
  }

  /* Ciężkie projekty (np. RejStream z osadzonym wideo) potrzebują czasu:
     zdarzenie load czeka na WSZYSTKIE zasoby ramki, więc krótki limit
     ogłaszał porażkę strony, która zaraz by się wczytała. */
  var PREVIEW_TIMEOUT_MS = 15000;
  var PREVIEW_RETRY_MS = 15000;

  function previewIframeState(iframe) {
    /* "painted" | "blank" — blank = about:blank / puste body / nic nie namalowane */
    try {
      var w = iframe.contentWindow;
      var href = w && w.location ? w.location.href : "";
      if (!href || href === "about:blank") return "blank";
      var d = iframe.contentDocument;
      if (!d || !d.body) return "blank";
      var hasContent = d.body.children.length > 0 || (d.body.textContent || "").trim().length > 0;
      return hasContent ? "painted" : "blank";
    } catch (e) {
      return "painted"; /* obcy origin — nie sprawdzimy, ufamy przeglądarce */
    }
  }

  /* Stan statycznego zrzutu (zamrożenie robi js/app.js na słabszych urządzeniach) */
  function snapshotState(preview) {
    var frame = preview.querySelector(".card-preview-frame");
    if (!frame) return "none";
    var img = frame.querySelector(".card-preview-snapshot");
    if (!img) return "none";
    if (!img.getAttribute("src")) return "broken";
    if (img.complete) return img.naturalWidth > 0 ? "ok" : "broken";
    return "pending";
  }

  /* Cofnięcie zepsutego zamrożenia — podgląd wraca do żywej ramki */
  function unfreezePreview(preview) {
    var frame = preview.querySelector(".card-preview-frame");
    var iframe = preview.querySelector("iframe");
    if (frame) {
      frame.classList.remove("is-frozen");
      frame._frozenDone = false;
      frame._freezeScheduled = false;
      var img = frame.querySelector(".card-preview-snapshot");
      if (img && img.parentNode) img.parentNode.removeChild(img);
    }
    if (iframe) {
      iframe.style.display = "";
      var desired = iframe.getAttribute("data-src");
      var current = "";
      try { current = iframe.contentWindow.location.href; } catch (e) { current = ""; }
      if (!document.body.classList.contains("rj-home") && desired && (!current || current === "about:blank")) {
        try { iframe.src = desired; } catch (e) { /* ignorujemy */ }
      }
    }
  }

  function settlePreview(preview, ok, safeFallback) {
    if (preview._rjSettled) return;
    if (mountingNow === preview) mountingNow = null;
    preview._rjSettled = true;
    preview._rjMounting = false;
    stopPreviewDough(preview);
    clearTimeout(preview._rjTimer);
    clearTimeout(preview._rjRecheck);
    preview.classList.remove("is-loading");
    preview.classList.toggle("is-loaded", !!ok);
    preview.classList.toggle("is-failed", !ok);
    preview.classList.toggle("is-safe-fallback", !!safeFallback);
    /* Slot jest wolny — następna karta dostanie swoją ramkę po krótkiej pauzie,
       żeby wstawienie nowego dokumentu nie trafiło w tę samą klatkę. */
    schedulePump(ok ? MOUNT_GAP_MS : 1200);
    var message = preview.querySelector(".rj-fallback-message");
    if (message) message.textContent = safeFallback ? "Podgląd dostępny po otwarciu projektu" : "Podgląd chwilowo niedostępny";

    /* Sygnał dla cichego łapacza błędów (js/error-reporter.js):
       nieudany podgląd to dokładnie ten rodzaj usterki, o której użytkownik milczy */
    if (!ok && !safeFallback) {
      try {
        var broken = preview.querySelector("iframe");
        document.dispatchEvent(new CustomEvent("rj:preview-failed", {
          detail: {
            src: broken ? (broken.getAttribute("data-src") || broken.getAttribute("src") || "") : ""
          }
        }));
      } catch (e) { /* bardzo stare przeglądarki — trudno */ }
    }
  }

  /* Nigdy nie ładuj aktywnej miniatury, dopóki worker nie potwierdzi, że
     potrafi wyciszyć ją przed wykonaniem kodu projektu. Bez workera zostaje
     dostępny link i fallback; osobne projekty nie zmieniają swoich ustawień. */
  var silentWorkerReady = null;
  function ensureSilentPreviewWorker() {
    if (silentWorkerReady) return silentWorkerReady;
    silentWorkerReady = new Promise(function (resolve) {
      if (!navigator.serviceWorker || typeof MessageChannel !== "function") { resolve(false); return; }
      var done = false, timer;
      function finish(ok) {
        if (done) return;
        done = true; clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", check);
        resolve(ok);
      }
      function check() {
        var controller = navigator.serviceWorker.controller;
        if (!controller || done) return;
        var channel = new MessageChannel();
        channel.port1.onmessage = function (event) {
          channel.port1.close();
          if (event.data === "rj-silent-preview-v1") finish(true);
        };
        try { controller.postMessage("rj-silent-preview-v1", [channel.port2]); } catch (e) { channel.port1.close(); }
      }
      navigator.serviceWorker.addEventListener("controllerchange", check);
      timer = setTimeout(function () { finish(false); }, 8000);
      check();
      /* Szybka kontrola: wdrożenie bez /sw.js nie ma po co czekać 8 s. */
      if (typeof fetch === "function") {
        fetch("/sw.js?v=2", { method: "HEAD", cache: "no-store" }).then(function (res) {
          if (!res || !res.ok) finish(false);
        }).catch(function () { finish(false); });
      }
      navigator.serviceWorker.register("/sw.js?v=2", { scope:"/", updateViaCache:"none" }).then(function (reg) {
        if (reg && reg.update) reg.update().catch(function () {});
        check();
      }).catch(function () { finish(false); });
    });
    var task = silentWorkerReady;
    task.then(function (ok) { if (!ok && silentWorkerReady === task) silentWorkerReady = null; });
    return task;
  }

  /* Jedno wejście do montowania: wybiera żywą ramkę albo zostawia statyczny zrzut.
     Gwarancja: podgląd NIGDY nie kończy jako samo tło — zawsze jest kulka,
     wczytana strona, statyczny zrzut albo plakietka z ponowieniem. */
  function mountPreview(preview) {
    var iframe = preview.querySelector("iframe[data-src]");
    if (!iframe) return;
    /* Jeden dokument naraz — druga ramka poczeka na zwolnienie slotu. */
    if (mountingNow && mountingNow !== preview) return;
    if (preview._rjMounting) return; /* próba już trwa */
    if (preview._rjSettled && preview.classList.contains("is-loaded")) return;
    /* po jawnym niepowodzeniu ponawiamy tylko przez przycisk „Spróbuj ponownie" */
    if (preview._rjSettled && preview.classList.contains("is-failed")) return;

    /* Podczas gry loadera nic ciężkiego: zapamiętujemy chęć i wracamy później.
       Dzięki temu animacja kulek ma cały wątek dla siebie. */
    if (!pageReady) {
      preview._rjWantMount = true;
      return;
    }
    preview._rjWantMount = false;

    var frame = preview.querySelector(".card-preview-frame");
    if (frame) {
      var snap = snapshotState(preview);
      if (snap === "ok") return; /* widoczny statyczny zrzut — nie ruszamy */

      if (snap === "pending") {
        /* zrzut jeszcze się dekoduje — dajmy mu chwilę, ale nie w nieskończoność */
        var pendingImg = frame.querySelector(".card-preview-snapshot");
        if (pendingImg && !pendingImg._rjWatch) {
          pendingImg._rjWatch = true;
          pendingImg.addEventListener("error", function () {
            unfreezePreview(preview);
            preview._rjMounting = false;
            preview._rjSettled = false;
            mountPreview(preview);
          });
          setTimeout(function () {
            /* zrzut, który nie zdekodował się w 3 s, traktujemy jak zepsuty —
               inaczej podgląd zostałby wiecznym tłem */
            if (snapshotState(preview) === "ok") return;
            unfreezePreview(preview);
            preview._rjMounting = false;
            preview._rjSettled = false;
            mountPreview(preview);
          }, 3000);
        }
        return;
      }

      /* is-frozen bez działającego obrazu (albo zepsuty zrzut) = ślepy zaułek */
      if (frame.classList.contains("is-frozen") || snap === "broken") unfreezePreview(preview);
    }

    preview._rjSuspended = false;
    mountingNow = preview;
    var mountToken = preview._rjMountToken = (preview._rjMountToken || 0) + 1;
    preview._rjMounting = true;
    preview._rjMounted = true;
    preview._rjSettled = false;
    preview.classList.remove("is-failed", "is-loaded");
    preview.classList.add("is-loading");
    ensurePreviewLoader(preview);
    animateDough(preview.querySelector(".card-preview-loader"));

    var attempt = preview._rjAttempts || 0;
    preview._rjAttempts = attempt + 1;

    var base = iframe.getAttribute("data-src") || "";
    /* druga próba idzie ze świeżym adresem — omija cache przeglądarki */
    var url = attempt > 0 ? base + (base.indexOf("?") === -1 ? "?" : "&") + "rjretry=" + Date.now() : base;

    function finish(ok, safeFallback) {
      if (preview._rjSettled) return;
      settlePreview(preview, ok, safeFallback);
    }

    var retried = false; /* licznik prób w ramach TEGO montowania */

    function retryOrFail() {
      if (preview._rjSettled) return;
      if (!retried) {
        retried = true;
        try {
          iframe.src = url;
        } catch (e) {
          finish(false);
          return;
        }
        armWatchdog(PREVIEW_RETRY_MS);
        return;
      }
      finish(false);
    }

    function armWatchdog(delay) {
      clearTimeout(preview._rjTimer);
      preview._rjTimer = setTimeout(function () {
        if (preview._rjSettled) return;
        /* load mógł nie wystrzelić (wiszące subzasoby), ale treść jest na ekranie */
        if (previewIframeState(iframe) === "painted") {
          finish(true);
          return;
        }
        retryOrFail();
      }, delay || PREVIEW_TIMEOUT_MS);
    }

    function onLoad() {
      if (preview._rjSettled) return;
      if (previewIframeState(iframe) === "painted") {
        finish(true);
        return;
      }
      /* ramka wciąż pusta (np. about:blank) — chwila i ponawiamy */
      clearTimeout(preview._rjRecheck);
      preview._rjRecheck = setTimeout(function () {
        if (preview._rjSettled) return;
        if (previewIframeState(iframe) === "painted") finish(true);
        else retryOrFail();
      }, 1200);
    }

    function onError() {
      if (preview._rjSettled) return;
      retryOrFail();
    }

    preview._rjOnLoad = onLoad;
    preview._rjOnError = onError;

    if (!iframe._rjWired) {
      iframe._rjWired = true;
      iframe.addEventListener("load", function () {
        if (typeof preview._rjOnLoad === "function") preview._rjOnLoad();
      });
      iframe.addEventListener("error", function () {
        if (typeof preview._rjOnError === "function") preview._rjOnError();
      });
    }

    function loadPreview() {
      if (!document.body.classList.contains("rj-home")) {
        iframe.src = url; armWatchdog();
        if (retentionObserver) retentionObserver.observe(preview);
        return;
      }
      var target;
      try { target = new URL(url, location.href); } catch (e) { finish(false); return; }
      if (!/^https?:$/.test(target.protocol)) { finish(false, true); return; }
      /* Inna domena (np. rejhub.vercel.app vs rejson59.github.io) nie może iść
         przez lokalny worker pośredniczący — ładujemy ją wprost. Ramka dostaje
         piaskownicę bez nawigacji okna głównego, więc podgląd zostaje podglądem. */
      if (target.origin !== location.origin) {
        iframe.name = "rejson-card-preview";
        iframe.setAttribute("allow", "autoplay 'none'");
        if (!iframe.getAttribute("sandbox")) {
          iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
        }
        try { iframe.src = target.href; } catch (e) { finish(false); return; }
        armWatchdog();
        if (retentionObserver) retentionObserver.observe(preview);
        return;
      }
      iframe.name = "rejson-card-preview";
      iframe.setAttribute("allow", "autoplay 'none'");
      var proxy = new URL("/__rj_silent_preview__", location.origin);
      proxy.searchParams.set("target", target.href);
      var proxyUrl = proxy.href;
      ensureSilentPreviewWorker().then(function (ready) {
        if (!document.documentElement.contains(preview) || !preview._rjMounting || preview._rjMountToken !== mountToken) return;
        if (preview._rjNear === false) {
          preview._rjMounting = preview._rjMounted = false;
          preview._rjSuspended = true;
          preview.classList.remove("is-loading");
          stopPreviewDough(preview);
          return;
        }
        if (!ready) {
          /* Brak workera (np. wdrożenie bez /sw.js) nie może zabić podglądu —
             wtedy po prostu ładujemy stronę wprost. */
          try { iframe.src = target.href; } catch (e) { finish(false); return; }
          armWatchdog();
          if (retentionObserver) retentionObserver.observe(preview);
          return;
        }
        /* Adres pośredni znajduje się w scope głównego workera, również gdy
           prawdziwy projekt ma już własny, węższy service worker. */
        navigator.serviceWorker.getRegistration(proxyUrl).then(function (registration) {
          if (!preview._rjMounting || preview._rjMountToken !== mountToken) return;
          var controller = navigator.serviceWorker.controller;
          if (!registration || !registration.active || !controller || registration.active.scriptURL !== controller.scriptURL) { finish(false, true); return; }
          try { iframe.src = proxyUrl; } catch (e) { finish(false); return; }
          armWatchdog();
          if (retentionObserver) retentionObserver.observe(preview);
        }).catch(function () { finish(false, true); });
      });
    }
    try { loadPreview(); } catch (e) { finish(false); }
  }

  /* Zwolnienie zachowuje link, geometrię karty, błędy i sprawdzone migawki.
     Nie zmieniamy licznika prób na kolejny adres z pominięciem cache: po
     powrocie jest zwykłe ładowanie, a nie ręczne ponowienie błędu. */
  /* Zwolnienie ramki: `src` znika, więc przeglądarka kasuje cały dokument
     podglądu razem z jego skryptami, animacjami i kontekstem GPU. Zostaje
     okładka karty (.card-preview-frame ma firmowy gradient) — nigdy czarna
     dziura. `data-src` jest nietknięte, więc powrót to jedno przypisanie. */
  function releasePreview(preview) {
    if (!preview || !preview._rjMounted) return;
    if (mountingNow === preview) mountingNow = null;
    if (preview.contains(document.activeElement)) return;
    if (snapshotState(preview) !== "none") return; /* jest statyczny zrzut — nie ruszamy */
    var iframe = preview.querySelector("iframe[data-src]");
    if (!iframe) return;
    var failed = preview.classList.contains("is-failed");
    clearTimeout(preview._rjTimer);
    clearTimeout(preview._rjRecheck);
    preview._rjOnLoad = preview._rjOnError = null;
    stopPreviewDough(preview);
    preview._rjMounting = false;
    preview._rjMounted = false;
    preview._rjAttempts = 0;
    preview._rjSuspended = !failed;
    if (!failed) preview._rjSettled = false;
    preview.classList.remove("is-loading", "is-loaded");
    iframe.removeAttribute("src");
    if (retentionObserver) retentionObserver.unobserve(preview);
  }

  /* To samo, ale tylko dla karty, której naprawdę nie ma już w pobliżu. */
  function releaseFarPreview(preview) {
    if (!document.documentElement.contains(preview) || preview._rjNear === true) return;
    releasePreview(preview);
  }

  /* Zgłoszenie „ta karta chce podgląd”. Silnik sam zdecyduje kiedy i czy
     w ogóle — kolejność wynika z realnej widoczności, nie z kolejności zdarzeń. */
  function enqueuePreview(preview) {
    if (!pageReady) { preview._rjWantMount = true; return; }
    schedulePump(0);
  }

  /* Ręczne ponowienie z plakietki „Spróbuj ponownie" */

  function retryPreview(preview) {
    if (!preview) return;
    clearTimeout(preview._rjTimer);
    clearTimeout(preview._rjRecheck);
    preview._rjSettled = false;
    preview._rjMounting = false;
    preview._rjMounted = false;
    preview._rjAttempts = 0;
    preview.classList.remove("is-failed", "is-loaded", "is-loading");
    unfreezePreview(preview);
    /* Ręczne ponowienie ma pierwszeństwo, ale musi zmieścić się w slocie
       silnika — jeśli właśnie wczytuje się inna karta, ta ruszy po niej. */
    if (mountingNow && mountingNow !== preview) {
      preview._rjRetryNext = true;
      schedulePump(0);
      return;
    }
    mountPreview(preview);
  }

  /* Bezpiecznik: gdyby IntersectionObserver nie wystrzelił (bfcache, nietypowy
     layout, skok do kotwicy), montujemy podglądy blisko widoku ręcznie. */
  function sweepPreviews() {
    if (!pageReady) return; /* loader jeszcze gra — nie zabieramy mu klatek */
    var previews = document.querySelectorAll(".card-preview");
    var vh = window.innerHeight || 0;
    /* Ten sam zapas co observer — inaczej bezpiecznik zaciągałby ramki
       ze 800 px, niwecząc mniejszy margines na słabszym sprzęcie. */
    var margin = weakDevice ? 300 : 700;
    previews.forEach(function (p) {
      if (p._rjSettled || p._rjMounting) return;
      if (snapshotState(p) === "ok") return;
      var r = p.getBoundingClientRect();
      if (!r.width && !r.height) return; /* ukryta sekcja */
      if (r.bottom > -margin && r.top < vh + margin) { p._rjNear = true; p._rjSuspended = false; }
    });
    schedulePump(0);
  }

  /* Skanowanie odroczone do czasu wolnego wątku: render kart przez app.js
     potrafi dodać kilkadziesiąt węzłów w jednej chwili, a każde wywołanie
     scan() robiło pełny querySelectorAll po całym dokumencie. */
  var scanScheduled = false;

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    var run = function () {
      scanScheduled = false;
      scan(document);
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 300 });
    else setTimeout(run, 60);
  }

  function scan(root) {
    var scope = root || document;
    var previews = scope.querySelectorAll(".card-preview");
    previews.forEach(function (p) {
      if (p._rjObserved) return;
      var iframe = p.querySelector("iframe[data-src]");
      if (!iframe) return;
      ensurePreviewLoader(p);
      p._rjObserved = true;
      p._rjVisible = false;
      if (!previewObserver) {
        /* bardzo stare przeglądarki — bez sygnału widoczności silnik
           wczytuje karty po kolei, w kolejności dokumentu */
        enqueuePreview(p);
        return;
      }
      previewObserver.observe(p);
      if (visibleObserver) visibleObserver.observe(p);

      /* siatka bezpieczeństwa: kursor lub fokus montuje podgląd natychmiast,
         nawet gdyby observer się spóźnił (np. po skoku do kotwicy) */
      p.addEventListener("pointerenter", function () { mountPreview(p); }, { passive: true });
      p.addEventListener("focus", function () { mountPreview(p); });
      p.addEventListener("focusout", function () {
        if (p._rjRetained !== false) return;
        clearTimeout(p._rjReleaseTimer);
        p._rjReleaseTimer = setTimeout(function () {
          if (!p._rjRetained) releaseFarPreview(p);
        }, PREVIEW_RELEASE_DELAY_MS);
      });
    });
  }

  /* karty renderowane przez app.js dopiero po pobraniu danych */
  if ("MutationObserver" in window) {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        for (var j = 0; j < muts[i].addedNodes.length; j++) {
          var node = muts[i].addedNodes[j];
          if (node.nodeType !== 1) continue;
          if (node.matches('.card-preview') || node.querySelector('.card-preview') ||
              (node.matches('iframe[data-src]') && node.closest('.card-preview'))) {
            scheduleScan();
            return;
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* --- ręczne ponowienie: przycisk w plakietce (przechwytuje klik przed linkiem karty) --- */
  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest("[data-rj-retry]") : null;
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    retryPreview(btn.closest(".card-preview"));
  }, true);

  /* --- sweep: montowanie bez polegania wyłącznie na IntersectionObserver --- */
  function scheduleSweep() {
    if (sweepScheduled) return;
    sweepScheduled = true;
    var run = function () {
      sweepScheduled = false;
      sweepPreviews();
    };
    /* Jeden pomiar po krótkim oddechu, zamiast mierzenia każdej karty
       przy każdej klatce przewijania. IntersectionObserver działa niezależnie. */
    setTimeout(run, 200);
  }

  /* Observer już śledzi ruch: pełny pomiar na scroll tylko jako fallback. */
  if (!previewObserver) window.addEventListener("scroll", scheduleSweep, { passive: true });
  window.addEventListener("resize", scheduleSweep, { passive: true });
  window.addEventListener("pageshow", function () {
    /* powrót z bfcache: ramki bywają puste, a klasy mówią „wczytane" */
    document.querySelectorAll(".card-preview.is-loaded").forEach(function (p) {
      var iframe = p.querySelector("iframe");
      if (iframe && previewIframeState(iframe) === "blank") {
        p._rjSettled = false;
        p._rjMounting = false;
        p._rjMounted = false;
        p.classList.remove("is-loaded");
        mountPreview(p);
      }
    });
    sweepPreviews();
  });
  [700, 1800, 4000, 8000].forEach(function (delay) {
    setTimeout(sweepPreviews, delay);
  });

  window.RJLoader = {
    scan: scan,
    mountPreview: mountPreview,
    retry: retryPreview,
    sweep: sweepPreviews,
    /* `refresh` budzi silnik po zdarzeniu z zewnątrz — np. po tym, jak
       js/app.js zamienił ciężki podgląd w statyczny zrzut. */
    refresh: function () { schedulePump(0); },
    liveCount: function () { return livePreviews().length; }
  };

  /* nakładka strony: kulki napędzone natychmiast (defer ⇒ DOM już sparsowany) */
  var initialOverlay = getOverlay();
  if (initialOverlay) animateDough(initialOverlay);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { scan(document); });
  } else {
    scan(document);
  }
})();

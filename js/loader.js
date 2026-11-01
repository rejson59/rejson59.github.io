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
 *    (IntersectionObserver, rootMargin 500px). Strona ładuje się najpierw,
 *    podglądy potem — i tylko te, które faktycznie dojedziesz.
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
     pasek dochodzi do ~94% dokładnie w tym momencie, więc na końcu nie ma skoku. */
  var MIN_SHOW_MS = 1800;

  /* Podglądy (5 iframe-ów, w tym ciężki projekt z wideo) nie mogą startować,
     gdy loader jeszcze gra — zabierały główny wątek i GPU, przez co kulki
     gubiły klatki. Montujemy je dopiero po zdjęciu nakładki. */
  var pageReady = false;

  function markPageReady() {
    if (pageReady) return;
    pageReady = true;

    /* Podglądy, które już zgłosiły chęć (były w zasięgu ekranu), montujemy
       POJEDYNCZO. Wcześniej pięć iframe-ów (w tym projekt z wideo) startowało
       w jednej klatce — na słabszym sprzęcie oznaczało to kilkusekundowe
       zamrożenie strony zaraz po zniknięciu loadera. */
    setTimeout(function () {
      var queue = [];
      var previews = document.querySelectorAll(".card-preview");
      previews.forEach(function (p) {
        if (p._rjWantMount) queue.push(p);
      });

      var el = getOverlay();
      var lite = !!(el && el.classList.contains("rj-loader--lite"));
      var gap = lite ? 320 : 150;

      (function next(i) {
        if (i >= queue.length) { scheduleSweep(); return; }
        enqueuePreview(queue[i]);
        /* słaby sprzęt: kolejna ramka czeka na wolną chwilę, nie na zegarek */
        if (lite && window.requestIdleCallback) {
          window.requestIdleCallback(function () { next(i + 1); }, { timeout: 800 });
        } else {
          setTimeout(function () { next(i + 1); }, gap);
        }
      })(0);
    }, 150);
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

  function hideOverlay(inst) {
    var el = getOverlay();
    if (!el || el._done) return;
    el._done = true;

    function doHide() {
      el.classList.remove("is-shown");
      el.classList.add("is-hidden");
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
    var frames = 0;

    function tick(ts) {
      if (last) samples.push(ts - last);
      last = ts;
      frames++;

      if (frames < 24 && !el.classList.contains("is-hidden")) {
        window.requestAnimationFrame(tick);
        return;
      }
      if (!samples.length) return;

      samples.sort(function (a, b) { return a - b; });
      var p75 = samples[Math.floor(samples.length * 0.75)];
      if (p75 > 26) el.classList.add("rj-loader--lite");
    }

    window.requestAnimationFrame(tick);
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

  var previewObserver = null;
  if ("IntersectionObserver" in window) {
    previewObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          enqueuePreview(entry.target);
        }
      });
    }, { rootMargin: "500px 0px 500px 0px", threshold: 0.01 });
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
      if (desired && (!current || current === "about:blank")) {
        try { iframe.src = desired; } catch (e) { /* ignorujemy */ }
      }
    }
  }

  function settlePreview(preview, ok) {
    if (preview._rjSettled) return;
    preview._rjSettled = true;
    preview._rjMounting = false;
    stopPreviewDough(preview);
    clearTimeout(preview._rjTimer);
    clearTimeout(preview._rjRecheck);
    preview.classList.remove("is-loading");
    preview.classList.toggle("is-loaded", !!ok);
    preview.classList.toggle("is-failed", !ok);

    /* Sygnał dla cichego łapacza błędów (js/error-reporter.js):
       nieudany podgląd to dokładnie ten rodzaj usterki, o której użytkownik milczy */
    if (!ok) {
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

  /* Jedno wejście do montowania: wybiera żywą ramkę albo zostawia statyczny zrzut.
     Gwarancja: podgląd NIGDY nie kończy jako samo tło — zawsze jest kulka,
     wczytana strona, statyczny zrzut albo plakietka z ponowieniem. */
  function mountPreview(preview) {
    var iframe = preview.querySelector("iframe[data-src]");
    if (!iframe) return;
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

    function finish(ok) {
      if (preview._rjSettled) return;
      settlePreview(preview, ok);
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

    try {
      iframe.src = url;
    } catch (e) {
      finish(false);
      return;
    }
    armWatchdog();
    if (previewObserver) previewObserver.unobserve(preview);
  }

  /* Ręczne ponowienie z plakietki „Spróbuj ponownie" */
  /* Jedna wspólna kolejka dla observera i scrolla: również po pierwszym
     ekranie nie uruchamiamy wielu ciężkich stron w tej samej klatce. */
  var previewQueue = [], previewQueueTimer = null;
  function drainPreviewQueue() {
    previewQueueTimer = null;
    var started = false;
    while (previewQueue.length) {
      var next = previewQueue.shift();
      next._rjQueued = false;
      if (!document.documentElement.contains(next) || next._rjMounting || next._rjSettled) continue;
      mountPreview(next);
      started = true;
      break;
    }
    /* Okno odpoczynku trwa także po opróżnieniu kolejki, aby następne
       wywołania observera w tej samej klatce nie ominęły odstępu. */
    if (started || previewQueue.length) previewQueueTimer = setTimeout(drainPreviewQueue, 220);
  }
  function enqueuePreview(preview) {
    if (!pageReady) { preview._rjWantMount = true; return; }
    if (preview._rjQueued || preview._rjMounting || preview._rjSettled) return;
    preview._rjQueued = true;
    previewQueue.push(preview);
    if (!previewQueueTimer) drainPreviewQueue();
  }

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
    mountPreview(preview);
  }

  /* Bezpiecznik: gdyby IntersectionObserver nie wystrzelił (bfcache, nietypowy
     layout, skok do kotwicy), montujemy podglądy blisko widoku ręcznie. */
  function sweepPreviews() {
    if (!pageReady) return; /* loader jeszcze gra — nie zabieramy mu klatek */
    var previews = document.querySelectorAll(".card-preview");
    var vh = window.innerHeight || 0;
    previews.forEach(function (p) {
      if (p._rjSettled || p._rjMounting) return;
      if (snapshotState(p) === "ok") return;
      var r = p.getBoundingClientRect();
      if (!r.width && !r.height) return; /* ukryta sekcja */
      if (r.bottom > -500 && r.top < vh + 500) enqueuePreview(p);
    });
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
      if (!previewObserver) {
        /* bardzo stare przeglądarki — po prostu ładuj po kolei */
        enqueuePreview(p);
        return;
      }
      p._rjObserved = true;
      previewObserver.observe(p);

      /* siatka bezpieczeństwa: kursor lub fokus montuje podgląd natychmiast,
         nawet gdyby observer się spóźnił (np. po skoku do kotwicy) */
      p.addEventListener("pointerenter", function () { mountPreview(p); }, { passive: true });
      p.addEventListener("focus", function () { mountPreview(p); });
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
  var sweepScheduled = false;
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

  window.addEventListener("scroll", scheduleSweep, { passive: true });
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
    sweep: sweepPreviews
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

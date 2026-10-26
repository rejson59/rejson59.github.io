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
 *    (IntersectionObserver, rootMargin ~900px). Strona ładuje się najpierw,
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
      slots.forEach(function (slot, i) {
        var delay = i * 130;
        var ballEl = slot.querySelector(".ball");
        var shadowEl = slot.querySelector(".shadow");
        try {
          if (ballEl) ballEl.animate(doughBallFrames(h), { duration: DOUGH_MS, iterations: Infinity, delay: delay, fill: "backwards" });
          if (shadowEl) shadowEl.animate(DOUGH_SHADOW_FRAMES, { duration: DOUGH_MS, iterations: Infinity, delay: delay, fill: "backwards" });
        } catch (e) { /* zostaje fallback CSS */ }
      });
    });
  }

  function getOverlay() {
    return overlay || (overlay = document.getElementById("rj-page-loader"));
  }

  /* ---------- 1. Wygaszenie nakładki po starcie strony ---------- */
  var started = performance.now();
  var MIN_SHOW_MS = 1000;  /* kulki mają legalną chwilę występu — czytelne, ale nie męczące */

  function hideOverlay(inst) {
    var el = getOverlay();
    if (!el || el._done) return;
    el._done = true;
    var elapsed = performance.now() - started;
    var wait = inst ? 0 : Math.max(0, MIN_SHOW_MS - elapsed);
    setTimeout(function () {
      el.classList.remove("is-shown");
      el.classList.add("is-hidden");
    }, wait);
  }

  if (document.readyState === "complete") {
    hideOverlay();
  } else {
    window.addEventListener("load", function () { hideOverlay(); });
    setTimeout(function () { hideOverlay(); }, 4000); /* twardy limit bezpieczeństwa */
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
    el._done = false;
    el.classList.add("is-shown");   /* pokazanie NATYCHMIAST (bez delayu visibility) */
    el.classList.remove("is-hidden");
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
    var el = document.createElement("div");
    el.className = "card-preview-loader";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="rj-dough rj-dough--sm">' + ball + "</div>";
    preview.appendChild(el);
    animateDough(el);
  }

  var previewObserver = null;
  if ("IntersectionObserver" in window) {
    previewObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          mountPreview(entry.target);
        }
      });
    }, { rootMargin: "900px 0px 900px 0px", threshold: 0.01 });
  }

  function mountPreview(preview) {
    if (preview._rjMounted) return;
    var iframe = preview.querySelector("iframe[data-src]");
    if (!iframe) return;
    /* zamrożone screenshoty (słabsze urządzenia) nie potrzebują ramki */
    var frame = preview.querySelector(".card-preview-frame");
    if (frame && frame.classList.contains("is-frozen")) return;
    preview._rjMounted = true;
    preview.classList.add("is-loading");
    iframe.addEventListener("load", function () {
      preview.classList.remove("is-loading");
      preview.classList.add("is-loaded");
    }, { once: true });
    iframe.src = iframe.getAttribute("data-src");
    if (previewObserver) previewObserver.unobserve(preview);
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
        mountPreview(p);
        return;
      }
      p._rjObserved = true;
      previewObserver.observe(p);
    });
    animateDough(document);
  }

  /* karty renderowane przez app.js dopiero po pobraniu danych */
  if ("MutationObserver" in window) {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes.length) {
          scan(document);
          return;
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.RJLoader = { scan: scan, mountPreview: mountPreview };

  /* nakładka strony: kulki napędzone natychmiast (defer ⇒ DOM już sparsowany) */
  animateDough(document);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { scan(document); });
  } else {
    scan(document);
  }
})();

/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   ============================================================================
   Topbar „Dwie taflę” — scalanie po przewinięciu.
   ----------------------------------------------------------------------------
   Na starcie widać dwie kapsuły (marka + nawigacja). Gdy strona ruszy się
   w dół, dochodzi klasa `is-merged` i w ich miejsce wjeżdża jedna szeroka
   tafla. Wystarczy jedna klasa, całe przejście robi CSS.
   ========================================================================== */
(function (window, document) {
  "use strict";

  var THRESHOLD = 24;
  var header = null;
  var bound = false;
  var queued = false;

  function apply() {
    queued = false;
    if (!header) header = document.querySelector(".rj-shared-header");
    if (!header) return;
    var merged = (window.pageYOffset || document.documentElement.scrollTop || 0) > THRESHOLD;
    if (merged === header.classList.contains("is-merged")) return;
    header.classList.toggle("is-merged", merged);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(apply);
    else window.setTimeout(apply, 16);
  }

  function start() {
    if (bound) return;
    header = document.querySelector(".rj-shared-header");
    if (!header) return;
    bound = true;
    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    /* Strony z własnym przewijaniem (np. RejChat) też mają scalać topbar. */
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  /* `refresh` wiąże topbar także wtedy, gdy skrypt wystartował po
     DOMContentLoaded (np. doładowany dynamicznie). */
  window.RejTopbar = {
    refresh: function () { start(); apply(); }
  };
})(window, document);

/* © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
   ==========================================================================
   Wysokość okna RejChatu na telefonie.

   Arkusz ustawiał na wąskim ekranie `height: auto` z `flex: 1 1 auto`.
   Lista wiadomości ma `flex-basis: 0`, więc w kontenerze bez określonej
   wysokości rosła razem z treścią: czat „robił się nieskończony”, strona
   wydłużała się w nieskończoność, a lista nigdy nie dostawała własnego
   paska przewijania (scroll działał tylko na całej stronie).

   Tutaj mierzymy realną przestrzeń: od góry tafli do dolnej krawędzi okna,
   z odjęciem paska mini reklam, wyspy i bezpiecznego marginesu. Wynik trafia
   do zmiennej `--rj-chat-fit`, której używa CSS jako `max-height`.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var layout = document.querySelector('.comm-layout');
  if (!layout || !window.getComputedStyle) return;

  var root = document.documentElement;
  var frame = 0;
  var resizeTimer = 0;

  function px(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : 0;
  }

  function visibleHeight(el) {
    if (!el) return 0;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || px(style.opacity) === 0) return 0;
    var rect = el.getBoundingClientRect();
    if (rect.height <= 0) return 0;
    return Math.min(rect.height, Math.max(0, window.innerHeight - rect.top));
  }

  function measure() {
    frame = 0;
    if (window.innerWidth > 860) {
      root.style.removeProperty('--rj-chat-fit');
      return;
    }
    var viewport = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    var top = Math.max(0, layout.getBoundingClientRect().top);
    var ads = visibleHeight(document.getElementById('rj-mobile-ads'));
    var island = visibleHeight(document.getElementById('rj-island'));
    var safe = 0;
    try {
      var probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden';
      document.body.appendChild(probe);
      safe = probe.getBoundingClientRect().height;
      probe.remove();
    } catch (e) { safe = 0; }
    /* Zapas 12 px: cień tafli i ostatni wiersz nie mogą chować się pod krawędzią. */
    var fit = Math.floor(viewport - top - Math.max(ads, island) - safe - 12);
    fit = Math.max(220, Math.min(fit, viewport));
    root.style.setProperty('--rj-chat-fit', fit + 'px');
  }

  function schedule() {
    if (frame) return;
    frame = window.requestAnimationFrame(measure);
  }

  function later() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(schedule, 120);
  }

  window.addEventListener('resize', later, { passive: true });
  window.addEventListener('orientationchange', later, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', later, { passive: true });
    window.visualViewport.addEventListener('scroll', later, { passive: true });
  }
  /* Kompozytor na telefonie zwija pasek adresu — tafla musi się zmieścić od nowa. */
  document.addEventListener('focusin', later);
  document.addEventListener('focusout', later);
  ['rj:tab-change', 'rj:room-change', 'rj:dm-open-user', 'rj:island-state'].forEach(function (name) {
    window.addEventListener(name, later);
  });

  schedule();
  window.addEventListener('load', later);
})(window, document);

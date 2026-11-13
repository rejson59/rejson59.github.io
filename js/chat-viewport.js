/* © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
   ==========================================================================
   Wysokość okna RejChatu — na każdej szerokości.

   Wcześniej skrypt działał tylko na telefonie (`innerWidth > 860` kończył
   pomiar), a na komputerze arkusz ustawiał `height: auto`. Efekt: siatka
   rosła razem z treścią, lista nie miała własnego przewijania, a strona
   wydłużała się z każdą wiadomością.

   Teraz mierzymy zawsze:
   - góra tafli to jej realna pozycja w dokumencie (z uwzględnieniem
     przewinięcia strony),
   - od dołu odejmujemy to, co naprawdę stoi na drodze: wyspę, bezpieczny
     margines systemowy i stopkę strony (na telefonie stopka jest ukryta),
   - wynik trafia do `--rj-chat-h`, którego używa `rejchat-shell.css`.

   Reklamy mobilne są przyklejone do GÓRY ekranu, więc nie zabierają miejsca
   na dole — wcześniej były odejmowane „na wszelki wypadek” i czat tracił
   bez potrzeby 72 px.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var layout = document.querySelector('.comm-layout');
  if (!layout || !window.getComputedStyle) return;

  var root = document.documentElement;
  var MIN_HEIGHT = 300;   /* poniżej tego czat przestaje być czytelny */
  var MAX_HEIGHT = 1120;  /* na bardzo wysokim ekranie nie robimy „studni” */
  var GAP = 10;           /* oddech między taflą a krawędzią ekranu */
  var frame = 0;
  var resizeTimer = 0;

  function px(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : 0;
  }

  function visibleHeight(el) {
    if (!el) return 0;
    var style = window.getComputedStyle(el);
    var opacity = String(style.opacity == null ? '' : style.opacity).trim();
    if (style.display === 'none' || style.visibility === 'hidden' || (opacity && px(opacity) === 0)) return 0;
    var rect = el.getBoundingClientRect();
    return rect.height > 0 ? rect.height : 0;
  }

  /* Wysokość paska systemowego (iPhone: pasek gestów). */
  function safeArea() {
    try {
      var probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden';
      document.body.appendChild(probe);
      var height = probe.getBoundingClientRect().height;
      probe.remove();
      return height || 0;
    } catch (e) { return 0; }
  }

  function measure() {
    frame = 0;

    var viewport = (window.visualViewport && window.visualViewport.height) ||
      window.innerHeight || root.clientHeight || 0;
    if (!viewport) return 0;

    /* Pozycja tafli w dokumencie — niezależna od tego, jak daleko przewinięto
       stronę. Bez tego pomiar „uciekał” przy każdym scrollu. */
    var scrolled = window.pageYOffset || root.scrollTop || 0;
    var top = Math.max(0, layout.getBoundingClientRect().top + scrolled);

    var island = visibleHeight(document.getElementById('rj-island'));
    var footer = visibleHeight(document.querySelector('.site-footer'));
    var safe = safeArea();

    /* Wyspa i stopka nie mogą wejść na czat; bierzemy większą z rezerw. */
    var bottom = Math.max(island + safe, footer);

    var fit = Math.floor(viewport - top - bottom - GAP);
    fit = Math.max(MIN_HEIGHT, Math.min(fit, MAX_HEIGHT, Math.floor(viewport)));

    root.style.setProperty('--rj-chat-h', fit + 'px');
    /* Zgodność ze starszą warstwą (rejchat-viewport.css). */
    root.style.setProperty('--rj-chat-fit', fit + 'px');
    return fit;
  }

  function schedule() {
    if (frame) return;
    frame = window.requestAnimationFrame(measure);
  }

  function later() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(schedule, 100);
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

  /* Hero i stopka zmieniają wysokość po wczytaniu fontów albo po komunikacie. */
  if (typeof window.ResizeObserver === 'function') {
    var observer = new window.ResizeObserver(later);
    var hero = document.querySelector('.comm-hero');
    var footer = document.querySelector('.site-footer');
    if (hero) observer.observe(hero);
    if (footer) observer.observe(footer);
  }
  if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
    document.fonts.ready.then(later).catch(function () { /* ignorujemy */ });
  }

  schedule();
  window.addEventListener('load', later);

  /* API dla testów i innych modułów (np. po zmianie zakładki). */
  window.RJChatViewport = {
    fit: measure,
    schedule: schedule,
    min: MIN_HEIGHT,
    max: MAX_HEIGHT
  };
})(window, document);

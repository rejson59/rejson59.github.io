/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * Pasek przewijania (v1).
 *
 * Jedna, lekka rzecz: podczas przewijania dodajemy na <html> klasę
 * `rj-scrolling`, a po 700 ms ciszy ją zdejmujemy. Dzięki temu na telefonie
 * suwak jest cienki i ledwo widoczny, gdy strona stoi, a rozjaśnia się tylko
 * wtedy, gdy naprawdę się ruszasz. Zero nasłuchów na każdym elemencie —
 * jedno przewijanie na dokumencie (także przechwycone z wewnętrznych list).
 */
(function (window, document) {
  'use strict';

  var root = document.documentElement;
  var idle = 0;
  var queued = false;

  function wake() {
    if (!root.classList.contains('rj-scrolling')) root.classList.add('rj-scrolling');
    if (idle) window.clearTimeout(idle);
    idle = window.setTimeout(function () {
      idle = 0;
      root.classList.remove('rj-scrolling');
    }, 700);
  }

  function onScroll() {
    if (queued) return;
    queued = true;
    var run = function () { queued = false; wake(); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else window.setTimeout(run, 16);
  }

  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('scroll', onScroll, { passive: true });
})(window, document);

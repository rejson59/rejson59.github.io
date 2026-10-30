/* Nawigacja na stronach, które nie mają własnego menu mobilnego. */
(function () {
  'use strict';
  var button = document.getElementById('liquid-menu-toggle');
  var nav = document.getElementById('site-nav');
  if (!button || !nav) return;
  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Zamknij menu' : 'Otwórz menu');
  }
  button.addEventListener('click', function () { setOpen(button.getAttribute('aria-expanded') !== 'true'); });
  nav.addEventListener('click', function (event) { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') { setOpen(false); button.focus(); }
  });
  document.addEventListener('click', function (event) {
    if (!nav.contains(event.target) && !button.contains(event.target)) setOpen(false);
  });
})();

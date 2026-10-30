/* Grupujemy liczniki tylko na małych ekranach; bez JS pozostają widoczne. */
(function () {
  'use strict';
  var button = document.getElementById('metric-more-toggle');
  var panel = document.getElementById('metric-more-panel');
  var group = document.querySelector('.header-metrics');
  if (!button || !panel || !group) return;
  document.body.classList.add('metrics-ready');
  function setOpen(open) {
    group.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Zamknij statystyki strony' : 'Pokaż statystyki strony');
  }
  button.addEventListener('click', function () { setOpen(button.getAttribute('aria-expanded') !== 'true'); });
  document.addEventListener('click', function (event) { if (!group.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') { setOpen(false); button.focus(); }
  });
  window.addEventListener('resize', function () { if (window.innerWidth > 760) setOpen(false); });
  var more = document.getElementById('nav-more');
  if (more) {
    document.addEventListener('click', function (event) { if (!more.contains(event.target) || event.target.closest('.nav-more-panel a')) more.open = false; });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && more.open) {
        event.preventDefault(); event.stopPropagation();
        more.open = false; more.querySelector('summary').focus();
      }
    }, true);
    window.addEventListener('resize', function () { more.open = false; });
  }
})();

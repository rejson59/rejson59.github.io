(function () {
  'use strict';
  /* Nowa strona usług używa wspólnego topbaru (js/shared-topbar.js), więc
     stare menu może nie istnieć — bez tego sprawdzenia skrypt rzucałby
     wyjątkiem na starcie i psuł resztę strony. */
  var menu = document.getElementById('services-menu'), nav = document.getElementById('services-nav');
  if (menu && nav) menu.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Zamknij menu' : 'Otwórz menu');
  });
  var theme = document.getElementById('services-theme');
  if (theme) theme.addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
})();

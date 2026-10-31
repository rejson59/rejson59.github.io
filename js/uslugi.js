(function () {
  'use strict';
  var menu = document.getElementById('services-menu'), nav = document.getElementById('services-nav');
  menu.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Zamknij menu' : 'Otwórz menu');
  });
  document.getElementById('services-theme').addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
})();

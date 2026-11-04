/* Dostępne menu „Więcej” na stronie głównej. */
(function () {
  'use strict';
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

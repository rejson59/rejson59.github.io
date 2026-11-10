/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Spis sekcji długich podstron.

   Strony, na których cała treść siedzi w jednej wysokiej ramce, dostają
   krótki pasek „Na tej stronie” u góry i (na szerokich ekranach) spis
   z boku. Nic nie jest ukrywane — treść po prostu przestaje być jedną
   niekończącą się kolumną. */
(function (window, document) {
  'use strict';

  var MIN_SECTIONS = 3;
  var SKIP = /^(main|nav|footer|header)$/i;

  function slug(value, index) {
    var base = String(value || '')
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, function (c) {
        return { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z' }[c];
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return base ? base + '-' + index : 'sekcja-' + index;
  }

  function build() {
    var main = document.querySelector('main');
    if (!main || main.querySelector('.rj-page-index')) return;
    var headings = Array.prototype.filter.call(main.querySelectorAll('h2, h3'), function (heading) {
      if (heading.closest('nav, .rj-page-index, [hidden]')) return false;
      var parent = heading.parentElement;
      if (!parent || SKIP.test(parent.tagName)) return false;
      return String(heading.textContent || '').trim().length > 2;
    }).slice(0, 12);
    if (headings.length < MIN_SECTIONS) return;

    var nav = document.createElement('nav');
    nav.className = 'rj-page-index';
    nav.setAttribute('aria-label', 'Na tej stronie');
    var links = headings.map(function (heading, index) {
      if (!heading.id) heading.id = slug(heading.textContent, index);
      return '<a class="rj-page-index-link" href="#' + heading.id + '">' + heading.textContent.trim() + '</a>';
    }).join('');
    nav.innerHTML = '<span class="rj-page-index-label">Na tej stronie</span><div class="rj-page-index-list">' + links + '</div>';

    var anchor = main.querySelector('.hero, .safe-hero, .page-hero, .tools-hero, .rjc-hero, .services-hero, .partner-hero, h1');
    var host = anchor && anchor.parentNode === main ? anchor.nextSibling : main.firstChild;
    main.insertBefore(nav, host || null);
    document.documentElement.classList.add('has-page-index');

    /* Podświetlenie aktualnej sekcji — spokojne, bez skakania layoutu. */
    if ('IntersectionObserver' in window) {
      var linksByHeading = headings.map(function (heading) {
        return { head: heading, link: nav.querySelector('a[href="#' + heading.id + '"]') };
      });
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var item = linksByHeading.filter(function (pair) { return pair.head === entry.target; })[0];
          if (!item || !item.link) return;
          if (entry.isIntersecting) {
            linksByHeading.forEach(function (pair) { if (pair.link) pair.link.classList.remove('is-current'); });
            item.link.classList.add('is-current');
          }
        });
      }, { rootMargin: '-25% 0px -60% 0px', threshold: 0.1 });
      headings.forEach(function (heading) { observer.observe(heading); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})(window, document);

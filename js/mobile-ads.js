/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * Mini reklamy mobilne (v10).
 *
 * Zasady, które użytkownik ustalił dla telefonu:
 *  - pasek stoi POD topbarem (sticky), a nie na dole ekranu — nie zasłania
 *    treści i nie koliduje z wyspą;
 *  - widać DOKŁADNIE JEDNĄ promocję naraz — karta zajmuje całą szerokość
 *    paska, więc nic nie jest ściśnięte w dwóch kolumnach;
 *  - każda promocja ma krótki tytuł i jeszcze krótszy opis (dwie linijki
 *    mieszczą się w 72 px wysokości paska) i leży w zaokrąglonej ramce,
 *    żeby nie wyglądała jak goły napis na taśmie;
 *  - każda promocja zostaje na ekranie dłużej: zmiana co 3,5 sekundy,
 *    płynnym przejściem, w kółko;
 *  - kropki pod paskiem pokazują, która promocja jest aktualna.
 *
 * Autoprzesuwanie zatrzymuje się, gdy ktoś dotknie paska albo kafelka,
 * gdy karta jest w tle i gdy system prosi o mniej ruchu. Nadal zero
 * śledzenia: wszystko dzieje się lokalnie, w tej karcie.
 */
(function () {
  'use strict';
  // Reklamy należą do stron serwisu z wyjątkiem panelu admina; nigdy do osobnych projektów.
  if (!/^\/(?:index|404|logowanie|partnerstwo|profil|konto-demo|rejchat|rejfile|rejsejf|rejtools|uslugi)?(?:\.html)?\/?$/i.test(location.pathname)) return;
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (!document.body || document.getElementById('rj-mobile-ads')) return;
  var probe = document.createElement('div'); probe.id = 'rj-mobile-ads-check';
  document.documentElement.appendChild(probe);
  var styled = false;
  try { var cs = getComputedStyle(probe); styled = cs.position === 'fixed' && cs.zIndex === '2147482999'; } catch (e) {}
  probe.remove();
  if (!styled) return;

  var bar = document.createElement('aside');
  bar.id = 'rj-mobile-ads';
  bar.setAttribute('aria-label', 'Mini reklamy i promocje');
  /* Treść promocji trzymamy w jednym miejscu: tytuł, krótki opis i ikona.
     Dzięki temu <noscript> (statyczny HTML) i wersja z JS wyglądają tak samo. */
  var ADS = [
    { kind: 'chat', href: '/rejchat', title: 'RejChat · pogadaj', desc: 'Czat na żywo ze społecznością',
      icon: '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 9h8M8 12h5"/>' },
    { kind: 'site', href: '/uslugi', title: 'Masz pomysł na stronę?', desc: 'Zamów stronę lub projekt',
      icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M8 14h8"/>' },
    { kind: 'offer', href: '/partnerstwo#propozycja', title: 'Podziel się czymś', desc: 'Partnerstwo i współpraca',
      icon: '<path d="m4 10 11-5v14L4 14zM4 10v4m3.5 1 1.5 4h3l-1-3.3M18 9l2-2m-2 5h3m-3 3 2 2"/>' },
    { kind: 'house', href: '/rejfile', title: 'RejFile · wyślij plik', desc: 'Duże pliki i szybkie linki',
      icon: '<path d="M6 3h8l4 4v13H6z"/><path d="M14 3v5h4M12 16V10m-2 2 2-2 2 2"/>' }
  ];

  function adMarkup(ad) {
    return '<a class="rj-mobile-ad rj-mobile-ad--' + ad.kind + '" href="' + ad.href + '">' +
      '<span class="rj-mobile-ad-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ad.icon + '</svg></span>' +
      '<span class="rj-mobile-ad-copy"><span class="rj-mobile-ad-title">' + ad.title + '</span>' +
      '<span class="rj-mobile-ad-desc">' + ad.desc + '</span></span></a>';
  }

  bar.innerHTML = '<span class="rj-mobile-ads-label">mini reklamy</span>' +
    '<div class="rj-mobile-ads-frame"><div class="rj-mobile-ads-items" tabindex="0" aria-label="Mini reklamy i promocje (przewijane)">' +
    ADS.map(adMarkup).join('') +
    '</div></div>' +
    '<span class="rj-mobile-ads-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

  /* Pasek wchodzi zaraz pod topbar, żeby sticky `top` liczył się od jego
     dolnej krawędzi. Gdy strona nie ma topbaru, ląduje na początku body. */
  var header = document.querySelector('.rj-shared-header');
  if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
  else document.body.insertBefore(bar, document.body.firstChild);

  var lastTop = -1;
  function measure() {
    /* Liczy się dolna krawędź topbaru względem okna, nie sama wysokość:
       nad nagłówkiem bywa jeszcze kilka pikseli odstępu strony. */
    var top = header ? Math.round(header.getBoundingClientRect().bottom) : 0;
    if (top < 0) top = 0;
    if (top === lastTop) return;
    lastTop = top;
    bar.style.setProperty('--rj-ads-top', top + 'px');
  }
  measure();

  /* Topbar zwija się po przewinięciu (64 → 60 px) i ma animację wejścia —
     pasek musi podążać za jego dolną krawędzią, żeby nie było szpary. */
  var measuring = false;
  function remeasure() {
    if (measuring) return;
    measuring = true;
    var run = function () { measuring = false; measure(); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else window.setTimeout(run, 16);
  }
  window.addEventListener('scroll', remeasure, { passive: true });
  window.setTimeout(measure, 300);
  window.setTimeout(measure, 1200);

  document.documentElement.classList.add('rj-mobile-ads-active');

  /* --------------------------------------------------- autoprzesuwanie --- */

  var frame = bar.querySelector('.rj-mobile-ads-items');
  var STEP_MS = 3500;
  var timer = 0;
  var paused = false;
  var resumeTimer = 0;

  function phone() {
    try { return window.matchMedia('(max-width: 1199px)').matches; }
    catch (e) { return window.innerWidth <= 1199; }
  }

  /* Jedna promocja na raz: krok to dokładnie szerokość widocznego paska
     (kafelki mają 100% szerokości i zero odstępu między sobą). */
  function step() {
    if (!frame || paused || document.hidden || !phone()) return;
    var card = frame.querySelector('.rj-mobile-ad');
    if (!card) return;
    var distance = frame.clientWidth || card.getBoundingClientRect().width;
    if (!distance || frame.scrollWidth <= frame.clientWidth + 2) return;
    var max = frame.scrollWidth - frame.clientWidth;
    var next = frame.scrollLeft + distance;
    if (next >= max - 4) {
      /* Koniec listy — wracamy na początek. */
      next = 0;
    }
    try {
      frame.scrollTo({ left: next, behavior: 'smooth' });
    } catch (e) {
      frame.scrollLeft = next;
    }
    syncDots();
  }

  /* Kropki: tylko wskaźnik, bez przechwytywania dotknięć. */
  var dots = bar.querySelectorAll('.rj-mobile-ads-dots i');
  function syncDots() {
    if (!dots.length || !frame) return;
    var width = frame.clientWidth || 1;
    var index = Math.round(frame.scrollLeft / width);
    if (index < 0) index = 0;
    if (index > dots.length - 1) index = dots.length - 1;
    for (var i = 0; i < dots.length; i += 1) {
      dots[i].classList.toggle('is-on', i === index);
    }
  }
  if (frame) {
    frame.addEventListener('scroll', syncDots, { passive: true });
    syncDots();
  }

  function play() {
    if (timer || !frame) return;
    timer = window.setInterval(step, STEP_MS);
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = 0;
  }

  /* Dotknięcie, kółko myszy i sam gest przewijania wstrzymują jazdę na 6 s —
     nikt nie walczy z paskiem, który właśnie chwycił. */
  function hold() {
    paused = true;
    if (resumeTimer) window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(function () { paused = false; }, 6000);
  }

  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (name) {
    bar.addEventListener(name, hold, { passive: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else play();
  });
  window.addEventListener('resize', remeasure, { passive: true });
  window.addEventListener('load', measure);

  /* Systemowa prośba o mniej ruchu: reklamy stoją, ale nadal można je
     przewinąć palcem. */
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (!reduceMotion) play();
  syncDots();
})();

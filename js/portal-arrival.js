/* Nakładka na prawdziwym dokumencie projektu. Bez jednorazowego znacznika nie zmienia strony. */
(function () {
  'use strict';
  var KEY = 'rj_rocket_overlay_v2', marker;
  try {
    marker = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!marker) return;
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem('rj_portal_arrival_v1');
  } catch (e) { return; }
  function path(p) { return String(p || '').replace(/\/index\.html?$/i, '').replace(/\/+$/, '') || '/'; }
  function sameDestination(expected, actual) {
    var from = path(expected), to = path(actual);
    return from === to || (/^\/[A-Za-z0-9._-]+$/.test(from) && to.indexOf(from + '/') === 0);
  }
  if (typeof marker.path !== 'string' || typeof marker.at !== 'number' || Date.now() - marker.at < 0 ||
      Date.now() - marker.at > 60000 || !sameDestination(marker.path, location.pathname) || window.top !== window.self) return;
  var override = marker.motionOverride === true;
  if (!override && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function mount() {
    // Niektóre przeglądarki udostępniają link.sheet także po blokadzie CSP.
    // Sprawdź faktycznie zastosowaną regułę, zanim zasłonisz projekt.
    var probe = document.createElement('div'); probe.id = 'rj-arrival-css-check';
    document.documentElement.appendChild(probe);
    var styled = false;
    try { var cs = getComputedStyle(probe); styled = cs.position === 'fixed' && cs.zIndex === '2147483645'; } catch (e) {}
    probe.parentNode.removeChild(probe);
    if (!styled) return;
    var root = document.createElement('div'); root.id = 'rj-portal-arrival';
    if (override) root.setAttribute('data-motion-override', '');
    root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Podróż do projektu');
    root.innerHTML = '<div class="rj-arrival-stars" aria-hidden="true"></div><div class="rj-arrival-content"><div class="rj-arrival-heading"><p class="rj-arrival-eyebrow">✦ KIERUNEK</p><h1 class="rj-arrival-name"></h1><p class="rj-arrival-caption" role="status" aria-live="polite">Lecimy do projektu…</p></div><div class="rj-arrival-map" aria-hidden="true"><div class="rj-arrival-home"></div><div class="rj-arrival-planet"></div><div class="rj-arrival-motion"><div class="rj-arrival-elevation"><div class="rj-arrival-rocket-wrap"><div class="rj-arrival-puffs"><i></i><i></i><i></i></div><img class="rj-arrival-rocket" src="/assets/travel-rocket.svg?v=2" alt=""></div></div></div></div><div class="rj-arrival-controls"><div class="rj-arrival-progress" aria-hidden="true"><span></span></div><div class="rj-arrival-buttons"><button class="rj-arrival-reduce" type="button" aria-pressed="false">Ogranicz ruch</button><button class="rj-arrival-skip" type="button">Pomiń animację ↗</button></div></div></div>';
    var name = typeof marker.name === 'string' ? marker.name.slice(0,100) : '';
    var title = root.querySelector('.rj-arrival-name'); title.textContent = name || 'Twój projekt';
    if (name.length > 35) title.classList.add('is-long');
    var motion = root.querySelector('.rj-arrival-motion'), caption = root.querySelector('.rj-arrival-caption');
    var reduce = root.querySelector('.rj-arrival-reduce');
    var reduced = false;
    try { reduced = localStorage.getItem('rj_rocket_reduce_motion_v1') === '1'; } catch (e) {}
    function updateMotion() {
      root.classList.toggle('motion-off', reduced); reduce.setAttribute('aria-pressed', String(reduced));
      reduce.textContent = reduced ? 'Włącz ruch rakiety' : 'Ogranicz ruch';
    }
    reduce.addEventListener('click', function () {
      reduced = !reduced; try { localStorage.setItem('rj_rocket_reduce_motion_v1', reduced ? '1' : '0'); } catch (e) {}
      updateMotion();
    });
    updateMotion();
    document.documentElement.appendChild(root);
    var DURATION = 4200, elapsed = 0, previous = null, finished = false, loaded = document.readyState === 'complete';
    var started = false, removed = false, waitingLong = false, timer = 0, loadTimer = 0, raf = 0, remaining = 1500, visibleSince = 0;
    function remove() {
      if (removed) return; removed = true;
      clearTimeout(timer); clearTimeout(loadTimer); cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('load', onLoad);
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    function syncVisibility() {
      if (removed) return;
      var hidden = document.visibilityState === 'hidden'; previous = null;
      root.classList.toggle('is-paused', hidden);
      if (!started) return;
      if (hidden && timer) { clearTimeout(timer); timer = 0; remaining = Math.max(0, remaining - (Date.now() - visibleSince)); }
      else if (!hidden && !timer) { visibleSince = Date.now(); timer = setTimeout(remove, remaining); }
    }
    function reveal() {
      if (started || removed) return; started = true;
      caption.textContent = 'Otwieramy projekt…'; syncVisibility(); root.classList.add('is-playing');
    }
    function flightComplete() {
      if (elapsed < DURATION) return false;
      if (reduced || finished) return true;
      if (elapsed < DURATION + 2000) return false;
      try {
        if (motion.getAnimations) return !motion.getAnimations().some(function (a) {
          return (a.animationName === 'rj-arrival-flight' || a.animationName === 'rj-arrival-flight-small') && a.playState !== 'finished' && a.playState !== 'idle';
        });
        return getComputedStyle(motion).animationName === 'none' || elapsed >= DURATION + 5000;
      } catch (e) { return elapsed >= DURATION + 5000; }
    }
    function tick(now) {
      if (removed || started) return;
      if (document.visibilityState !== 'hidden') { if (previous !== null) elapsed += Math.max(0, now - previous); previous = now; } else previous = null;
      if (elapsed >= DURATION && !loaded) {
        var message = waitingLong ? 'Ładowanie trwa dłużej. Możesz pominąć animację.' : 'Jeszcze chwilka, ładujemy projekt…';
        if (caption.textContent !== message) caption.textContent = message;
      }
      if (loaded && flightComplete()) { reveal(); return; }
      raf = requestAnimationFrame(tick);
    }
    function onLoad() { loaded = true; }
    motion.addEventListener('animationend', function (e) {
      if (e.target === motion && (e.animationName === 'rj-arrival-flight' || e.animationName === 'rj-arrival-flight-small')) finished = true;
    });
    root.querySelector('.rj-arrival-skip').addEventListener('click', reveal);
    root.addEventListener('animationend', function (e) { if (e.target === root && e.animationName === 'rj-arrival-finished') remove(); });
    document.addEventListener('visibilitychange', syncVisibility); syncVisibility();
    if (!loaded) window.addEventListener('load', onLoad, {once:true});
    // Długie lub nieudane ładowanie nigdy nie udaje zdarzenia load. Zamiast tego
    // zostawiamy użytkownikowi widoczny przycisk pominięcia.
    loadTimer = setTimeout(function () { waitingLong = true; }, 12000);
    raf = requestAnimationFrame(tick);
  }
  // Stary bootstrap może załadować starszy arkusz. Aktualizujemy go centralnie,
  // nie zmieniając pliku projektu i nie zastępując jego service workera.
  var sheet = document.querySelector('link[data-rj-portal-style]');
  if (!sheet || !sheet.sheet) return;
  var version = 0; try { version = Number(new URL(sheet.href, location.href).searchParams.get('v')) || 0; } catch (e) {}
  if (version >= 17) { mount(); return; }
  var fresh = document.createElement('link'); fresh.rel = 'stylesheet'; fresh.href = '/css/portal.css?v=17';
  fresh.addEventListener('load', mount, {once:true});
  (document.head || document.documentElement).appendChild(fresh);
})();

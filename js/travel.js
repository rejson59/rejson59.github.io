/* Automatyczna podróż w tej samej, nowo otwartej karcie. Cel pochodzi wyłącznie z listy projektów. */
(function () {
  'use strict';
  var name = new URLSearchParams(location.search).get('projekt') || '';
  var featured = { RejStream:'https://rejson59.github.io/RejStream/', Jakuplayer:'https://rejson59.github.io/Jakuplayer/', JoyPad:'https://rejson59.github.io/JoyPad/', mconline:'https://rejson59.github.io/mconline/', VibeAnimations:'https://rejson59.github.io/VibeAnimations/' };
  var KEY = 'rj_rocket_trip_v1', DURATION = 4200;
  try { sessionStorage.removeItem('rj_portal_arrival_v1'); } catch (e) { /* starszy znacznik nie jest wymagany */ }
  var title = document.getElementById('project-name'), status = document.getElementById('travel-status'), skip = document.getElementById('skip');
  var direct = document.getElementById('direct');
  var target = null, elapsed = 0, previous = null, raf = 0, leaving = false, errorShown = false;
  var motion = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.body.classList.toggle('motion-off', !motion);
  document.body.classList.toggle('is-paused', document.visibilityState === 'hidden');
  function find(list) { return Array.isArray(list) ? list.find(function (r) { return r && r.name === name; }) : null; }
  function liveUrl(repo) {
    if (!repo) return null;
    try { var url = new URL(typeof repo.homepage === 'string' ? repo.homepage.trim() : ''); if (url.protocol === 'https:' || url.protocol === 'http:') return url.href; } catch (e) { /* użyj GitHub Pages */ }
    if (repo.has_pages || repo.name === 'rejson-widgets') return 'https://rejson59.github.io/' + encodeURIComponent(repo.name) + '/';
    return null;
  }
  var workerPending = null, workerSettled = false;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    try { workerPending = navigator.serviceWorker.register('/sw.js?v=2', {scope:'/', updateViaCache:'none'}).then(function () { return navigator.serviceWorker.ready; }).then(function () { workerSettled = true; }, function () { workerSettled = true; }); } catch (e) { workerSettled = true; }
  }
  function navigate(animateArrival) {
    if (!target || leaving) return;
    leaving = true; skip.disabled = true; status.textContent = 'Otwieramy projekt…';
    var url = new URL(target), finished = false;
    function finish() {
      if (finished) return; finished = true;
      try {
        if (animateArrival && url.origin === location.origin) sessionStorage.setItem(KEY, JSON.stringify({path:url.pathname, at:Date.now(), motionOverride:true, kind:'rocket'}));
        else sessionStorage.removeItem(KEY);
      } catch (e) { /* brak storage nie blokuje wejścia */ }
      try { location.replace(url.href); } catch (e) { leaving = false; skip.disabled = false; direct.hidden = false; status.textContent = 'Nie udało się otworzyć projektu automatycznie.'; }
    }
    if (!animateArrival || url.origin !== location.origin || !workerPending || workerSettled) { finish(); return; }
    var timer = setTimeout(finish, 1500);
    workerPending.then(function () { clearTimeout(timer); finish(); });
  }
  function setTarget(href) {
    if (!href || target || errorShown) return;
    target = href; direct.href = href; skip.disabled = false;
    try { if (new URL(href).origin === location.origin) { var p = document.createElement('link'); p.rel = 'prefetch'; p.href = href; document.head.appendChild(p); } } catch (e) { /* nawigacja nadal działa */ }
    if (!motion) navigate(false); else if (elapsed >= DURATION) navigate(true);
  }
  skip.addEventListener('click', function () { navigate(false); });
  function tick(now) {
    if (leaving || errorShown) return;
    if (document.visibilityState !== 'hidden') { if (previous !== null) elapsed += Math.max(0, now - previous); previous = now; } else previous = null;
    if (elapsed >= DURATION) { status.textContent = target ? 'Otwieramy projekt…' : 'Szukamy projektu…'; if (target) { navigate(true); return; } }
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', function () { previous = null; document.body.classList.toggle('is-paused', document.visibilityState === 'hidden'); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) { if (raf) cancelAnimationFrame(raf); location.reload(); } });
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === '.' || name === '..') { status.textContent = 'Nie znaleziono projektu. Wróć i wybierz inny.'; return; }
  title.textContent = name; document.title = 'Podróż do ' + name + ' — Rejson59';
  if (name.length > 35) title.classList.add('long-name');
  status.textContent = 'Lecimy do projektu…'; document.body.classList.add('is-flying');
  raf = requestAnimationFrame(tick);
  var cached = null; try { var stored = JSON.parse(localStorage.getItem('rejson_repos_cache_v2') || 'null'); cached = find(stored && stored.data); } catch (e) { /* kopia zapasowa */ }
  setTarget((Object.prototype.hasOwnProperty.call(featured, name) && featured[name]) || liveUrl(cached) || liveUrl(find(window.PROJECTS_FALLBACK)));
  if (!target) {
    var lookupTimer = setTimeout(function () { errorShown = true; document.body.classList.remove('is-flying'); status.textContent = 'Nie udało się odnaleźć projektu. Wróć i spróbuj ponownie.'; }, 8000);
    try {
      fetch('https://api.github.com/repos/rejson59/' + encodeURIComponent(name), {headers:{Accept:'application/vnd.github+json'}}).then(function (r) { if (!r.ok) throw new Error('repo'); return r.json(); }).then(function (repo) {
        clearTimeout(lookupTimer); if (!errorShown && repo.name === name) setTarget(liveUrl(repo));
        if (!target && !errorShown) { errorShown = true; status.textContent = 'Nie znaleziono strony tego projektu.'; }
      }).catch(function () { clearTimeout(lookupTimer); if (!errorShown) { errorShown = true; status.textContent = 'Nie udało się odnaleźć projektu. Wróć i spróbuj ponownie.'; } });
    } catch (e) { clearTimeout(lookupTimer); errorShown = true; status.textContent = 'Nie udało się odnaleźć projektu. Wróć i spróbuj ponownie.'; }
  }
})();

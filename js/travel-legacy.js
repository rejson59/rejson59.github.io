/* Dawny adres podróży: bez dodatkowej strony animacji przejdź do znanego projektu. */
(function () {
  'use strict';
  var name = new URLSearchParams(location.search).get('projekt') || '';
  var featured = {RejStream:'https://rejson59.github.io/RejStream/', Jakuplayer:'https://rejson59.github.io/Jakuplayer/', JoyPad:'https://rejson59.github.io/JoyPad/', mconline:'https://rejson59.github.io/mconline/', VibeAnimations:'https://rejson59.github.io/VibeAnimations/'};
  var status = document.getElementById('legacy-status'), done = false;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === '.' || name === '..') { status.textContent = 'Nie znaleziono projektu.'; return; }
  function find(list) { return Array.isArray(list) ? list.find(function (r) { return r && r.name === name; }) : null; }
  function liveUrl(repo) {
    if (!repo) return null;
    try { var u = new URL(typeof repo.homepage === 'string' ? repo.homepage.trim() : ''); if (u.protocol === 'https:' || u.protocol === 'http:') return u.href; } catch (e) {}
    return repo.has_pages || repo.name === 'rejson-widgets' ? 'https://rejson59.github.io/' + encodeURIComponent(repo.name) + '/' : null;
  }
  function go(href) {
    if (!href || done) return; done = true;
    var target = new URL(href);
    try {
      if (target.origin === location.origin) {
        sessionStorage.setItem('rj_rocket_overlay_v2', JSON.stringify({path:target.pathname, at:Date.now(), name:name, motionOverride:true}));
        sessionStorage.setItem('rj_portal_arrival_v1', JSON.stringify({path:target.pathname, at:0}));
      }
    } catch (e) {}
    location.replace(target.href);
  }
  var cache = null;
  try { var stored = JSON.parse(localStorage.getItem('rejson_repos_cache_v2') || 'null'); cache = find(stored && stored.data); } catch (e) {}
  var target = (Object.prototype.hasOwnProperty.call(featured, name) && featured[name]) || liveUrl(cache) || liveUrl(find(window.PROJECTS_FALLBACK));
  if (target) { go(target); return; }
  var timer = setTimeout(function () { done = true; status.textContent = 'Nie udało się odnaleźć projektu.'; }, 8000);
  try {
    fetch('https://api.github.com/repos/rejson59/' + encodeURIComponent(name), {headers:{Accept:'application/vnd.github+json'}})
      .then(function (r) { if (!r.ok) throw new Error('repo'); return r.json(); })
      .then(function (repo) { clearTimeout(timer); if (!done && repo.name === name) go(liveUrl(repo)); if (!done) status.textContent = 'Nie znaleziono strony projektu.'; })
      .catch(function () { clearTimeout(timer); if (!done) { done = true; status.textContent = 'Nie udało się odnaleźć projektu.'; } });
  } catch (e) { clearTimeout(timer); done = true; status.textContent = 'Nie udało się odnaleźć projektu.'; }
})();

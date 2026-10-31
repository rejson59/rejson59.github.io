/* Mini promocje bez śledzenia i bez możliwości ukrycia paska. */
(function () {
  'use strict';
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (!document.body || document.getElementById('rj-mobile-ads')) return;
  // Nie zmieniaj układu projektu, jeśli jego CSP blokuje arkusz.
  var probe = document.createElement('div'); probe.id = 'rj-mobile-ads-check';
  document.documentElement.appendChild(probe);
  var styled = false;
  try { var cs = getComputedStyle(probe); styled = cs.position === 'fixed' && cs.zIndex === '2147482999'; } catch (e) {}
  probe.remove();
  if (!styled) return;
  var bar = document.createElement('aside');
  bar.id = 'rj-mobile-ads';
  bar.setAttribute('aria-label', 'Mini reklamy i promocje');
  bar.innerHTML = '<span class="rj-mobile-ads-label">mini reklamy<br>i promocje :)</span><div class="rj-mobile-ads-items" aria-label="Promocje, przewiń aby zobaczyć kolejne"><a class="rj-mobile-ad rj-mobile-ad--house" href="/rejfile"><span>↗ RejFile · wyślij plik</span></a><a class="rj-mobile-ad rj-mobile-ad--offer" href="/partnerstwo#propozycja"><span>✦ Twoja reklama tutaj</span></a></div><button class="rj-mobile-ads-pause" type="button" aria-label="Wstrzymaj automatyczną zmianę promocji" aria-pressed="false" title="Wstrzymaj lub wznów zmianę promocji">Ⅱ</button>';
  var spacer = document.createElement('div'); spacer.className = 'rj-mobile-ads-spacer'; spacer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(spacer); document.body.appendChild(bar);
  document.documentElement.classList.add('rj-mobile-ads-active');

  var items = bar.querySelector('.rj-mobile-ads-items');
  var pause = bar.querySelector('.rj-mobile-ads-pause');
  var paused = false, lastInteraction = 0;
  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var canHover = window.matchMedia ? window.matchMedia('(hover: hover)') : { matches: false };
  function syncMotionPreference() { pause.hidden = reducedMotion.matches; }
  syncMotionPreference();
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', syncMotionPreference);
  else if (reducedMotion.addListener) reducedMotion.addListener(syncMotionPreference);
  bar.addEventListener('pointerdown', function () { lastInteraction = Date.now(); });
  pause.addEventListener('click', function () {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? '▶' : 'Ⅱ';
  });
  window.setInterval(function () {
    if (paused || reducedMotion.matches || document.hidden || bar.getClientRects().length === 0 ||
        bar.contains(document.activeElement) || (canHover.matches && bar.matches(':hover')) ||
        Date.now() - lastInteraction < 12000) return;
    var links = items.querySelectorAll('a');
    if (links.length < 2 || !items.clientWidth) return;
    var next = Math.round(items.scrollLeft / items.clientWidth) + 1;
    items.scrollTo({ left: (next % links.length) * items.clientWidth, behavior: 'smooth' });
  }, 8000);
})();

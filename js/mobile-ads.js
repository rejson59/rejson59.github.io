/* Stałe, lokalne promocje mobilne bez śledzenia. */
(function () {
  'use strict';
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
  bar.innerHTML = '<span class="rj-mobile-ads-label">mini reklamy i promocje :)</span><div class="rj-mobile-ads-items"><a class="rj-mobile-ad rj-mobile-ad--house" href="/rejfile"><span>↗ RejFile · wyślij plik</span></a><a class="rj-mobile-ad rj-mobile-ad--offer" href="/partnerstwo#propozycja"><span>✦ Twoja reklama tutaj</span></a></div>';
  var spacer = document.createElement('div'); spacer.className = 'rj-mobile-ads-spacer'; spacer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(spacer); document.body.appendChild(bar);
  document.documentElement.classList.add('rj-mobile-ads-active');
})();

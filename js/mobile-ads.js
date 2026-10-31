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
  bar.innerHTML = '<span class="rj-mobile-ads-label">mini reklamy i promocje :) <span class="rj-mobile-ads-hint">przesuń →</span></span><div class="rj-mobile-ads-items" tabindex="0" aria-label="Przewijane mini reklamy"><a class="rj-mobile-ad rj-mobile-ad--site" href="/uslugi"><span class="rj-mobile-ad-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M8 14h8"/></svg></span><span>Masz pomysł na swoją stronę?</span></a><a class="rj-mobile-ad rj-mobile-ad--offer" href="/partnerstwo#propozycja"><span class="rj-mobile-ad-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10 11-5v14L4 14zM4 10v4m3.5 1 1.5 4h3l-1-3.3M18 9l2-2m-2 5h3m-3 3 2 2"/></svg></span><span>Masz coś, czym chcesz się podzielić?</span></a><a class="rj-mobile-ad rj-mobile-ad--house" href="/rejfile"><span class="rj-mobile-ad-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v13H6z"/><path d="M14 3v5h4M12 16V10m-2 2 2-2 2 2"/></svg></span><span>RejFile · wyślij plik</span></a></div>';
  var spacer = document.createElement('div'); spacer.className = 'rj-mobile-ads-spacer'; spacer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(spacer); document.body.appendChild(bar);
  document.documentElement.classList.add('rj-mobile-ads-active');
})();

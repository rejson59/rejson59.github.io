/* Stałe, lokalne banery mobilne. Nie śledzą kliknięć ani nie wysyłają danych. */
(function () {
  'use strict';
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (!document.body || document.getElementById('rj-mobile-ads')) return;
  // Respektuj CSP: bez działającego arkusza nie zmieniaj układu projektu.
  var probe = document.createElement('div'); probe.id = 'rj-mobile-ads-check';
  document.documentElement.appendChild(probe);
  var styled = false;
  try { var cs = getComputedStyle(probe); styled = cs.position === 'fixed' && cs.zIndex === '2147482999'; } catch (e) {}
  probe.remove();
  if (!styled) return;
  var bar = document.createElement('aside');
  bar.id = 'rj-mobile-ads';
  bar.setAttribute('aria-label', 'Polecane strony i miejsce reklamowe');
  bar.innerHTML = '<a class="rj-mobile-ad rj-mobile-ad--house" href="/rejfile"><span class="rj-mobile-ad-icon" aria-hidden="true">↗</span><span class="rj-mobile-ad-text"><small>OD REJSONA</small><strong>RejFile · wyślij plik</strong></span></a><a class="rj-mobile-ad rj-mobile-ad--offer" href="/partnerstwo#propozycja"><span class="rj-mobile-ad-icon" aria-hidden="true">✦</span><span class="rj-mobile-ad-text"><small>MIEJSCE REKLAMOWE</small><strong>Twoja reklama tutaj ↗</strong></span></a>';
  var spacer = document.createElement('div'); spacer.className = 'rj-mobile-ads-spacer'; spacer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(spacer); document.body.appendChild(bar);
  document.documentElement.classList.add('rj-mobile-ads-active');
})();

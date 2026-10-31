/* Lokalne promocje w jednej ramce po prawej, bez śledzenia. */
(function () {
  'use strict';
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (!document.body || document.querySelector('.rj-side-ads')) return;
  var right = document.createElement('aside');
  right.className = 'rj-side-ads rj-side-ads--right';
  right.setAttribute('aria-label', 'Mini reklamy i promocje');
  right.innerHTML = '<div class="rj-side-ads-title">mini reklamy i promocje :)</div><a class="rj-side-ad rj-side-ad--chat" href="/rejchat"><span class="rj-side-ad-tag">OD REJSONA</span><strong>RejChat</strong><span>Rozmowy, ludzie i wpisy.</span><b>Odkryj ↗</b></a><a class="rj-side-ad rj-side-ad--file" href="/rejfile"><span class="rj-side-ad-tag">OD REJSONA</span><strong>RejFile</strong><span>Wyślij plik po swojemu.</span><b>Sprawdź ↗</b></a><a class="rj-side-ad rj-side-ad--offer" href="/partnerstwo#propozycja"><span class="rj-side-ad-tag">MIEJSCE REKLAMOWE</span><strong>Twoja reklama tutaj?</strong><span>Produkt, wydarzenie lub usługa.</span><b>Zapytaj ↗</b></a>';
  document.body.appendChild(right);
  document.body.classList.add('rj-side-ads-enabled');
})();

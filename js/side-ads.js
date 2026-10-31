/* Lokalne banery: bez sieci reklamowej i bez śledzenia. */
(function () {
  'use strict';
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (!document.body || document.querySelector('.rj-side-ads')) return;
  var left = document.createElement('aside'), right = document.createElement('aside');
  left.className = 'rj-side-ads rj-side-ads--left'; right.className = 'rj-side-ads rj-side-ads--right';
  left.setAttribute('aria-label', 'Polecane strony i miejsce reklamowe');
  right.setAttribute('aria-label', 'Polecane strony i miejsce reklamowe');
  left.innerHTML = '<a class="rj-side-ad rj-side-ad--chat" href="/rejchat"><span class="rj-side-ad-tag">OD REJSONA</span><span class="rj-side-ad-symbol" aria-hidden="true">✦</span><strong>RejChat</strong><span>Rozmowy, ludzie i wpisy w jednym miejscu.</span><b>Odkryj ↗</b></a><a class="rj-side-ad rj-side-ad--offer" href="/partnerstwo#propozycja"><span class="rj-side-ad-tag">MIEJSCE REKLAMOWE</span><strong>Twoja reklama tutaj?</strong><span>Możesz wykupić tutaj reklamę.</span><b>Zapytaj o reklamę ↗</b></a>';
  right.innerHTML = '<a class="rj-side-ad rj-side-ad--file" href="/rejfile"><span class="rj-side-ad-tag">OD REJSONA</span><span class="rj-side-ad-symbol" aria-hidden="true">↗</span><strong>RejFile</strong><span>Wyślij plik i podziel się nim po swojemu.</span><b>Sprawdź ↗</b></a><a class="rj-side-ad rj-side-ad--offer" href="/partnerstwo#propozycja"><span class="rj-side-ad-tag">MIEJSCE REKLAMOWE</span><strong>Zrób miejsce na swój pomysł.</strong><span>Produkt, wydarzenie, usługa lub coś innego.</span><b>Zapytaj o reklamę ↗</b></a>';
  document.body.appendChild(left); document.body.appendChild(right);
  document.body.classList.add('rj-side-ads-enabled');
})();

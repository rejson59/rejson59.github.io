/* Lokalne banery: bez sieci reklamowej i bez śledzenia. */
(function () {
  'use strict';
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (!document.body || document.querySelector('.rj-side-ads')) return;
  try { if (sessionStorage.getItem('rj_side_ads_dismissed_v1') === '1') return; } catch (e) {}
  var left = document.createElement('aside'), right = document.createElement('aside');
  left.className = 'rj-side-ads rj-side-ads--left'; right.className = 'rj-side-ads rj-side-ads--right';
  left.setAttribute('aria-label', 'Polecane strony i miejsce reklamowe');
  right.setAttribute('aria-label', 'Polecane strony i miejsce reklamowe');
  left.innerHTML = '<a class="rj-side-ad rj-side-ad--chat" href="/rejchat"><span class="rj-side-ad-tag">OD REJSONA</span><span class="rj-side-ad-symbol" aria-hidden="true">✦</span><strong>RejChat</strong><span>Rozmowy, ludzie i wpisy w jednym miejscu.</span><b>Odkryj ↗</b></a><a class="rj-side-ad rj-side-ad--offer" href="/partnerstwo#propozycja"><span class="rj-side-ad-tag">MIEJSCE REKLAMOWE</span><strong>Twoja reklama tutaj?</strong><span>Możesz wykupić tutaj reklamę.</span><b>Zapytaj o reklamę ↗</b></a>';
  right.innerHTML = '<a class="rj-side-ad rj-side-ad--file" href="/rejfile"><span class="rj-side-ad-tag">OD REJSONA</span><span class="rj-side-ad-symbol" aria-hidden="true">↗</span><strong>RejFile</strong><span>Wyślij plik i podziel się nim po swojemu.</span><b>Sprawdź ↗</b></a><a class="rj-side-ad rj-side-ad--offer" href="/partnerstwo#propozycja"><span class="rj-side-ad-tag">MIEJSCE REKLAMOWE</span><strong>Zrób miejsce na swój pomysł.</strong><span>Produkt, wydarzenie, usługa lub coś innego.</span><b>Zapytaj o reklamę ↗</b></a>';
  function dismiss() {
    try { sessionStorage.setItem('rj_side_ads_dismissed_v1', '1'); } catch (e) {}
    left.remove(); right.remove(); document.body.classList.remove('rj-side-ads-enabled');
  }
  [left, right].forEach(function (rail) {
    var close = document.createElement('button'); close.className = 'rj-side-ads-close'; close.type = 'button';
    close.setAttribute('aria-label', 'Ukryj boczne banery na czas wizyty'); close.title = 'Ukryj boczne banery na czas wizyty'; close.textContent = '×';
    close.addEventListener('click', dismiss); rail.insertBefore(close, rail.firstChild);
  });
  document.body.appendChild(left); document.body.appendChild(right);
  document.body.classList.add('rj-side-ads-enabled');
})();

/* Lokalne promocje w jednej ramce po prawej, bez śledzenia. */
(function () {
  'use strict';
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (!document.body || document.querySelector('.rj-side-ads')) return;
  var right = document.createElement('aside');
  right.className = 'rj-side-ads rj-side-ads--right';
  right.setAttribute('aria-label', 'Mini reklamy i promocje');
  var chat = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 1-8 8 8.5 8.5 0 0 1-3.5-.7L4 20l1.4-4A8 8 0 1 1 20 11Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" stroke-width="2.5"/></svg>';
  var file = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v13H6z"/><path d="M14 3v5h4M12 16V10m-2 2 2-2 2 2"/></svg>';
  var site = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M8 14h8M8 17h5"/></svg>';
  var offer = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 11-5v14L4 14zM4 10v4m3.5 1 1.5 4h3l-1-3.3M18 9l2-2m-2 5h3m-3 3 2 2"/></svg>';
  right.innerHTML = '<div class="rj-side-ads-title">mini reklamy i promocje :) <span class="rj-side-ads-hint">przewiń ↓</span></div>' +
    '<a class="rj-side-ad rj-side-ad--chat" href="/rejchat"><span class="rj-side-ad-top"><span class="rj-side-ad-icon">' + chat + '</span><span class="rj-side-ad-tag">OD REJSONA</span></span><strong>RejChat</strong><span>Rozmowy, ludzie i wpisy.</span><b>Odkryj ↗</b></a>' +
    '<a class="rj-side-ad rj-side-ad--file" href="/rejfile"><span class="rj-side-ad-top"><span class="rj-side-ad-icon">' + file + '</span><span class="rj-side-ad-tag">OD REJSONA</span></span><strong>RejFile</strong><span>Wyślij plik po swojemu.</span><b>Sprawdź ↗</b></a>' +
    '<a class="rj-side-ad rj-side-ad--site" href="/uslugi"><span class="rj-side-ad-top"><span class="rj-side-ad-icon">' + site + '</span><span class="rj-side-ad-tag">STRONY Z POMYSŁEM</span></span><strong>Masz pomysł na swoją stronę?</strong><span>Stwórzmy ją razem.</span><b>Dowiedz się więcej ↗</b></a>' +
    '<a class="rj-side-ad rj-side-ad--offer" href="/partnerstwo#propozycja"><span class="rj-side-ad-top"><span class="rj-side-ad-icon">' + offer + '</span><span class="rj-side-ad-tag">MIEJSCE REKLAMOWE</span></span><strong>Masz coś, czym chcesz się podzielić?</strong><span>Reklama i współpraca dla każdego.</span><b>Zapytaj ↗</b></a>';
  document.body.appendChild(right);
  document.body.classList.add('rj-side-ads-enabled');
})();

/* Zwykły link prowadzi wprost do projektu. Znacznik należy tylko do nowej karty. */
(function () {
  'use strict';
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest && event.target.closest('a[data-journey][target="_blank"]');
    if (!link || link.hasAttribute('download')) return;
    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return; }
    // Obcej strony nie wolno zmieniać ani przekazywać jej danych sesji.
    if (url.origin !== location.origin || (url.protocol !== 'https:' && url.protocol !== 'http:')) return;
    var tab;
    try { tab = window.open('about:blank', '_blank'); } catch (e) { return; }
    if (!tab) return; // Blokada wyskakujących okien: zachowaj zwykły link.
    event.preventDefault();
    try {
      var card = link.closest('[data-repo]');
      var name = card ? (card.getAttribute('data-repo') || '').slice(0, 100) : '';
      tab.sessionStorage.setItem('rj_rocket_overlay_v2', JSON.stringify({path:url.pathname, at:Date.now(), name:name, motionOverride:true}));
      // Stary bootstrap niektórych projektów sprawdza ten klucz. Stary skrypt
      // odrzuci wygasły znacznik, a nowy przeczyta wyłącznie nowy klucz.
      tab.sessionStorage.setItem('rj_portal_arrival_v1', JSON.stringify({path:url.pathname, at:0}));
    } catch (e) { /* Strona otworzy się bez nakładki, jeśli storage jest zablokowany. */ }
    try {
      var meta = tab.document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; tab.document.head.appendChild(meta);
    } catch (e) { /* Przeglądarka może zablokować dostęp do dokumentu pustej karty. */ }
    var detached = false;
    try { tab.opener = null; detached = tab.opener === null; } catch (e) {}
    if (!detached) {
      try { tab.close(); } catch (e) {}
      window.open(url.href, '_blank', 'noopener,noreferrer');
      return;
    }
    try { tab.location.replace(url.href); } catch (e) { tab.location.href = url.href; }
  });
})();

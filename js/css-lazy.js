/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * Podłączanie arkuszy odroczonych (`<link rel="preload" as="style">`).
 *
 * Po co: strona główna miała 31 blokujących arkuszy. Największy z nich,
 * `/hub/island.css` (49 KB), opisuje wyłącznie wyspę montowaną przez
 * `island.js` po DOMContentLoaded — blokowanie nim pierwszego malowania
 * było stratą czasu. Arkusz jedzie więc jako `preload`, a ten plik
 * zamienia go w normalny stylesheet, gdy dokument jest już gotowy.
 *
 * Dlaczego nie `onload="this.media='all'"`: CSP RejHuba ma
 * `script-src-attr 'none'`, więc inline handlery są blokowane i arkusz
 * nigdy by się nie podłączył.
 *
 * Jak oznaczać: `<link rel="preload" href="…" as="style" data-rj-css>`
 * plus `<noscript>` z tym samym adresem dla osób bez JS.
 */
(function () {
  "use strict";

  function attach() {
    var links = document.querySelectorAll('link[rel="preload"][as="style"][data-rj-css]');
    for (var i = 0; i < links.length; i++) {
      var preload = links[i];
      if (preload.dataset.rjCssDone === "1") continue;
      preload.dataset.rjCssDone = "1";
      var style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = preload.href;
      /* Kolejność w <head> musi zostać taka jak w HTML — wstawiamy tuż za
         preloadem, żeby kaskada nie zamieniła się miejscami. */
      preload.parentNode.insertBefore(style, preload.nextSibling);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  } else {
    attach();
  }
})();

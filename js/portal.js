/* Efekt wejścia uruchamia wyłącznie zwykłe kliknięcie w prawdziwy link. */
(function () {
  "use strict";
  var KEY = "rj_portal_arrival_v1";
  var DURATION = 1350;
  var busy = false;
  var timer = 0;
  var overlay = null;

  function reduced() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function clearFlight() {
    if (timer) clearTimeout(timer);
    timer = 0; busy = false;
    if (overlay) overlay.remove();
    overlay = null;
  }
  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    clearFlight();
    try { sessionStorage.removeItem(KEY); } catch (e) { /* normalny powrót */ }
  });

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var anchor = event.target && event.target.closest && event.target.closest("a[data-portal][href]");
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
    var url;
    try { url = new URL(anchor.href, location.href); } catch (e) { return; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (busy) { event.preventDefault(); return; }

    event.preventDefault(); // także przed istniejącym loaderem nawigacji
    if (reduced()) {
      try { sessionStorage.removeItem(KEY); } catch (e) { /* storage niedostępny */ }
      location.assign(url.href);
      return;
    }
    busy = true;
    try {
      if (url.origin === location.origin) {
        sessionStorage.setItem(KEY, JSON.stringify({ path: url.pathname, at: Date.now() }));
      } else {
        sessionStorage.removeItem(KEY);
      }
    } catch (e) { /* przejście nadal działa bez storage */ }

    try {
      overlay = document.createElement("div");
      overlay.id = "rj-portal-flight";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML = '<div class="rj-portal-stars" aria-hidden="true"></div><div class="rj-portal-vortex" aria-hidden="true"></div><div class="rj-portal-caption"></div>';
      var card = anchor.closest("[data-repo]");
      overlay.querySelector(".rj-portal-caption").textContent = "Przejście do: " + (card ? card.getAttribute("data-repo") : "projektu");
      document.body.appendChild(overlay);
      timer = setTimeout(function () { location.assign(url.href); }, DURATION);
    } catch (e) {
      clearFlight();
      location.assign(url.href);
    }
  }, true);
})();

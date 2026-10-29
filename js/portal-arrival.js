/* Uruchamiane na obsługiwanych stronach projektów przez service worker.
   Bez znacznika z tej samej karty nie zmienia strony projektu. */
(function () {
  "use strict";
  var KEY = "rj_portal_arrival_v1";
  var marker;
  try {
    marker = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (!marker) return;
    sessionStorage.removeItem(KEY); // znacznik jest jednorazowy, także po odświeżeniu
  } catch (e) { return; }
  function path(p) { return String(p || "").replace(/\/+$/, "") || "/"; }
  if (typeof marker.path !== "string" || typeof marker.at !== "number" ||
      Date.now() - marker.at < 0 || Date.now() - marker.at > 60000 ||
      path(marker.path) !== path(location.pathname)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.top !== window.self) return;

  // SW umieszcza arkusz przed skryptem; bez CSS nie pokazujemy zasłony.
  // Dzięki temu działa również przy CSP blokującym style inline.
  var stylesheet = document.querySelector("link[data-rj-portal-style]");
  if (!stylesheet || !stylesheet.sheet) return;
  var root = document.createElement("div");
  root.id = "rj-portal-arrival";
  root.className = "is-playing";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = '<div class="rj-portal-vortex"></div>';
  document.documentElement.appendChild(root);
  function remove() { if (root.parentNode) root.parentNode.removeChild(root); }
  root.addEventListener("animationend", function (event) { if (event.target === root) remove(); });
  setTimeout(remove, 2200); // nigdy nie zostawiaj strony zakrytej
})();

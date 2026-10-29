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
  // Strona portalu przekazuje informację, czy animacja jest włączona.
  var motionOverride = marker.motionOverride === true;
  if (!motionOverride && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.top !== window.self) return;

  // SW umieszcza arkusz przed skryptem; bez CSS nie pokazujemy zasłony.
  // Dzięki temu działa również przy CSP blokującym style inline.
  var stylesheet = document.querySelector("link[data-rj-portal-style]");
  if (!stylesheet || !stylesheet.sheet) return;
  var root = document.createElement("div");
  root.id = "rj-portal-arrival";
  if (motionOverride) root.setAttribute("data-motion-override", "");
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.innerHTML = '<div class="rj-arrival-panel rj-panel-nw" aria-hidden="true"></div><div class="rj-arrival-panel rj-panel-ne" aria-hidden="true"></div><div class="rj-arrival-panel rj-panel-sw" aria-hidden="true"></div><div class="rj-arrival-panel rj-panel-se" aria-hidden="true"></div><div class="rj-portal-vortex" aria-hidden="true"></div><div class="rj-portal-arrival-caption">Ładowanie projektu…</div>';
  document.documentElement.appendChild(root);
  var started = false;
  function remove() { if (root.parentNode) root.parentNode.removeChild(root); }
  function reveal() {
    if (started) return;
    started = true;
    root.classList.add("is-playing");
    setTimeout(remove, 3000); // awaryjne sprzątanie po animacji
  }
  root.addEventListener("animationend", function (event) { if (event.target === root) remove(); });
  if (document.readyState === "complete") reveal();
  else window.addEventListener("load", reveal, { once: true });
  setTimeout(reveal, 12000); // nieskończone ładowanie nie może blokować projektu
})();

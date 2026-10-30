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
  function path(p) { return String(p || "").replace(/\/index\.html?$/i, "").replace(/\/+$/, "") || "/"; }
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
  root.innerHTML = '<div class="rj-arrival-vignette rj-arrival-wide" aria-hidden="true"></div><div class="rj-arrival-vignette rj-arrival-medium" aria-hidden="true"></div><div class="rj-arrival-vignette rj-arrival-small" aria-hidden="true"></div><div class="rj-arrival-ring" aria-hidden="true"></div><div class="rj-arrival-echo rj-arrival-echo--one" aria-hidden="true"></div><div class="rj-arrival-echo rj-arrival-echo--two" aria-hidden="true"></div><div class="rj-arrival-rays" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="rj-arrival-veil" aria-hidden="true"></div><div class="rj-portal-vortex" aria-hidden="true"></div><div class="rj-portal-arrival-caption">Ładowanie projektu…</div>';
  document.documentElement.appendChild(root);
  var started = false;
  var removed = false;
  var timer = 0;
  var loadTimer = 0;
  var remaining = 4000;
  var visibleSince = 0;
  function remove() {
    if (removed) return;
    removed = true;
    clearTimeout(timer);
    clearTimeout(loadTimer);
    document.removeEventListener("visibilitychange", syncVisibility);
    if (root.parentNode) root.parentNode.removeChild(root);
  }
  function syncVisibility() {
    if (removed) return;
    var hidden = document.visibilityState === "hidden";
    root.classList.toggle("is-paused", hidden);
    if (!started) return;
    if (hidden) {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
        remaining = Math.max(0, remaining - (Date.now() - visibleSince));
      }
    } else if (!timer) {
      visibleSince = Date.now();
      timer = setTimeout(remove, remaining);
    }
  }
  function reveal() {
    if (started || removed) return;
    started = true;
    // Stan pauzy ustawiamy przed rozpoczęciem animacji, również gdy strona
    // zdąży się załadować w nieaktywnej karcie.
    syncVisibility();
    root.classList.add("is-playing");
  }
  document.addEventListener("visibilitychange", syncVisibility);
  syncVisibility();
  root.addEventListener("animationend", function (event) { if (event.target === root && event.animationName === "rj-arrival-finished") remove(); });
  if (document.readyState === "complete") reveal();
  else window.addEventListener("load", reveal, { once: true });
  loadTimer = setTimeout(reveal, 12000); // nieskończone ładowanie nie może blokować projektu
})();

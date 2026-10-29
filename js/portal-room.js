/* Osobna przestrzeń portalu. Adres projektu pochodzi z listy repozytoriów,
   nigdy z dowolnego URL-a w parametrze strony. */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var name = params.get("projekt") || "";
  var featured = { RejStream: "https://rejson59.github.io/RejStream/", Jakuplayer: "https://rejson59.github.io/Jakuplayer/", JoyPad: "https://rejson59.github.io/JoyPad/", mconline: "https://rejson59.github.io/mconline/", VibeAnimations: "https://rejson59.github.io/VibeAnimations/" };
  var door = document.getElementById("portal-door");
  var button = document.getElementById("enter");
  var direct = document.getElementById("direct");
  var status = document.getElementById("status");
  var flight = document.getElementById("flight");
  var target = null;
  var travelling = false;
  var raf = 0;
  var previous = null;
  var KEY = "rj_portal_arrival_v1";
  var FLIGHT_MS = 4200;
  // Samodzielne wejście do portalu też może przygotować znany globalny SW.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("/sw.js?v=2", { scope: "/", updateViaCache: "none" }).catch(function () {});
  }

  function find(list) {
    if (!Array.isArray(list)) return null;
    return list.find(function (repo) { return repo && repo.name === name; }) || null;
  }
  function liveUrl(repo) {
    if (!repo) return null;
    var home = typeof repo.homepage === "string" ? repo.homepage.trim() : "";
    try {
      var url = new URL(home);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch (e) { /* brak poprawnej strony */ }
    if (repo.has_pages || repo.name === "rejson-widgets") return "https://rejson59.github.io/" + encodeURIComponent(repo.name) + "/";
    return null;
  }
  function setTarget(href) {
    if (!href || travelling) return;
    target = href;
    direct.href = href;
    direct.hidden = false;
    button.disabled = false;
    door.disabled = false;
    status.textContent = "";
    // Wskazówka dla przeglądarki, bez osadzania projektu i udawania gotowości.
    try {
      if (new URL(href).origin === location.origin) {
        var prefetch = document.createElement("link");
        prefetch.rel = "prefetch"; prefetch.href = href;
        document.head.appendChild(prefetch);
      }
    } catch (e) { /* nawigacja i tak zadziała */ }
  }
  function go() {
    if (!target || travelling) return;
    travelling = true;
    door.disabled = true; button.disabled = true;
    var url = new URL(target);
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function navigate() {
      try {
        if (!reduced && url.origin === location.origin) sessionStorage.setItem(KEY, JSON.stringify({ path: url.pathname, at: Date.now() }));
        else sessionStorage.removeItem(KEY);
      } catch (e) { /* brak storage nie blokuje przejścia */ }
      location.assign(url.href);
    }
    if (reduced) { navigate(); return; }
    flight.classList.add("is-active");
    document.body.classList.add("is-travelling");
    try { if (window.RJPortalScene) window.RJPortalScene.start(FLIGHT_MS); } catch (e) { /* nawigacja nie zależy od grafiki */ }
    status.textContent = "Wyruszamy do projektu…";
    // Liczymy wyłącznie widoczny czas: przełączenie karty nie skróci animacji.
    var elapsed = 0;
    previous = null;
    function tick(now) {
      if (document.visibilityState === "visible") {
        if (previous !== null) elapsed += Math.max(0, now - previous);
        previous = now;
      } else previous = null;
      if (elapsed >= FLIGHT_MS) navigate();
      else raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener("visibilitychange", function () {
    previous = null;
    flight.classList.toggle("is-paused", document.visibilityState !== "visible");
  });
  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    if (raf) cancelAnimationFrame(raf);
    travelling = false; flight.classList.remove("is-active");
    document.body.classList.remove("is-travelling");
    try { if (window.RJPortalScene) window.RJPortalScene.reset(); } catch (e) { /* brak sceny nie blokuje powrotu */ }
    if (target) { door.disabled = false; button.disabled = false; status.textContent = ""; }
    try { sessionStorage.removeItem(KEY); } catch (e) { /* brak storage */ }
  });
  door.addEventListener("click", go);
  button.addEventListener("click", go);

  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === "." || name === "..") {
    status.textContent = "Nie znaleziono tego portalu. Wróć na stronę główną i wybierz projekt.";
    return;
  }
  document.getElementById("project-name").textContent = name;
  document.title = "Portal do " + name + " — Rejson59";
  // GitHub Pages nie obsługuje dynamicznego routingu: katalog /portal/ jest
  // prawdziwą stroną, a ten przyjazny adres odtwarza 404.html przy odświeżeniu.
  try { history.replaceState(null, "", "/portal/" + encodeURIComponent(name)); } catch (e) { /* bez zmiany adresu */ }
  var cached = null;
  try { var stored = JSON.parse(localStorage.getItem("rejson_repos_cache_v2") || "null"); cached = find(stored && stored.data); } catch (e) { /* użyj kopii */ }
  var featuredUrl = Object.prototype.hasOwnProperty.call(featured, name) ? featured[name] : null;
  setTarget(featuredUrl || liveUrl(cached) || liveUrl(find(window.PROJECTS_FALLBACK)));
  if (!target) {
    // Repo dodane niedawno może nie być jeszcze w lokalnej kopii listy.
    fetch("https://api.github.com/repos/rejson59/" + encodeURIComponent(name), { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) { if (!r.ok) throw new Error("repo"); return r.json(); })
      .then(function (repo) {
        if (repo.name === name) setTarget(liveUrl(repo));
        if (!target) status.textContent = "Nie znaleziono strony live tego projektu. Wróć na stronę główną.";
      }).catch(function () { status.textContent = "Nie udało się odnaleźć projektu. Wróć na stronę główną i spróbuj ponownie."; });
  }
})();

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
  var motionToggle = document.getElementById("motion-toggle");
  var motionEnabled = true;
  var target = null;
  var travelling = false;
  var raf = 0;
  var previous = null;
  var KEY = "rj_portal_arrival_v1";
  var FLIGHT_MS = 4200;
  // Przy pierwszej wizycie instalacja SW może skończyć się po locie. Bez
  // aktywnego workera dokument projektu nie dostanie animacji wyjścia.
  var workerPending = null;
  var workerSettled = false;
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    try {
      workerPending = navigator.serviceWorker.register("/sw.js?v=2", { scope: "/", updateViaCache: "none" })
        .then(function () { return navigator.serviceWorker.ready; })
        .then(function () { workerSettled = true; }, function () { workerSettled = true; });
    } catch (e) { workerSettled = true; /* SW nie może blokować portalu */ }
  }

  // Animacja startuje od razu. Odwiedzający nadal może ją wyłączyć.
  function updateMotionControl() {
    if (!motionToggle) return;
    document.body.classList.toggle("motion-override", motionEnabled);
    document.body.classList.toggle("motion-off", !motionEnabled);
    motionToggle.setAttribute("aria-pressed", String(motionEnabled));
    motionToggle.textContent = motionEnabled ? "Wyłącz animację portalu" : "Włącz animację portalu";
    document.dispatchEvent(new Event("rj-portal-motion"));
  }
  if (motionToggle) motionToggle.addEventListener("click", function () {
    if (travelling) return;
    motionEnabled = !motionEnabled;
    updateMotionControl();
  });
  updateMotionControl();

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
    var reduced = !motionEnabled;
    function navigate() {
      var done = false;
      function finish() {
        if (done || !travelling) return;
        done = true;
        try {
          if (!reduced && url.origin === location.origin) sessionStorage.setItem(KEY, JSON.stringify({ path: url.pathname, at: Date.now(), motionOverride: true }));
          else sessionStorage.removeItem(KEY);
        } catch (e) { /* brak storage nie blokuje przejścia */ }
        location.assign(url.href);
      }
      if (reduced || url.origin !== location.origin || !workerPending || workerSettled) { finish(); return; }
      // Krótkie, ograniczone oczekiwanie tylko po ukończonym locie. W razie
      // odmowy lub awarii nadal otwieramy projekt, bez blokowania nawigacji.
      var timeout = setTimeout(finish, 5000);
      workerPending.then(function () { clearTimeout(timeout); finish(); });
    }
    if (reduced) { navigate(); return; }
    var bounds = door.getBoundingClientRect();
    if (bounds.width > 0) {
      flight.style.setProperty("--portal-x", (bounds.left + bounds.width / 2) + "px");
      flight.style.setProperty("--portal-y", (bounds.top + bounds.height / 2) + "px");
      flight.style.setProperty("--portal-size", bounds.width + "px");
      flight.style.setProperty("--portal-height", bounds.height + "px");
      flight.style.setProperty("--travel-x", (window.innerWidth / 2 - bounds.left - bounds.width / 2) + "px");
      flight.style.setProperty("--travel-y", (window.innerHeight / 2 - bounds.top - bounds.height / 2) + "px");
    }
    // Wejście zaczyna się na prawdziwej, żywej bramie, nie na nowym płaskim kółku.
    // Klon istnieje tylko przez czas lotu; oryginał pozostaje na stronie portalu.
    var mouth = document.getElementById("flight-mouth");
    var scene = door.querySelector(".portal-layers");
    if (mouth && scene) {
      var oldScene = mouth.querySelector(".flight-source");
      if (oldScene) oldScene.remove();
      var source = scene.cloneNode(true);
      source.classList.add("flight-source");
      mouth.appendChild(source);
      mouth.classList.add("has-source");
    }
    flight.classList.add("is-active");
    document.body.classList.add("is-travelling");
    document.dispatchEvent(new Event("rj-portal-flight"));
    // Pigułka ma najwyższą warstwę: na czas lotu nie może zasłaniać tunelu.
    var feedback = document.getElementById("rejson-liquid-widget-root");
    if (feedback) feedback.style.setProperty("visibility", "hidden", "important");
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
    document.body.classList.toggle("scene-paused", document.visibilityState === "hidden");
  });
  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    if (raf) cancelAnimationFrame(raf);
    travelling = false; flight.classList.remove("is-active");
    document.body.classList.remove("is-travelling");
    document.dispatchEvent(new Event("rj-portal-reset"));
    var feedback = document.getElementById("rejson-liquid-widget-root");
    if (feedback) feedback.style.setProperty("visibility", "visible", "important");
    var mouth = document.getElementById("flight-mouth");
    if (mouth) { var copy = mouth.querySelector(".flight-source"); if (copy) copy.remove(); mouth.classList.remove("has-source"); }
    if (target) { door.disabled = false; button.disabled = false; status.textContent = ""; }
    try { sessionStorage.removeItem(KEY); } catch (e) { /* brak storage */ }
  });
  door.addEventListener("click", go);
  button.addEventListener("click", go);

  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === "." || name === "..") {
    status.textContent = "Nie znaleziono tego portalu. Wróć na stronę główną i wybierz projekt.";
    return;
  }
  /* Każdy projekt ma stałą, własną aurę; kolory nie zmieniają celu ani animacji lotu. */
  var hueHash = 0;
  for (var i = 0; i < name.length; i++) hueHash = (hueHash * 31 + name.charCodeAt(i)) >>> 0;
  document.body.dataset.aura = ["mint", "violet", "azure", "rose"][hueHash % 4];
  var nameNode = document.getElementById("project-name");
  nameNode.textContent = name;
  nameNode.classList.toggle("project-name--long", name.length > 18);
  nameNode.classList.toggle("project-name--very-long", name.length > 35);
  document.title = "Portal do " + name + " — Rejson59";
  // GitHub Pages nie obsługuje dynamicznego routingu: katalog /portal/ jest
  // prawdziwą stroną, a ten przyjazny adres odtwarza 404.html przy odświeżeniu.
  try { history.replaceState(null, "", "/portal/" + encodeURIComponent(name)); } catch (e) { /* bez zmiany adresu */ }
  var cached = null;
  try { var stored = JSON.parse(localStorage.getItem("rejson_repos_cache_v2") || "null"); cached = find(stored && stored.data); } catch (e) { /* użyj kopii */ }
  var featuredUrl = Object.prototype.hasOwnProperty.call(featured, name) ? featured[name] : null;
  var fallback = find(window.PROJECTS_FALLBACK);
  var featuredDescriptions = { RejStream: "Seriale i animacje w przeglądarce.", Jakuplayer: "Prosty odtwarzacz w przeglądarce.", JoyPad: "Zamień komputer i telefon w bezprzewodową konsolę." };
  var description = (cached && typeof cached.description === "string" && cached.description) ||
    (fallback && typeof fallback.description === "string" && fallback.description) || (Object.prototype.hasOwnProperty.call(featuredDescriptions, name) && featuredDescriptions[name]) || "Odkryj projekt, gdy zechcesz.";
  var descriptionNode = document.getElementById("project-description");
  if (descriptionNode) descriptionNode.textContent = String(description).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160);
  setTarget(featuredUrl || liveUrl(cached) || liveUrl(fallback));
  if (!target) {
    // Repo dodane niedawno może nie być jeszcze w lokalnej kopii listy.
    var lookupTimer = setTimeout(function () {
      if (!target) status.textContent = "Nie udało się odnaleźć projektu. Wróć na stronę główną i spróbuj ponownie.";
    }, 8000);
    try {
      fetch("https://api.github.com/repos/rejson59/" + encodeURIComponent(name), { headers: { Accept: "application/vnd.github+json" } })
        .then(function (r) { if (!r.ok) throw new Error("repo"); return r.json(); })
        .then(function (repo) {
          clearTimeout(lookupTimer);
          if (repo.name === name) setTarget(liveUrl(repo));
          if (!target) status.textContent = "Nie znaleziono strony live tego projektu. Wróć na stronę główną.";
        }).catch(function () {
          clearTimeout(lookupTimer);
          status.textContent = "Nie udało się odnaleźć projektu. Wróć na stronę główną i spróbuj ponownie.";
        });
    } catch (e) {
      clearTimeout(lookupTimer);
      status.textContent = "Nie udało się odnaleźć projektu. Wróć na stronę główną i spróbuj ponownie.";
    }
  }
})();

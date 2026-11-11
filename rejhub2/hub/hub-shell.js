/* RejHub 2.0 — wspólny element podstron: porządki po starym service workerze.
   Autodestrukcja NIE jest już tutaj: jedynym jej miejscem jest dynamiczna
   wyspa (hub/island.js → dock → „Zamknij”). Pigułka w rogu została usunięta. */
(function () {
  "use strict";

  /* Strona główna RejHub 2.0 nie ma się rejestrować w starym service workerze. */
  function dropOldServiceWorkers() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then(function (list) {
      list.forEach(function (registration) {
        var scope = registration.scope || "";
        if (scope.indexOf("/sw") !== -1 || scope === location.origin + "/") {
          registration.unregister().catch(function () {});
        }
      });
    }).catch(function () {});
  }

  /* ---------- animacje poza kadrem ----------
     Karta z pulsującą kropką, obracająca się poświata premium i smugi szkła
     liczą się w każdej klatce, nawet gdy są kilka ekranów niżej. Zatrzymujemy
     je, gdy wyjadą z widoku (IntersectionObserver + klasa) — po powrocie
     animacja gra dalej od tego samego miejsca cyklu, więc wygląd się nie
     zmienia, a kompozytor nie robi nic dla tego, czego nie widać. */
  var PAUSED_CLASS = "rj-anim-paused";
  var ANIM_TARGETS = ".project-card, .rj-premium, .board-cta, .comm-cta, .rj-home-stats, " +
    ".universe-nav, .universe-links a, .rj-side-ad, .rj-mobile-ad";

  function watchOffscreenAnimations() {
    if (!("IntersectionObserver" in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        entry.target.classList.toggle(PAUSED_CLASS, !entry.isIntersecting);
      }
    }, { rootMargin: "120px 0px 120px 0px", threshold: 0 });

    function scan() {
      var list = document.querySelectorAll(ANIM_TARGETS);
      for (var i = 0; i < list.length; i++) {
        if (list[i].__rjPauseWatched) continue;
        list[i].__rjPauseWatched = true;
        observer.observe(list[i]);
      }
    }

    scan();

    /* Karty projektów dochodzą z API GitHuba już po starcie strony. */
    if (!("MutationObserver" in window)) return;
    var timer = 0;
    var watcher = new MutationObserver(function (records) {
      if (timer) return; /* skanowanie już zaplanowane */
      for (var i = 0; i < records.length; i++) {
        var nodes = records[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue;
          if (node.matches(ANIM_TARGETS) || node.querySelector(ANIM_TARGETS)) {
            timer = setTimeout(function () { timer = 0; scan(); }, 300);
            return;
          }
        }
      }
    });
    watcher.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (window.RejPanic && typeof window.RejPanic.mount === "function") window.RejPanic.mount();
    });
  } else if (window.RejPanic && typeof window.RejPanic.mount === "function") {
    window.RejPanic.mount();
  }
  dropOldServiceWorkers();
  watchOffscreenAnimations();
})();

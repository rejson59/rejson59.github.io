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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (window.RejPanic && typeof window.RejPanic.mount === "function") window.RejPanic.mount();
    });
  } else if (window.RejPanic && typeof window.RejPanic.mount === "function") {
    window.RejPanic.mount();
  }
  dropOldServiceWorkers();
})();

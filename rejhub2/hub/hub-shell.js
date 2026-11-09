/* RejHub 2.0 — wspólny element podstron: powrót do huba i drobne poprawki. */
(function () {
  "use strict";

  function addPill() {
    if (document.querySelector(".rjhub-pill")) return;
    var pill = document.createElement("a");
    pill.className = "rjhub-pill";
    pill.href = "/";
    pill.setAttribute("aria-label", "Wróć do RejHub 2.0");
    pill.innerHTML =
      '<span class="rjhub-pill-mark" aria-hidden="true">R</span>' +
      "<span>RejHub</span>" +
      '<span class="rjhub-pill-arrow" aria-hidden="true">↗</span>';
    document.body.appendChild(pill);
  }

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
    document.addEventListener("DOMContentLoaded", addPill);
  } else {
    addPill();
  }
  dropOldServiceWorkers();
})();

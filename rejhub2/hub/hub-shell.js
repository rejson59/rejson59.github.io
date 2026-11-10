/* RejHub 2.0 — wspólny element podstron: awaryjne zamknięcie i drobne poprawki. */
(function () {
  "use strict";

  /* Wcześniej w tym miejscu był link „RejHub ↗” prowadzący na stronę główną.
     Był rzadko używany, więc jego miejsce zajmuje szybka autodestrukcja:
     ta sama pigułka, ten sam róg, ale realna funkcja awaryjna. */
  function addPill() {
    /* Nowa wyspa (hub/island.js) ma własne wyjście awaryjne — stara pigułka
       byłaby w tym samym rogu ekranu duplikatem. */
    if (document.querySelector('script[src*="hub/island.js"]') || window.__RJ_ISLAND__) return;
    if (document.querySelector(".rjhub-pill")) return;
    /* Strony-przekierowania (podroz, portal) nie potrzebują pigułki —
       znikają z ekranu w ułamku sekundy. */
    if (document.querySelector(".rj-legacy-home")) return;
    var pill = document.createElement("button");
    pill.type = "button";
    pill.className = "rjhub-pill rjhub-pill--panic";
    pill.setAttribute("data-rj-panic", "");
    pill.title = "Szybka autodestrukcja — zamyka wszystkie karty RejHubu (Ctrl+Shift+X)";
    pill.setAttribute("aria-label", "Szybka autodestrukcja: zamknij wszystkie karty RejHubu");
    pill.innerHTML =
      '<span class="rjhub-pill-mark" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3v9" /><path d="M6.5 6.5a7.5 7.5 0 1 0 11 0" /></svg>' +
      "</span>" +
      "<span>Autodestrukcja</span>";
    document.body.appendChild(pill);
    if (window.RejPanic && typeof window.RejPanic.mount === "function") window.RejPanic.mount();
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

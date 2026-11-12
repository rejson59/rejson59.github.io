/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja

   Przeniesienie RejHuba na nowy adres.

   Stare strony (rejson59.github.io) nie są już rozwijane — cały serwis
   działa pod https://rejhub.vercel.app. Ten skrypt przenosi odwiedzającego
   razem ze ścieżką, parametrami (`?…`) i kotwicą (`#…`), żeby np. link do
   konkretnego czatu albo profilu prowadził dokładnie tam, gdzie prowadził.

   Działa też bez JavaScriptu: każda strona ma `<meta http-equiv="refresh">`
   z tym samym adresem, a pod spodem widoczny przycisk „Przejdź do RejHub”. */
(function () {
  "use strict";

  var NEW_ORIGIN = "https://rejhub.vercel.app";

  /* Stare adresy z końcówką `.html` i katalogi `…/index.html` prowadzą do
     tych samych, czystych adresów na nowej stronie (cleanUrls). */
  function cleanPath(path) {
    var value = path || "/";
    value = value.replace(/\/index\.html?$/i, "/");
    value = value.replace(/\.html?$/i, "");
    value = value.replace(/\/{2,}/g, "/");
    /* `/podroz/` i `/podroz` to na nowej stronie ten sam adres — bez ukosnika
       na końcu link jest krótszy i nie tworzy dwóch wersji w historii. */
    if (value.length > 1) value = value.replace(/\/+$/, "");
    if (value === "") value = "/";
    if (value.charAt(0) !== "/") value = "/" + value;
    return value;
  }

  var body = document.body;
  var explicit = body ? body.getAttribute("data-przeniesienie") : null;
  var path = explicit ? cleanPath(explicit) : cleanPath(window.location.pathname);

  var target = NEW_ORIGIN + path + window.location.search + window.location.hash;

  /* Podgląd adresu i przycisk działają także wtedy, gdy przeglądarka
     zablokuje automatyczne przekierowanie. */
  var link = document.getElementById("rj-przeniesienie-link");
  if (link) link.href = target;
  var shown = document.getElementById("rj-przeniesienie-adres");
  if (shown) shown.textContent = "rejhub.vercel.app" + path;

  /* `replace`, żeby „Wstecz” nie wracało na starą stronę i nie zapętlało
     przekierowania. */
  window.location.replace(target);
})();

/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/* RejHub 2.0 — wspólny loader.
   Losuje jeden z 16 znaczników z /szklane-studio (loader-mark + mark-*), chowa
   nakładkę po wczytaniu strony i pokazuje ją ponownie przy przejściu
   na inną podstronę. Na czterech stronach ze starym loaderem
   (data-legacy="1") chowanie zostawiamy js/loader.js, żeby nie dublować
   dwóch harmonogramów — tutaj tylko losujemy znacznik. */
(function () {
  "use strict";

  var overlay = document.getElementById("rj-page-loader");
  if (!overlay) return;

  var MARKS = [
    "mark-orbit", "mark-comet", "mark-dots", "mark-bounce",
    "mark-bubbles", "mark-ripple", "mark-prism", "mark-sweep",
    "mark-halo", "mark-droplet", "mark-aurora", "mark-crystal",
    "mark-typing", "mark-wave", "mark-fill", "mark-spark"
  ];

  /* Jeden znacznik na wejście — kolejne strony dostają inny. */
  var mark = overlay.querySelector(".loader-mark");
  if (mark) {
    var pick = MARKS[Math.floor(Math.random() * MARKS.length)];
    for (var i = 0; i < MARKS.length; i++) mark.classList.remove(MARKS[i]);
    mark.classList.add(pick);
  }

  if (overlay.getAttribute("data-legacy") === "1") return;

  var MIN_MS = 650;
  var startedAt = (window.performance && performance.now) ? performance.now() : Date.now();
  var hidden = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function hide() {
    if (hidden) return;
    hidden = true;
    overlay.classList.add("is-hidden");
    document.documentElement.classList.remove("rj-loading");
  }

  function hideSoon() {
    var left = reduce ? 0 : MIN_MS - (now() - startedAt);
    setTimeout(hide, Math.max(0, left));
  }

  function show() {
    hidden = false;
    overlay.classList.remove("is-hidden");
    document.documentElement.classList.add("rj-loading");
    startedAt = now();
  }

  if (document.readyState === "complete") {
    hideSoon();
  } else {
    window.addEventListener("load", hideSoon, { once: true });
  }

  /* Failsafe: gdyby jakieś zdjęcie wisiało, nakładka i tak zejdzie. */
  setTimeout(hide, 7000);

  /* Powrót z bfcache — strona jest już gotowa, nie ma czego ładować. */
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) hide();
  });

  /* Klik w link wewnętrzny: pokaż nakładkę od razu, żeby przejście nie
     mrugało gołą tapetą. Nowe karty i pliki zostawiamy w spokoju. */
  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link) return;
    if (link.target && link.target !== "_self") return;
    if (link.hasAttribute("download")) return;
    var href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#") return;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;

    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;

    show();
  }, true);

  /* Wstecz/dalej bez pełnego przeładowania — nakładka nie może zostać. */
  window.addEventListener("beforeunload", function () {
    if (!hidden) overlay.classList.add("is-hidden");
  });
})();

/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * RejHub 2.0 — wspólna obsługa topbaru (v5).
 *
 * Jeden binder dla wszystkich podstron: motyw, menu mobilne, panel „Więcej”,
 * Escape i podświetlenie bieżącej strony. Znaczniki są identyczne w każdej
 * podstronie (pilnuje tego `scripts/jsdom/topbar.test.js`), więc różnice w
 * działaniu nie mogą już wynikać z tego, kto pierwszy podpiął przycisk.
 *
 * Idempotencja: każdy element dostaje `data-rj-bound="1"` zanim dostanie
 * nasłuch. Dzięki temu strona z własną obsługą (np. stara witryna, RejChat)
 * nie przełącza motywu dwa razy.
 */
(function (window, document) {
  "use strict";

  var BOUND = "rjBound";

  function bindOnce(element, key) {
    if (!element) return false;
    if (element.dataset[BOUND]) return false;
    element.dataset[BOUND] = "1";
    void key;
    return true;
  }

  /* Jeden zapis motywu w całym RejHubie — zgodny z tym, co robi reszta strony. */
  function toggleTheme() {
    var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (error) { /* tryb prywatny */ }
  }

  function setupTheme() {
    var theme = document.querySelector(".rj-shared-header [data-shared-theme], .rj-shared-header .theme-toggle");
    if (!bindOnce(theme, "theme")) return;
    theme.addEventListener("click", toggleTheme);
  }

  function setupMenu() {
    var header = document.querySelector(".rj-shared-header");
    if (!header) return;
    var button = header.querySelector(".hamburger-btn");
    var nav = button && document.getElementById(button.getAttribute("aria-controls"));
    if (!button || !nav) return;
    if (!bindOnce(button, "menu")) return;

    function setOpen(open) {
      nav.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Zamknij menu" : "Otwórz menu");
    }

    button.addEventListener("click", function (event) {
      event.stopPropagation();
      setOpen(button.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("click", function (event) {
      if (!nav.classList.contains("is-open")) return;
      if (!nav.contains(event.target) && !button.contains(event.target)) setOpen(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (nav.classList.contains("is-open")) {
        setOpen(false);
        button.focus();
      }
    });
  }

  function setupMore() {
    var more = document.querySelector(".rj-shared-header .nav-more");
    if (!more) return;
    document.addEventListener("click", function (event) {
      if (!more.contains(event.target)) {
        /* `open` bywa tylko na <details>; klik poza zamyka panel. */
        more.open = false;
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && more.open) {
        more.open = false;
        var summary = more.querySelector("summary");
        if (summary) summary.focus();
      }
    });
  }

  /* Bieżąca podstrona jest zaznaczona tak samo wszędzie. */
  function setupCurrent() {
    var header = document.querySelector(".rj-shared-header");
    if (!header) return;
    var here = location.pathname.replace(/\/index\.html$/, "/").replace(/\/$/, "") || "/";
    var links = header.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var path;
      try { path = new URL(link.href, location.origin).pathname.replace(/\/$/, "") || "/"; }
      catch (error) { continue; }
      if (path === "/" || path === "/licencja") continue; /* strona główna i licencja w panelu */
      if (path === here) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (here === "/") {
      var home = header.querySelector(".rj-home-link");
      if (home) home.setAttribute("aria-current", "page");
    }
  }

  function start() {
    setupTheme();
    setupMenu();
    setupMore();
    setupCurrent();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  /* Nie kolidujemy z `js/topbar-split.js`, który trzyma `RejTopbar.refresh`. */
  window.RejTopbarPaint = start;
})(window, document);

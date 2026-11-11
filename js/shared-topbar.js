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

  /* ---------------------------------------------------------- ustawienia ---
     Kółko zębate w topbarze otwiera mały panel ustawień: motyw i animacje.
     Wcześniej ten przycisk od razu przełączał motyw, a ikona słońca/księżyca
     sugerowała tylko jedną rzecz — teraz wygląda jak to, czym jest: wejście
     do opcji. Samo przełączanie motywu zostało dokładnie takie samo. */

  var panel = null;

  function themeName() {
    return document.documentElement.dataset.theme === "light" ? "jasny" : "ciemny";
  }

  function motionOn() {
    if (window.RejMotion && typeof window.RejMotion.status === "function") {
      return window.RejMotion.status() === "on";
    }
    try { return localStorage.getItem("rejhub_motion") !== "off"; } catch (error) { return true; }
  }

  function applyTheme(next) {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (error) { /* tryb prywatny */ }
    paintPanel();
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  }

  function toggleMotion() {
    var next = !motionOn();
    if (window.RejMotion) {
      if (next) window.RejMotion.on();
      else window.RejMotion.off();
    }
    try { localStorage.setItem("rejhub_motion", next ? "on" : "off"); } catch (error) { /* prywatny */ }
    paintPanel();
  }

  function buildPanel(button) {
    /* Panel powstaje w JS, a nie w HTML-u każdej podstrony — dzięki temu nie
       trzeba go wklejać w 19 plikach i nie może się rozjechać między nimi. */
    if (document.querySelector(".rj-settings-panel")) {
      return document.querySelector(".rj-settings-panel");
    }
    var box = document.createElement("div");
    box.className = "rj-settings-panel";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Ustawienia wyglądu");
    box.hidden = true;
    box.innerHTML =
      '<p class="rj-settings-title">Ustawienia</p>' +
      '<button class="rj-settings-row" type="button" data-rj-setting="theme">' +
        '<span>Motyw</span><b data-value="theme">ciemny</b>' +
      '</button>' +
      '<button class="rj-settings-row" type="button" data-rj-setting="motion">' +
        '<span>Animacje</span><b data-value="motion">zawsze</b>' +
      '</button>' +
      '<a class="rj-settings-link" href="/profil">Konto i profil <span aria-hidden="true">↗</span></a>';

    var host = button.closest(".header-right") || button.parentNode;
    host.appendChild(box);

    box.addEventListener("click", function (event) {
      var row = event.target.closest("[data-rj-setting]");
      if (!row) return;
      if (row.getAttribute("data-rj-setting") === "theme") toggleTheme();
      else toggleMotion();
    });

    button.setAttribute("aria-controls", "rj-settings-panel");
    box.id = "rj-settings-panel";
    return box;
  }

  function paintPanel() {
    if (!panel) return;
    var theme = panel.querySelector('[data-value="theme"]');
    var motion = panel.querySelector('[data-value="motion"]');
    if (theme) theme.textContent = themeName();
    if (motion) motion.textContent = motionOn() ? "zawsze" : "zgodnie z systemem";
  }

  function setPanel(open) {
    if (!panel) return;
    panel.hidden = !open;
    var button = document.querySelector(".rj-shared-header .theme-toggle");
    if (button) button.setAttribute("aria-expanded", String(open));
    if (open) paintPanel();
  }

  function setupTheme() {
    var theme = document.querySelector(".rj-shared-header [data-shared-theme], .rj-shared-header .theme-toggle");
    if (!bindOnce(theme, "theme")) return;

    panel = buildPanel(theme);
    paintPanel();

    /* Przechwytujemy kliknięcie w fazie capture, zanim dojdzie do przycisku.
       Powód: /rejchat i /logowanie mają własne, starsze obsługi tego samego
       przycisku (community.js, logowanie.js) i bez tego jedno kliknięcie
       otwierałoby panel ORAZ przełączało motyw. Tutaj kliknięcie kończy się
       wyłącznie na panelu. */
    document.addEventListener("click", function (event) {
      if (!event.target || !event.target.closest) return;
      if (!event.target.closest(".rj-shared-header .theme-toggle")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPanel(panel.hidden);
    }, true);

    document.addEventListener("click", function (event) {
      if (!panel || panel.hidden) return;
      if (panel.contains(event.target) || theme.contains(event.target)) return;
      setPanel(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !panel || panel.hidden) return;
      setPanel(false);
      theme.focus();
    });
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
    if (panel) paintPanel();
    setupMenu();
    setupMore();
    setupCurrent();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  /* Nie kolidujemy z `js/topbar-split.js`, który trzyma `RejTopbar.refresh`. */
  window.RejTopbarPaint = start;
  window.RejTopbarSettings = { paint: paintPanel, close: function () { setPanel(false); } };
})(window, document);

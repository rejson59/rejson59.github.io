/* ============================================================================
   Szybka autodestrukcja — RejHub (wersja 1)
   ----------------------------------------------------------------------------
   Mały, awaryjny przycisk (lewym dolnym rogu), który:
     1. prosi WSZYSTKIE karty tej witryny (i podglądów projektów) o zamknięcie,
     2. zamyka karty, które ta strona otworzyła (rejestr w localStorage),
     3. na koniec przenosi bieżącą kartę na neutralną stronę (about:blank),
        żeby nie zostawiać śladu w historii.

   Skrót: Ctrl+Shift+X (Cmd+Shift+X na Macu) — działa od razu, bez pytania.

   Jak to możliwe bez uprawnień: przeglądarka pozwala zamknąć wyłącznie kartę
   otwartą skryptem, dlatego każda karta RejHubu nasłuchuje komunikatu na
   BroadcastChannel i sama wywołuje window.close(); jeśli nie może, przechodzi
   na about:blank. Nic nie jest wysyłane na serwer.
   ========================================================================== */
(function () {
  "use strict";

  var CHANNEL = "rejhub-panic-v1";
  var TABS_KEY = "rejhub_open_tabs_v1";
  var TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var channel = null;
  var armed = false;

  try { channel = new BroadcastChannel(CHANNEL); } catch (e) { channel = null; }

  function readTabs() {
    try {
      var list = JSON.parse(localStorage.getItem(TABS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function writeTabs(list) {
    try { localStorage.setItem(TABS_KEY, JSON.stringify(list.slice(-40))); } catch (e) {}
  }

  /* Rejestr kart: każda karta dopisuje się przy starcie i znika przy zamknięciu. */
  function registerTab() {
    var tabs = readTabs().filter(function (tab) { return tab.id !== TAB_ID && Date.now() - tab.at < 6 * 3600 * 1000; });
    tabs.push({ id: TAB_ID, at: Date.now(), url: location.pathname });
    writeTabs(tabs);
    window.addEventListener("pagehide", function () {
      writeTabs(readTabs().filter(function (tab) { return tab.id !== TAB_ID; }));
    });
  }

  function blank() {
    try { location.replace("about:blank"); } catch (e) { location.href = "about:blank"; }
  }

  function closeSelf() {
    try { window.close(); } catch (e) {}
    /* window.close() działa tylko dla kart otwartych skryptem — resztę
       wyprowadzamy na pustą stronę, żeby treść zniknęła z ekranu. */
    setTimeout(blank, 120);
  }

  function destroyAll() {
    if (armed) return;
    armed = true;
    try { if (channel) channel.postMessage({ type: "panic" }); } catch (e) {}
    var tabs = readTabs();
    tabs.forEach(function (tab) {
      if (tab.id === TAB_ID) return;
      try {
        var win = window.open("", tab.id);
        if (win && win !== window) { try { win.close(); } catch (e) {} }
      } catch (e) {}
    });
    writeTabs([]);
    /* Krótka chwila, żeby komunikat zdążył dotrzeć do innych kart. */
    setTimeout(closeSelf, 260);
  }

  /* Każda karta nasłuchuje — również ta, która nie ma przycisku (podglądy). */
  if (channel) {
    channel.addEventListener("message", function (event) {
      if (event && event.data && event.data.type === "panic") closeSelf();
    });
  }
  window.addEventListener("storage", function (event) {
    if (event.key === "rejhub_panic_v1" && event.newValue) closeSelf();
  });

  function onKey(event) {
    var key = String(event.key || "").toLowerCase();
    if (key === "x" && event.shiftKey && (event.ctrlKey || event.metaKey) && !event.altKey) {
      event.preventDefault();
      destroyAll();
    }
  }

  function buildButton() {
    if (document.querySelector("[data-rj-panic]")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "rj-panic";
    button.setAttribute("data-rj-panic", "");
    button.title = "Szybka autodestrukcja — zamyka wszystkie karty RejHubu (Ctrl+Shift+X)";
    button.setAttribute("aria-label", "Szybka autodestrukcja: zamknij wszystkie karty RejHubu");
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M12 3v9" />' +
        '<path d="M6.5 6.5a7.5 7.5 0 1 0 11 0" />' +
      "</svg>";
    button.addEventListener("click", destroyAll);
    document.body.appendChild(button);
  }

  function start() {
    registerTab();
    document.addEventListener("keydown", onKey, true);
    if (!document.documentElement.hasAttribute("data-rj-panic-off")) buildButton();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

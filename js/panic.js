/* ============================================================================
   Szybka autodestrukcja — RejHub (wersja 3)
   ----------------------------------------------------------------------------
   Jedynym widocznym wejściem jest DYNAMICZNA WYSPA (przycisk w docku →
   potwierdzenie „Zamknij”). Ten plik nie tworzy już żadnego pływającego
   przycisku ani pigułki w rogu ekranu — zostały usunięte na życzenie
   właściciela. Zostaje samo działanie: rejestr kart, zamykanie okien
   i skrót Ctrl+Shift+X (Cmd+Shift+X).

   Co robi po kliknięciu:
     1. zamyka okna, które ta karta otworzyła sama (window.open),
     2. wysyła sygnał do wszystkich kart RejHubu — każda próbuje się zamknąć,
     3. dla kart, które odpowiedziały, próbuje domknąć je po nazwie okna,
     4. na końcu zamyka bieżącą kartę.

   Dlaczego wcześniej karty zostawały jako „about:blank”:
     • stara wersja wołała `window.open("", losowe-id)` dla każdej karty
       z rejestru — a `window.open` z nieistniejącą nazwą TWORZY nowe, puste
       okno. Efekt: kilka/kilkanaście nowych zakładek about:blank,
     • a gdy przeglądarka odmawiała zamknięcia, strona robiła
       nawigację na pustą stronę.

   Teraz nowe okna nie powstają. Karta, której przeglądarka nie pozwoli
   zamknąć (tylko karty otwarte skryptem są zamykalne — to ograniczenie
   Chrome/Firefox/Edge, nie strony), jest czyszczona lokalnie: znika cała
   treść, historia i tytuł, a na ekranie zostaje neutralna plansza z prośbą
   o zamknięcie karty. Żadnej nawigacji na about:blank.
   ========================================================================== */
(function () {
  "use strict";

  var CHANNEL = "rejhub-panic-v2";
  var TABS_KEY = "rejhub_open_tabs_v1";
  var TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var TAB_NAME = "rejhub-tab-" + TAB_ID;
  var channel = null;
  var armed = false;
  var closing = false;
  var opened = [];
  var alive = {};

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

  function forgetTab() {
    writeTabs(readTabs().filter(function (tab) { return tab.id !== TAB_ID; }));
  }

  function post(message) {
    try { if (channel) channel.postMessage(message); } catch (e) {}
  }

  /* ---------- rejestr kart ---------- */

  function registerTab() {
    /* Nazwa okna pozwala innej karcie trafić w tę samą kartę zamiast
       otwierać nową (window.open("", name) tworzy okno tylko wtedy, gdy
       okna o tej nazwie już nie ma — dlatego pytamy najpierw „pingiem”). */
    try { window.name = TAB_NAME; } catch (e) {}
    var tabs = readTabs().filter(function (tab) {
      return tab.id !== TAB_ID && Date.now() - tab.at < 6 * 3600 * 1000;
    });
    tabs.push({ id: TAB_ID, name: TAB_NAME, at: Date.now(), url: location.pathname });
    writeTabs(tabs);
    window.addEventListener("pagehide", forgetTab);
    window.addEventListener("pageshow", function (event) {
      /* powrót z bfcache: karta znów istnieje */
      if (event && event.persisted) registerTab();
    });
  }

  /* ---------- zamykanie ---------- */

  function retryClose() {
    try { window.close(); } catch (e) {}
  }

  /* Ostatnia deska ratunku: czyścimy dokument lokalnie. Bez nawigacji, więc
     nie powstaje żadna nowa karta i nie zostaje wpis w historii. */
  function wipe() {
    if (!document || !document.documentElement) return;
    try {
      document.title = "";
      if (window.stop) window.stop();
      var screen =
        '<meta name="robots" content="noindex,nofollow">' +
        '<title>Karta wyłączona</title>' +
        '<style>html,body{margin:0;height:100%;background:#070b13;color:#dfe8f7;' +
        'font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}' +
        'main{height:100%;display:grid;place-content:center;text-align:center;gap:14px;padding:24px}' +
        'b{font-size:17px;letter-spacing:-.01em}p{margin:0;color:#9fb0c8;font-size:13px}' +
        'button{margin-top:6px;padding:10px 18px;border:1px solid #ffffff33;border-radius:999px;' +
        'background:#ffffff12;color:#eaf2ff;font:inherit;font-size:13px;cursor:pointer}' +
        'button:hover{background:#ffffff1f}</style>' +
        '<main><b>Karta wyłączona</b><p>RejHub został zamknięty w tej karcie.</p>' +
        '<button type="button" onclick="window.close()">Zamknij kartę</button></main>';
      document.open();
      document.write(screen);
      document.close();
    } catch (e) {
      try { document.body.textContent = "Karta wyłączona"; } catch (error) {}
    }
  }

  function closeSelf() {
    if (closing) return;
    closing = true;
    forgetTab();
    post({ type: "bye", id: TAB_ID });

    retryClose();

    /* Dwie dodatkowe próby — część przeglądarek zamyka kartę dopiero po
       ponownym wywołaniu z tego samego kontekstu. */
    setTimeout(function () {
      retryClose();
      setTimeout(function () {
        retryClose();
        setTimeout(function () {
          /* Jeśli strona nadal żyje, przeglądarka odmówiła zamknięcia. */
          wipe();
        }, 160);
      }, 160);
    }, 140);
  }

  function destroyAll() {
    if (armed) return;
    armed = true;

    /* 1. okna otwarte przez tę kartę — te są zawsze zamykalne */
    opened.forEach(function (win) {
      try { if (win && !win.closed) win.close(); } catch (e) {}
    });
    opened = [];

    /* 2. kto jeszcze żyje? Tylko żywe karty mają nazwę okna — dzięki temu
       window.open("", nazwa) trafia w istniejącą kartę, a nie tworzy nowej. */
    alive = {};
    post({ type: "ping" });

    setTimeout(function () {
      readTabs().forEach(function (tab) {
        if (tab.id === TAB_ID || !tab.name) return;
        if (!alive[tab.name]) return; /* nie odpowiada — nie ma czego zamykać */
        var win = null;
        try { win = window.open("", tab.name); } catch (e) { win = null; }
        if (!win || win === window) return;
        try { win.close(); } catch (e) {}
        /* Gdyby karta zdążyła zniknąć w ułamku sekundy między pingiem
           a otwarciem, przeglądarka mogła utworzyć nowe puste okno.
           Ono jest otwarte skryptem, więc zamykamy je natychmiast. */
        setTimeout(function () {
          try { if (!win.closed && win.location && win.location.href === "about:blank") win.close(); } catch (e) {}
        }, 60);
      });

      /* 3. sygnał dla wszystkich — każda karta próbuje zamknąć się sama */
      post({ type: "panic" });

      /* 4. domknięcie bieżącej karty */
      setTimeout(function () {
        writeTabs([]);
        closeSelf();
      }, 320);
    }, 280);
  }

  /* ---------- nasłuch ---------- */

  if (channel) {
    channel.addEventListener("message", function (event) {
      var data = event && event.data;
      if (!data) return;
      if (data.type === "panic") {
        closeSelf();
        return;
      }
      if (data.type === "ping" && data.id !== TAB_ID) {
        alive[TAB_NAME] = true;
        post({ type: "pong", id: TAB_ID, name: TAB_NAME });
        return;
      }
      if (data.type === "pong" && data.name) alive[data.name] = true;
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

  /* ---------- karty otwierane z RejHubu ---------- */

  /* Karta otwarta przez window.open jest zamykalna; karta otwarta samą
     przeglądarką (ctrl+klik, „otwórz w nowej karcie”) — nie. Dlatego
     przechwytujemy nowe karty dla adresów RejHubu i otwieramy je sami. */
  function rememberTab(href) {
    var name = "rejhub-tab-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    var win = null;
    try { win = window.open(href, name); } catch (e) { win = null; }
    if (win) {
      opened.push(win);
      var prune = function () {
        opened = opened.filter(function (item) { return item && !item.closed; });
      };
      setTimeout(prune, 30000);
      return true;
    }
    return false;
  }

  function sameOrigin(href) {
    try { return new URL(href, location.href).origin === location.origin; } catch (e) { return false; }
  }

  function onClick(event) {
    if (event.defaultPrevented) return;
    if (event.button && event.button !== 0) return;
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link) return;
    if (link.target !== "_blank") return;
    if (link.hasAttribute("download") || link.hasAttribute("data-rj-no-tab")) return;
    if (!sameOrigin(link.href)) return; /* projekty na innych domenach rządzą się swoimi zasadami */
    if (rememberTab(link.href)) event.preventDefault();
  }

  function onAuxClick(event) {
    if (event.button !== 1) return;
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link || link.hasAttribute("download")) return;
    if (!sameOrigin(link.href)) return;
    if (rememberTab(link.href)) event.preventDefault();
  }

  /* ---------- przycisk ---------- */

  function wire(button) {
    if (!button || button.__rjPanicWired) return;
    button.__rjPanicWired = true;
    button.setAttribute("data-rj-panic", "");
    if (button.tagName === "A") button.setAttribute("role", "button");
    if (!button.getAttribute("title")) {
      button.title = "Szybka autodestrukcja — zamyka wszystkie karty RejHubu (Ctrl+Shift+X)";
    }
    if (!button.getAttribute("aria-label")) {
      button.setAttribute("aria-label", "Szybka autodestrukcja: zamknij wszystkie karty RejHubu");
    }
    button.addEventListener("click", function (event) {
      event.preventDefault();
      destroyAll();
    });
  }

  /* RejHub 2.0: autodestrukcja mieszka WYŁĄCZNIE w dynamicznej wyspie
     (dock → potwierdzenie). Tutaj nie powstaje żaden przycisk — ani kółko
     w prawym dolnym rogu, ani pigułka. `mount()` podpina tylko elementy,
     które strona sama oznaczyła atrybutem `data-rj-panic`. */
  function mount() {
    if (document.documentElement.hasAttribute("data-rj-panic-off")) return;
    var mounts = document.querySelectorAll("[data-rj-panic]");
    Array.prototype.forEach.call(mounts, wire);
  }

  function start() {
    registerTab();
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onAuxClick, true);
    mount();
  }

  window.RejPanic = {
    run: destroyAll,
    mount: mount,
    status: function () { return { armed: armed, closing: closing, name: TAB_NAME }; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

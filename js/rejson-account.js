/* Wspólne konto dla projektów pod tym samym originem. Bez przekazywania tokenów w URL. */
(function (window, document) {
  "use strict";
  if (window.RejsonAccount) return;
  // Nie udajemy wspólnej sesji, gdy skrypt jest osadzony na innej domenie.
  var script = document.currentScript;
  if (script && script.src) {
    try { if (new window.URL(script.src, location.href).origin !== location.origin) return; }
    catch (e) { return; }
  }
  var SESSION = "rejson_community_session_v1";
  var RETURN = "rejson_account_return_v1";
  var URL = "https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/community_whoami";
  // Klucz publiczny anon; bez sekretów i bez nowej bazy kont.
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";
  function stored() {
    try {
      var item = JSON.parse(localStorage.getItem(SESSION) || "null");
      return item && typeof item.token === "string" && item.token.length >= 16 ? item : null;
    } catch (e) { return null; }
  }
  function getSession() {
    var session = stored();
    if (!session) return Promise.resolve(null);
    var headers = { apikey:KEY, Authorization:"Bearer " + KEY, "Content-Type":"application/json" };
    var request = window.RJNet && window.RJNet.rpc
      ? window.RJNet.rpc(URL, { p_token: session.token }, { label:"community_whoami", headers: headers, retries: 2 })
      : fetch(URL, { method:"POST", cache:"no-store", headers: headers, body:JSON.stringify({p_token:session.token}) })
          .then(function (r) { if (!r.ok) throw new Error("Nie można potwierdzić konta."); return r.json(); });
    return request
      .then(function (r) {
        var current = stored();
        if (!current || current.token !== session.token) return null;
        if (!r || !Object.prototype.hasOwnProperty.call(r, "username")) throw new Error("Nieprawidłowa odpowiedź konta.");
        if (r.username === null) return null;
        if (typeof r.username !== "string" || !r.username) throw new Error("Nieprawidłowa odpowiedź konta.");
        return { username:r.username, token:session.token };
      });
  }
  function open() {
    // Link używa tylko lokalnej ścieżki; parametry projektu nie trafiają do URL logowania.
    try {
      var current = location.pathname + location.search + location.hash;
      sessionStorage.removeItem(RETURN);
      if (current.length <= 4096) sessionStorage.setItem(RETURN, JSON.stringify({path:current, at:Date.now()}));
    } catch (e) { /* Konto nadal można otworzyć bez automatycznego powrotu. */ }
    location.assign("/logowanie?powrot=1");
  }
  function subscribe(fn) {
    if (typeof fn !== "function") throw new TypeError("Wymagana funkcja");
    function storage(ev) { if (!ev || ev.key === SESSION || ev.key === null) fn(); }
    function local() { fn(); }
    window.addEventListener("storage", storage);
    window.addEventListener("rj:session-change", local);
    return function () { window.removeEventListener("storage", storage); window.removeEventListener("rj:session-change", local); };
  }
  window.RejsonAccount = Object.freeze({getSession:getSession, open:open, subscribe:subscribe});
  window.dispatchEvent(new Event("rj:account-ready"));

  /* ---------- wyspa RejHuba na stronie projektu ----------
     Ten skrypt ładują projekty (`/js/rejson-account.js`) — między innymi
     Jakuplayer i RejStream — więc jest pewnym punktem zaczepienia: działa
     nawet tam, gdzie service worker nie jest zarejestrowany albo przeglądarka
     go nie ma. Wyspa i tak jest wstrzykiwana przez /sw.js, gdy ten działa,
     dlatego montujemy ją tylko raz i tylko poza stronami samego RejHuba.

     Warunki:
       - nie na rejhub.vercel.app (tam wyspa jest w HTML strony),
       - nie na `/rejhub2/…` (to też jest RejHub, nie projekt),
       - nie w podglądzie karty na stronie głównej (byłaby druga wyspa
         w ramce obok wyspy rodzica). */
  function isProjectPage() {
    if (!/(^|\.)rejson59\.github\.io$/i.test(location.hostname)) return false;
    var path = String(location.pathname || "/");
    if (/^\/rejhub2(?:\/|\.html?$)/i.test(path)) return false;
    if (/^\/(?:rejson-widgets|hub)\//i.test(path)) return false;
    /* Strony RejHuba pod tym adresem to jednoplikowe przekierowania
       (`data-przeniesienie`); ich i tak nie rozwijamy. */
    return true;
  }

  function islandMounted() {
    return !!window.__RJ_ISLAND__ || !!document.getElementById("rj-island-root");
  }

  function insidePreviewFrame() {
    try {
      if (window.name === "rejson-card-preview") return true;
      if (window.self === window.top) return false;
      var frame = window.frameElement;
      if (!frame) return false; /* obca domena — nie dotykamy */
      if (frame.hasAttribute("data-card-preview")) return true;
      if (frame.classList && frame.classList.contains("card-preview-iframe")) return true;
      return !!(frame.closest && frame.closest(".card-preview-frame"));
    } catch (e) {
      /* Brak dostępu do frameElement znaczy obcy origin — zostawiamy. */
      return true;
    }
  }

  function mountIsland() {
    if (islandMounted() || !isProjectPage() || insidePreviewFrame()) return;
    var base = String(script && script.src ? script.src : "").split("?")[0];
    var root = base.replace(/\/js\/rejson-account\.js$/i, "");
    if (!root || root === base) return;

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = root + "/hub/island.css";
    (document.head || document.documentElement).appendChild(link);

    var tag = document.createElement("script");
    tag.src = root + "/hub/island.js";
    tag.defer = true;
    /* Nazwa projektu z adresu: `/Jakuplayer/` → „Jakuplayer”. */
    var slug = String(location.pathname || "").split("/").filter(Boolean)[0] || "rejhub";
    tag.setAttribute("data-project", slug);
    tag.setAttribute("data-project-name", slug);
    /* Odnośniki czatu i konta mają prowadzić do RejHuba, nie w głąb projektu. */
    tag.setAttribute("data-hub-base", "https://rejhub.vercel.app");
    tag.onerror = function () { if (tag.parentNode) tag.parentNode.removeChild(tag); };
    (document.head || document.documentElement).appendChild(tag);
  }

  /* Skrypt bywa w `<head>` z `defer` — DOM jest już gotowy, ale na wszelki
     wypadek czekamy, gdy strona jeszcze się wczytuje. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountIsland, { once: true });
  } else {
    mountIsland();
  }
})(window, document);

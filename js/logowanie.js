/* Ogólne konto rejson59.github.io: istniejący backend i sesja. */
(function () {
  "use strict";
  var URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  // Publiczny klucz anon jest taki sam jak w kliencie społeczności.
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";
  var SESSION = "rejson_community_session_v1";
  var RETURN = "rejson_account_return_v1";
  function projectReturn() {
    if (new URLSearchParams(location.search).get("powrot") !== "1") return null;
    try {
      var item = JSON.parse(sessionStorage.getItem(RETURN) || "null");
      if (!item || typeof item.path !== "string" || item.path.length > 4096 || typeof item.at !== "number" || Date.now() - item.at < 0 || Date.now() - item.at > 30 * 60 * 1000) return null;
      if (item.path.charAt(0) !== "/" || item.path.charAt(1) === "/" || item.path.indexOf("\\") !== -1) return null;
      var dest = new window.URL(item.path, location.origin);
      if (dest.origin !== location.origin || /^\/(?:logowanie|portal|podroz)(?:[./]|$)/i.test(dest.pathname) || dest.pathname === "/") return null;
      return dest.pathname + dest.search + dest.hash;
    } catch (e) { return null; }
  }
  var manage = new URLSearchParams(location.search).get("zarzadzaj") === "1";
  function continueAfterAuth() {
    var dest = projectReturn();
    if (dest) {
      try { sessionStorage.removeItem(RETURN); } catch (e) {}
      location.replace(dest);
    } else if (!manage) {
      location.replace("/profil");
    }
  }
  var returnLink = document.getElementById("account-return");
  var returnPath = projectReturn();
  if (returnLink && returnPath) {
    returnLink.href = returnPath; returnLink.hidden = false;
    returnLink.addEventListener("click", function () { try { sessionStorage.removeItem(RETURN); } catch (e) {} });
  }
  var mode = "login", generation = 0;
  var $ = function (id) { return document.getElementById(id); };
  var form = $("account-form"), name = $("account-name"), pin = $("account-pin"), error = $("account-error"), submit = $("account-submit");

  function show(section) {
    ["account-loading", "account-guest", "account-user", "account-unavailable"].forEach(function (id) {
      $(id).hidden = id !== section;
    });
  }
  function stored() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION) || "null");
      return s && typeof s.token === "string" && s.token.length >= 16 && typeof s.username === "string" && s.username ? s : null;
    } catch (e) { return null; }
  }
  function rpc(fn, body) {
    var url = URL + "/rest/v1/rpc/" + fn;
    var headers = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
    /* Odczyt stanu konta ponawiamy — pojedyncze zerwanie łącza nie może
       udawać, że konto zniknęło. */
    if (window.RJNet && window.RJNet.rpc) return window.RJNet.rpc(url, body || {}, { label: fn, headers: headers, retries: window.RJNet.readOnly(fn) ? 2 : 0 });
    return fetch(url, { method: "POST", cache: "no-store", headers: headers, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok) throw new Error((data && data.message) || "Nie udało się połączyć z kontem.");
          return data;
        });
      });
  }
  function report(message) { error.textContent = message || ""; error.hidden = !message; }
  function loadPasswordStatus() {
    var session = stored();
    if (!session) return;
    $("password-status").textContent = "Sprawdzam sposób logowania…";
    rpc("community_password_status", {p_token:session.token}).then(function (data) {
      var current = stored();
      if (!current || current.token !== session.token) return;
      if (!data || typeof data.has_password !== "boolean") throw new Error("Nie udało się sprawdzić zabezpieczenia.");
      $("password-status").textContent = data.has_password ? "Konto ma ustawione hasło." : "Twoje konto nadal używa PIN-u. Możesz ustawić hasło poniżej.";
    }).catch(function () {
      var current = stored();
      if (current && current.token === session.token) $("password-status").textContent = "Nie udało się sprawdzić zabezpieczenia. Spróbuj później.";
    });
  }
  function signedIn(username) { $("account-username").textContent = username; show("account-user"); loadPasswordStatus(); window.dispatchEvent(new Event("rj:session-change")); }
  function verify() {
    var seq = ++generation, session = stored();
    if (!session) { show("account-guest"); return; }
    show("account-loading");
    rpc("community_whoami", { p_token: session.token }).then(function (result) {
      if (seq !== generation) return;
      var current = stored();
      if (!current || current.token !== session.token) { verify(); return; }
      if (!result || !Object.prototype.hasOwnProperty.call(result, "username")) throw new Error("Nieprawidłowa odpowiedź serwera.");
      if (result.username === null) {
        try { localStorage.removeItem(SESSION); } catch (e) {}
        report("Sesja wygasła. Zaloguj się ponownie.");
        show("account-guest");
        return;
      }
      if (typeof result.username !== "string" || !result.username) throw new Error("Nieprawidłowa odpowiedź serwera.");
      // Sesja została sprawdzona ponownie po odpowiedzi.
      try { localStorage.setItem(SESSION, JSON.stringify({ token: session.token, username: result.username })); } catch (e) {}
      if (manage && !projectReturn()) signedIn(result.username);
      else continueAfterAuth();
    }).catch(function () { if (seq === generation) show("account-unavailable"); });
  }
  /* Losowy identyfikator przeglądarki — nie śledzi użytkownika w sieci, służy
     tylko do limitu nowych kont z jednego urządzenia (2 na 10 minut). */
  function deviceId() {
    try {
      var key = "rejson_device_id_v1", value = localStorage.getItem(key);
      if (value && value.length >= 8 && value.length <= 64) return value;
      value = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID()
        : "fp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(key, value);
      return value;
    } catch (e) { return null; }
  }
  function setMode(next) {
    mode = next;
    $("mode-login").classList.toggle("is-active", next === "login");
    $("mode-register").classList.toggle("is-active", next === "register");
    $("mode-login").setAttribute("aria-pressed", String(next === "login"));
    $("mode-register").setAttribute("aria-pressed", String(next === "register"));
    submit.textContent = next === "login" ? "Zaloguj się" : "Utwórz konto";
    pin.autocomplete = next === "login" ? "current-password" : "new-password";
    $("account-secret-label").textContent = next === "login" ? "Hasło lub dotychczasowy PIN" : "Hasło";
    pin.placeholder = next === "login" ? "Twoje hasło lub PIN" : "Co najmniej 10 znaków";
    report("");
  }
  $("mode-login").addEventListener("click", function () { setMode("login"); });
  $("mode-register").addEventListener("click", function () { setMode("register"); });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var username = name.value.trim(), value = pin.value;
    var byteLength = new TextEncoder().encode(value).length;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(username) || byteLength > 72 || (mode === "login" ? !value.length : Array.from(value).length < 10)) {
      report("Nazwa: 3–24 znaki; nowe hasło: co najmniej 10 znaków i maksymalnie 72 bajty.");
      return;
    }
    var seq = ++generation;
    report(""); submit.disabled = true;
    var args = { p_username: username, p_pin: value };
    if (mode !== "login") args.p_fp = deviceId();
    rpc(mode === "login" ? "community_login" : "community_register", args)
      .then(function (data) {
        if (seq !== generation) return;
        if (!data || typeof data.token !== "string" || data.token.length < 16 || typeof data.username !== "string" || !data.username) throw new Error("Nieprawidłowa odpowiedź serwera.");
        try { localStorage.setItem(SESSION, JSON.stringify({ token: data.token, username: data.username })); }
        catch (e) { throw new Error("Nie można zapisać sesji w tej przeglądarce."); }
        pin.value = "";
        if (manage && !projectReturn()) signedIn(data.username);
        else { window.dispatchEvent(new Event("rj:session-change")); continueAfterAuth(); }
      }).catch(function (err) { if (seq === generation) report(err.message || "Nie udało się zalogować."); })
      .finally(function () { submit.disabled = false; });
  });
  $("password-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var session = stored(), current = $("current-secret"), next = $("new-password"), confirm = $("confirm-password");
    var result = $("password-result"), button = $("password-submit");
    if (!session) { result.textContent = "Zaloguj się ponownie."; return; }
    if (!current.value || Array.from(next.value).length < 10 || new TextEncoder().encode(next.value).length > 72) {
      result.textContent = "Wpisz obecny PIN lub hasło i nowe hasło: co najmniej 10 znaków, maksymalnie 72 bajty."; return;
    }
    if (next.value !== confirm.value) { result.textContent = "Nowe hasła nie są takie same."; return; }
    var seq = generation;
    button.disabled = true; result.textContent = "Zapisuję…";
    rpc("community_set_password", {p_token:session.token, p_current_secret:current.value, p_new_password:next.value})
      .then(function (data) {
        var still = stored();
        if (seq !== generation || !still || still.token !== session.token) return;
        if (!data || data.ok !== true) throw new Error("Nie udało się zapisać hasła.");
        current.value = ""; next.value = ""; confirm.value = "";
        result.textContent = "Hasło zapisane. Użyj go przy następnym logowaniu.";
        loadPasswordStatus();
      }).catch(function (err) { if (seq === generation) result.textContent = err.message || "Nie udało się zapisać hasła."; })
      .finally(function () { button.disabled = false; });
  });
  $("revoke-other-sessions").addEventListener("click", function () {
    var session = stored(), button = this, status = $("revoke-status"), seq = generation;
    if (!session) { status.textContent = "Zaloguj się ponownie."; return; }
    if (!window.confirm("Wylogować wszystkie pozostałe urządzenia? Na tym urządzeniu pozostaniesz zalogowany.")) return;
    button.disabled = true; status.textContent = "Wylogowuję inne urządzenia…";
    rpc("community_revoke_other_sessions", {p_token:session.token}).then(function (data) {
      var still = stored();
      if (seq !== generation || !still || still.token !== session.token) return;
      if (!data || data.ok !== true) throw new Error("Nie udało się wylogować urządzeń.");
      status.textContent = "Pozostałe sesje zostały wylogowane. To urządzenie pozostaje zalogowane.";
    }).catch(function (err) { if (seq === generation) status.textContent = err.message || "Nie udało się wylogować urządzeń."; })
      .finally(function () { button.disabled = false; });
  });
  function forget() {
    ++generation;
    try { localStorage.removeItem(SESSION); } catch (e) { report("Nie udało się usunąć sesji z przeglądarki."); }
    pin.value = ""; show("account-guest"); window.dispatchEvent(new Event("rj:session-change"));
  }
  $("account-logout").addEventListener("click", forget);
  $("account-forget").addEventListener("click", forget);
  $("account-retry").addEventListener("click", verify);
  window.addEventListener("storage", function (event) { if (event.key === SESSION || event.key === null) verify(); });
  /* Topbar jest teraz jeden dla całej witryny: te same id na każdej podstronie,
     a motyw i menu obsługuje `shared-topbar.js`. Tu zostaje tylko awaryjna
     obsługa starszych znaczników (bez podwójnego przełączania). */
  var accountMenu = $("account-menu") || $("menu-toggle");
  var accountNav = $("account-nav") || $("site-nav");
  if (accountMenu && accountNav && !accountMenu.dataset.rjBound) {
    accountMenu.dataset.rjBound = "1";
    accountMenu.addEventListener("click", function () {
      var open = accountNav.classList.toggle("is-open");
      this.setAttribute("aria-expanded", String(open));
      this.setAttribute("aria-label", open ? "Zamknij menu" : "Otwórz menu");
    });
  }
  var themeButton = $("theme-toggle") || $("shared-theme");
  if (themeButton && !themeButton.dataset.rjBound) {
    themeButton.dataset.rjBound = "1";
    themeButton.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }
  verify();
})();

/* Konto społeczności: osobny ekran, ten sam istniejący backend i sesja. */
(function () {
  "use strict";
  var URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  // Publiczny klucz anon jest taki sam jak w kliencie społeczności.
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";
  var SESSION = "rejson_community_session_v1";
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
    return fetch(URL + "/rest/v1/rpc/" + fn, {
      method: "POST", cache: "no-store",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) throw new Error(data && data.message || "Nie udało się połączyć z kontem.");
        return data;
      });
    });
  }
  function report(message) { error.textContent = message || ""; error.hidden = !message; }
  function signedIn(username) { $("account-username").textContent = username; show("account-user"); }
  function verify() {
    var seq = ++generation, session = stored();
    if (!session) { show("account-guest"); return; }
    show("account-loading");
    rpc("community_whoami", { p_token: session.token }).then(function (result) {
      if (seq !== generation) return;
      if (!result || !Object.prototype.hasOwnProperty.call(result, "username")) throw new Error("Nieprawidłowa odpowiedź serwera.");
      if (result.username === null) {
        try { localStorage.removeItem(SESSION); } catch (e) {}
        report("Sesja wygasła. Zaloguj się ponownie.");
        show("account-guest");
        return;
      }
      if (typeof result.username !== "string" || !result.username) throw new Error("Nieprawidłowa odpowiedź serwera.");
      // Popraw lokalną nazwę jedynie dla wciąż aktualnej sesji.
      try { localStorage.setItem(SESSION, JSON.stringify({ token: session.token, username: result.username })); } catch (e) {}
      signedIn(result.username);
    }).catch(function () { if (seq === generation) show("account-unavailable"); });
  }
  function setMode(next) {
    mode = next;
    $("mode-login").classList.toggle("is-active", next === "login");
    $("mode-register").classList.toggle("is-active", next === "register");
    $("mode-login").setAttribute("aria-pressed", String(next === "login"));
    $("mode-register").setAttribute("aria-pressed", String(next === "register"));
    submit.textContent = next === "login" ? "Zaloguj się" : "Utwórz konto";
    pin.autocomplete = next === "login" ? "current-password" : "new-password";
    report("");
  }
  $("mode-login").addEventListener("click", function () { setMode("login"); });
  $("mode-register").addEventListener("click", function () { setMode("register"); });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var username = name.value.trim(), value = pin.value;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(username) || !/^[0-9]{4}$/.test(value)) {
      report("Nazwa: 3–24 znaki (litery, cyfry, _ . -); PIN: dokładnie 4 cyfry.");
      return;
    }
    var seq = ++generation;
    report(""); submit.disabled = true;
    rpc(mode === "login" ? "community_login" : "community_register", { p_username: username, p_pin: value })
      .then(function (data) {
        if (seq !== generation) return;
        if (!data || typeof data.token !== "string" || data.token.length < 16 || typeof data.username !== "string" || !data.username) throw new Error("Nieprawidłowa odpowiedź serwera.");
        try { localStorage.setItem(SESSION, JSON.stringify({ token: data.token, username: data.username })); }
        catch (e) { throw new Error("Nie można zapisać sesji w tej przeglądarce."); }
        pin.value = "";
        signedIn(data.username);
      }).catch(function (err) { if (seq === generation) report(err.message || "Nie udało się zalogować."); })
      .finally(function () { submit.disabled = false; });
  });
  function forget() {
    ++generation;
    try { localStorage.removeItem(SESSION); } catch (e) { report("Nie udało się usunąć sesji z przeglądarki."); }
    pin.value = ""; show("account-guest");
  }
  $("account-logout").addEventListener("click", forget);
  $("account-forget").addEventListener("click", forget);
  $("account-retry").addEventListener("click", verify);
  window.addEventListener("storage", function (event) { if (event.key === SESSION || event.key === null) verify(); });
  $("account-menu").addEventListener("click", function () {
    var open = $("account-nav").classList.toggle("is-open");
    this.setAttribute("aria-expanded", String(open));
    this.setAttribute("aria-label", open ? "Zamknij menu" : "Otwórz menu");
  });
  $("theme-toggle").addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
  });
  verify();
})();

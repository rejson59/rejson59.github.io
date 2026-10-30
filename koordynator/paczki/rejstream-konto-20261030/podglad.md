# Podgląd zmian w RejStream

Podgląd wyłącznie do czytania; właściwe pliki i sumy są w planie. Odstępy na końcach wierszy pominięto.

```diff
--- a/account.js
+++ b/account.js
@@ -207,6 +207,21 @@
     }
     if (version === generation) notify();
   }
+  async function authenticate(method, username, secret) {
+    // RPC retains the p_pin name for compatibility; it also accepts passwords.
+    const result = await request(method, { p_username: username, p_pin: secret });
+    await restore(result);
+    if (!session) {
+      throw new Error(method === "community_register"
+        ? "Konto utworzono, ale nie udało się wczytać danych. Spróbuj się zalogować."
+        : error || "Nie udało się wczytać konta.");
+    }
+    try {
+      browserStorage?.setItem(SESSION, JSON.stringify(session));
+      if (browserStorage && typeof window !== "undefined")
+        window.dispatchEvent(new Event("rj:session-change"));
+    } catch {}
+  }
   return {
     state,
     storage,
@@ -233,21 +248,18 @@
       } catch {}
       await restore(stored);
     },
-    async login(username, pin) {
-      const result = await request("community_login", {
-        p_username: username,
-        p_pin: pin,
-      });
-      await restore(result);
-      if (!session) throw new Error(error || "Nie udało się wczytać konta.");
-      try {
-        browserStorage?.setItem(SESSION, JSON.stringify(session));
-      } catch {}
+    async login(username, secret) {
+      return authenticate("community_login", username, secret);
+    },
+    async register(username, password) {
+      return authenticate("community_register", username, password);
     },
     async logout() {
       await flush();
       try {
         browserStorage?.removeItem(SESSION);
+        if (browserStorage && typeof window !== "undefined")
+          window.dispatchEvent(new Event("rj:session-change"));
       } catch {}
       await restore(null);
     },
@@ -259,10 +271,18 @@
       if (cached) return cached;
       try {
         const result = await request("rejchat_get_profiles", {
-          p_usernames: [username],
+          p_names: [username],
         });
         if (Array.isArray(result) && result.length > 0) {
-          const profile = result[0];
+          const row = result.find((item) => typeof item?.username === "string" && item.username.toLowerCase() === key);
+          if (!row) return null;
+          const avatars = ["comet", "planet", "cat", "fox", "leaf", "cloud", "heart", "spark"];
+          const colors = ["mint", "blue", "violet", "rose", "amber", "slate"];
+          const profile = {
+            username: row.username,
+            avatar: avatars.includes(row.avatar) ? row.avatar : "comet",
+            color: colors.includes(row.color) ? row.color : "mint",
+          };
           profiles[key] = profile;
           notify();
           return profile;
--- a/src.js
+++ b/src.js
@@ -129,6 +129,7 @@
 let entryNudgeDismissed = false;
 const dismissedEpisodeNudges = new Set();
 let loginReturn = null;
+let accountMode = "login";
 function loginNudge(context, key = "entry") {
   if (
     account.state().username ||
@@ -155,7 +156,7 @@
 }
 function accountPage() {
   const { username, error } = account.state();
-  return `<section class="section account-section"><div class="page-heading"><span class="eyebrow">JEDNO KONTO · SPOŁECZNOŚĆ REJSON</span><h1>${username ? `Cześć, ${esc(username)}` : "Zaloguj się"}<span>.</span></h1><p>To samo konto co na rejson59.github.io/spolecznosc. Historia, wznawianie, ulubione i obejrzane są przypisane do konta. Nie przechowujemy ich lokalnie.</p></div>${username ? `<p>Sesja konta jest wspólna ze społecznością na tej samej domenie.</p><div class="hero-actions"><button id="account-sync" class="button secondary">Ponów synchronizację</button><button id="account-logout" class="button secondary">Wyloguj się</button></div>` : `<form id="account-form" class="account-form"><label>Nazwa użytkownika<input name="username" autocomplete="username" required maxlength="64"></label><label>PIN społeczności<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="current-password" required></label><button class="button primary" type="submit">Zaloguj się</button></form><p>Nie masz konta? <a href="https://rejson59.github.io/spolecznosc.html" target="_blank" rel="noopener">Utwórz je w społeczności ↗</a></p>`}<p id="account-error" role="status">${esc(error)}</p><p>Na urządzeniu pozostaje tylko token logowania i ustawienia interfejsu. Plików wideo nie wysyłamy; dla lokalnego filmu zapisujemy nazwę i pozycję na koncie.</p></section>`;
+  return `<section class="section account-section"><div class="page-heading"><span class="eyebrow">JEDNO KONTO · SPOŁECZNOŚĆ REJSON</span><h1>${username ? `Cześć, ${esc(username)}` : accountMode === "register" ? "Utwórz konto" : "Zaloguj się"}<span>.</span></h1><p>To samo konto co na rejson59.github.io/spolecznosc. Historia, wznawianie, ulubione i obejrzane są przypisane do konta. Nie przechowujemy ich lokalnie.</p></div>${username ? `<p>Sesja konta jest wspólna ze społecznością na tej samej domenie.</p><div class="hero-actions"><button id="account-sync" class="button secondary">Ponów synchronizację</button><button id="account-logout" class="button secondary">Wyloguj się</button></div>` : `<div class="hero-actions" role="group" aria-label="Wybierz sposób korzystania z konta"><button type="button" class="button secondary" data-account-mode="login" aria-pressed="${accountMode === "login"}">Zaloguj się</button><button type="button" class="button secondary" data-account-mode="register" aria-pressed="${accountMode === "register"}">Utwórz konto</button></div><form id="account-form" class="account-form"><label>Nazwa użytkownika<input name="username" autocomplete="username" required minlength="3" maxlength="24"></label><label><span id="account-secret-label">${accountMode === "login" ? "Hasło lub dotychczasowy PIN" : "Hasło"}</span><input name="secret" type="password" autocomplete="${accountMode === "login" ? "current-password" : "new-password"}" required></label><label id="account-confirm-label" ${accountMode === "login" ? "hidden" : ""}>Powtórz hasło<input name="confirm" type="password" autocomplete="new-password" ${accountMode === "register" ? "required" : ""}></label><p id="account-auth-hint">${accountMode === "login" ? "Możesz użyć hasła albo swojego dotychczasowego PIN-u." : "Hasło musi mieć co najmniej 10 znaków i maksymalnie 72 bajty. Nie ma automatycznego odzyskiwania zapomnianego hasła."}</p><button class="button primary" type="submit">${accountMode === "login" ? "Zaloguj się" : "Utwórz konto"}</button></form>`}<p id="account-error" role="status">${esc(error)}</p><p>Na urządzeniu pozostaje tylko token logowania i ustawienia interfejsu. Plików wideo nie wysyłamy; dla lokalnego filmu zapisujemy nazwę i pozycję na koncie.</p></section>`;
 }
 function navButtons(mobile = false) {
   return [
@@ -576,57 +577,7 @@
   document.querySelector("#favorite-count").textContent = favorites.filter(
     (key) => getSeries(key),
   ).length;
-  const accountLink = document.querySelector(".header-avatar");
-  const username = account.state().username;
-  const profiles = account.state().profiles;
-  accountLink.textContent = username ? username.charAt(0).toUpperCase() : "R";
-  accountLink.title = username
-    ? `Konto: ${username}`
-    : "Zaloguj się kontem społeczności";
-  accountLink.setAttribute("aria-label", accountLink.title);
-
-  // Załaduj profil RejChat jeśli zalogowany
-  if (username && !profiles[username.toLowerCase()]) {
-    account.loadProfile(username);
-  }
-
-  const profile = document.querySelector(".profile");
-  const avatarEl = profile.querySelector(".avatar");
-  const headingEl = profile.querySelector(".profile-heading");
-  const messageEl = profile.querySelector(".profile-message");
-
-  avatarEl.textContent = username ? username.charAt(0).toUpperCase() : "R";
-
-  // Wyświetl awatar i kolor nicka z profilu RejChat
-  const userProfile = profiles[username?.toLowerCase()];
-  if (userProfile?.avatar) {
-    avatarEl.innerHTML = `<img src="${userProfile.avatar}" alt="${username}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
-  }
-  if (userProfile?.nick_color) {
-    avatarEl.style.background = userProfile.nick_color;
-    accountLink.style.background = userProfile.nick_color;
-  }
-
-  headingEl.textContent = username
-    ? `Cześć, ${username}`
-    : "Twój kolejny seans";
-  messageEl.textContent = username
-    ? "Twoje historie. Twoje tempo."
-    : "Zaloguj się i zachowaj swoje postępy.";
-  profile.setAttribute("aria-label", username
-    ? `Przejdź do konta: ${username}`
-    : "Zaloguj się i zachowaj swoje postępy");
-
-  // Dodaj link do profilu RejChat
-  if (username) {
-    profile.setAttribute("href", `https://rejchat.example.com/profil?u=${encodeURIComponent(username)}`);
-    profile.setAttribute("target", "_blank");
-    profile.setAttribute("rel", "noopener");
-  } else {
-    profile.setAttribute("href", "#account");
-    profile.removeAttribute("target");
-    profile.removeAttribute("rel");
-  }
+  updateAccountAppearance();
   createIcons({ icons });
   bindContent();
   inlineDisposers = [...content.querySelectorAll(".inline-trailer iframe")].map(
@@ -634,18 +585,40 @@
   );
   if (activeEpisode?.id) loadEmbed();
   else document.querySelector(".player-health")?.remove();
+  content.querySelectorAll("[data-account-mode]").forEach((button) => {
+    button.addEventListener("click", () => {
+      accountMode = button.dataset.accountMode;
+      render();
+      content.querySelector('[name="username"]')?.focus();
+    });
+  });
   document
     .querySelector("#account-form")
     ?.addEventListener("submit", async (event) => {
       event.preventDefault();
-      const form = event.currentTarget,
-        button = form.querySelector("button");
-      const username = form.elements.username.value,
-        pin = form.elements.pin.value;
-      form.elements.pin.value = "";
+      const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
+      const username = form.elements.username.value.trim(), secret = form.elements.secret.value;
+      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(username)) {
+        showToast("Nazwa: 3–24 znaki, litery, cyfry, _ . lub -.");
+        return;
+      }
+      if (new TextEncoder().encode(secret).length > 72 || !secret ||
+          (accountMode === "register" && Array.from(secret).length < 10)) {
+        showToast("Hasło: co najmniej 10 znaków przy rejestracji i maksymalnie 72 bajty.");
+        return;
+      }
+      if (accountMode === "register" && secret !== form.elements.confirm.value) {
+        showToast("Hasła nie są takie same.");
+        return;
+      }
+      const mode = accountMode;
+      form.elements.secret.value = "";
+      form.elements.confirm.value = "";
       button.disabled = true;
+      const modeButtons = [...content.querySelectorAll("[data-account-mode]")];
+      modeButtons.forEach((item) => { item.disabled = true; });
       try {
-        await account.login(username, pin);
+        await (mode === "register" ? account.register(username, secret) : account.login(username, secret));
         const destination = loginReturn || "account";
         loginReturn = null;
         go(destination);
@@ -653,6 +626,7 @@
         showToast(error.message);
       } finally {
         button.disabled = false;
+        modeButtons.forEach((item) => { item.disabled = false; });
       }
     });
   document
@@ -825,6 +799,43 @@
     }
   }
 });
+function updateAccountAppearance() {
+  const accountLink = document.querySelector(".header-avatar");
+  const profile = document.querySelector(".profile");
+  if (!accountLink || !profile) return;
+  const { username, profiles } = account.state();
+  const userProfile = profiles[username?.toLowerCase()];
+  if (username && !userProfile) account.loadProfile(username);
+  accountLink.textContent = username ? username.charAt(0).toUpperCase() : "R";
+  accountLink.title = username ? `Konto: ${username}` : "Zaloguj się kontem społeczności";
+  accountLink.setAttribute("aria-label", accountLink.title);
+  const avatar = profile.querySelector(".avatar");
+  avatar.textContent = username ? username.charAt(0).toUpperCase() : "R";
+  const avatars = ["comet", "planet", "cat", "fox", "leaf", "cloud", "heart", "spark"];
+  if (userProfile && avatars.includes(userProfile.avatar)) {
+    const img = document.createElement("img");
+    img.src = `https://rejson59.github.io/assets/avatars/${userProfile.avatar}.svg`;
+    img.alt = "";
+    img.className = "profile-avatar-image";
+    avatar.replaceChildren(img);
+  }
+  const colors = { mint: "#83dfc9", blue: "#a0cdff", violet: "#d5bcff", rose: "#ffaecd", amber: "#f7d18b", slate: "#d1ddeb" };
+  const color = Object.hasOwn(colors, userProfile?.color) ? colors[userProfile.color] : "";
+  avatar.style.background = color;
+  accountLink.style.background = color;
+  profile.querySelector(".profile-heading").textContent = username ? `Cześć, ${username}` : "Twój kolejny seans";
+  profile.querySelector(".profile-message").textContent = username ? "Twoje historie. Twoje tempo." : "Zaloguj się i zachowaj swoje postępy.";
+  profile.setAttribute("aria-label", username ? `Przejdź do profilu: ${username}` : "Zaloguj się i zachowaj swoje postępy");
+  if (username) {
+    profile.setAttribute("href", `https://rejson59.github.io/profil?u=${encodeURIComponent(username)}`);
+    profile.setAttribute("target", "_blank");
+    profile.setAttribute("rel", "noopener");
+  } else {
+    profile.setAttribute("href", "#account");
+    profile.removeAttribute("target");
+    profile.removeAttribute("rel");
+  }
+}
 let previousUser = account.state().username;
 account.subscribe(() => {
   const state = account.state();
@@ -835,7 +846,10 @@
   }
   const status = document.querySelector("#account-error");
   if (status) status.textContent = state.error;
-  if (state.username === previousUser) return;
+  if (state.username === previousUser) {
+    updateAccountAppearance();
+    return;
+  }
   previousUser = state.username;
   favorites = read("rej-favorites", []);
   watched = read("rej-watched", []);
--- a/style.css
+++ b/style.css
@@ -3739,6 +3739,15 @@
 .account-form label {
   display: grid;
   gap: 8px;
+}
+.profile-avatar-image {
+  width: 100%;
+  height: 100%;
+  object-fit: cover;
+  border-radius: 50%;
+}
+.account-form label[hidden] {
+  display: none;
 }
 .account-form input {
   width: 100%;
--- a/README.md
+++ b/README.md
@@ -28,11 +28,11 @@

 ## Konta społeczności i prywatność

-RejStream używa **istniejących kont społeczności** z `rejson59.github.io/spolecznosc.html` w projekcie Supabase `rejson-widgets`. To własny system **nazwa + 4-cyfrowy PIN**, nie Supabase Auth ani nowe konta. Zakładka `#account` loguje przez istniejące `community_login`, sprawdza `community_whoami` i pobiera bibliotekę konta. Rejestracja prowadzi do społeczności.
+RejStream używa **istniejących kont społeczności** z `rejson59.github.io/spolecznosc.html` w projekcie Supabase `rejson-widgets`. To ten sam własny system kont, nie Supabase Auth: stare konta mogą używać czterocyfrowego PIN-u, nowe i zaktualizowane — hasła. Zakładka `#account` loguje przez istniejące `community_login` lub rejestruje przez `community_register`, sprawdza `community_whoami` i pobiera bibliotekę konta. Rejestracja w RejStream wymaga hasła minimum 10 znaków i maksymalnie 72 bajty; RPC zachowuje nazwę parametru `p_pin` dla kompatybilności.

 - Gość może oglądać odcinki i lokalne pliki; **nie zapisujemy ani nie wznawiamy jego historii**.
 - Historia `#history`, zapisane sekundy (z ułamkami), ulubione i ręczne „obejrzane” wymagają konta; dane przechowywane są w Supabase, nie w localStorage/IndexedDB.
-- W przeglądarce pozostają token sesji społeczności (`rejson_community_session_v1`, wspólny na tym samym originie) i preferencje interfejsu. PIN nie jest zapisywany.
+- W przeglądarce pozostają token sesji społeczności (`rejson_community_session_v1`, wspólny na tym samym originie) i preferencje interfejsu. Hasło ani PIN nie są zapisywane.
 - Stare lokalne `rej-playback-v1`, `rej-recent`, `rej-favorites`, `rej-watched`, `rej-saved` są usuwane. **Nie przenosimy anonimowej historii na konto bez zgody.**
 - Dane są w pamięci aplikacji podczas sesji; synchronizacja zmienionych wpisów odbywa się co około 5 s. Błąd jest widoczny globalnie, a kolejkę można ponowić z ekranu konta. Nie ma trwałego lokalnego fallbacku offline; zamknięcie karty przed udanym zapisem może utracić ostatnie sekundy.
 - Wylogowanie i zmiana konta usuwają dane z pamięci; stary tracker nie może zapisać pozycji do nowego konta. Zmiany wspólnej sesji w innych kartach są obsługiwane przez `storage`.
@@ -40,7 +40,7 @@

 `supabase/rejstream.sql` zawiera wdrożoną migrację: tabela `rejstream_library` z RLS i odebranym bezpośrednim dostępem dla `anon`/`authenticated`. RPC odczytu/zapisu ustalają użytkownika **wyłącznie z tokena przez istniejące `community_session_user`**, nigdy z identyfikatora przesłanego przez klienta. Kod przeglądarki zawiera tylko istniejący publiczny klucz anon. Nie dodajemy klucza service-role i nie zmieniamy kont, PIN-ów ani tabel społeczności.

-Odziedziczony PIN czterocyfrowy zapewnia mniejszą ochronę niż pełne hasło/MFA; integracja nie zmienia globalnego mechanizmu społeczności. Token sesji jest poufny. Nie należy umieszczać go w linkach ani logach.
+Odziedziczony PIN czterocyfrowy zapewnia mniejszą ochronę niż hasło; istniejące konto może go zmienić na hasło w ustawieniach konta na stronie głównej. Integracja nie dodaje MFA ani odzyskiwania zapomnianego hasła. Token sesji jest poufny. Nie należy umieszczać go w linkach ani logach.

 ## Player i interfejs

--- a/tests/account.test.js
+++ b/tests/account.test.js
@@ -162,3 +162,40 @@
     request.mock.calls.filter((c) => c[0] === "rejstream_write"),
   ).toHaveLength(1);
 });
+
+it("passes both legacy PINs and password secrets through the same login RPC", async () => {
+  const { store, request } = setup();
+  await store.login("a", "1234");
+  await store.login("b", "Trudne hasło 2026!");
+  expect(request).toHaveBeenCalledWith("community_login", { p_username: "a", p_pin: "1234" });
+  expect(request).toHaveBeenCalledWith("community_login", { p_username: "b", p_pin: "Trudne hasło 2026!" });
+  expect(localStorage.getItem("rejson_community_session_v1")).not.toContain("Trudne hasło");
+});
+
+it("registers through the shared account RPC and hydrates the library", async () => {
+  const request = vi.fn(async (name, params) => {
+    if (name === "community_register") return { token: "new-token", username: params.p_username };
+    if (name === "community_whoami") return { username: "Nowy" };
+    if (name === "rejstream_read") return [];
+  });
+  const store = createAccountStore(request, localStorage);
+  const listener = vi.fn();
+  window.addEventListener("rj:session-change", listener);
+  await store.register("Nowy", "moje bezpieczne hasło");
+  expect(request).toHaveBeenCalledWith("community_register", { p_username: "Nowy", p_pin: "moje bezpieczne hasło" });
+  expect(store.state().username).toBe("Nowy");
+  expect(localStorage.getItem("rejson_community_session_v1")).not.toContain("moje bezpieczne hasło");
+  expect(listener).toHaveBeenCalledTimes(1);
+  await store.logout();
+  expect(listener).toHaveBeenCalledTimes(2);
+  window.removeEventListener("rj:session-change", listener);
+});
+
+it("reports a created account separately when library hydration fails", async () => {
+  const request = vi.fn(async (name) => {
+    if (name === "community_register") return { token: "new-token", username: "Nowy" };
+    throw Error("offline");
+  });
+  const store = createAccountStore(request, localStorage);
+  await expect(store.register("Nowy", "moje bezpieczne hasło")).rejects.toThrow("Konto utworzono");
+});
--- a/tests/rejchat-profile.test.js
+++ b/tests/rejchat-profile.test.js
@@ -12,9 +12,9 @@
     const fetcher = vi.fn(async (url, options) => {
       if (url.endsWith("rejchat_get_profiles")) {
         const body = JSON.parse(options.body);
-        expect(body.p_usernames).toEqual(["testuser"]);
+        expect(body.p_names).toEqual(["testuser"]);
         return new Response(
-          JSON.stringify([{ username: "testuser", avatar: "https://example.com/avatar.jpg", nick_color: "#ff0000" }]),
+          JSON.stringify([{ username: "testuser", avatar: "cat", color: "rose" }]),
           { status: 200 }
         );
       }
@@ -23,7 +23,7 @@
     vi.stubGlobal("fetch", fetcher);
     const store = createAccountStore(rpc, null);
     const profile = await store.loadProfile("testuser");
-    expect(profile).toEqual({ username: "testuser", avatar: "https://example.com/avatar.jpg", nick_color: "#ff0000" });
+    expect(profile).toEqual({ username: "testuser", avatar: "cat", color: "rose" });
   });

   it("returns null when profile not found", async () => {
@@ -39,7 +39,7 @@
   it("caches profile after first load", async () => {
     const fetcher = vi.fn(async () => {
       return new Response(
-        JSON.stringify([{ username: "testuser", avatar: "https://example.com/avatar.jpg", nick_color: "#ff0000" }]),
+        JSON.stringify([{ username: "testuser", avatar: "cat", color: "rose" }]),
         { status: 200 }
       );
     });
@@ -80,7 +80,7 @@
   it("updates state with loaded profile", async () => {
     const fetcher = vi.fn(async () => {
       return new Response(
-        JSON.stringify([{ username: "testuser", avatar: "https://example.com/avatar.jpg", nick_color: "#ff0000" }]),
+        JSON.stringify([{ username: "testuser", avatar: "cat", color: "rose" }]),
         { status: 200 }
       );
     });
@@ -89,8 +89,15 @@
     await store.loadProfile("testuser");
     expect(store.state().profiles["testuser"]).toEqual({
       username: "testuser",
-      avatar: "https://example.com/avatar.jpg",
-      nick_color: "#ff0000"
+      avatar: "cat",
+      color: "rose"
     });
   });
+  it("normalizes unexpected avatar and color instead of using arbitrary markup or URLs", async () => {
+    const request = vi.fn(async () => [{ username: "testuser", avatar: "https://evil.invalid/x", color: "red" }]);
+    const store = createAccountStore(request, null);
+    await expect(store.loadProfile("testuser")).resolves.toEqual({ username: "testuser", avatar: "comet", color: "mint" });
+    expect(request).toHaveBeenCalledWith("rejchat_get_profiles", { p_names: ["testuser"] });
+  });
+
 });
--- a/tests/ui.test.js
+++ b/tests/ui.test.js
@@ -1,9 +1,9 @@
 // @vitest-environment jsdom
 import { it, expect, vi, beforeAll } from "vitest";
-const sessionMock = vi.hoisted(() => ({ username: "Test viewer", onChange: null }));
+const sessionMock = vi.hoisted(() => ({ username: "Test viewer", profiles: {}, onChange: null }));
 vi.mock("../account.js", () => ({
   account: {
-    state: () => ({ username: sessionMock.username, error: "", profiles: {} }),
+    state: () => ({ username: sessionMock.username, error: "", profiles: sessionMock.profiles }),
     storage: () => localStorage,
     subscribe: (fn) => { sessionMock.onChange = fn; return () => {}; },
     init: async () => {},
@@ -542,7 +542,7 @@
 it("updates desktop account messaging on login, logout and restored sessions", async () => {
   await navigate("home");
   const profile = document.querySelector(".profile");
-  expect(profile.getAttribute("href")).toContain("rejchat.example.com/profil?u=");
+  expect(profile.getAttribute("href")).toContain("rejson59.github.io/profil?u=");
   expect(profile.textContent).toContain("Cześć, Test viewer");
   expect(profile.textContent).toContain("Twoje historie. Twoje tempo.");
   expect(profile.querySelector(".avatar").textContent).toBe("T");
@@ -559,6 +559,20 @@
   sessionMock.username = "Test viewer";
   sessionMock.onChange();
   expect(document.body.textContent).not.toMatch(/Bez konta|Bez zakładania konta/i);
+});
+
+it("updates shared profile appearance without restarting the player", async () => {
+  await navigate("watch/circus/1/1");
+  const player = document.querySelector("#episode-player");
+  sessionMock.profiles["test viewer"] = { avatar: "cat", color: "rose" };
+  sessionMock.onChange();
+  expect(document.querySelector("#episode-player")).toBe(player);
+  expect(document.querySelector(".profile .avatar img").src).toBe("https://rejson59.github.io/assets/avatars/cat.svg");
+  expect(document.querySelector(".profile").href).toContain("rejson59.github.io/profil?u=Test%20viewer");
+  sessionMock.profiles["test viewer"] = { avatar: '<img src=x onerror=alert(1)>', color: 'red' };
+  sessionMock.onChange();
+  expect(document.querySelector(".profile .avatar img")).toBeNull();
+  delete sessionMock.profiles["test viewer"];
 });

 it("recommends an intro before Helluva seasons and bridges season boundaries", async () => {
--- /dev/null
+++ b/tests/account-ui.test.js
@@ -0,0 +1,63 @@
+// @vitest-environment jsdom
+import { beforeAll, beforeEach, it, expect, vi } from "vitest";
+import { TextEncoder } from "node:util";
+const mocked = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
+vi.mock("../account.js", () => ({
+  account: {
+    state: () => ({ username: null, error: "", profiles: {} }),
+    storage: () => null,
+    subscribe: () => () => {}, init: async () => {}, flush: async () => {},
+    login: mocked.login, register: mocked.register, loadProfile: async () => null,
+  },
+}));
+beforeAll(async () => {
+  vi.stubGlobal("TextEncoder", TextEncoder);
+  document.body.innerHTML = '<div id="app"></div>';
+  window.scrollTo = vi.fn();
+  location.hash = "#account";
+  await import("../src.js");
+});
+beforeEach(() => {
+  mocked.login.mockReset().mockResolvedValue();
+  mocked.register.mockReset().mockResolvedValue();
+  document.querySelector('[data-account-mode="login"]').click();
+});
+function form() { return document.querySelector("#account-form"); }
+function submit() { form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }
+
+it("accepts a full password for the existing account without a numeric or four-character restriction", async () => {
+  expect(form().elements.secret.getAttribute("pattern")).toBeNull();
+  expect(form().elements.secret.getAttribute("inputmode")).toBeNull();
+  expect(form().elements.secret.getAttribute("maxlength")).toBeNull();
+  expect(form().elements.confirm.closest("label").hidden).toBe(true);
+  form().elements.username.value = "Someone";
+  form().elements.secret.value = "Hasło 123! xyz";
+  submit();
+  expect(mocked.login).toHaveBeenCalledWith("Someone", "Hasło 123! xyz");
+  expect(mocked.register).not.toHaveBeenCalled();
+  await Promise.resolve();
+});
+it("offers password registration in the project and prevents mismatched or short passwords", async () => {
+  document.querySelector('[data-account-mode="register"]').click();
+  expect(form().elements.confirm.closest("label").hidden).toBe(false);
+  expect(form().elements.confirm.required).toBe(true);
+  form().elements.username.value = "Someone";
+  form().elements.secret.value = "short";
+  form().elements.confirm.value = "short";
+  submit();
+  expect(mocked.register).not.toHaveBeenCalled();
+  form().elements.secret.value = "long password";
+  form().elements.confirm.value = "another password";
+  submit();
+  expect(mocked.register).not.toHaveBeenCalled();
+  form().elements.confirm.value = "long password";
+  submit();
+  expect(mocked.register).toHaveBeenCalledWith("Someone", "long password");
+  await Promise.resolve();
+});
+it("still allows a legacy four-digit PIN for login", () => {
+  form().elements.username.value = "Someone";
+  form().elements.secret.value = "1234";
+  submit();
+  expect(mocked.login).toHaveBeenCalledWith("Someone", "1234");
+});
```

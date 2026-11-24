/*!
 * Portal społeczności — logowanie, wpisy i komentarze.
 * Sesja przechowywana w localStorage pod kluczem rejson_community_session_v1
 * (ten sam klucz odczytuje js/view-tracker.js przy pingach obecności).
 */
(function (window, document) {
  "use strict";

  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

  var SESSION_KEY = "rejson_community_session_v1";

  var session = loadSession(); /* {token, username} | null */
  var nameCheckTimer = null;
  var authBusy = false;
  var nameStatus = { valid: false, taken: false, checked: false };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Linki są kodowane dopiero po podziale na tekst i adres; skrót dotyczy tylko czatu. */
  function linkify(value, shorten) {
    var text=String(value||''), regex=/(?:https?:\/\/|www\.)[^\s<>"']+/g, last=0, match, html='';
    while((match=regex.exec(text))){
      html+=esc(text.slice(last,match.index));var raw=match[0],trail='';
      while(/[.,!?;:)\]]$/.test(raw)){trail=raw.slice(-1)+trail;raw=raw.slice(0,-1);}
      var href=/^https?:\/\//i.test(raw)?raw:'https://'+raw;
      var label=shorten&&window.RJChatMessageUI?window.RJChatMessageUI.shortLink(raw):raw;
      var title=label!==raw?' title="'+esc(raw)+'" aria-label="Otwórz link: '+esc(raw)+'"':'';
      html+='<a class="comm-link" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer nofollow"'+title+'>'+esc(label)+'</a>'+esc(trail);
      last=match.index+match[0].length;
    }
    return html+esc(text.slice(last));
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.token === "string" && parsed.token.length >= 16 && parsed.username) {
        return { token: parsed.token, username: String(parsed.username), is_owner: parsed.is_owner === true };
      }
    } catch (e) { /* ignorujemy */ }
    return null;
  }

  function saveSession(s) {
    var oldToken = session && session.token;
    if (s && s.token && s.username) {
      session = { token: s.token, username: s.username, is_owner: s.is_owner === true };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignorujemy */ }
    } else {
      session = null;
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignorujemy */ }
    }
    if (oldToken !== (session && session.token)) { clearChatDrafts(); resetChatSession(); }
    window.dispatchEvent(new Event("rj:session-change"));
  }

  var RPC_URL = SUPABASE_URL + "/rest/v1/rpc/";
  var RPC_HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": "Bearer " + SUPABASE_ANON_KEY,
    "Content-Type": "application/json"
  };
  /* Jedna wspólna warstwa: limit czasu, ponowienia z odstępem i sklejanie
     identycznych żądań. Wcześniej każdy błąd sieci kończył się pustym czatem
     do ręcznego odświeżenia. */
  function rpc(fnName, body) {
    var url = RPC_URL + fnName;
    if (window.RJNet && window.RJNet.rpc) {
      /* Ponawiamy wyłącznie odczyty; powtórzone „wyślij”/„polub” zdublowałoby akcję. */
      return window.RJNet.rpc(url, body || {}, { label: fnName, headers: RPC_HEADERS, retries: window.RJNet.readOnly(fnName) ? 2 : 0 });
    }
    return fetch(url, { method: "POST", headers: RPC_HEADERS, body: JSON.stringify(body || {}), cache: "no-store" })
      .then(function (res) {
        return res.text().then(function (raw) {
          var data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
          if (!res.ok) {
            var err = new Error((data && (data.message || data.hint)) || ("Błąd serwera (" + res.status + ")"));
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
  }

  function relTime(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (isNaN(t)) return "";
    var diff = Math.max(0, Date.now() - t);
    var s = Math.floor(diff / 1000);
    if (s < 15) return "przed chwilą";
    if (s < 60) return s + " s temu";
    var m = Math.floor(s / 60);
    if (m < 60) return m === 1 ? "1 min temu" : m + " min temu";
    var h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? "1 godz. temu" : h + " godz. temu";
    var d = Math.floor(h / 24);
    return d === 1 ? "wczoraj" : d + " dni temu";
  }

  var AGENT_AVATAR_SRC = "assets/agent-avatar.png";

  function avatarFor(name, isBot) {
    var initial = (String(name || "?").trim().charAt(0) || "?").toUpperCase();
    if (isBot === true) {
      return (
        '<span class="comm-avatar comm-avatar-bot" aria-hidden="true">' +
          esc(initial) +
          '<img src="' + AGENT_AVATAR_SRC + '" alt="" loading="lazy">' +
        "</span>"
      );
    }
    return '<span class="comm-avatar" data-profile-avatar="' + esc(name) + '" aria-hidden="true">' + esc(initial) + "</span>";
  }

  function profileLink(name) {
    if (!window.RJProfiles || !window.RJProfiles.safeName(name)) return esc(name);
    return '<a href="/profil?u=' + encodeURIComponent(name) + '" data-profile-name="' + esc(name) + '">' + esc(name) + '</a>';
  }
  function hydrateProfiles(root) { if (window.RJProfiles) window.RJProfiles.hydrate(root || document); }

  /* Odznaka właściciela strony obok nazwy.
     Wyłącznie na podstawie flagi `is_owner` z bazy — NIGDY po nazwie.
     Konto o nazwie „rejson-59” zgłosiło się 19.11 i dostawało koronę oraz
     przyciski moderacji tylko dlatego, że nazwa wyglądała podobnie. */
  function isOwnerName(flagFromDb) {
    return flagFromDb === true;
  }

  function ownerBadgeHTML(flagFromDb) {
    if (!isOwnerName(flagFromDb)) return "";
    return '<span class="comm-owner-badge" title="Twórca strony rejson59.github.io">👑 Właściciel</span>';
  }

  /* Odznaka oficjalnego agenta AI (konto bota publikującego nowości). */
  var AGENT_NAME = "agent_ai_rejsona";
  function isAgentName(name) {
    return String(name || "").toLowerCase() === AGENT_NAME;
  }
  function botBadgeHTML(flagFromDb) {
    if (flagFromDb !== true) return "";
    return '<span class="comm-bot-badge" title="Oficjalny agent AI Rejsona — publikuje zapowiedzi aktualizacji i nowości ze strony">🤖 Agent AI</span>';
  }
  function authorBadges(name, p) {
    return ownerBadgeHTML(p && p.is_owner) + botBadgeHTML(p && p.is_bot);
  }

  /* ================= LOGOWANIE / REJESTRACJA ================= */
  function setAuthError(msg) {
    var el = document.getElementById("auth-error");
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function setNameStatus(text, kind) {
    var el = document.getElementById("name-status");
    if (!el) return;
    el.textContent = text;
    el.className = "comm-name-status" + (kind ? " is-" + kind : "");
  }

  function refreshAuthSubmit() {
    var btn = document.getElementById("auth-submit");
    var pinEl = document.getElementById("auth-pin");
    if (!btn || !pinEl) return;
    var secret = pinEl.value || "";
    var bytes = new TextEncoder().encode(secret).length;
    var pinOk = nameStatus.taken ? secret.length > 0 && bytes <= 72 : Array.from(secret).length >= 10 && bytes <= 72;
    var nameInput = document.getElementById("auth-username");
    var nameOk = nameStatus.checked && nameStatus.valid && nameInput && nameStatus.name === nameInput.value.trim();
    btn.disabled = authBusy || !(pinOk && nameOk);
    if (!nameOk) {
      btn.textContent = "Zaloguj / utwórz konto";
    } else if (nameStatus.taken) {
      btn.textContent = "Zaloguj tą nazwą";
    } else {
      btn.textContent = "Utwórz konto z tą nazwą";
    }
  }

  function scheduleNameCheck() {
    var input = document.getElementById("auth-username");
    if (!input) return;
    clearTimeout(nameCheckTimer);
    var name = input.value.trim();

    if (!name) {
      nameStatus = { valid: false, taken: false, checked: false };
      setNameStatus("3–24 znaki: litery, cyfry oraz _ . -");
      refreshAuthSubmit();
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.\-]{2,23}$/.test(name)) {
      nameStatus = { valid: false, taken: false, checked: true };
      var reserved = ["admin", "administrator", "root", "moderator", "owner", "system"];
      setNameStatus(
        reserved.indexOf(name.toLowerCase()) >= 0
          ? "✕ ta nazwa jest zarezerwowana"
          : "✕ 3–24 znaki: litery, cyfry oraz _ . -", "bad");
      refreshAuthSubmit();
      return;
    }

    nameStatus = { valid: false, taken: false, checked: false };
    setNameStatus("sprawdzam nazwę…");
    refreshAuthSubmit();
    nameCheckTimer = setTimeout(function () {
      rpc("community_username_status", { p_username: name })
        .then(function (data) {
          if (input.value.trim() !== name) return;
          nameStatus = {
            name: name,
            valid: Boolean(data && data.valid),
            taken: Boolean(data && data.taken),
            checked: true
          };
          if (!nameStatus.valid) {
            setNameStatus("✕ ta nazwa jest niedostępna", "bad");
          } else if (nameStatus.taken) {
            setNameStatus("🔒 nazwa zajęta — wpisz hasło lub dotychczasowy PIN", "taken");
          } else {
            setNameStatus("✓ nazwa wolna — wymyśl hasło i dołącz do społeczności", "good");
          }
          refreshAuthSubmit();
        })
        .catch(function () {
          if (input.value.trim() !== name) return;
          nameStatus = { valid: false, taken: false, checked: false };
          setNameStatus("nie udało się sprawdzić nazwy — sprawdź połączenie");
          refreshAuthSubmit();
        });
    }, 350);
  }

  /* Ten sam identyfikator co na stronie logowania — limit kont działa w obu
     miejscach, bo oba wołają community_register(). */
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

  function handleAuthSubmit(ev) {
    ev.preventDefault();
    var nameEl = document.getElementById("auth-username");
    var pinEl = document.getElementById("auth-pin");
    var btn = document.getElementById("auth-submit");
    if (!nameEl || !pinEl || !btn) return;

    var name = nameEl.value.trim();
    var pin = pinEl.value;
    var byteLength = new TextEncoder().encode(pin).length;
    if (authBusy || !nameStatus.checked || !nameStatus.valid || nameStatus.name !== name || byteLength > 72 || (nameStatus.taken ? !pin.length : Array.from(pin).length < 10)) return;

    setAuthError(null);
    authBusy = true;
    btn.disabled = true;
    var fn = nameStatus.taken ? "community_login" : "community_register";

    var authArgs = { p_username: name, p_pin: pin };
    if (!nameStatus.taken) authArgs.p_fp = deviceId();
    rpc(fn, authArgs)
      .then(function (data) {
        if (!data || !data.token) throw new Error("Brak tokena sesji w odpowiedzi.");
        saveSession({ token: data.token, username: data.username, is_owner: data.is_owner === true });
        pinEl.value = "";
        renderAuthZone();
        chatGeneration++; requestChat(true); loadOnline();
        var dialog = document.getElementById("chat-auth-dialog");
        if (dialog && dialog.open) dialog.close();
        var textarea = document.getElementById("chat-input");
        if (textarea) textarea.focus();
      })
      .catch(function (err) {
        setAuthError(err.message || "Nie udało się zalogować.");
      })
      .finally(function () { authBusy = false; refreshAuthSubmit(); });
  }

  function handleLogout() {
    saveSession(null);
    renderAuthZone();
    chatGeneration++; requestChat(true); loadOnline();
    var textarea = document.getElementById("chat-input");
    if (textarea) { textarea.value = ""; refreshChatSend(); }
  }

  /* ================= STREFA AUTH ================= */
  /* Po usunięciu wpisów w RejChat nie ma kompozytora wpisu ani pól do niego.
     Zostaje karta logowania (w dialogu „Dołącz do rozmowy”), przycisk
     wylogowania i odświeżenie stanu formularza czatu. */
  function renderAuthZone() {
    var loginCard = document.getElementById("login-card");
    if (loginCard) loginCard.hidden = !!session;
    if (session) {
      var chatDialog = document.getElementById("chat-auth-dialog");
      if (chatDialog && chatDialog.open) chatDialog.close();
    }
    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.hidden = !session;
    refreshChatAuth();
  }

  /* ================= KTO JEST TERAZ ONLINE ================= */
  var ONLINE_CACHE_KEY = "rejson_comm_online_cache_v1";

  function onlineUserHTML(u) {
    var name = String(u.username || "?");
    var isAgent = isAgentName(name) || u.is_bot === true;
    var tabs = Number(u.tabs) || 1;
    var projects = Array.isArray(u.projects) ? u.projects.length : 0;
    return (
      '<span class="comm-online-user">' +
        '<span class="comm-online-dot" aria-hidden="true"></span>' +
        '<span class="comm-avatar comm-avatar-sm' + (isAgent ? " comm-avatar-bot" : "") + '"' + (isAgent ? '' : ' data-profile-avatar="' + esc(name) + '"') + ' aria-hidden="true">' + esc((name.charAt(0) || "?").toUpperCase()) +
          (isAgent ? '<img src="' + AGENT_AVATAR_SRC + '" alt="" loading="lazy">' : "") +
        "</span>" +
        profileLink(name) + ownerBadgeHTML(u && u.is_owner) + botBadgeHTML(isAgent) +
        (tabs > 1 ? '<span class="comm-online-count mono" title="Ta sama osoba ma tyle kart otwartych">' + tabs + " karty</span>" : "") +
        (projects > 1 ? '<span class="comm-online-count mono" title="Ile stron/projektów ma teraz otwarte">' + projects + " strony</span>" : "") +
      "</span>"
    );
  }

  function renderOnlineUsers(users) {
    var box = document.getElementById("comm-online");
    if (!box) return;
    if (!users.length) {
      box.innerHTML =
        '<span class="comm-online-empty">Na razie nikogo tu nie ma. Zajrzyj ponownie później!</span>';
      return;
    }
    box.innerHTML = users.map(onlineUserHTML).join("");
    hydrateProfiles(box);
  }

  function loadOnline() {
    var box = document.getElementById("comm-online");
    if (!box) return;
    return rpc("community_online_users", { p_window_seconds: 90 })
      .then(function (users) {
        var list = Array.isArray(users) ? users : [];
        renderOnlineUsers(list);
        try {
          localStorage.setItem(ONLINE_CACHE_KEY, JSON.stringify({ at: Date.now(), users: list }));
        } catch (e) { /* ignorujemy */ }
        return list;
      })
      .catch(function () { /* cicho — sekcja opcjonalna */ });
  }

  /* Błyskawiczny start: pokaż ostatnio znanych (cache świeższy niż 2 min),
     zanim leci żądanie — żadnego wielosekundowego „Ładowanie…”. */
  function primeOnlineFromCache() {
    try {
      var raw = localStorage.getItem(ONLINE_CACHE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.at !== "number" || !Array.isArray(parsed.users)) return;
      if (Date.now() - parsed.at > 2 * 60 * 1000) return;
      renderOnlineUsers(parsed.users);
    } catch (e) { /* ignorujemy */ }
  }

  /* ================= CZAT SPOŁECZNOŚCI NA ŻYWO ================= */
  /* 4,5 s zamiast 2 s: przy kilku otwartych kartach dwa razy mniej żądań,
     a różnica w odbiorze jest niezauważalna (nowe wiadomości i tak dociągamy
     od razu po wysłaniu i po powrocie do karty). */
  var CHAT_REFRESH_MS = 4500;
  var CHAT_MAX_SHOWN = 60;
  var chatRoom = "general", chatDrafts = { general: "", links: "" }, chatErrors = { general: "", links: "" };
  function clearChatDrafts() {
    chatDrafts = { general: "", links: "" }; chatErrors = { general: "", links: "" };
    var field = document.getElementById("chat-input"), status = document.getElementById("chat-send-status");
    if (field) field.value = ""; if (status) status.textContent = "";
    var saveStatus=document.getElementById("chat-save-status"); if(saveStatus)saveStatus.textContent="";
    chatMode = null; if(chatPhotoPicker)chatPhotoPicker.clear(); var box=document.getElementById("chat-compose-context"); if(box)box.hidden=true;
  }
  var chatMessages = Object.create(null), chatSignature = "", chatMode = null, chatDraftBeforeEdit = "", chatPhotoPicker = null;
  var chatLastId = null;      /* id ostatniej wiadomości — dociągamy tylko nowe */
  var chatHighWater = null; /* Najnowsza znana wiadomość (czas i id), także po usunięciu. */
  var chatBusy = false;
  var chatTickCount = 0;
  var chatRequest = null, chatNeedsFull = false, chatGeneration = 0, chatRenderedSession = null, chatScroll = null;

  function chatMsgHTML(m) {
    var mine = session && session.username === m.author_name;
    var canDel = mine || (session && isOwnerName(session.is_owner));
    return (
      '<div class="chat-msg' + (mine ? " is-mine" : "") + '" data-chat-id="' + esc(m.id) + '" data-message-author="' + esc(m.author_name) + '" data-message-time="' + (Date.parse(m.created_at)||0) + '">' +
        avatarFor(m.author_name, m.is_bot) +
        '<div class="chat-bubble">' +
          '<div class="chat-meta">' +
            '<span class="chat-author">' + profileLink(m.author_name) + authorBadges(m.author_name, m) + "</span>" +
            '<span class="chat-time mono">' + relTime(m.created_at) + "</span>" +
            (session && !mine ? '<button class="chat-private-start" type="button" data-dm-user="' + esc(m.author_name) + '" aria-label="Prywatna rozmowa z ' + esc(m.author_name) + '">✉</button>' : '') +
          (session ? '<details class="rc-message-menu"><summary aria-label="Opcje wiadomości">⋯</summary><div class="rc-menu-items">' +
            '<button type="button" data-message-info="public" data-message-id="' + esc(m.id) + '">Odczyty i reakcje</button>' +
            '<button class="rejchat-message-action" type="button" data-chat-reply="' + esc(m.id) + '">Odpowiedz</button>' : '') +
          (session && isOwnerName(session.is_owner) ? '<button class="rejchat-message-action" type="button" data-pin-scope="public" data-pin-id="' + esc(m.id) + '">Przypnij wiadomość</button>' : '') +
          (session && !mine ? '<button class="rejchat-message-action" type="button" data-report-scope="public" data-report-id="' + esc(m.id) + '">Zgłoś wiadomość</button>' : '') +
          (session ? '<button class="rejchat-message-action" type="button" data-save-sejf="text" data-save-scope="public" data-save-message="' + esc(m.id) + '">Zapisz tekst w RejSejfie</button>' : '') +
          (session && m.photo && (m.photo.status||'ok')==='ok' && Date.parse(m.photo.expires_at)>Date.now() ? '<button class="rejchat-message-action" type="button" data-save-sejf="photo" data-save-scope="public" data-save-message="' + esc(m.id) + '" title="Kopia w Sejfie nie wygaśnie po 14 dniach">Zapisz zdjęcie w RejSejfie</button>' : '') +
          (mine ? '<button class="rejchat-message-action" type="button" data-chat-edit="' + esc(m.id) + '">Edytuj</button>' : '') +
          (canDel ? '<button class="chat-delete" type="button" data-chat-delete="' + esc(m.id) + '">Usuń wiadomość</button>' : '') +
          (session ? '</div></details>' : '') +
          "</div>" +
          (m.reply ? '<div class="rejchat-reply-quote">↩ ' + esc(m.reply.author_name) + ': ' + esc(m.reply.content) + '</div>' : '') +
          '<p class="chat-text">' + linkify(m.content, true) + "</p>" +
          (window.RJChatPhotos ? window.RJChatPhotos.button(m.photo) : "") +
          (m.edited_at ? '<span class="rejchat-edited">Edytowano</span>' : '') +
        "</div>" +
      "</div>"
    );
  }

  function chatList() { return document.getElementById("chat-list"); }
  // Usuwamy dane natychmiast, zanim może wrócić opóźniona odpowiedź poprzedniej sesji.
  function resetChatSession() {
    chatGeneration++; chatLastId=null; chatHighWater=null; chatRenderedSession=null; chatSignature=""; chatMessages=Object.create(null);
    var box=chatList(); if(box)box.innerHTML=session?'<p class="comm-chat-empty">Ładowanie czatu…</p>':'<p class="comm-chat-empty">Zaloguj się, aby zobaczyć rozmowy.</p>';
    if (chatScroll) chatScroll.reset();
    var jump=document.getElementById("chat-jump");if(jump)jump.hidden=true;
    var status=document.getElementById("chat-connection"); if(status&&!session)status.textContent="Dostęp po zalogowaniu";
  }


  function chatNearBottom() {
    var list = chatList();
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight < 48;
  }

  function chatScrollBottom() {
    var list = chatList();
    if (chatScroll) chatScroll.bottom(); else if (list) list.scrollTop = list.scrollHeight;
    var jump = document.getElementById("chat-jump");
    if (jump) jump.hidden = true;
  }

  function renderChatAll(rows) {
    var box = chatList();
    if (!box) return;
    chatRenderedSession = session ? session.token : "";
    chatMessages = Object.create(null); rows.forEach(function(m){chatMessages[String(m.id)]=m;}); chatSignature=JSON.stringify(rows);
    if (!rows.length) {
      box.innerHTML = '<p class="comm-chat-empty">Pusto tu… bądź pierwszą osobą na czacie! 👋</p>';
      return;
    }
    box.innerHTML = rows.map(chatMsgHTML).join("");
    /* Lista rośnie tylko do limitu — inaczej po godzinie rozmowy DOM ciągnie
       setki węzłów, a przewijanie zaczyna klatkować. */
    while (box.children.length > CHAT_MAX_SHOWN) box.removeChild(box.firstChild);
    if(window.RJChatMessageUI)window.RJChatMessageUI.group(box);
    hydrateProfiles(box);
  }

  function appendChat(rows) {
    var box = chatList();
    if (!box || !rows.length) return;
    var empty = box.querySelector(".comm-chat-empty");
    if (empty) box.innerHTML = "";
    var existing = Array.prototype.map.call(box.querySelectorAll('[data-chat-id]'), function (el) { return el.getAttribute('data-chat-id'); });
    rows = rows.filter(function (row) { return existing.indexOf(String(row.id)) < 0; });
    rows.forEach(function(m){chatMessages[String(m.id)]=m;}); chatSignature="";
    box.insertAdjacentHTML("beforeend", rows.map(chatMsgHTML).join(""));
    hydrateProfiles(box);
    while (box.children.length > CHAT_MAX_SHOWN) box.removeChild(box.firstChild);
    if(window.RJChatMessageUI)window.RJChatMessageUI.group(box);
  }

  function refreshChatSend() {
    var btn = document.getElementById("chat-send");
    var input = document.getElementById("chat-input");
    if (!btn || !input) return;
    btn.disabled = !session || chatBusy || (!(input.value || "").trim() && !(chatPhotoPicker && chatPhotoPicker.file()));
    if(chatPhotoPicker)chatPhotoPicker.disabled(chatBusy);
    var length = document.getElementById("chat-length-text") || document.getElementById("chat-length");
    if (length) length.textContent = (input.value || "").length + " / 2000 znaków · Enter — wyślij, Shift+Enter — nowa linia";
  }

  function refreshChatAuth() {
    var form = document.getElementById("chat-form");
    var note = document.getElementById("chat-note");
    var input = document.getElementById("chat-input");
    if (!form || !note) return;
    form.hidden = !session;
    var picker=document.getElementById("chat-photo-picker"); if(picker)picker.hidden=!session;
    note.hidden = !!session;
    if (input && session) input.placeholder = "Napisz coś jako " + session.username + "…";
    refreshChatSend();
  }

  function chatConnection(ok) {
    var status = document.getElementById("chat-connection");
    if (!status) return;
    status.textContent = ok ? "Na żywo" : "Brak połączenia — ponawiamy";
    status.classList.toggle("is-offline", !ok);
  }

  /* Wspólny komunikat sieci: zamiast pustki użytkownik widzi, że trwa
     ponawianie, a po powrocie łącza czat dociąga się sam. */
  window.addEventListener("rj:net-state", function (event) {
    var detail = event.detail || {};
    if (detail.status === "retry") {
      var label = document.getElementById("chat-connection");
      if (label) { label.textContent = "Ponawiam połączenie…"; label.classList.add("is-offline"); }
    } else if (detail.status === "offline") {
      var off = document.getElementById("chat-connection");
      if (off) { off.textContent = "Brak internetu — czekam"; off.classList.add("is-offline"); }
    }
  });
  window.addEventListener("rj:net-online", function () {
    chatGeneration++;
    requestChat(true);
  });

  function chatSessionFailure(err, generation, token) {
    if (generation !== chatGeneration || !session || session.token !== token) return true;
    if (err && /^Sesja wygasła/.test(err.message || "")) {
      handleLogout();
      var note = document.getElementById("chat-connection");
      if (note) note.textContent = "Sesja wygasła — zaloguj się ponownie";
      return true;
    }
    return false;
  }

  // Serwer porządkuje wiadomości po czasie i id. Starsze wpisy wracające
  // po usunięciu albo duplikaty odpowiedzi nie są nowymi wiadomościami.
  function updateChatHighWater(rows) {
    var previous=chatHighWater, latest=previous, added=false;
    rows.forEach(function(row){
      var raw=String(row.created_at||""), time=Date.parse(raw), fraction=raw.match(/\.(\d+)(?:Z|[+-]\d\d(?::?\d\d)?)$/i), extra=Number(((fraction&&fraction[1])||"").padEnd(9,"0").slice(3,9)), id=String(row.id || "").toLowerCase();
      if(!Number.isFinite(time)||!id)return;
      function later(a,b){return !b||a.time>b.time||(a.time===b.time&&(a.extra>b.extra||(a.extra===b.extra&&a.id>b.id)));}
      var key={time:time,extra:extra,id:id};
      if(previous&&later(key,previous)&&!Object.prototype.hasOwnProperty.call(chatMessages,String(row.id)))added=true;
      if(later(key,latest))latest=key;
    });
    chatHighWater=latest;
    return added;
  }

  /* pełne przeładowanie (co ~10 s łapie też wiadomości usunięte przez innych) */
  function loadChatFull() {
    var box = chatList();
    var generation = chatGeneration, token=session && session.token;
    return rpc("rejchat_room_list_v3", { p_token:token, p_room:chatRoom, p_after_id:null, p_limit:50 })
      .then(function (rows) {
        if (!Array.isArray(rows) || generation !== chatGeneration || !session || session.token !== token) return;
        chatConnection(true);
        var firstRender = !chatLastId;
        var position = chatScroll ? chatScroll.capture() : {following:chatNearBottom(),top:box ? box.scrollTop : 0};
        var added = updateChatHighWater(rows);
        if (chatRenderedSession !== (session ? session.token : "") || chatSignature !== JSON.stringify(rows) || (!rows.length && box && (!box.querySelector(".comm-chat-empty") || box.querySelector(".comm-chat-empty").textContent.indexOf("Pusto tu") !== 0))) renderChatAll(rows);
        chatLastId = rows.length ? rows[rows.length - 1].id : null;
        /* Pierwsze wejście zawsze ląduje na najnowszych wiadomościach — nawet
           jeśli lista nie miała jeszcze wysokości w chwili renderowania. */
        if (firstRender || position.following) chatScrollBottom();
        else if (chatScroll) chatScroll.restore(position);
        else if (box) box.scrollTop = position.top;
        if (!position.following && added) showChatJump();
      })
      .catch(function (err) {
        if (chatSessionFailure(err, generation, token)) return;
        chatConnection(false);
        var b2 = chatList();
        if (b2 && !chatLastId) {
          b2.innerHTML = '<p class="comm-chat-empty">Nie udało się pobrać czatu — sprawdź połączenie. <button type="button" class="btn btn-ghost btn-sm" data-chat-retry>Spróbuj ponownie</button></p>';
          var retryBtn = b2.querySelector('[data-chat-retry]');
          if (retryBtn) retryBtn.addEventListener('click', function () {
            retryBtn.disabled = true;
            retryBtn.textContent = 'Łączę…';
            requestChat(true).then(function () {
              if (retryBtn.isConnected) { retryBtn.disabled = false; retryBtn.textContent = 'Spróbuj ponownie'; }
            });
          });
        }
      });
  }

  function loadChatIncremental() {
    var generation = chatGeneration, token=session && session.token;
    return rpc("rejchat_room_list_v3", { p_token:token, p_room:chatRoom, p_after_id:chatLastId, p_limit:50 })
      .then(function (rows) {
        if (!Array.isArray(rows) || generation !== chatGeneration || !session || session.token !== token) return;
        chatConnection(true);
        if (!rows.length) return;
        var position = chatScroll ? chatScroll.capture() : {following:chatNearBottom(),top:chatList().scrollTop};
        var added=updateChatHighWater(rows);
        appendChat(rows);
        chatLastId = rows[rows.length - 1].id;
        if (chatScroll) chatScroll.restore(position); else if (position.following) chatScrollBottom();
        if (!position.following && added) showChatJump();
      })
      .catch(function (err) { if (!chatSessionFailure(err, generation, token)) chatConnection(false); });
  }

  function showChatJump() {
    var jump = document.getElementById("chat-jump");
    if (jump) jump.hidden = false;
  }

  // Jedno żądanie listy na raz. Wynik sprzed wysłania/usunięcia nie nadpisuje czatu.
  function requestChat(full) {
    if (!session) return Promise.resolve();
    if (chatRequest) { if (full) chatNeedsFull = true; return chatRequest; }
    chatRequest = (full ? loadChatFull() : loadChatIncremental()).finally(function () {
      chatRequest = null;
      if (chatNeedsFull) { chatNeedsFull = false; requestChat(true); }
    });
    return chatRequest;
  }

  function chatPoll() {
    chatTickCount++;
    /* Pełne przeładowanie (50 wiadomości naraz) co ~54 s zamiast co ~22 s.
       Nowe wiadomości i tak dociąga przyrostowo co 4,5 s — pełny strzał
       służy tylko wyłapaniu usuniętych wpisów. */
    return requestChat(chatTickCount % 12 === 1 || !chatLastId);
  }

  function handleChatSubmit(ev) {
    ev.preventDefault();
    if (!session || chatBusy) return;
    var input = document.getElementById("chat-input");
    if (!input) return;
    var content = (input.value || "").trim(), file=chatPhotoPicker && chatPhotoPicker.file();
    if (!content && !file) return;
    if(file && chatMode && chatMode.kind === "edit"){ document.getElementById("chat-send-status").textContent="Podczas edycji usuń wybrane nowe zdjęcie. Istniejące zdjęcie pozostanie przy wiadomości."; return; }
    chatBusy = true;
    var sendStatus = document.getElementById("chat-send-status");
    chatErrors[chatRoom] = "";
    if (sendStatus) sendStatus.textContent = "";
    refreshChatSend();
    var sendingToken = session.token, sendingRoom = chatRoom, mode = chatMode, sendingGeneration=chatGeneration;
    var action = mode && mode.kind === "edit" ? "rejchat_message_edit" : "rejchat_room_send_v2";
    var payload = mode && mode.kind === "edit" ? {p_token:sendingToken,p_scope:"public",p_id:mode.id,p_content:content} : {p_token:sendingToken,p_room:sendingRoom,p_content:content,p_reply_to:mode && mode.id || null};
    var sending = file ? window.RJChatPhotos.read(file).then(function(data){
      if(!session || session.token!==sendingToken || chatRoom!==sendingRoom || chatGeneration!==sendingGeneration) throw new Error("Rozmowa została zmieniona. Zdjęcie nie zostało wysłane.");
      return rpc("rejchat_send_photo",{p_token:sendingToken,p_scope:"public",p_room:sendingRoom,p_thread_id:null,p_content:content,p_reply_to:mode && mode.id || null,p_mime:data.mime,p_data_base64:data.data});
    }) : rpc(action,payload);
    sending.then(function (row) {
        if (!session || session.token !== sendingToken) return;
        if (sendingRoom !== chatRoom) { if (chatDrafts[sendingRoom].trim() === content) chatDrafts[sendingRoom] = ""; return; }
        if (input.value.trim() === content) input.value = mode && mode.kind === "edit" ? chatDraftBeforeEdit : "";
        if(file && chatPhotoPicker.file() === file)chatPhotoPicker.clear();
        if(chatMode === mode) {chatMode=null;document.getElementById("chat-compose-context").hidden=true;}
        if (row && row.id) {
          appendChat([{
            id: row.id,
            author_name: row.author_name,
            content: row.content,
            created_at: row.created_at,
            is_owner: row.is_owner === true,
            is_bot: isAgentName(row.author_name)
          }]);
          chatGeneration++;
          chatScrollBottom();
          requestChat(true);
        } else {
          chatGeneration++;
          requestChat(true);
        }
      })
      .catch(function (err) {
        if (!session || session.token !== sendingToken) return;
        chatErrors[sendingRoom] = (err && err.message) ? err.message : "Nie udało się wysłać wiadomości.";
        var status = document.getElementById("chat-send-status");
        if (status && sendingRoom === chatRoom) status.textContent = chatErrors[sendingRoom];
      })
      .then(function () { chatBusy = false; refreshChatSend(); });
  }

  function setupChat() {
    if (!chatList()) return;
    if (window.RJChatScroll) chatScroll = window.RJChatScroll.create(chatList());
    if(window.RJChatPhotos){chatPhotoPicker=window.RJChatPhotos.picker("chat",refreshChatSend);window.RJChatPhotos.attach(chatList(),"public");}
    refreshChatAuth(); if(!session)resetChatSession();
    window.addEventListener("rj:room-change", function (event) {
      var next = event.detail === "links" ? "links" : "general";
      if (next === chatRoom) return;
      var field = document.getElementById("chat-input");
      if (field) { chatDrafts[chatRoom] = chatMode && chatMode.kind === "edit" ? chatDraftBeforeEdit : field.value; field.value = chatDrafts[next]; }
      chatMode=null;document.getElementById("chat-compose-context").hidden=true;
      document.getElementById("chat-save-status").textContent="";
      if(chatPhotoPicker)chatPhotoPicker.clear();
      chatRoom = next; chatGeneration++; chatLastId = null; chatHighWater = null; var jump=document.getElementById("chat-jump");if(jump)jump.hidden=true; chatRenderedSession = null; chatSignature=""; chatMessages=Object.create(null);
      document.getElementById("chat-room-title").textContent = next === "links" ? "Linki" : "Czat ogólny";
      document.getElementById("chat-room-description").textContent = next === "links" ? "Podziel się odnośnikiem lub zdjęciem ze społecznością" : "Rozmawiaj ze społecznością";
      document.getElementById("chat-send-status").textContent = chatErrors[next];
      document.getElementById("chat-search").value = "";
      chatList().innerHTML = session ? '<p class="comm-chat-empty">Ładowanie czatu…</p>' : '<p class="comm-chat-empty">Zaloguj się, aby zobaczyć rozmowy.</p>';
      if (chatScroll) chatScroll.reset();
      refreshChatSend(); requestChat(true);
    });
    if (location.hash === "#linki") window.dispatchEvent(new CustomEvent("rj:room-change", {detail:"links"}));
    requestChat(true);
    var jump = document.getElementById("chat-jump");
    if (jump) jump.addEventListener("click", chatScrollBottom);
    chatList().addEventListener("scroll", function () { if (chatNearBottom() && jump) jump.hidden = true; });

    var form = document.getElementById("chat-form");
    if (form) form.addEventListener("submit", handleChatSubmit);

    var input = document.getElementById("chat-input");
    if (input) { input.addEventListener("input", refreshChatSend); input.addEventListener("keydown", function(e){if(e.key==="Enter" && !e.shiftKey && !e.isComposing && !e.ctrlKey && !e.altKey && !e.metaKey){e.preventDefault();if(form && !document.getElementById("chat-send").disabled)form.requestSubmit();}}); }

    document.getElementById("chat-compose-cancel").addEventListener("click", function(){
      if(chatMode && chatMode.kind === "edit") input.value=chatDraftBeforeEdit;
      chatMode=null;document.getElementById("chat-compose-context").hidden=true;refreshChatSend();input.focus();
    });
    var list = chatList();
    list.addEventListener("click", function (ev) {
      var action=ev.target.closest("[data-chat-reply], [data-chat-edit]");
      if(action && session && !chatBusy){
        var edit=action.hasAttribute("data-chat-edit"),id=action.getAttribute(edit ? "data-chat-edit" : "data-chat-reply"),m=chatMessages[id];
        if(!m)return;
        if(chatMode && chatMode.kind === "edit")input.value=chatDraftBeforeEdit;
        chatMode={kind:edit ? "edit" : "reply",id:id};
        if(edit){chatDraftBeforeEdit=input.value;input.value=m.content;}
        document.getElementById("chat-compose-label").textContent=(edit ? "Edytujesz wiadomość" : "Odpowiadasz: "+m.author_name+" — "+m.content.slice(0,100));
        document.getElementById("chat-compose-context").hidden=false;refreshChatSend();input.focus();return;
      }
      var dm = ev.target && ev.target.closest ? ev.target.closest("[data-dm-user]") : null;
      if (dm && session) { window.dispatchEvent(new CustomEvent("rj:dm-open-user", {detail: dm.getAttribute("data-dm-user")})); return; }
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-chat-delete]") : null;
      if (!btn || !session) return;
      var id = btn.getAttribute("data-chat-delete");
      var row = btn.closest(".chat-msg");
      rpc("community_chat_delete", { p_token: session.token, p_id: id })
        .then(function () { chatGeneration++; if (row) row.remove(); requestChat(true); })
        .catch(function (err) { var status = document.getElementById("chat-send-status"); if (status) status.textContent = err.message || "Nie udało się usunąć wiadomości."; });
    });

    var chatPollTask = null;
    var chatVisible = function () {
      var panel = document.getElementById("panel-chat");
      var view = document.getElementById("chat-public-view");
      return !!session && !!panel && !panel.hidden && !!view && !view.hidden;
    };
    if (window.RJNet && window.RJNet.every) {
      chatPollTask = window.RJNet.every("rejchat-rooms", CHAT_REFRESH_MS, chatPoll, { when: chatVisible });
    } else {
      setInterval(function () {
        if (document.visibilityState !== "visible" || !chatVisible()) return;
        chatPoll();
      }, CHAT_REFRESH_MS);
    }
    document.addEventListener("rj:room-change", function () { if (chatPollTask) chatPollTask.poke(400); });
  }

  /* ================= MOTYW ================= */
  function setupTheme() {
    var btn = document.getElementById("theme-toggle");
    if (!btn || btn.dataset.rjBound) return;
    btn.dataset.rjBound = "1";
    btn.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) { /* ignorujemy */ }
    });
  }

  /* ================= START ================= */
  function init() {
    setupTheme();
    renderAuthZone();
    setupChat();

    var usernameInput = document.getElementById("auth-username");
    if (usernameInput) usernameInput.addEventListener("input", scheduleNameCheck);

    var pinInput = document.getElementById("auth-pin");
    if (pinInput) pinInput.addEventListener("input", refreshAuthSubmit);

    var authForm = document.getElementById("auth-form");
    if (authForm) authForm.addEventListener("submit", handleAuthSubmit);

    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

    /* szybki start sekcji online z cache, potem świeży strzał */
    primeOnlineFromCache();
    loadOnline();

    /* Panel „Zalogowani teraz online” ma własny zegar, niezależny od czatu.
       Obecność zgłaszamy dopiero po pierwszej interakcji, więc lista musi
       doganiać rzeczywistość w tle, także podczas rozmowy. */
    if (window.RJNet && window.RJNet.every) {
      window.RJNet.every("rejchat-online", 60000, loadOnline);
    } else {
      setInterval(function () {
        if (document.visibilityState === "visible") loadOnline();
      }, 60000);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") loadOnline();
    });

    // Zmiana konta w innej karcie nie może zostawić starego formularza i przycisków.
    window.addEventListener("storage", function (event) {
      if (event.key !== SESSION_KEY && event.key !== null) return;
      var oldToken = session && session.token;
      session = loadSession();
      if (oldToken !== (session && session.token)) { clearChatDrafts(); resetChatSession(); }
      renderAuthZone(); chatGeneration++; requestChat(true);
    });
    /* Sprawdzamy zapisany token; opóźniona odpowiedź nie może nadpisać nowej sesji. */
    if (session) {
      var checkingToken = session.token;
      rpc("community_whoami", { p_token: checkingToken })
        .then(function (data) {
          if (!session || session.token !== checkingToken) return;
          if (data && data.username) saveSession({ token: checkingToken, username: data.username });
          else if (data && data.username === null) { saveSession(null); renderAuthZone(); chatGeneration++; requestChat(true); }
        })
        .catch(function () { /* chwilowy brak sieci — zostaw sesję */ });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);

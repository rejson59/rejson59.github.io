/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/* ==========================================================================
   Rejson59 — „Premium za darmo” + powiadomienia (tylko prawdziwe zdarzenia)
   --------------------------------------------------------------------------
   Zasada: nic tu nie udaje. Każde powiadomienie pochodzi z realnych danych:
     • projekt, który obserwujesz, ma nowszy `updated_at` (dane GitHuba),
     • Rejson59 jest TERAZ online (realna obecność z bazy, nie timer).

   Bramka: sam ten moduł niczego nie blokuje. Odblokowuje DODATKI, które bez
   konta nie mają gdzie istnieć („Twoje” powiadomienia, „Twoje” obserwacje).
   Zero fałszywej presji: brak liczników „ostatnie miejsca”, brak wymyślonych
   zdarzeń.

   Publiczne API: window.RJPremium
   ========================================================================== */

(function () {
  "use strict";
  if (window.RJPremium) return;

  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

  var SESSION_KEY = "rejson_community_session_v1";
  var FOLLOW_KEY = "rj_following_v1";
  var SEEN_KEY = "rj_seen_v1";
  var LINK_KEY = "rj_identity_link_v1";
  var NOTICES_KEY = "rj_general_notifications_v1:";
  var READ_KEY = "rj_general_read_v1:";
  var VISIT_KEY = "rj_visit_v1";           /* sessionStorage: raz na wizytę */
  var VOTER_KEY = "rejson_widgets_voter_id_v1"; /* ten sam klucz co pigułka zgłoszeń */
  var LINK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; /* odstęp między próbami scalania */

  /* ---------- drobiazgi ---------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function readJSON(store, key, fallback) {
    try {
      var raw = store.getItem(key);
      if (!raw) return fallback;
      var val = JSON.parse(raw);
      return val == null ? fallback : val;
    } catch (e) { return fallback; }
  }

  function writeJSON(store, key, val) {
    try { store.setItem(key, JSON.stringify(val)); } catch (e) { /* prywatny tryb */ }
  }

  function nowIso() { return new Date().toISOString(); }

  /* ---------- sesja ---------- */

  function session() {
    var s = readJSON(window.localStorage, SESSION_KEY, null);
    if (!s || typeof s.token !== "string" || s.token.length < 16 || !s.username) return null;
    return s;
  }

  function isLoggedIn() { return !!session(); }
  function username() { var s = session(); return s ? s.username : null; }

  /* ---------- RPC ---------- */

  function rpc(fn, args) {
    if (!window.fetch) return Promise.reject(new Error("brak fetch"));
    return fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args || {}),
      cache: "no-store"
    }).then(function (res) {
      if (!res.ok) throw new Error(fn + " → " + res.status);
      return res.json();
    });
  }

  /* ---------- scalanie tożsamości ----------
     Wołane raz na konto: dopisuje nick do WCZEŚNIEJSZYCH anonimowych zgłoszeń
     z urządzeń powiązanych z kontem (to robi funkcja w bazie — patrz
     supabase/2026-10-28_identity_merge_submissions.sql). */
  function linkIdentity() {
    var s = session();
    if (!s) return Promise.resolve(null);
    var done = readJSON(window.localStorage, LINK_KEY, {});
    if (done[s.username] && Date.now() - done[s.username] < LINK_INTERVAL_MS) return Promise.resolve(null);

    return rpc("community_link_submissions", { p_token: s.token })
      .then(function (res) {
        done[s.username] = Date.now();
        writeJSON(window.localStorage, LINK_KEY, done);
        if (res && res.linked > 0) {
          document.dispatchEvent(new CustomEvent("rj:identity-merged", { detail: res }));
        }
        return res;
      })
      .catch(function () { return null; });
  }

  /* ---------- obserwowane projekty ---------- */

  function following() {
    var list = readJSON(window.localStorage, FOLLOW_KEY, []);
    return Array.isArray(list) ? list.filter(function (x) { return typeof x === "string"; }) : [];
  }

  function isFollowing(slug) {
    return following().indexOf(String(slug)) !== -1;
  }

  function toggleFollow(slug) {
    if (!isLoggedIn()) return false;
    slug = String(slug || "").trim();
    if (!slug) return false;
    var list = following();
    var i = list.indexOf(slug);
    if (i === -1) list.push(slug);
    else list.splice(i, 1);
    writeJSON(window.localStorage, FOLLOW_KEY, list);
    return i === -1;
  }

  /* Źródło danych o projektach: żywa lista z app.js, a gdy jej nie ma —
     kopia zapasowa z projects-data.js. */
  function projects() {
    if (Array.isArray(window.RJ_PROJECTS) && window.RJ_PROJECTS.length) return window.RJ_PROJECTS;
    if (Array.isArray(window.PROJECTS_FALLBACK)) return window.PROJECTS_FALLBACK;
    return [];
  }

  function projectStamp(p) {
    return String(p.pushed_at || p.updated_at || p.updated || "");
  }

  // Na podstronach nie ma app.js; dla obserwowanych projektów użyj prawdziwych
  // danych GitHuba, z limitem odpytywania i bez zerowania migawki przy błędzie.
  var lastProjectFetch = 0, fetchedProjects = [], projectFetchError = false;
  function projectData(followed) {
    var local = projects();
    if (local.length || !followed.length) { projectFetchError = false; return Promise.resolve(local); }
    if (Date.now() - lastProjectFetch < 5 * 60 * 1000) return Promise.resolve(fetchedProjects);
    lastProjectFetch = Date.now();
    var controller = window.AbortController ? new AbortController() : null;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
    return fetch("https://api.github.com/users/rejson59/repos?per_page=100&sort=updated", {cache:"no-store", signal:controller ? controller.signal : undefined})
      .then(function (res) { if (!res.ok) throw new Error("GitHub"); return res.json(); })
      .then(function (rows) { if (!Array.isArray(rows)) throw new Error("GitHub"); projectFetchError = false; fetchedProjects = rows; return fetchedProjects; })
      .catch(function () { projectFetchError = true; return fetchedProjects; })
      .finally(function () { if (timeout) clearTimeout(timeout); });
  }

  /* ---------- powiadomienia ---------- */

  var state = { items: [], loading: false, error: null, sourceError: "", ownerOnline: false };
  var activeToken = null, inFlight = null;
  function queueKey(s) { return NOTICES_KEY + String(s.username).toLowerCase(); }
  function loadQueue(s) {
    var items = s ? readJSON(window.localStorage, queueKey(s), []) : [];
    return Array.isArray(items) ? items.filter(function (it) { return it && typeof it.id === "string"; }) : [];
  }
  function syncSession() {
    var s = session(), token = s ? s.token : null;
    if (token !== activeToken) {
      activeToken = token;
      inFlight = null;
      state.items = loadQueue(s);
      state.sourceError = "";
      state.ownerOnline = false;
    }
    return s;
  }
  function changed() { window.dispatchEvent(new CustomEvent("rj:premium-notifications")); }
  function markRead(id) {
    var s = syncSession();
    if (!s) return;
    var readKey = READ_KEY + String(s.username).toLowerCase();
    var read = readJSON(window.localStorage, readKey, {});
    if (!read || typeof read !== "object" || Array.isArray(read)) read = {};
    state.items.forEach(function (it) { if (!id || it.id === id) read[it.id] = Date.now(); });
    var keys = Object.keys(read).sort(function(a,b) { return read[b] - read[a]; });
    keys.slice(500).forEach(function(key) { delete read[key]; });
    writeJSON(window.localStorage, readKey, read);
    state.items = state.items.filter(function (it) { return id && it.id !== id; });
    writeJSON(window.localStorage, queueKey(s), state.items);
    paintCount();
    paintClub();
    changed();
  }

  /* Jedno przejście: porównujemy „co widziałem ostatnio” z tym, co jest teraz.
     Pierwsze uruchomienie tylko zapisuje punkt odniesienia — bez zalewu
     powiadomień o wszystkim, co wydarzyło się przed założeniem konta. */
  function collect() {
    var s = session();
    if (!s) return Promise.resolve([]);

    var accountSeenKey = SEEN_KEY + ":" + String(s.username).toLowerCase();
    var seen = readJSON(window.localStorage, accountSeenKey, null);
    if (!seen) {
      var legacySeen = readJSON(window.localStorage, SEEN_KEY, null);
      if (legacySeen && legacySeen.user === s.username) seen = legacySeen;
    }
    var firstRun = !seen || seen.user !== s.username;

    var prevProjects = (!firstRun && seen.projects) || {};
    // Podstrony nie mają listy projektów — nie wymazuj poprzedniej migawki.
    var nextProjects = Object.assign({}, prevProjects);
    var events = [];

    var followed = following();

    /* 3. obecność właściciela — realna, z bazy */
    var presencePromise = rpc("community_online_users", { p_window_seconds: 120 })
      .catch(function () { return null; });

    return Promise.all([presencePromise, projectData(followed)]).then(function (res) {
      // Odpowiedź starej sesji nie może trafić do nowego konta.
      var currentSession = session();
      if (!currentSession || currentSession.token !== s.token) return [];
      var projectRows = res[1];
      /* 1. projekty, które obserwuję */
      projectRows.forEach(function (p) {
        var name = p.name || p.slug;
        if (!name) return;
        var stamp = projectStamp(p);
        var previousTime = Date.parse(prevProjects[name] || "");
        var currentTime = Date.parse(stamp);
        if (!isNaN(currentTime) && (isNaN(previousTime) || currentTime >= previousTime)) nextProjects[name] = stamp;
        if (!followed.length || followed.indexOf(name) === -1) return;
        var before = prevProjects[name];
        if (!firstRun && before && !isNaN(currentTime) && !isNaN(previousTime) && currentTime > previousTime) {
          events.push({
            id: "update:" + name + ":" + stamp,
            kind: "update",
            icon: "📦",
            title: "„" + name + "” dostał aktualizację",
            text: "Obserwujesz ten projekt, więc mówię od razu.",
            href: p.liveUrl || p.homepage || p.html_url || ("https://github.com/rejson59/" + name),
            when: stamp
          });
        }
      });

      state.sourceError = projectFetchError ? "Nie udało się sprawdzić aktualizacji projektów." : "";
      var online = Array.isArray(res[0]) ? res[0] : [];

      var ownerOnline = online.some(function (u) {
        return u && (u.is_owner === true || String(u.username || "").toLowerCase() === "rejson59");
      });
      state.ownerOnline = ownerOnline;

      var visit = readJSON(window.sessionStorage, VISIT_KEY, {});
      if (!firstRun && ownerOnline && !visit.ownerAnnounced) {
        visit.ownerAnnounced = true;
        writeJSON(window.sessionStorage, VISIT_KEY, visit);
        events.push({
          id: "presence:" + new Date().toISOString().slice(0, 13),
          kind: "presence",
          icon: "🟢",
          title: "Rejson59 był online",
          text: "Widziano go na stronie.",
          href: "/rejchat",
          when: nowIso()
        });
      }

      var nextSeen = {
        user: s.username,
        projects: nextProjects,
        at: nowIso()
      };
      writeJSON(window.localStorage, accountSeenKey, nextSeen);
      writeJSON(window.localStorage, SEEN_KEY, nextSeen);

      /* Scalanie, nie podmiana: odświeżenie (np. po powrocie z innej karty)
         nie może skasować powiadomień, które użytkownik już widzi. Deduplikacja
         po stabilnym `id` zdarzenia. */
      var merged = {};
      var read = readJSON(window.localStorage, READ_KEY + String(s.username).toLowerCase(), {});
      if (!read || typeof read !== "object" || Array.isArray(read)) read = {};
      loadQueue(s).concat(state.items, events).forEach(function (ev) {
        var key = ev.id || ev.title;
        if (!merged[key] && !Object.prototype.hasOwnProperty.call(read, key)) merged[key] = ev;
      });
      state.items = Object.keys(merged).map(function (k) { return merged[k]; });
      state.items.sort(function (a, b) { return String(b.when).localeCompare(String(a.when)); });
      state.items = state.items.slice(0, 100);
      writeJSON(window.localStorage, queueKey(s), state.items);
      changed();
      return state.items;
    });
  }

  /* ---------- wstrzykiwanie przycisków ---------- */

  function fmtWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 90) return "przed chwilą";
    if (diff < 3600) return Math.round(diff / 60) + " min temu";
    if (diff < 86400) return Math.round(diff / 3600) + " godz. temu";
    if (diff < 86400 * 7) return Math.round(diff / 86400) + " dni temu";
    return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  }

  function bellHTML() {
    return '' +
      '<button class="rj-bell" id="rj-bell" type="button" aria-expanded="false" aria-controls="rj-bell-panel" ' +
        'aria-label="Powiadomienia o projektach i zgłoszeniach" title="Powiadomienia o projektach i zgłoszeniach">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/>' +
          '<path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' +
        '<span class="rj-bell-count" id="rj-bell-count" hidden>0</span>' +
      '</button>';
  }

  function panelHTML() {
    return '<div class="rj-panel" id="rj-bell-panel" hidden>' +
      '<div class="rj-panel-head">' +
        '<strong>Powiadomienia</strong>' +
        '<button type="button" class="rj-panel-close" id="rj-bell-close" aria-label="Zamknij">×</button>' +
      '</div>' +
      '<div class="rj-panel-body" id="rj-bell-body"></div>' +
      '<div class="rj-panel-foot" id="rj-bell-foot"></div>' +
    '</div>';
  }

  function renderPanel() {
    var body = document.getElementById("rj-bell-body");
    var foot = document.getElementById("rj-bell-foot");
    if (!body) return;

    if (!isLoggedIn()) {
      body.innerHTML =
        '<div class="rj-panel-guest">' +
          '<p class="rj-panel-guest-title">Powiadomienia są dla zalogowanych</p>' +
          '<p>Dowiesz się tutaj, gdy projekt, który obserwujesz, dostanie aktualizację — ' +
             'i gdy pojawi się nowość w RejChat.</p>' +
          '<a class="rj-cta" href="logowanie">Załóż darmowe konto</a>' +
        '</div>';
      if (foot) foot.innerHTML = "";
      return;
    }

    if (state.loading && !state.items.length) {
      body.innerHTML = '<p class="rj-panel-muted">Sprawdzam…</p>';
      return;
    }
    if (!state.items.length) {
      body.innerHTML = '<p class="rj-panel-muted">Nic nowego od Twojej ostatniej wizyty. ' +
        'Tu pojawią się tylko prawdziwe zdarzenia — żadnych „ktoś właśnie coś zrobił”.</p>';
    } else {
      body.innerHTML = state.items.map(function (it) {
        return '<a class="rj-note" href="' + esc(it.href) + '">' +
          '<span class="rj-note-icon" aria-hidden="true">' + esc(it.icon) + '</span>' +
          '<span class="rj-note-text">' +
            '<strong>' + esc(it.title) + '</strong>' +
            '<span>' + esc(it.text) + '</span>' +
          '</span>' +
          '<time>' + esc(fmtWhen(it.when)) + '</time>' +
        '</a>';
      }).join("");
    }

    if (foot) {
      foot.innerHTML = '<button type="button" class="rj-panel-link" id="rj-mark-seen">' +
        'Oznacz jako przeczytane</button>';
      var mark = document.getElementById("rj-mark-seen");
      if (mark) mark.addEventListener("click", function () {
        markRead(null);
        renderPanel();
      });
    }
  }

  function paintCount() {
    var badge = document.getElementById("rj-bell-count");
    if (!badge) return;
    var n = state.items.length;
    badge.textContent = n > 9 ? "9+" : String(n);
    badge.hidden = n === 0;
    var bell = document.getElementById("rj-bell");
    if (bell) bell.classList.toggle("has-news", n > 0);
  }

  /* ---------- sekcja „Premium za darmo” ---------- */

  /* Liczniki konta — tylko to, co naprawdę wiemy: obserwacje i lista
     projektów. Bez wymyślonych „wkładów” z usuniętej tablicy. */
  function myStats() {
    return {
      following: following().length,
      projects: projects().filter(function (p) {
        return !!(p.liveUrl || p.homepage || p.html_url);
      }).length
    };
  }

  function statsHTML(st) {
    var cells = [
      [st.following, "Obserwujesz"],
      [st.projects, "Projekty w RejHub"]
    ];
    return '<div class="rj-stats">' +
      cells.map(function (c) {
        return '<div class="rj-stat"><b>' + c[0] + '</b><span>' + esc(c[1]) + "</span></div>";
      }).join("") +
      "</div>";
  }

  function clubHTML() {
    var perks = [
      ["bell", "Powiadomienia", "Aktualizacje obserwowanych projektów i realna obecność — bez wymyślonych zdarzeń."],
      ["portal", "Obserwowane projekty", "Klikasz „obserwuj” i wiesz, gdy projekt się zmieni."],
      ["account", "Twój profil", "Awatar, kolor nicka i bio — widoczne w RejChat i na profilu."],
      ["chat", "RejChat", "Czat i wpisy po zalogowaniu, z reakcjami i spokojnym moderowaniem."],
      ["file", "Wspólne konto", "Jedno konto strony i projektów — bez e-maila, nazwa i hasło."]
    ];

    var s = session();
    if (!s) {
      return '<div class="rj-premium is-locked rj-club-card">' +
        '<span class="rj-premium__glow" aria-hidden="true"></span>' +
        '<span class="rj-premium__sheen" aria-hidden="true"></span>' +
        '<div class="rj-premium__inner">' +
          '<p class="rj-premium__head"><span class="rj-premium__dot"></span> Rejson59 · Premium</p>' +
          '<h2 class="rj-club-title">Premium jest u mnie za darmo — wystarczy się zalogować :)</h2>' +
          '<p class="rj-club-lead">Własny profil, rozmowy i projekty bliżej Ciebie. Konto jest bezpłatne: wystarczy nick i hasło, bez e-maila.</p>' +
          '<div class="rj-profile-teaser" aria-label="Przykładowe awatary profilu"><span class="rj-profile-teaser__avatars"><img src="/assets/avatars/cat.svg" alt=""><img src="/assets/avatars/planet.svg" alt=""><img src="/assets/avatars/fox.svg" alt=""></span><span><strong>Twój profil, Twój styl</strong><small>Awatar · kolor nicka · publiczne bio</small></span></div>' +
          '<ul class="rj-premium__list">' +
            perks.map(function (p) {
              return '<li><svg class="rj-perk-icon ui-icon" aria-hidden="true"><use href="/assets/ui-icons.svg?v=2#' + p[0] + '"></use></svg><span><strong>' + esc(p[1]) + '.</strong> ' + esc(p[2]) + '</span></li>';
            }).join("") +
          '</ul>' +
          '<div class="rj-club-actions">' +
            '<a class="rj-cta" href="logowanie">Załóż darmowe konto</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    /* „obserwować” ma sens tylko projekt, który ma gdzie otworzyć — i musi
       działać zarówno na danych z app.js (liveUrl), jak i z kopii (homepage) */
    var followable = projects().filter(function (p) {
      return !!(p.liveUrl || p.homepage || p.html_url);
    }).slice(0, 8);
    var list = following();
    var st = myStats();
    return '<div class="rj-premium is-unlocked rj-club-card">' +
      '<span class="rj-premium__glow" aria-hidden="true"></span>' +
      '<span class="rj-premium__sheen" aria-hidden="true"></span>' +
      '<div class="rj-premium__inner">' +
        '<p class="rj-premium__head"><span class="rj-premium__dot"></span> Twoje konto · ' + esc(s.username) + '</p>' +
        '<h2 class="rj-club-title">Wszystko odblokowane</h2>' +
        '<p class="rj-club-lead">' +
          'Cześć <strong>' + esc(s.username) + '</strong> — to Twoje konto i Twoje rzeczy. ' +
          'Powiadomień czeka: <strong>' + state.items.length + '</strong>' +
          (state.ownerOnline ? ' · <strong>Rejson59 jest teraz online</strong>' : '') +
        '</p>' +
        statsHTML(st) +
        '<div class="rj-follow" role="group" aria-label="Obserwowane projekty">' +
          followable.map(function (p) {
            var on = list.indexOf(p.name) !== -1;
            return '<button type="button" class="rj-follow-chip' + (on ? " is-on" : "") + '" ' +
              'data-follow="' + esc(p.name) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
              (on ? "★ " : "☆ ") + esc(p.name) + '</button>';
          }).join("") +
        '</div>' +
        '<p class="rj-club-note">Obserwowanie zapisuje się na tym urządzeniu. Zgłoszenia i pomysły ' +
          'widzi wyłącznie admin — w swoim panelu.</p>' +
      '</div>' +
    '</div>';
  }

  /* Mały baner zostaje na miejscu; pełna karta otwiera się tylko na życzenie. */
  function setupCompactClub() {
    var section = document.querySelector(".rj-club");
    var open = document.getElementById("rj-account-mini-open");
    var close = document.getElementById("rj-account-details-close");
    if (!section || !open || !close) return;
    if (!section.classList.contains("rj-club--compact")) {
      function setOpen(value) {
        section.classList.toggle("is-open", value);
        open.setAttribute("aria-expanded", value ? "true" : "false");
      }
      open.addEventListener("click", function () {
        var expanded = open.getAttribute("aria-expanded") !== "true";
        setOpen(expanded);
        if (expanded) close.focus();
      });
      close.addEventListener("click", function () { setOpen(false); open.focus(); });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && section.classList.contains("is-open")) {
          setOpen(false); open.focus();
        }
      });
      section.classList.add("rj-club--compact");
    }
    var s = session();
    document.getElementById("rj-account-mini-title").textContent = s ? "Cześć, " + s.username + "!" : "Twoje miejsce u Rejsona";
    document.getElementById("rj-account-mini-description").textContent = s ? "Twoje zgłoszenia i obserwowane projekty pod ręką." : "Profil, zgłoszenia i obserwowane projekty w jednym miejscu.";
    document.getElementById("rj-account-mini-link").textContent = s ? "Przejdź do konta ↗" : "Załóż konto lub zaloguj się ↗";
  }

  function paintClub() {
    var host = document.getElementById("rj-club");
    if (!host) return;
    // Stary znacznik odłożenia nie ukrywa już stałego baneru.
    host.hidden = false;
    host.innerHTML = clubHTML();
    setupCompactClub();

    host.querySelectorAll("[data-follow]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var on = toggleFollow(btn.getAttribute("data-follow"));
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.textContent = (on ? "★ " : "☆ ") + btn.getAttribute("data-follow");
      });
    });
  }

  /* ---------- montowanie ---------- */

  function mount() {
    var metrics = document.querySelector(".header-metrics");
    if (metrics && !document.querySelector(".rj-chat-alerts") && !document.getElementById("rj-bell")) {
      metrics.insertAdjacentHTML("afterbegin", bellHTML());
      metrics.insertAdjacentHTML("afterend", panelHTML());

      var bell = document.getElementById("rj-bell");
      var panel = document.getElementById("rj-bell-panel");
      bell.addEventListener("click", function () {
        var open = panel.hidden;
        panel.hidden = !open;
        bell.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) renderPanel();
      });
      var close = document.getElementById("rj-bell-close");
      if (close) close.addEventListener("click", function () {
        panel.hidden = true;
        bell.setAttribute("aria-expanded", "false");
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && !panel.hidden) {
          panel.hidden = true;
          bell.setAttribute("aria-expanded", "false");
        }
      });
      document.addEventListener("click", function (ev) {
        if (panel.hidden) return;
        if (panel.contains(ev.target) || bell.contains(ev.target)) return;
        panel.hidden = true;
        bell.setAttribute("aria-expanded", "false");
      });
    }

    if (isLoggedIn() && document.getElementById("rj-club")) linkIdentity();
    paintClub();
    paintCount();
    refresh();
  }

  function refresh() {
    var s = syncSession();
    if (!s) {
      state.items = [];
      paintCount();
      changed();
      return Promise.resolve([]);
    }
    if (inFlight && inFlight.token === s.token) return inFlight.promise;
    state.loading = true;
    var promise = collect().then(function (items) {
      if (!session() || session().token !== s.token) return [];
      state.loading = false;
      state.error = null;
      paintCount();
      renderPanel();
      if (!document.querySelector(".rj-club--compact.is-open")) paintClub();
      return items;
    }).catch(function (err) {
      if (session() && session().token === s.token) {
        state.loading = false;
        state.error = String(err && err.message || err);
      }
      return [];
    }).finally(function () { if (inFlight && inFlight.promise === promise) inFlight = null; });
    inFlight = { token: s.token, promise: promise };
    return promise;
  }

  function sessionChanged() { syncSession(); paintCount(); paintClub(); changed(); refresh(); }
  window.addEventListener("rj:session-change", sessionChanged);
  window.addEventListener("storage", function (event) {
    if (event.key === SESSION_KEY || event.key === null) return sessionChanged();
    var s = syncSession();
    if (s && event.key === queueKey(s)) { state.items = loadQueue(s); paintCount(); paintClub(); changed(); }
  });

  window.RJPremium = {
    session: session,
    isLoggedIn: isLoggedIn,
    username: username,
    following: following,
    isFollowing: isFollowing,
    toggleFollow: toggleFollow,
    linkIdentity: linkIdentity,
    notifications: function () { syncSession(); return state.items.slice(); },
    markRead: markRead,
    sourceError: function () { syncSession(); return state.sourceError; },
    refresh: refresh,
    mount: mount
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

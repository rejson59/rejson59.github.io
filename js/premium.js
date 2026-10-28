/* ==========================================================================
   Rejson59 — „Premium za darmo” + powiadomienia (tylko prawdziwe zdarzenia)
   --------------------------------------------------------------------------
   Zasada: nic tu nie udaje. Każde powiadomienie pochodzi z realnych danych:
     • projekt, który obserwujesz, ma nowszy `updated_at` (dane GitHuba),
     • Twoje zgłoszenie na tablicy zmieniło status albo dostało odpowiedź,
     • Rejson59 jest TERAZ online (realna obecność z bazy, nie timer).

   Bramka: sam ten moduł niczego nie blokuje. Odblokowuje DODATKI, które bez
   konta nie mają gdzie istnieć („Twoje” powiadomienia, „Twoje” obserwacje).
   Zero fałszywej presji: brak liczników „ostatnie miejsca”, brak wymyślonych
   zdarzeń, „nie teraz” pamiętane na 7 dni.

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
  var SNOOZE_KEY = "rj_club_snooze_v1";
  var VISIT_KEY = "rj_visit_v1";           /* sessionStorage: raz na wizytę */
  var SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; /* „nie teraz” = tydzień spokoju */

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
    if (done[s.username] && Date.now() - done[s.username] < SNOOZE_MS) return Promise.resolve(null);

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

  /* ---------- powiadomienia ---------- */

  var state = { items: [], loading: false, error: null, ownerOnline: false };

  /* Jedno przejście: porównujemy „co widziałem ostatnio” z tym, co jest teraz.
     Pierwsze uruchomienie tylko zapisuje punkt odniesienia — bez zalewu
     powiadomień o wszystkim, co wydarzyło się przed założeniem konta. */
  function collect() {
    var s = session();
    if (!s) return Promise.resolve([]);

    var seen = readJSON(window.localStorage, SEEN_KEY, null);
    var firstRun = !seen || seen.user !== s.username;

    var prevProjects = (seen && seen.projects) || {};
    var prevSubs = (seen && seen.subs) || {};
    var nextProjects = {};
    var events = [];

    /* 1. projekty, które obserwuję */
    var followed = following();
    projects().forEach(function (p) {
      var name = p.name || p.slug;
      if (!name) return;
      var stamp = projectStamp(p);
      nextProjects[name] = stamp;
      if (!followed.length || followed.indexOf(name) === -1) return;
      var before = prevProjects[name];
      if (!firstRun && before && stamp && stamp !== before) {
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

    /* 2. moje zgłoszenia na tablicy — status i odpowiedź */
    var boardPromise = rpc("list_public_board", { p_limit: 60 })
      .catch(function () { return null; });

    /* 3. obecność właściciela — realna, z bazy */
    var presencePromise = rpc("community_online_users", { p_window_seconds: 120 })
      .catch(function () { return null; });

    return Promise.all([boardPromise, presencePromise]).then(function (res) {
      var rows = Array.isArray(res[0]) ? res[0] : [];
      var online = Array.isArray(res[1]) ? res[1] : [];
      var nextSubs = {};

      var mine = rows.filter(function (it) {
        return String(it.author_name || "").toLowerCase() === String(s.username).toLowerCase();
      });

      mine.forEach(function (it) {
        var sig = { s: it.status || "", r: it.admin_replied_at || "" };
        nextSubs[it.id] = sig;
        var before = prevSubs[it.id];
        if (firstRun || !before) return;          /* pierwsze zobaczenie — cicho */

        if (sig.s !== before.s) {
          var label = STATUS_LABEL[sig.s] || sig.s;
          events.push({
            id: "status:" + it.id + ":" + sig.s,
            kind: "status",
            icon: sig.s === "completed" ? "✅" : (sig.s === "in_progress" ? "🛠" : "🔎"),
            title: "„" + (it.title || "") + "” — " + label,
            text: "Twoje zgłoszenie zmieniło status.",
            href: "tablica-pomyslow#" + it.id,
            when: it.updated_at || nowIso()
          });
        }
        if (sig.r && sig.r !== before.r) {
          events.push({
            id: "reply:" + it.id + ":" + sig.r,
            kind: "reply",
            icon: "💬",
            title: "Nowa odpowiedź Rejsona",
            text: (it.title || "Twoje zgłoszenie") + " — zobacz, co napisał.",
            href: "tablica-pomyslow#" + it.id,
            when: sig.r
          });
        }
      });

      var ownerOnline = online.some(function (u) {
        return u && (u.is_owner === true || String(u.username || "").toLowerCase() === "rejson59");
      });
      state.ownerOnline = ownerOnline;

      var visit = readJSON(window.sessionStorage, VISIT_KEY, {});
      if (ownerOnline && !visit.ownerAnnounced) {
        visit.ownerAnnounced = true;
        writeJSON(window.sessionStorage, VISIT_KEY, visit);
        events.push({
          id: "presence:" + new Date().toISOString().slice(0, 13),
          kind: "presence",
          icon: "🟢",
          title: "Rejson59 jest teraz online",
          text: "Realna obecność — nie timer, który ma Cię popędzać.",
          href: "spolecznosc",
          when: nowIso()
        });
      }

      writeJSON(window.localStorage, SEEN_KEY, {
        user: s.username,
        projects: nextProjects,
        subs: firstRun ? nextSubs : Object.assign(prevSubs, nextSubs),
        at: nowIso()
      });

      /* Scalanie, nie podmiana: odświeżenie (np. po powrocie z innej karty)
         nie może skasować powiadomień, które użytkownik już widzi. Deduplikacja
         po stabilnym `id` zdarzenia. */
      var merged = {};
      state.items.concat(events).forEach(function (ev) {
        var key = ev.id || ev.title;
        if (!merged[key]) merged[key] = ev;
      });
      state.items = Object.keys(merged).map(function (k) { return merged[k]; });
      state.items.sort(function (a, b) { return String(b.when).localeCompare(String(a.when)); });
      return state.items;
    });
  }

  var STATUS_LABEL = {
    new: "Nowe", under_review: "Rozważane", planned: "Planowane",
    in_progress: "W realizacji", completed: "Wdrożone", closed: "Zamknięte"
  };

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
        'aria-label="Powiadomienia">' +
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
          '<p>Dowiesz się tutaj, gdy Twoje zgłoszenie zmieni status albo gdy projekt, który ' +
             'obserwujesz, dostanie aktualizację.</p>' +
          '<a class="rj-cta" href="spolecznosc">Załóż konto w 10 sekund</a>' +
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
        state.items = [];
        paintCount();
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

  function clubHTML() {
    var perks = [
      ["🔔", "Powiadomienia", "Twoje zgłoszenia, obserwowane projekty i realna obecność Rejsona."],
      ["🧵", "Jedna historia", "Wcześniejsze głosy i zgłoszenia dostają Twój nick — także z innych urządzeń."],
      ["⭐", "Obserwowane projekty", "Klikasz „obserwuj” i wiesz, gdy projekt się zmieni."]
    ];

    var s = session();
    if (!s) {
      return '<div class="rj-premium is-locked rj-club-card">' +
        '<span class="rj-premium__glow" aria-hidden="true"></span>' +
        '<div class="rj-premium__inner">' +
          '<p class="rj-premium__head"><span class="rj-premium__dot"></span> Rejson59 · Premium</p>' +
          '<h2 class="rj-club-title">Premium jest u mnie za darmo — wystarczy się zalogować :)</h2>' +
          '<p class="rj-club-lead">Konto to nick i 4-cyfrowy PIN — bez maila, bez potwierdzania, ' +
            'jakieś 10 sekund. Odblokowuje rzeczy, które muszą wiedzieć, kim jesteś:</p>' +
          '<ul class="rj-premium__list">' +
            perks.map(function (p) {
              return "<li><strong>" + esc(p[1]) + ".</strong> " + esc(p[2]) + "</li>";
            }).join("") +
          '</ul>' +
          '<div class="rj-club-actions">' +
            '<a class="rj-cta" href="spolecznosc">Załóż konto w 10 sekund</a>' +
            '<button type="button" class="rj-cta ghost" id="rj-club-later">Nie teraz — przypomnij za tydzień</button>' +
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
    return '<div class="rj-premium is-unlocked rj-club-card">' +
      '<span class="rj-premium__glow" aria-hidden="true"></span>' +
      '<div class="rj-premium__inner">' +
        '<p class="rj-premium__head"><span class="rj-premium__dot"></span> Twoje konto · ' + esc(s.username) + '</p>' +
        '<h2 class="rj-club-title">Wszystko odblokowane</h2>' +
        '<p class="rj-club-lead">' +
          'Obserwowanych projektów: <strong>' + list.length + '</strong> · ' +
          'powiadomień czeka: <strong>' + state.items.length + '</strong>' +
          (state.ownerOnline ? ' · <strong>Rejson59 jest teraz online</strong>' : '') +
        '</p>' +
        '<div class="rj-follow" role="group" aria-label="Obserwowane projekty">' +
          followable.map(function (p) {
            var on = list.indexOf(p.name) !== -1;
            return '<button type="button" class="rj-follow-chip' + (on ? " is-on" : "") + '" ' +
              'data-follow="' + esc(p.name) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
              (on ? "★ " : "☆ ") + esc(p.name) + '</button>';
          }).join("") +
        '</div>' +
        '<p class="rj-club-note">Obserwowanie zapisuje się na tym urządzeniu — po zalogowaniu ' +
          'na innym sprzęcie Twoje zgłoszenia i tak trafią do tego samego konta.</p>' +
      '</div>' +
    '</div>';
  }

  function paintClub() {
    var host = document.getElementById("rj-club");
    if (!host) return;
    if (isSnoozed() && !isLoggedIn()) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = clubHTML();

    var later = document.getElementById("rj-club-later");
    if (later) later.addEventListener("click", function () {
      writeJSON(window.localStorage, SNOOZE_KEY, Date.now());
      host.hidden = true;
    });

    host.querySelectorAll("[data-follow]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var on = toggleFollow(btn.getAttribute("data-follow"));
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.textContent = (on ? "★ " : "☆ ") + btn.getAttribute("data-follow");
      });
    });
  }

  function isSnoozed() {
    var ts = Number(window.localStorage.getItem(SNOOZE_KEY) || 0);
    return !!ts && Date.now() - ts < SNOOZE_MS;
  }

  /* ---------- montowanie ---------- */

  function mount() {
    var metrics = document.querySelector(".header-metrics");
    if (metrics && !document.getElementById("rj-bell")) {
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

    if (isLoggedIn()) linkIdentity();
    paintClub();
    paintCount();
    refresh();
  }

  function refresh() {
    if (!isLoggedIn()) {
      state.items = [];
      paintCount();
      return Promise.resolve([]);
    }
    state.loading = true;
    return collect().then(function (items) {
      state.loading = false;
      state.error = null;
      paintCount();
      renderPanel();
      paintClub();
      return items;
    }).catch(function (err) {
      state.loading = false;
      state.error = String(err && err.message || err);
      return [];
    });
  }

  window.RJPremium = {
    session: session,
    isLoggedIn: isLoggedIn,
    username: username,
    following: following,
    isFollowing: isFollowing,
    toggleFollow: toggleFollow,
    linkIdentity: linkIdentity,
    notifications: function () { return state.items.slice(); },
    refresh: refresh,
    mount: mount,
    isSnoozed: isSnoozed
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

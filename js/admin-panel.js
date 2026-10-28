/*!
 * Główny Panel Admina — logowanie (ten sam e-mail i hasło co w panelu zgłoszeń),
 * zakładki oraz SZCZEGÓŁOWA aktywność na żywo:
 *  - odwiedzający z trwałym 4-cyfrowym identyfikatorem (nikt nie jest anonimowy),
 *  - ścieżki kroków + dokładna lista akcji (co klikał i kiedy),
 *  - globalny strumień kliknięć wszystkich użytkowników,
 *  - strumień zdarzeń (zgłoszenia, polubienia, wpisy, komentarze),
 *  - zakładka Społeczność (członkowie, moderacja wpisów).
 * Dane: admin-only RPC public.get_admin_activity / get_admin_community.
 */
(function (window, document) {
  "use strict";

  var REFRESH_MS = 6000;        /* główny cykl: aktywność na żywo */
  var SLOW_CYCLE_DIV = 3;       /* co 3. cykl (≈18 s): społeczność + statystyki dzienne */
  var PRESENCE_WINDOW = 90;
  var SITE_SLUG = "rejson59.github.io";

  var numFmt = new Intl.NumberFormat("pl-PL");
  var refreshTimer = null;
  var countdownTimer = null;
  var refreshTick = 0;
  var lastFetchAt = 0;
  var panelActive = false;

  /* Anti-flicker: sekcja jest przerenderowywana tylko, gdy dane się zmieniły.
     Sygnatura = stabilny JSON źródłowych danych. */
  var renderSigs = {};
  function changed(key, value) {
    var sig = JSON.stringify(value);
    if (renderSigs[key] === sig) return false;
    renderSigs[key] = sig;
    return true;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmt(n) {
    return numFmt.format(Math.max(0, Number(n) || 0));
  }

  /* Odznaka właściciela (złota korona) */
  function ownerBadge(isOwner) {
    return isOwner
      ? '<span class="adm-owner-badge" title="Twórca strony">👑 Właściciel</span>'
      : "";
  }

  /* Odznaka oficjalnego agenta AI Społeczności */
  var AGENT_NAME = "agent_ai_rejsona";
  function isAgentName(name) {
    return String(name || "").toLowerCase() === AGENT_NAME;
  }
  function botBadge(isBot) {
    return isBot
      ? '<span class="adm-bot-badge" title="Oficjalny agent AI — wpisy publikowane automatycznie o aktualizacjach">🤖 Agent AI</span>'
      : "";
  }

  /* Czytelna etykieta osoby: nazwa albo stały identyfikator — nigdy "Anonim" */
  function whoLabel(username, fp, isOwner) {
    if (username) {
      return (
        '<span class="pa-who">' +
        esc(username) + ownerBadge(isOwner) +
        "</span>"
      );
    }
    return (
      '<span class="pa-who pa-who-guest">Gość <span class="pa-fp-mini mono">#' +
      esc(fp && fp !== "----" ? fp : "????") +
      "</span>" + ownerBadge(isOwner) + "</span>"
    );
  }

  /* ---------- Płynna animacja liczby ---------- */
  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function animateNum(el, target) {
    if (!el) return;
    target = Math.max(0, Number(target) || 0);
    var prev = typeof el._val === "number" ? el._val : 0;
    if (el._val === target) return;
    if (el._raf) cancelAnimationFrame(el._raf);

    function finish(v) {
      el._val = v;
      el.textContent = fmt(v);
    }

    if (reduceMotion || prev === target) { finish(target); return; }

    el.classList.remove("adm-bump");
    void el.offsetWidth;
    el.classList.add("adm-bump");

    var duration = 650;
    var startTs = null;
    function step(ts) {
      if (!startTs) startTs = ts;
      var p = Math.min(1, (ts - startTs) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(prev + (target - prev) * eased));
      if (p < 1) {
        el._raf = requestAnimationFrame(step);
      } else {
        finish(target);
        el._raf = null;
      }
    }
    el._raf = requestAnimationFrame(step);
  }

  /* ---------- Czas ---------- */
  function relTime(iso) {
    if (!iso) return "—";
    var t = Date.parse(iso);
    if (isNaN(t)) return "—";
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

  function clockTime(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return "--:--";
    var d = new Date(t);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) +
      ":" + ("0" + d.getSeconds()).slice(-2);
  }

  function fmtDuration(seconds) {
    var s = Math.max(0, Number(seconds) || 0);
    if (s < 60) return s + " s";
    var m = Math.floor(s / 60);
    if (m < 60) return m + " min " + (s % 60) + " s";
    var h = Math.floor(m / 60);
    return h + " godz. " + (m % 60) + " min";
  }

  /* Przyjazne nazwy znanych podstron (w ścieżkach profili) */
  function prettySlug(slug) {
    var s = String(slug || "").toLowerCase();
    var map = {
      "": "Strona główna",
      "/": "Strona główna",
      "index": "Strona główna",
      "admin": "Panel admina",
      "spolecznosc": "Społeczność",
      "tablica-pomyslow": "Tablica pomysłów",
      "rejson-widgets": "Podgląd zgłoszeń"
    };
    return map[s] !== undefined ? map[s] : String(slug || "");
  }

  /* Zbuduj grupy kroków ścieżki: sąsiednie powtórki tej samej strony = jeden krok */
  function buildTrailGroups(trail) {
    var asc = (Array.isArray(trail) ? trail.slice() : []).sort(function (a, b) {
      return Date.parse(a.at) - Date.parse(b.at);
    });
    var groups = [];
    asc.forEach(function (step) {
      var g = groups[groups.length - 1];
      if (g && g.slug === step.slug) {
        g.to = step.at;
        g.n += 1;
      } else {
        groups.push({ slug: step.slug, from: step.at, to: step.at, n: 1 });
      }
    });
    groups.reverse(); /* najnowsze na górze */
    return groups;
  }

  /* Pionowa oś czasu ścieżki — pełna w profilu, kompaktowa na karcie na żywo */
  function trailTimelineHtml(trail, opts) {
    opts = opts || {};
    var groups = buildTrailGroups(trail);
    if (!groups.length) return "";
    var limit = opts.limit || 99;
    var shown = groups.slice(0, limit);
    var hiddenCount = groups.length - shown.length;
    var items = shown.map(function (g, i) {
      var isNow = i === 0;
      var spanS = Math.max(0, (Date.parse(g.to) - Date.parse(g.from)) / 1000);
      var badges = [];
      if (g.n > 1) badges.push("×" + fmt(g.n));
      if (spanS >= 45) badges.push("przez " + fmtDuration(spanS));
      var when = clockTime(g.from).slice(0, 5) +
        (g.n > 1 ? "–" + clockTime(g.to).slice(0, 5) : "") +
        (isNow ? " · " + relTime(g.to) : "");
      return (
        '<li class="vif-tl-step' + (isNow ? " is-now" : "") + '">' +
          '<span class="vif-tl-dot" aria-hidden="true"></span>' +
          '<span class="vif-tl-name">' + esc(prettySlug(g.slug)) + "</span>" +
          (badges.length ? '<span class="vif-tl-badge mono">' + esc(badges.join(" · ")) + "</span>" : "") +
          '<span class="vif-tl-time mono">' + esc(when) + "</span>" +
        "</li>"
      );
    }).join("");
    return '<ol class="vif-tl' + (opts.compact ? " vif-tl-compact" : "") + '">' + items +
      (hiddenCount > 0 ? '<li class="vif-tl-more">… i ' + fmt(hiddenCount) + " wcześniejszych kroków</li>" : "") +
      "</ol>";
  }

  /* ---------- Zakładki ---------- */
  var TAB_IDS = {
    activity: "tab-activity",
    submissions: "tab-submissions",
    community: "tab-community",
    visitors: "tab-visitors",
    errors: "tab-errors"
  };

  function bindTabs() {
    var btns = document.querySelectorAll(".adm-tab");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var tab = btn.getAttribute("data-tab");
          for (var j = 0; j < btns.length; j++) {
            var active = btns[j] === btn;
            btns[j].classList.toggle("is-active", active);
            btns[j].setAttribute("aria-selected", active ? "true" : "false");
          }
          Object.keys(TAB_IDS).forEach(function (key) {
            var el = $(TAB_IDS[key]);
            if (el) el.hidden = key !== tab;
          });
          if (tab === "community") fetchCommunity();
          if (tab === "visitors") fetchVisitorList();
          if (tab === "errors" && window.RJAdminErrors) window.RJAdminErrors.load();
        });
      })(btns[i]);
    }
  }

  /* ---------- Logowanie ---------- */
  function showAuth() {
    panelActive = false;
    stopRefresh();
    var a = $("panel-auth");
    var d = $("panel-dash");
    var l = $("panel-logout");
    if (a) a.hidden = false;
    if (d) d.hidden = true;
    if (l) l.hidden = true;
  }

  function showPanel() {
    panelActive = true;
    var a = $("panel-auth");
    var d = $("panel-dash");
    var l = $("panel-logout");
    if (a) a.hidden = true;
    if (d) d.hidden = false;
    if (l) l.hidden = false;
    startRefresh();
  }

  function verifyAdmin() {
    if (!window.RejsonCloud || !window.RejsonCloud.rpc) return Promise.resolve(false);
    return window.RejsonCloud.rpc("admin_setup_status", {}, true)
      .then(function (status) { return Boolean(status && status.is_admin); })
      .catch(function () { return false; });
  }

  function bindAuthForm() {
    var form = $("panel-auth-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errBox = $("panel-auth-error");
      var btn = $("panel-login-btn");
      var email = $("panel-email").value.trim();
      var pass = $("panel-pass").value;
      if (errBox) errBox.hidden = true;
      if (btn) btn.disabled = true;

      window.RejsonCloud.signInOwner(email, pass, false)
        .then(function () {
          window.location.reload();
        })
        .catch(function (err) {
          if (errBox) {
            errBox.textContent = err && err.message
              ? err.message
              : "Nie udało się zalogować — sprawdź e-mail i hasło.";
            errBox.hidden = false;
          }
          if (btn) btn.disabled = false;
        });
    });
  }

  function bindLogout() {
    var btn = $("panel-logout");
    if (!btn) return;
    btn.addEventListener("click", function () {
      try { window.RejsonCloud.setStoredSession(null); } catch (e) { /* ignorujemy */ }
      window.location.reload();
    });
  }

  /* ---------- Histogram otwartych stron ---------- */
  function renderHistogram(histo) {
    var wrap = $("act-histogram");
    if (!wrap || !changed("histogram", histo)) return;

    var keys = Object.keys(histo || {}).filter(function (k) {
      return (Number(histo[k]) || 0) > 0;
    });
    keys.sort(function (a, b) { return Number(a) - Number(b); });

    if (!keys.length) {
      wrap.innerHTML = '<span class="adm-histo-empty">Nikt nie jest teraz online — odwiedź stronę, a pojawią się dane.</span>';
      return;
    }

    function osobaWord(n) {
      if (n === 1) return "osoba";
      var r10 = n % 10, r100 = n % 100;
      if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return "osoby";
      return "osób";
    }

    wrap.innerHTML = keys
      .map(function (k) {
        var pages = Number(k);
        var ppl = Number(histo[k]) || 0;
        var multi = pages >= 2;
        return (
          '<span class="adm-histo-chip' + (multi ? " is-multi" : "") + '">' +
            "<strong>" + pages + (pages === 1 ? " strona" : " strony") + "</strong> — " +
            ppl + " " + osobaWord(ppl) +
          "</span>"
        );
      })
      .join("");
  }

  /* ---------- Zalogowani użytkownicy Społeczności online (kompaktowo) ---------- */
  function renderIdentified(users) {
    var wrap = $("act-users");
    if (!wrap || !changed("identified", users)) return;

    if (!Array.isArray(users) || !users.length) {
      wrap.innerHTML =
        '<span class="adm-histo-empty">Brak zalogowanych użytkowników online.</span>';
      return;
    }

    wrap.innerHTML = users.map(function (u) {
      var name = String(u.username || "?");
      var projects = Array.isArray(u.projects) ? u.projects : [];
      var projHtml = projects
        .map(function (slug) {
          var isPage = String(slug).toLowerCase() === SITE_SLUG;
          return '<span class="adm-proj-chip' + (isPage ? " is-page" : "") + '">' + esc(slug) + "</span>";
        })
        .join("");
      var isOwner = String(name).toLowerCase() === "rejson59";
      var tabs = Number(u.tabs) || 1;
      return (
        '<div class="adm-online-user">' +
          '<span class="adm-dot" aria-hidden="true"></span>' +
          '<span class="commp-avatar" aria-hidden="true">' + esc(name.charAt(0).toUpperCase()) + "</span>" +
          '<span class="commp-name">' + esc(name) + (isOwner ? ownerBadge(true) : "") + botBadge(isAgentName(name)) +
            (tabs > 1 ? '<span class="pa-time-chip" title="Karty tej osoby">🗔 ' + fmt(tabs) + "</span>" : "") + "</span>" +
          (projHtml || '<span class="adm-proj-chip">—</span>') +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Ikony rodzajów akcji ---------- */
  function actionIcon(kind) {
    switch (kind) {
      case "like": return "❤";
      case "unlike": return "💔";
      case "submit": return "📨";
      case "open": return "📂";
      default: return "🖱";
    }
  }

  /* Dziennik: dzień po dniu — na jakich podstronach był i o której wszedł.
     Wydzielone z renderVisitorProfile, żeby dało się sprawdzić testem
     bez logowania do panelu. */
  function buildDayLogHtml(dayLog, todayIso) {
    if (!Array.isArray(dayLog) || !dayLog.length) return "";
    return '<div class="vif-section"><h3 class="vif-h">Dzień po dniu — podstrony i godzina wejścia</h3>' +
      '<div class="vif-days-log">' +
      dayLog.map(function (d) {
        var pages = Array.isArray(d.pages) ? d.pages : [];
        var isToday = String(d.day).slice(0, 10) === String(todayIso || "").slice(0, 10);
        return (
          '<div class="vif-day' + (isToday ? " is-today" : "") + '">' +
            '<div class="vif-day-head">' +
              '<span class="vif-day-date mono">' + esc(dayLabel(d.day)) + (isToday ? " · dziś" : "") + "</span>" +
              (d.entry_at ? '<span class="pa-time-chip" title="Pierwsze wejście tego dnia">🕘 wszedł ' + esc(clockTime(d.entry_at)) + "</span>" : "") +
              (d.last_at ? '<span class="pa-time-chip" title="Ostatnia aktywność tego dnia">⏱ do ' + esc(clockTime(d.last_at)) + "</span>" : "") +
              '<span class="pa-time-chip" title="Nowa wizyta po przerwie 30 min">🚪 ' + fmt(d.entries) + "</span>" +
              '<span class="pa-time-chip" title="Kliknięcia i akcje tego dnia">🖱 ' + fmt(d.actions) + "</span>" +
            "</div>" +
            '<div class="vif-day-pages">' +
              (pages.length
                ? pages.map(function (slug) {
                    var isPage = String(slug).toLowerCase() === SITE_SLUG;
                    return '<span class="adm-proj-chip' + (isPage ? " is-page" : "") + '">' + esc(prettySlug(slug)) + "</span>";
                  }).join("")
                : '<span class="vif-day-empty">brak zapisanych podstron</span>') +
            "</div>" +
          "</div>"
        );
      }).join("") +
      "</div></div>";
  }

  /* ---------- Odwiedzający na żywo (identyfikator + ścieżka + akcje) ---------- */
  function renderVisitors(visitors) {
    var wrap = $("pa-visitors");
    if (!wrap || !changed("visitors", visitors)) return;

    if (!Array.isArray(visitors) || !visitors.length) {
      wrap.innerHTML =
        '<div class="pa-empty">Nikt nie jest teraz online — jak tylko ktoś wejdzie na stronę lub do projektu, zobaczysz go tutaj z identyfikatorem, trasą i każdym kliknięciem.</div>';
      return;
    }

    wrap.innerHTML = visitors.map(function (v) {
      var fp = String(v.fingerprint_id || "----");
      var secs = Number(v.seconds_active) || 0;
      var openProjects = Array.isArray(v.open_projects) ? v.open_projects : [];
      var trail = Array.isArray(v.trail) ? v.trail.slice() : [];
      var actions = Array.isArray(v.actions) ? v.actions.slice() : [];
      trail.reverse();

      var openHtml = openProjects.length
        ? '<div class="pa-open-projects"><span class="pa-trail-label">Otwarte teraz</span>' +
          openProjects.map(function (slug) {
            var isPage = String(slug).toLowerCase() === SITE_SLUG;
            return '<span class="adm-proj-chip' + (isPage ? " is-page" : "") + '">' + esc(slug) + "</span>";
          }).join("") +
          "</div>"
        : "";

      var trailHtml = trail.length
        ? '<div class="pa-trail"><span class="pa-trail-label">Ścieżka</span>' +
          trailTimelineHtml(trail, { limit: 6, compact: true }) +
          "</div>"
        : "";

      var actionsHtml = actions.length
        ? '<div class="pa-actions"><span class="pa-trail-label">Ostatnie akcje</span><div class="pa-actions-list">' +
          actions.slice(0, 8).map(function (a) {
            return (
              '<div class="pa-action">' +
                '<span class="pa-action-icon" aria-hidden="true">' + actionIcon(a.kind) + "</span>" +
                '<span class="pa-action-text">' + esc(a.target || "") + "</span>" +
                (a.project ? '<span class="pa-event-proj">' + esc(a.project) + "</span>" : "") +
                '<span class="pa-action-time mono">' + esc(clockTime(a.at)) + "</span>" +
              "</div>"
            );
          }).join("") +
          "</div></div>"
        : '<div class="pa-actions"><span class="pa-trail-label">Ostatnie akcje</span><span class="pa-actions-empty">brak zarejestrowanych kliknięć (nowy licznik działa od teraz)</span></div>';

      return (
        '<div class="pa-visitor' + (v.person_id ? " is-clickable" : "") + '"' +
          (v.person_id ? ' data-person="' + esc(v.person_id) + '" title="Kliknij, aby otworzyć pełny profil tej osoby"' : "") + '>' +
          '<div class="pa-visitor-head">' +
            '<span class="pa-fp mono' + (v.via === "browser" ? " is-derived" : "") + '"' +
              (v.via === "browser"
                ? ' title="Przybliżony identyfikator przeglądarki (IP + przeglądarka) — gość bez pełnego odcisku, np. stary licznik w projekcie"'
                : v.via === "session"
                ? ' title="Identyfikator sesji — przeglądarka nie podała odcisku ani danych połączenia"'
                : ' title="Trwały identyfikator przeglądarki — przeżywa wyczyszczenie danych strony"') +
            ">#" + esc(fp) + "</span>" +
            whoLabel(v.username, fp, v.is_owner) +
            '<span class="pa-visitor-meta">' +
              '<span class="pa-time-chip">🟢 online ' + esc(relTime(v.last_seen_at)) + "</span>" +
              '<span class="pa-time-chip">⏱ na stronach: ' + esc(fmtDuration(secs)) + "</span>" +
              (Number(v.tabs) > 1
                ? '<span class="pa-time-chip" title="Ta sama osoba ma otwarte kilka kart — liczymy ją raz">🗔 ' + fmt(v.tabs) + " karty</span>"
                : "") +
              (v.person_id
                ? '<span class="pa-open-prof" aria-hidden="true">👉 profil</span>'
                : "") +
            "</span>" +
          "</div>" +
          openHtml +
          trailHtml +
          actionsHtml +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Wizualna mapa podstron (kto jest gdzie) ---------- */
  function renderPagesMap(pages) {
    var wrap = $("act-map");
    if (!wrap || !changed("map", pages)) return;
    if (!Array.isArray(pages) || !pages.length) {
      wrap.innerHTML =
        '<div class="pa-empty">Nikt nie jest teraz online — gdy tylko ktoś wejdzie, jego kropka pojawi się na mapie odpowiedniej podstrony.</div>';
      return;
    }

    var maxPeople = 1;
    pages.forEach(function (p) { maxPeople = Math.max(maxPeople, Number(p.people_count) || 0); });

    wrap.innerHTML = pages.map(function (p) {
      var slug = String(p.slug || "");
      var isPage = slug.toLowerCase() === SITE_SLUG;
      var peopleCount = Number(p.people_count) || 0;
      var tabs = Number(p.tabs) || 0;
      var people = Array.isArray(p.people) ? p.people : [];
      var intensity = Math.max(0.25, Math.min(1, peopleCount / maxPeople));
      var href = isPage ? "/" : "/" + encodeURIComponent(slug);

      var peopleHtml = people.map(function (person) {
        var who = String(person.who || "Gość");
        var initial = (who.charAt(0) || "?").toUpperCase();
        return (
          '<span class="adm-map-person" title="' + esc(who) + (Number(person.tabs) > 1 ? " · " + person.tabs + " karty" : "") + '">' +
            '<span class="adm-map-person-ava' + (person.is_username ? " is-ident" : "") + '" aria-hidden="true">' + esc(initial) + "</span>" +
            '<span class="adm-map-person-name">' + esc(who) + "</span>" +
          "</span>"
        );
      }).join("");

      return (
        '<a class="adm-map-node' + (isPage ? " is-site" : "") + '" href="' + href + '" target="_blank" rel="noopener"' +
          ' style="--map-intensity:' + intensity.toFixed(2) + '">' +
          '<span class="adm-map-node-head">' +
            '<span class="adm-map-dot" aria-hidden="true"></span>' +
            '<span class="adm-proj-chip' + (isPage ? " is-page" : "") + '">' + esc(isPage ? slug + " (strona główna)" : slug) + "</span>" +
            '<span class="adm-map-counts">' +
              '<span class="adm-map-num mono" title="Unikalne osoby tutaj">' + fmt(peopleCount) + " 👤</span>" +
              (tabs > peopleCount ? '<span class="adm-map-num mono adm-dim" title="Otwarte karty">' + fmt(tabs) + " 🗔</span>" : "") +
            "</span>" +
          "</span>" +
          '<span class="adm-map-people">' + peopleHtml + "</span>" +
        "</a>"
      );
    }).join("");
  }

  /* ---------- Wykres godzinowy: dziś (wejścia + kliknięcia) ---------- */
  function renderHourly(hours) {
    var wrap = $("act-hourly-chart");
    if (!wrap) return;
    var hourNow = new Date().getHours();
    if (!changed("hourly", [hours, hourNow])) return;
    if (!Array.isArray(hours) || !hours.length) {
      wrap.innerHTML = '<span class="adm-histo-empty">Brak danych na dziś — wykres pojawi się po pierwszych wejściach.</span>';
      return;
    }
    var maxV = 1, maxC = 1;
    hours.forEach(function (h) {
      maxV = Math.max(maxV, Number(h.visits) || 0);
      maxC = Math.max(maxC, Number(h.clicks) || 0);
    });
    var nowHour = new Date().getHours();
    wrap.innerHTML = '<div class="adm-hour-track">' + hours.map(function (h) {
      var v = Number(h.visits) || 0;
      var c = Number(h.clicks) || 0;
      var isNow = Number(h.hour) === nowHour;
      var label = ("0" + h.hour).slice(-2) + ":00";
      return (
        '<div class="adm-hour-col' + (isNow ? " is-now" : "") + '" title="' + esc(
          label + " — wejścia: " + v + " · kliknięcia: " + c
        ) + '">' +
          '<span class="adm-hour-bars">' +
            '<span class="adm-hour-bar adm-hour-visits" style="height:' + Math.max(3, Math.round((v / maxV) * 100)) + '%"></span>' +
            '<span class="adm-hour-bar adm-hour-clicks" style="height:' + Math.max(3, Math.round((c / maxC) * 100)) + '%"></span>' +
          "</span>" +
          (Number(h.hour) % 3 === 0 || isNow
            ? '<span class="adm-hour-lbl mono">' + esc(label) + "</span>"
            : '<span class="adm-hour-lbl mono"></span>') +
        "</div>"
      );
    }).join("") + "</div>" +
    '<div class="adm-hour-legend"><span class="adm-hour-key adm-hour-key-visits"></span> wejścia <span class="adm-hour-key adm-hour-key-clicks"></span> kliknięcia</div>';
  }

  /* ---------- Globalny strumień kliknięć ---------- */
  function renderClicks(clicks) {
    var wrap = $("pa-clicks");
    if (!wrap || !changed("clicks", clicks)) return;

    if (!Array.isArray(clicks) || !clicks.length) {
      wrap.innerHTML =
        '<div class="pa-empty">Jeszcze brak zarejestrowanych kliknięć — licznik działa od teraz, więc wejdź na stronę i kliknij coś, aby zobaczyć pierwsze wpisy.</div>';
      return;
    }

    wrap.innerHTML = clicks.map(function (c) {
      return (
        '<div class="pa-event">' +
          '<span class="pa-event-icon" aria-hidden="true">' + actionIcon(c.kind) + "</span>" +
          '<span class="pa-event-body">' +
            whoLabel(c.username, c.fp, c.is_owner) +
            '<span class="pa-event-text"> kliknął(-a): ' + esc(c.target || "") + "</span>" +
            (c.project ? '<span class="pa-event-proj">' + esc(c.project) + "</span>" : "") +
          "</span>" +
          '<span class="pa-event-time" title="' + esc(clockTime(c.at)) + '">' + esc(relTime(c.at)) + "</span>" +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Strumień zdarzeń ---------- */
  var EVENT_ICONS = {
    feedback: "💡",
    like: "❤",
    post: "📝",
    comment: "💬",
    like_post: "❤"
  };

  function eventIcon(ev) {
    if (ev.kind === "feedback") {
      return String(ev.text || "").indexOf("(bug)") === 0 ? "🐞" : "💡";
    }
    return EVENT_ICONS[ev.kind] || "🔔";
  }

  function renderEvents(events) {
    var wrap = $("pa-events");
    if (!wrap || !changed("events", events)) return;

    if (!Array.isArray(events) || !events.length) {
      wrap.innerHTML =
        '<div class="pa-empty">Brak zdarzeń — nowe zgłoszenia, polubienia i wpisy pojawią się tutaj na bieżąco.</div>';
      return;
    }

    wrap.innerHTML = events.map(function (ev) {
      var proj = ev.project
        ? '<span class="pa-event-proj">' + esc(ev.project) + "</span>"
        : "";
      return (
        '<div class="pa-event">' +
          '<span class="pa-event-icon" aria-hidden="true">' + eventIcon(ev) + "</span>" +
          '<span class="pa-event-body">' +
            '<span class="pa-event-who">' + esc(ev.who || "Gość") + "</span>" +
            '<span class="pa-event-text">' + esc(ev.text || "") + "</span>" +
            proj +
          "</span>" +
          '<span class="pa-event-time">' + esc(relTime(ev.at)) + "</span>" +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Wiersze projektów ---------- */
  function rowHTML(p) {
    var online = Number(p.online) || 0;
    var today = Number(p.views_today) || 0;
    var isSite = String(p.project_slug).toLowerCase() === SITE_SLUG;
    return (
      '<div class="adm-trow' + (isSite ? " is-site" : "") + '" role="row">' +
        '<span class="adm-tname" role="cell">' +
          (online > 0 ? '<span class="adm-dot" aria-hidden="true"></span>' : "") +
          '<span class="adm-tslug">' + esc(p.project_slug) + "</span>" +
        "</span>" +
        '<span class="adm-num adm-online' + (online > 0 ? " is-live" : " adm-dim") + '" role="cell">' + fmt(online) + "</span>" +
        '<span class="adm-num adm-today" role="cell">' + fmt(today) + "</span>" +
        '<span class="adm-num adm-dim" role="cell">' + fmt(p.views_total) + "</span>" +
        '<span class="adm-num adm-dim" role="cell">' + fmt(p.unique_visitors) + "</span>" +
        '<span class="adm-num adm-rel" role="cell">' + relTime(p.last_viewed_at) + "</span>" +
      "</div>"
    );
  }

  /* ---------- Główny render aktywności ---------- */
  function render(data) {
    if (!data || typeof data !== "object") return;
    var totals = data.totals || {};
    var multi = data.multi || {};
    var projects = Array.isArray(data.projects) ? data.projects : [];

    animateNum($("kpi-online"), totals.online_total);
    animateNum($("kpi-views-today"), totals.views_today_total);
    animateNum($("kpi-multi"), multi.multi_project_visitors);
    animateNum($("kpi-max-open"), multi.max_open_projects);
    animateNum($("kpi-views-total"), totals.views_total);
    animateNum($("kpi-unique-total"), totals.unique_visitors_total);

    var multiCard = $("kpi-multi-card");
    if (multiCard) {
      multiCard.classList.toggle("is-hot", (Number(multi.multi_project_visitors) || 0) > 0);
    }

    renderHistogram(multi.open_projects_histogram);
    renderIdentified(data.identified_users);
    renderVisitors(data.visitors);
    renderPagesMap(data.pages_map);
    renderClicks(data.clicks);
    renderEvents(data.events);

    var rows = $("act-rows");
    if (rows) {
      var html = projects.map(rowHTML).join("");
      if (rows.innerHTML !== html) rows.innerHTML = html;
    }

    stampUpdated();
  }

  function stampUpdated() {
    var updated = $("act-updated");
    if (!updated) return;
    lastFetchAt = Date.now();
    var now = new Date();
    var hh = ("0" + now.getHours()).slice(-2);
    var mm = ("0" + now.getMinutes()).slice(-2);
    var ss = ("0" + now.getSeconds()).slice(-2);
    updated.textContent = "ostatnia aktualizacja: " + hh + ":" + mm + ":" + ss + " · odświeżam co " + (REFRESH_MS / 1000) + " s";
  }

  /* ---------- Zakładka Społeczność ---------- */
  function renderCommunity(data) {
    if (!data || typeof data !== "object") return;
    var stats = data.stats || {};
    var users = Array.isArray(data.users) ? data.users : [];
    var posts = Array.isArray(data.posts) ? data.posts : [];

    animateNum($("comm-kpi-users"), stats.users);
    animateNum($("comm-kpi-posts"), stats.posts);
    animateNum($("comm-kpi-comments"), stats.comments);
    animateNum($("comm-kpi-likes"), stats.likes);

    var usersWrap = $("comm-users");
    if (usersWrap) {
      usersWrap.innerHTML = users.length
        ? users.map(function (u) {
            return (
              '<div class="commp-user">' +
                '<span class="commp-user-main">' +
                  (u.online ? '<span class="commp-dot" title="online teraz" aria-hidden="true"></span>' : "") +
                  '<span class="commp-avatar" aria-hidden="true">' + esc((String(u.username).charAt(0) || "?").toUpperCase()) + "</span>" +
                  '<span class="commp-name">' + esc(u.username) + ownerBadge(u.is_owner) + botBadge(u.is_bot === true || isAgentName(u.username)) + "</span>" +
                "</span>" +
                '<span class="commp-user-stats">' +
                  '<span class="pa-time-chip">📝 ' + fmt(u.posts_count) + "</span>" +
                  '<span class="pa-time-chip">💬 ' + fmt(u.comments_count) + "</span>" +
                  '<span class="pa-time-chip">❤ ' + fmt(u.likes_received) + "</span>" +
                  '<span class="pa-time-chip">dołączył(a): ' + esc(relTime(u.created_at)) + "</span>" +
                "</span>" +
                /* Zarządzanie kontem — konta specjalne (właściciel, bot) są chronione */
                (u.is_owner || u.is_bot
                  ? ""
                  : '<span class="commp-user-actions">' +
                    '<button class="btn btn-glass btn-sm" type="button" data-acc-reset-pin="' + esc(u.username) + '" title="Wygeneruj nowy 4-cyfrowy PIN — stare sesje użytkownika zostaną wylogowane">Nowy PIN</button>' +
                    '<button class="btn btn-glass btn-sm commp-del" type="button" data-acc-delete="' + esc(u.username) + '" title="Usuń konto wraz z wpisami, komentarzami i polubieniami">Usuń konto</button>' +
                  "</span>") +
              "</div>"
            );
          }).join("")
        : '<div class="pa-empty">Brak członków — pierwszy użytkownik może założyć konto na stronie Społeczności.</div>';
    }

    var postsWrap = $("comm-posts");
    if (postsWrap) {
      postsWrap.innerHTML = posts.length
        ? posts.map(function (p) {
            return (
              '<div class="commp-post">' +
                '<div class="commp-post-head">' +
                  '<span class="commp-avatar" aria-hidden="true">' + esc((String(p.author_name).charAt(0) || "?").toUpperCase()) + "</span>" +
                  '<span class="commp-name">' + esc(p.author_name) + ownerBadge(p.is_owner) + botBadge(p.is_bot === true || isAgentName(p.author_name)) + "</span>" +
                  (Number(p.media_count) > 0
                    ? '<span class="pa-time-chip" title="Wpisy z załącznikami">📎 ' + fmt(p.media_count) + "</span>"
                    : "") +
                  '<span class="pa-time-chip">❤ ' + fmt(p.likes_count) + "</span>" +
                  '<span class="pa-time-chip">💬 ' + fmt(p.comments_count) + "</span>" +
                  '<span class="pa-event-time">' + esc(relTime(p.created_at)) + "</span>" +
                  '<button class="btn btn-glass btn-sm commp-del" type="button" data-admin-del-post="' + esc(p.id) + '" title="Usuń ten wpis">Usuń</button>' +
                "</div>" +
                '<p class="commp-post-content">' + esc(p.content) + "</p>" +
              "</div>"
            );
          }).join("")
        : '<div class="pa-empty">Brak wpisów.</div>';
    }
  }

  function fetchCommunity() {
    if (!panelActive || !window.RejsonCloud || !window.RejsonCloud.rpc) {
      return Promise.resolve(null);
    }
    return window.RejsonCloud.rpc("get_admin_community", {}, true)
      .then(function (data) {
        renderCommunity(data);
        return data;
      })
      .catch(function () { return null; });
  }

  /* ---------- Zarządzanie kontami społeczności ---------- */
  function bindAccountManagement() {
    var wrap = $("comm-users");
    if (!wrap) return;
    wrap.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("button[data-acc-reset-pin], button[data-acc-delete]") : null;
      if (!t) return;

      var resetUser = t.getAttribute("data-acc-reset-pin");
      var delUser = t.getAttribute("data-acc-delete");

      if (resetUser) {
        if (!window.confirm("Zresetować PIN konta „" + resetUser + "”? Stare sesje zostaną wylogowane, a nowy PIN zobaczysz raz — podaj go użytkownikowi.")) return;
        t.disabled = true;
        window.RejsonCloud.rpc("admin_reset_community_pin", { p_username: resetUser }, true)
          .then(function (res) {
            alert(
              "Nowy PIN dla „" + ((res && res.username) || resetUser) + "”: " +
              ((res && res.new_pin) || "?") +
              "\n\nZapisz go teraz — nie da się go odczytać później (w bazie przechowujemy tylko hash)."
            );
          })
          .catch(function (err) {
            alert(err && err.message ? err.message : "Nie udało się zresetować PIN-u.");
          })
          .finally(function () { t.disabled = false; });
        return;
      }

      if (delUser) {
        if (!window.confirm("Na pewno usunąć konto „" + delUser + "”? Zniknie wraz ze wszystkimi wpisami, komentarzami i polubieniami.")) return;
        t.disabled = true;
        window.RejsonCloud.rpc("admin_delete_community_user", { p_username: delUser }, true)
          .then(function () { fetchCommunity(); })
          .catch(function (err) {
            alert(err && err.message ? err.message : "Nie udało się usunąć konta.");
            t.disabled = false;
          });
      }
    });
  }

  function bindCommunityModeration() {
    var wrap = $("comm-posts");
    if (!wrap) return;
    wrap.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-admin-del-post]") : null;
      if (!btn) return;
      if (!window.confirm("Usunąć ten wpis wraz z komentarzami i polubieniami?")) return;
      btn.disabled = true;
      window.RejsonCloud.rpc("admin_delete_post", { p_post_id: btn.getAttribute("data-admin-del-post") }, true)
        .then(function () { fetchCommunity(); })
        .catch(function (err) {
          alert(err && err.message ? err.message : "Nie udało się usunąć wpisu.");
          btn.disabled = false;
        });
    });
  }

  /* ---------- Wykres wejść (14 dni) + top projekty tygodnia ---------- */
  var WEEKDAY_SHORT = ["nd", "pn", "wt", "śr", "czw", "pt", "so"];

  function dayLabel(dayIso) {
    var d = new Date(dayIso + "T12:00:00");
    if (isNaN(d)) return dayIso;
    var wd = WEEKDAY_SHORT[d.getDay()];
    var dd = ("0" + d.getDate()).slice(-2);
    var mm = ("0" + (d.getMonth() + 1)).slice(-2);
    return wd + " " + dd + "." + mm;
  }

  function renderDailyData(data) {
    renderHourly(data && data.hours_today);
    var chart = $("act-daily-chart");
    var topWrap = $("act-top-week");
    if (!chart && !topWrap) return;
    if (!data || !Array.isArray(data.days)) return;

    var days = data.days;
    var maxTotal = 0;
    days.forEach(function (d) { maxTotal = Math.max(maxTotal, Number(d.total) || 0); });

    if (chart && changed("dailyc", days)) {
      var allZero = maxTotal === 0;
      chart.innerHTML = '<div class="adm-chart-track">' + days.map(function (d) {
        var total = Number(d.total) || 0;
        var pct = maxTotal > 0 ? Math.max(3, Math.round((total / maxTotal) * 100)) : 3;
        var projects = d.projects || {};
        var slugs = Object.keys(projects).sort(function (a, b) {
          return (Number(projects[b]) || 0) - (Number(projects[a]) || 0);
        });
        var tipLines = slugs.slice(0, 8).map(function (slug) {
          return "   " + slug + ": " + fmt(projects[slug]);
        });
        var isToday = d.day === days[days.length - 1].day;
        return (
          '<div class="adm-chart-col' + (isToday ? " is-today" : "") + '" title="' + esc(
            dayLabel(d.day) + " — " + total + (total === 1 ? " wejście" : " wejść") + (tipLines.length ? "\n" + tipLines.join("\n") : "")
          ) + '">' +
            '<span class="adm-chart-val mono">' + (total > 0 ? fmt(total) : "") + "</span>" +
            '<span class="adm-chart-barwrap"><span class="adm-chart-bar" style="height:' + pct + '%"></span></span>' +
            '<span class="adm-chart-day mono">' + esc(dayLabel(d.day)) + "</span>" +
          "</div>"
        );
      }).join("") + "</div>";
      if (allZero) {
        chart.innerHTML += '<span class="adm-chart-hint">Dzienne statystyki zbierane są od 23.10.2026 — słupki urosną z każdym dniem.</span>';
      }
    }

    if (topWrap && changed("topw", data.top_week)) {
      var top = Array.isArray(data.top_week) ? data.top_week : [];
      if (!top.length) {
        topWrap.innerHTML = '<div class="pa-empty">Jeszcze za mało danych — ranking zapełni się po pierwszych dniach z licznikiem dziennym.</div>';
      } else {
        var maxWeek = Number(top[0].views) || 1;
        var medals = ["🥇", "🥈", "🥉", "4.", "5.", "6."];
        topWrap.innerHTML = top.map(function (t, i) {
          var views = Number(t.views) || 0;
          var pct = Math.max(3, Math.round((views / maxWeek) * 100));
          var isSite = String(t.slug).toLowerCase() === SITE_SLUG;
          return (
            '<div class="adm-tw-row">' +
              '<span class="adm-tw-rank" aria-hidden="true">' + (medals[i] || (i + 1) + ".") + "</span>" +
              '<span class="adm-tw-body">' +
                '<span class="adm-tw-name">' +
                  '<span class="adm-proj-chip' + (isSite ? " is-page" : "") + '">' + esc(t.slug) + "</span>" +
                "</span>" +
                '<span class="adm-tw-track"><span class="adm-tw-bar" style="width:' + pct + '%"></span></span>' +
              "</span>" +
              '<span class="adm-tw-num mono">' + fmt(views) + "</span>" +
            "</div>"
          );
        }).join("");
      }
    }
  }

  function fetchDailyStats() {
    if (!panelActive || !window.RejsonCloud || !window.RejsonCloud.rpc) {
      return Promise.resolve(null);
    }
    return window.RejsonCloud.rpc("get_admin_daily_views", { p_days: 14 }, true)
      .then(function (data) {
        renderDailyData(data);
        return data;
      })
      .catch(function () { return null; });
  }

  /* ---------- Pobieranie: admin-only RPC ---------- */
  function fetchAdminActivity() {
    if (!panelActive || !window.RejsonCloud || !window.RejsonCloud.rpc) {
      return Promise.resolve(null);
    }
    return window.RejsonCloud.rpc("get_admin_activity", { p_window_seconds: PRESENCE_WINDOW }, true)
      .then(function (data) {
        render(data);
        return data;
      })
      .catch(function (err) {
        var msg = err && err.message ? String(err.message) : "";
        if (msg.indexOf("uprawnień") !== -1 || msg.indexOf("JWT") !== -1 || (err && err.status === 401)) {
          try { window.RejsonCloud.setStoredSession(null); } catch (e) { /* ignorujemy */ }
          showAuth();
          return null;
        }
        stampUpdated();
        return null;
      });
  }

  function startRefresh() {
    stopRefresh();
    refreshTick = 0;
    fetchAdminActivity();
    fetchCommunity();
    fetchDailyStats();
    refreshTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      refreshTick += 1;
      fetchAdminActivity();
      /* cięższe zapytania rzadziej — panel odświeża się płynnie bez obciążania bazy */
      if (refreshTick % SLOW_CYCLE_DIV === 1) {
        fetchCommunity();
        fetchDailyStats();
        var vt = $("tab-visitors");
        if (vt && !vt.hidden) fetchVisitorList();
      }
    }, REFRESH_MS);
  }

  function stopRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  /* =====================================================================
     IDENTYFIKATORY — lista rozpoznanych osób + profil z pełną aktywnością
     ===================================================================== */
  var visitorListData = [];
  var visitorFilter = "";
  var visitorOpenId = null;

  function viaBadge(via) {
    if (via === "account") {
      return '<span class="pa-time-chip" title="Rozpoznana po nazwie konta — to samo konto łączy wszystkie urządzenia">👤 konto</span>';
    }
    if (via === "fp") {
      return '<span class="pa-time-chip" title="Pełny odcisk przeglądarki — najpewniejsza identyfikacja">🧬 odcisk</span>';
    }
    if (via === "browser") {
      return '<span class="pa-time-chip" title="Przybliżony identyfikator z IP + przeglądarki — dla starszych liczników bez odcisku">🌐 przeglądarka</span>';
    }
    return '<span class="pa-time-chip" title="Tylko klucz sesji — przeglądarka nie podała żadnych identyfikatorów">⏳ sesja</span>';
  }

  function visitorRowHtml(p) {
    var open = visitorOpenId === p.id;
    return (
      '<button type="button" class="vif-row' + (open ? " is-open" : "") + '" data-vpid="' + esc(p.id) + '" title="Otwórz profil tej osoby">' +
        '<span class="vif-row-id mono' + (p.via !== "fp" ? " is-derived" : "") + '">#' + esc(p.label) + "</span>" +
        '<span class="vif-row-name">' +
          (p.online ? '<span class="commp-dot" aria-hidden="true" title="online teraz"></span>' : "") +
          (p.username ? "<strong>" + esc(p.username) + "</strong>" + ownerBadge(p.is_owner) : '<span class="vif-guest">Gość</span>') +
          viaBadge(p.via) +
          (p.is_bot ? '<span class="vif-badge vif-badge-bot" title="Ruch automatyczny (crawler / monitor)">🤖 bot</span>' : "") +
          (p.frozen && !p.is_bot ? '<span class="vif-badge vif-badge-frozen" title="Wszedł, ale nic nie kliknął i nie przeszedł na inną stronę">❄ zamrożony</span>' : "") +
        "</span>" +
        '<span class="vif-row-stats">' +
          '<span class="pa-time-chip" title="Wejścia — nowa wizyta po przerwie dłuższej niż 30 minut">🚪 ' + fmt(p.visits) + "</span>" +
          '<span class="pa-time-chip" title="Odwiedzone podstrony">📄 ' + fmt(p.pages) + "</span>" +
          '<span class="pa-time-chip" title="Kliknięcia i akcje">🖱 ' + fmt(p.actions) + "</span>" +
          (Number(p.submissions) > 0 ? '<span class="pa-time-chip" title="Zgłoszenia na tablicę">📨 ' + fmt(p.submissions) + "</span>" : "") +
          (Number(p.votes) > 0 ? '<span class="pa-time-chip" title="Głosy na pomysły">👍 ' + fmt(p.votes) + "</span>" : "") +
          (Array.isArray(p.today_pages) && p.today_pages.length
            ? '<span class="vif-row-today" title="Dziś był na: ' + esc(p.today_pages.map(prettySlug).join(" · ")) + '">' +
              "📄 dziś: " + esc(p.today_pages.slice(0, 3).map(prettySlug).join(" · ")) +
              (p.today_pages.length > 3 ? " +" + (p.today_pages.length - 3) : "") + "</span>"
            : "") +
          (p.today_entry_at
            ? '<span class="pa-time-chip" title="O której wszedł dziś pierwszy raz">🕘 ' + esc(clockTime(p.today_entry_at)) + "</span>"
            : "") +
        "</span>" +
        '<span class="vif-row-seen mono" title="Ostatnio widziana">' + esc(relTime(p.last_seen_at)) + "</span>" +
        '<span class="vif-row-arrow" aria-hidden="true">›</span>' +
      "</button>"
    );
  }

  function renderVisitorList() {
    var wrap = $("vif-list");
    var countEl = $("vif-count");
    if (!wrap) return;
    var q = visitorFilter.trim().toLowerCase();
    var rows = visitorListData.filter(function (p) {
      if (!q) return true;
      return (
        String(p.label || "").toLowerCase().indexOf(q) !== -1 ||
        String(p.username || "").toLowerCase().indexOf(q) !== -1 ||
        String(p.id || "").toLowerCase().indexOf(q) !== -1
      );
    });

    /* Trzy grupy: aktywni na górze, zamrożeni (brak akcji i 1 strona) oraz boty
       zwinięte pod spodem — nie zasłaniają właściwej listy. */
    var active = [];
    var frozen = [];
    var bots = [];
    rows.forEach(function (p) {
      if (p.is_bot) bots.push(p);
      else if (p.frozen) frozen.push(p);
      else active.push(p);
    });

    if (countEl) {
      var parts = [rows.length + (rows.length === 1 ? " osoba" : " osób")];
      if (frozen.length) parts.push(frozen.length + " ❄");
      if (bots.length) parts.push(bots.length + " 🤖");
      countEl.textContent = parts.join(" · ");
    }
    if (!rows.length) {
      wrap.innerHTML = '<div class="pa-empty">Brak pasujących identyfikatorów — osoby pojawią się tutaj, gdy ktoś wejdzie na stronę (lista obejmuje ostatnie dni).</div>';
      return;
    }

    var html = "";
    if (active.length) {
      html +=
        '<div class="vif-group">' +
          '<div class="vif-group-head">Aktywne <span class="vif-group-n mono">' + active.length + "</span></div>" +
          active.map(visitorRowHtml).join("") +
        "</div>";
    }
    if (frozen.length) {
      html +=
        '<details class="vif-group vif-cold">' +
          '<summary class="vif-group-head">Zamrożone ❄ — weszli, ale nic nie kliknęli <span class="vif-group-n mono">' + frozen.length + "</span></summary>" +
          frozen.map(visitorRowHtml).join("") +
        "</details>";
    }
    if (bots.length) {
      html +=
        '<details class="vif-group vif-cold">' +
          '<summary class="vif-group-head">Boty 🤖 — ruch automatyczny <span class="vif-group-n mono">' + bots.length + "</span></summary>" +
          bots.map(visitorRowHtml).join("") +
        "</details>";
    }
    wrap.innerHTML = html;
  }

  function fetchVisitorList(retried) {
    if (!panelActive || !window.RejsonCloud || !window.RejsonCloud.rpc) return Promise.resolve(null);
    var daysEl = $("vif-days");
    var days = daysEl ? Number(daysEl.value) || 7 : 7;
    return window.RejsonCloud.rpc("admin_visitor_list", { p_days: days }, true)
      .then(function (data) {
        visitorListData = (data && Array.isArray(data.people)) ? data.people : [];
        renderVisitorList();
        return data;
      })
      .catch(function (err) {
        /* retry raz, po chwili — pojedyncze przycięcia sieci nie psują widoku */
        if (!retried) {
          setTimeout(function () { fetchVisitorList(true); }, 1600);
          return null;
        }
        /* gdy lista już jest wyświetlona, chwilowy błąd zostawia stare dane */
        if (visitorListData.length) return null;
        var wrap = $("vif-list");
        if (wrap) {
          wrap.innerHTML = '<div class="pa-empty">Nie udało się wczytać identyfikatorów: ' + esc(err && err.message ? err.message : "błąd połączenia") + "</div>";
        }
        return null;
      });
  }

  function renderVisitorProfile(p) {
    var card = $("vif-profile-card");
    var host = $("vif-profile");
    var title = $("vif-profile-title");
    var sub = $("vif-profile-sub");
    if (!card || !host) return;
    card.hidden = false;
    if (card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });

    if (!p || typeof p !== "object") {
      host.innerHTML = '<div class="pa-empty">Nie udało się wczytać profilu tej osoby.</div>';
      return;
    }
    if (title) {
      var sameLabel = p.username && String(p.label) === String(p.username);
      title.innerHTML = "#" + esc(p.label || "----") +
        (p.username && !sameLabel ? " → <strong>" + esc(p.username) + "</strong>" : (p.username ? "" : " → Gość")) +
        (p.is_bot ? ' <span class="vif-badge vif-badge-bot">🤖 bot</span>' : "") +
        (p.frozen && !p.is_bot ? ' <span class="vif-badge vif-badge-frozen">❄ zamrożony</span>' : "");
    }
    if (sub) {
      sub.innerHTML =
        (p.via === "account" ? "identyfikacja po nazwie konta — łączy wszystkie urządzenia" :
         p.via === "fp" ? "identyfikacja pełnym odciskiem przeglądarki" :
         p.via === "browser" ? "identyfikacja przybliżona (IP + przeglądarka)" :
         "identyfikacja wyłącznie po sesji") +
        " · pierwszy kontakt: " + esc(relTime(p.first_seen_at)) +
        " · ostatnio: " + esc(relTime(p.last_seen_at));
    }

    var trail = Array.isArray(p.trail) ? p.trail.slice() : [];
    var actions = Array.isArray(p.actions) ? p.actions.slice() : [];
    var subs = Array.isArray(p.submissions) ? p.submissions : [];
    var posts = Array.isArray(p.posts) ? p.posts : [];
    var comments = Array.isArray(p.comments) ? p.comments : [];
    trail.reverse(); /* oś czasu rosnąco */

    var kpiHtml =
      '<div class="vif-kpis">' +
        '<span class="pa-time-chip" title="Nowa wizyta po przerwie dłuższej niż 30 minut">🚪 ' + fmt(p.visits) + " wejść</span>" +
        '<span class="pa-time-chip">📄 ' + fmt(p.pages) + " podstron</span>" +
        '<span class="pa-time-chip">🖱 ' + fmt(p.action_count) + " akcji</span>" +
        '<span class="pa-time-chip">📨 ' + fmt(subs.length) + " zgłoszeń</span>" +
        '<span class="pa-time-chip">👍 ' + fmt(p.votes) + " głosów</span>" +
        '<span class="pa-time-chip">📝 ' + fmt(posts.length) + " wpisów · 💬 " + fmt(comments.length) + " komentarzy</span>" +
      "</div>";

    /* Trwała pamięć: osoba × dzień (podstrony + godzina wejścia) */
    var dayLog = Array.isArray(p.day_log) ? p.day_log : [];
    var dayLogHtml = buildDayLogHtml(dayLog, new Date().toISOString().slice(0, 10));

    /* Ścieżka hop po hopie — celowo tylko z dzisiaj (starsze trasy nie są zapisywane) */
    var trailHtml = trail.length
      ? '<div class="vif-section"><h3 class="vif-h">Ścieżka z dziś (hop po hopie)</h3>' +
        trailTimelineHtml(trail, {}) + "</div>"
      : "";

    var actionsHtml = actions.length
      ? '<div class="vif-section"><h3 class="vif-h">Kliknięcia i akcje' +
        (actions.length > 60 ? ' <span class="vif-h-note mono">(ostatnie 60 z ' + fmt(p.action_count) + ")</span>" : "") +
        '</h3><div class="pa-actions-list vif-actions">' +
        actions.slice(0, 60).map(function (a) {
          return (
            '<div class="pa-action">' +
              '<span class="pa-action-icon" aria-hidden="true">' + actionIcon(a.kind) + "</span>" +
              '<span class="pa-action-text">' + esc(a.target || "") + "</span>" +
              (a.project ? '<span class="pa-event-proj">' + esc(a.project) + "</span>" : "") +
              '<span class="pa-action-time mono">' + esc(clockTime(a.at)) + " · " + esc(relTime(a.at)) + "</span>" +
            "</div>"
          );
        }).join("") + "</div></div>"
      : "";

    var subsHtml = subs.length
      ? '<div class="vif-section"><h3 class="vif-h">Zgłoszenia na tablicę</h3><div class="vif-subs">' +
        subs.map(function (it) {
          return (
            '<div class="vif-sub">' +
              '<span class="vif-sub-type">' + (it.type === "idea" ? "💡" : "🐞") + "</span>" +
              '<span class="vif-sub-title">' + esc(it.title || "") + "</span>" +
              '<span class="pa-time-chip">' + esc(it.status || "") + "</span>" +
              '<span class="pa-time-chip">👍 ' + fmt(it.votes) + "</span>" +
              '<span class="pa-event-proj">' + esc(it.project || "") + "</span>" +
              '<span class="pa-event-time">' + esc(relTime(it.at)) + "</span>" +
            "</div>"
          );
        }).join("") + "</div></div>"
      : "";

    var commHtml = (posts.length || comments.length)
      ? '<div class="vif-section"><h3 class="vif-h">Aktywność w społeczności</h3><div class="vif-comm">' +
        posts.map(function (p2) {
          return (
            '<div class="vif-comm-item"><span class="pa-action-icon">📝</span>' +
              '<span class="vif-comm-text">' + esc(p2.content || "") + "</span>" +
              '<span class="pa-time-chip">❤ ' + fmt(p2.likes) + "</span>" +
              '<span class="pa-event-time">' + esc(relTime(p2.at)) + "</span>" +
            "</div>"
          );
        }).join("") +
        comments.map(function (c) {
          return (
            '<div class="vif-comm-item"><span class="pa-action-icon">💬</span>' +
              '<span class="vif-comm-text">' + esc(c.content || "") + "</span>" +
              '<span class="pa-event-time">' + esc(relTime(c.at)) + "</span>" +
            "</div>"
          );
        }).join("") + "</div></div>"
      : "";

    var emptyHtml = (!dayLog.length && !trail.length && !actions.length && !subs.length && !posts.length && !comments.length)
      ? '<div class="pa-empty">Ta osoba nie zostawiła jeszcze żadnego śladu w wybranym okresie.</div>'
      : "";

    host.innerHTML = kpiHtml + dayLogHtml + trailHtml + actionsHtml + subsHtml + commHtml + emptyHtml;
    visitorProfileShownId = p.id || null;
  }

  var visitorProfileShownId = null;

  function fetchVisitorProfile(id, opts) {
    opts = opts || {};
    if (!panelActive || !window.RejsonCloud || !window.RejsonCloud.rpc) return;
    var host = $("vif-profile");
    var card = $("vif-profile-card");
    if (card) card.hidden = false;
    /* przy cichym odświeżaniu / ponownej próbie nie mrygamy loaderem */
    if (host && !opts.quiet) host.innerHTML = '<div class="pa-empty">Ładowanie profilu…</div>';
    var daysEl = $("vif-days");
    var days = daysEl ? Number(daysEl.value) || 7 : 7;
    window.RejsonCloud.rpc("admin_visitor_profile", { p_id: id, p_days: days }, true)
      .then(function (data) { renderVisitorProfile(data); })
      .catch(function (err) {
        /* jeden automatyczny retry po chwili — mobilna sieć potrafi przyciąć pojedynczy request */
        if (!opts.retried) {
          setTimeout(function () { fetchVisitorProfile(id, { quiet: true, retried: true }); }, 1600);
          return;
        }
        /* jeśli profil był już wyświetlony — zostawiamy stare dane zamiast komunikatu */
        if (visitorProfileShownId === id && host && host.innerHTML.trim() !== "") return;
        if (host) {
          host.innerHTML = '<div class="pa-empty">Nie udało się wczytać profilu: ' +
            esc(err && err.message ? err.message : "błąd połączenia") + "</div>";
        }
      });
  }

  function bindVisitorsTab() {
    var list = $("vif-list");
    var search = $("vif-search");
    var days = $("vif-days");
    var back = $("vif-back");

    if (list) {
      list.addEventListener("click", function (e) {
        var row = e.target && e.target.closest ? e.target.closest("[data-vpid]") : null;
        if (!row) return;
        visitorOpenId = row.getAttribute("data-vpid");
        renderVisitorList();
        fetchVisitorProfile(visitorOpenId);
      });
    }
    if (search) {
      search.addEventListener("input", function () {
        visitorFilter = search.value || "";
        renderVisitorList();
      });
    }
    if (days) {
      days.addEventListener("change", function () {
        fetchVisitorList();
        if (visitorOpenId) fetchVisitorProfile(visitorOpenId);
      });
    }
    if (back) {
      back.addEventListener("click", function () {
        visitorOpenId = null;
        visitorProfileShownId = null;
        var card = $("vif-profile-card");
        if (card) card.hidden = true;
        renderVisitorList();
      });
    }

    /* skok do profilu po wpisanym identyfikatorze lub nazwie konta */
    var gotoIn = $("vif-goto-id");
    var gotoBtn = $("vif-goto-btn");
    function openTypedProfile() {
      var raw = gotoIn ? String(gotoIn.value || "").trim() : "";
      var id = normalizePersonIdInput(raw);
      if (!id) { if (gotoIn) gotoIn.focus(); return; }
      visitorOpenId = id;
      renderVisitorList();
      if (!visitorListData.length) fetchVisitorList();
      fetchVisitorProfile(id);
    }
    if (gotoBtn) gotoBtn.addEventListener("click", openTypedProfile);
    if (gotoIn) {
      gotoIn.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); openTypedProfile(); }
      });
    }
  }

  /* Normalizacja ręcznie wpisanego ID: #1234 → fp:, nazwa → u:, prefiksy bez zmian */
  function normalizePersonIdInput(raw) {
    var s = String(raw || "").replace(/^#/, "").trim();
    if (!s) return null;
    var m = s.match(/^(u|fp|ch|sk):(.+)$/i);
    if (m) return m[1].toLowerCase() + ":" + m[2].trim();
    if (/^\d{4}$/.test(s)) return "fp:" + s;
    if (/^[0-9a-f]{8,64}$/i.test(s)) return "ch:" + s.toLowerCase();
    return "u:" + s;
  }

  /* ---------- Karta osoby na żywo → pełny profil w zakładce Identyfikatory
     (ta sama tożsamość po person_id, więc obie widoki są zsynchronizowane) ---------- */
  function openPersonProfile(id) {
    if (!id) return;
    var tabBtn = $("tab-btn-visitors");
    if (tabBtn && !tabBtn.classList.contains("is-active")) tabBtn.click();
    visitorOpenId = id;
    renderVisitorList();
    if (!visitorListData.length) fetchVisitorList();
    fetchVisitorProfile(id);
  }

  function bindLiveProfileOpen() {
    var wrap = $("pa-visitors");
    if (!wrap) return;
    wrap.addEventListener("click", function (e) {
      var card = e.target && e.target.closest ? e.target.closest("[data-person]") : null;
      if (!card) return;
      openPersonProfile(card.getAttribute("data-person"));
    });
  }

  /* ---------- Ręczne odświeżanie sekcji — kółko ⟳ przy nagłówkach ---------- */
  var REFRESH_ACTIONS = {
    activity: function () { return fetchAdminActivity(); },
    stats: function () { return fetchDailyStats(); },
    community: function () { return fetchCommunity(); },
    visitors: function () {
      return Promise.resolve(fetchVisitorList()).then(function () {
        if (visitorOpenId) fetchVisitorProfile(visitorOpenId, { quiet: true });
        return null;
      });
    }
  };

  function bindRefreshButtons() {
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".adm-refresh") : null;
      if (!btn || btn.disabled) return;
      var fn = REFRESH_ACTIONS[btn.getAttribute("data-refresh") || ""];
      if (!fn) return;
      btn.disabled = true;
      btn.classList.add("is-spinning");
      Promise.resolve(fn())
        .catch(function () { /* komunikat błędu wyświetla sekcja */ })
        .finally(function () {
          btn.classList.remove("is-spinning");
          btn.disabled = false;
        });
    });
  }

  /* ---------- Start ---------- */
  function boot() {
    bindTabs();
    bindAuthForm();
    bindLogout();
    bindCommunityModeration();
    bindAccountManagement();
    bindVisitorsTab();
    bindLiveProfileOpen();
    bindRefreshButtons();

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && panelActive) {
        fetchAdminActivity();
      }
    });

    /* Odliczanie „za N s” przy liczniku aktualizacji */
    countdownTimer = setInterval(function () {
      var updated = $("act-updated");
      if (!updated || !panelActive || !lastFetchAt) return;
      var elapsed = Math.floor((Date.now() - lastFetchAt) / 1000);
      var cycle = REFRESH_MS / 1000;
      var left = Math.max(0, cycle - (elapsed % cycle));
      var base = updated.textContent.replace(/ · za \d+ s$/, "");
      updated.textContent = base + " · za " + left + " s";
    }, 1000);

    var session = null;
    try {
      session = window.RejsonCloud && window.RejsonCloud.getStoredSession
        ? window.RejsonCloud.getStoredSession()
        : null;
    } catch (e) { /* ignorujemy */ }

    if (session && session.access_token) {
      verifyAdmin().then(function (ok) {
        if (ok) {
          showPanel();
        } else {
          try { window.RejsonCloud.setStoredSession(null); } catch (e) { /* ignorujemy */ }
          showAuth();
        }
      });
    } else {
      showAuth();
    }
  }

  /* Podgląd kawałka renderowania dla testów (strona admina i tak jest za logowaniem). */
  window.__rjAdmin = { buildDayLogHtml: buildDayLogHtml, dayLabel: dayLabel, prettySlug: prettySlug };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window, document);

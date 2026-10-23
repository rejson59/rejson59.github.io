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

  var REFRESH_MS = 8000;
  var PRESENCE_WINDOW = 90;
  var SITE_SLUG = "rejson59.github.io";

  var numFmt = new Intl.NumberFormat("pl-PL");
  var refreshTimer = null;
  var panelActive = false;

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

  /* ---------- Zakładki ---------- */
  var TAB_IDS = {
    activity: "tab-activity",
    submissions: "tab-submissions",
    community: "tab-community"
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
    if (!wrap) return;

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
    if (!wrap) return;

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
      return (
        '<div class="adm-online-user">' +
          '<span class="adm-dot" aria-hidden="true"></span>' +
          '<span class="commp-avatar" aria-hidden="true">' + esc(name.charAt(0).toUpperCase()) + "</span>" +
          '<span class="commp-name">' + esc(name) + (isOwner ? ownerBadge(true) : "") + "</span>" +
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

  /* ---------- Odwiedzający na żywo (identyfikator + ścieżka + akcje) ---------- */
  function renderVisitors(visitors) {
    var wrap = $("pa-visitors");
    if (!wrap) return;

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
          trail.map(function (step, idx) {
            var isLatest = idx === trail.length - 1;
            return (
              '<span class="pa-trail-step' + (isLatest ? " is-latest" : "") + '">' +
                '<span class="pa-trail-slug">' + esc(step.slug) + "</span>" +
                '<span class="pa-trail-time">' + esc(clockTime(step.at).slice(0, 5)) + "</span>" +
              "</span>" +
              (isLatest ? "" : '<span class="pa-trail-arrow">→</span>')
            );
          }).join("") +
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
        '<div class="pa-visitor">' +
          '<div class="pa-visitor-head">' +
            '<span class="pa-fp mono" title="Trwały identyfikator przeglądarki — przeżywa wyczyszczenie danych strony">#' + esc(fp) + "</span>" +
            whoLabel(v.username, fp, v.is_owner) +
            '<span class="pa-visitor-meta">' +
              '<span class="pa-time-chip">🟢 online ' + esc(relTime(v.last_seen_at)) + "</span>" +
              '<span class="pa-time-chip">⏱ na stronach: ' + esc(fmtDuration(secs)) + "</span>" +
            "</span>" +
          "</div>" +
          openHtml +
          trailHtml +
          actionsHtml +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Globalny strumień kliknięć ---------- */
  function renderClicks(clicks) {
    var wrap = $("pa-clicks");
    if (!wrap) return;

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
    if (!wrap) return;

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
    var now = new Date();
    var hh = ("0" + now.getHours()).slice(-2);
    var mm = ("0" + now.getMinutes()).slice(-2);
    var ss = ("0" + now.getSeconds()).slice(-2);
    updated.textContent = "ostatnia aktualizacja: " + hh + ":" + mm + ":" + ss;
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
                  '<span class="commp-name">' + esc(u.username) + ownerBadge(u.is_owner) + "</span>" +
                "</span>" +
                '<span class="commp-user-stats">' +
                  '<span class="pa-time-chip">📝 ' + fmt(u.posts_count) + "</span>" +
                  '<span class="pa-time-chip">💬 ' + fmt(u.comments_count) + "</span>" +
                  '<span class="pa-time-chip">❤ ' + fmt(u.likes_received) + "</span>" +
                  '<span class="pa-time-chip">dołączył(a): ' + esc(relTime(u.created_at)) + "</span>" +
                "</span>" +
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
                  '<span class="commp-name">' + esc(p.author_name) + ownerBadge(p.is_owner) + "</span>" +
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
    fetchAdminActivity();
    fetchCommunity();
    refreshTimer = setInterval(function () {
      if (document.visibilityState === "visible") {
        fetchAdminActivity();
        fetchCommunity();
      }
    }, REFRESH_MS);
  }

  function stopRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  /* ---------- Start ---------- */
  function boot() {
    bindTabs();
    bindAuthForm();
    bindLogout();
    bindCommunityModeration();

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && panelActive) {
        fetchAdminActivity();
      }
    });

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window, document);

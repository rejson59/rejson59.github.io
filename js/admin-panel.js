/*!
 * Główny Panel Admina — logowanie (ten sam e-mail i hasło co w panelu zgłoszeń),
 * zakładki oraz szczegółowa aktywność na żywo:
 * odwiedzający z trwałym 4-cyfrowym identyfikatorem przeglądarki,
 * ich ścieżki kroków (do 24 h) i strumień zdarzeń ze wszystkich projektów.
 * Dane pochodzą z admin-only RPC public.get_admin_activity (Supabase).
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

  /* ---------- Płynna animacja liczby do nowej wartości ---------- */
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

    if (reduceMotion || prev === target) {
      finish(target);
      return;
    }

    el.classList.remove("act-bump");
    void el.offsetWidth;
    el.classList.add("act-bump");

    var duration = 650;
    var startTs = null;
    function step(ts) {
      if (!startTs) startTs = ts;
      var p = Math.min(1, (ts - startTs) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      var cur = Math.round(prev + (target - prev) * eased);
      el.textContent = fmt(cur);
      if (p < 1) {
        el._raf = requestAnimationFrame(step);
      } else {
        finish(target);
        el._raf = null;
      }
    }
    el._raf = requestAnimationFrame(step);
  }

  /* ---------- Czas względny po polsku ---------- */
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
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  /* Czas przebywania: "3 min 48 s" / "1 godz. 12 min" */
  function fmtDuration(seconds) {
    var s = Math.max(0, Number(seconds) || 0);
    if (s < 60) return s + " s";
    var m = Math.floor(s / 60);
    if (m < 60) return m + " min " + (s % 60) + " s";
    var h = Math.floor(m / 60);
    return h + " godz. " + (m % 60) + " min";
  }

  /* ---------- Zakładki ---------- */
  function bindTabs() {
    var btns = document.querySelectorAll(".admin-tab");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var tab = btn.getAttribute("data-tab");
          for (var j = 0; j < btns.length; j++) {
            var active = btns[j] === btn;
            btns[j].classList.toggle("is-active", active);
            btns[j].setAttribute("aria-selected", active ? "true" : "false");
          }
          var actEl = $("tab-activity");
          var subEl = $("tab-submissions");
          if (actEl) actEl.hidden = tab !== "activity";
          if (subEl) subEl.hidden = tab !== "submissions";
        });
      })(btns[i]);
    }
  }

  /* ---------- Widoki: logowanie / panel ---------- */
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
      .then(function (status) {
        return Boolean(status && status.is_admin);
      })
      .catch(function () {
        return false;
      });
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
          /* Pełne przeładowanie — panel zgłoszeń też wejdzie z aktywną sesją */
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
      try {
        window.RejsonCloud.setStoredSession(null);
      } catch (e) { /* ignorujemy */ }
      window.location.reload();
    });
  }

  /* ---------- Render: histogram otwartych stron ---------- */
  function renderHistogram(histo) {
    var wrap = $("act-histogram");
    if (!wrap) return;

    var keys = Object.keys(histo || {}).filter(function (k) {
      return (Number(histo[k]) || 0) > 0;
    });
    keys.sort(function (a, b) { return Number(a) - Number(b); });

    if (!keys.length) {
      wrap.innerHTML = '<span class="act-histogram-empty">Nikt nie jest teraz online — odwiedź stronę, a pojawią się dane.</span>';
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
          '<span class="act-histo-chip' + (multi ? " is-multi" : "") + '">' +
            "<strong>" + pages + (pages === 1 ? " strona" : " strony") + "</strong> — " +
            ppl + " " + osobaWord(ppl) +
          "</span>"
        );
      })
      .join("");
  }

  /* ---------- Render: zalogowani użytkownicy Społeczności ---------- */
  function renderIdentified(users) {
    var wrap = $("act-users");
    if (!wrap) return;

    if (!Array.isArray(users) || !users.length) {
      wrap.innerHTML =
        '<span class="act-histogram-empty">Brak zalogowanych użytkowników online.</span>';
      return;
    }

    wrap.innerHTML = users.map(function (u) {
      var name = String(u.username || "?");
      var initial = name.charAt(0).toUpperCase();
      var projects = Array.isArray(u.projects) ? u.projects : [];
      var projHtml = projects
        .map(function (slug) {
          var isPage = String(slug).toLowerCase() === SITE_SLUG;
          return '<span class="act-user-proj' + (isPage ? " is-page" : "") + '">' + esc(slug) + "</span>";
        })
        .join("");
      return (
        '<div class="act-user">' +
          '<span class="act-user-name"><span class="act-user-avatar" aria-hidden="true">' + esc(initial) + "</span>" + esc(name) + "</span>" +
          '<span class="act-user-sep">przegląda teraz:</span>' +
          '<span class="act-user-projects">' + (projHtml || '<span class="act-user-proj">—</span>') + "</span>" +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Render: odwiedzający na żywo z identyfikatorami i ścieżkami ---------- */
  function renderVisitors(visitors) {
    var wrap = $("pa-visitors");
    if (!wrap) return;

    if (!Array.isArray(visitors) || !visitors.length) {
      wrap.innerHTML =
        '<div class="pa-empty">Nikt nie jest teraz online — jak tylko ktoś wejdzie na stronę lub do projektu, zobaczysz go tutaj ze swoim identyfikatorem i trasą.</div>';
      return;
    }

    wrap.innerHTML = visitors.map(function (v) {
      var fp = String(v.fingerprint_id || "----");
      var username = v.username ? String(v.username) : null;
      var secs = Number(v.seconds_active) || 0;
      var openProjects = Array.isArray(v.open_projects) ? v.open_projects : [];
      var trail = Array.isArray(v.trail) ? v.trail.slice() : [];
      /* ścieżka w bazie od najnowszej — do wyświetlenia odwracamy od najstarszej */
      trail.reverse();

      var whoHtml = username
        ? '<span class="pa-who"><span class="act-user-avatar" aria-hidden="true">' + esc(username.charAt(0).toUpperCase()) + "</span>" + esc(username) + "</span>"
        : '<span class="pa-who" style="color:var(--muted)">Gość (niezalogowany)</span>';

      var openHtml = openProjects.length
        ? '<div class="pa-open-projects"><span>Otwarte teraz:</span>' +
          openProjects.map(function (slug) {
            var isPage = String(slug).toLowerCase() === SITE_SLUG;
            return '<span class="act-user-proj' + (isPage ? " is-page" : "") + '">' + esc(slug) + "</span>";
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
                '<span class="pa-trail-time">' + esc(clockTime(step.at)) + "</span>" +
              "</span>" +
              (isLatest ? "" : '<span class="pa-trail-arrow">→</span>')
            );
          }).join("") +
          "</div>"
        : "";

      return (
        '<div class="pa-visitor">' +
          '<div class="pa-visitor-head">' +
            '<span class="pa-fp mono" title="Trwały identyfikator przeglądarki — przeżywa wyczyszczenie danych strony">#' + esc(fp) + "</span>" +
            whoHtml +
            '<span class="pa-visitor-meta">' +
              '<span class="pa-time-chip">🟢 online ' + esc(relTime(v.last_seen_at)) + "</span>" +
              '<span class="pa-time-chip">⏱ na stronach: ' + esc(fmtDuration(secs)) + "</span>" +
            "</span>" +
          "</div>" +
          openHtml +
          trailHtml +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Render: strumień zdarzeń ---------- */
  var EVENT_ICONS = {
    feedback: "💡",
    like: "❤",
    post: "📝",
    comment: "💬"
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
            '<span class="pa-event-who">' + esc(ev.who || "Anonim") + "</span>" +
            '<span class="pa-event-text">' + esc(ev.text || "") + "</span>" +
            proj +
          "</span>" +
          '<span class="pa-event-time">' + esc(relTime(ev.at)) + "</span>" +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Render: wiersze projektów ---------- */
  function rowHTML(p) {
    var online = Number(p.online) || 0;
    var today = Number(p.views_today) || 0;
    var isSite = String(p.project_slug).toLowerCase() === SITE_SLUG;
    return (
      '<div class="act-row' + (isSite ? " is-site" : "") + '" role="row">' +
        '<span class="act-proj-name" role="cell">' +
          (online > 0 ? '<span class="online-aura-dot" aria-hidden="true"></span>' : "") +
          '<span class="act-proj-slug">' + esc(p.project_slug) + "</span>" +
        "</span>" +
        '<span class="act-col-num act-online' + (online > 0 ? " is-live" : " act-dim") + '" role="cell" data-label="Online">' + fmt(online) + "</span>" +
        '<span class="act-col-num act-today" role="cell" data-label="Kliknięcia dziś">' + fmt(today) + "</span>" +
        '<span class="act-col-num act-dim" role="cell" data-label="Wejścia łącznie">' + fmt(p.views_total) + "</span>" +
        '<span class="act-col-num act-dim" role="cell" data-label="Unikalne osoby">' + fmt(p.unique_visitors) + "</span>" +
        '<span class="act-col-num act-rel" role="cell" data-label="Ostatnia aktywność">' + relTime(p.last_viewed_at) + "</span>" +
      "</div>"
    );
  }

  /* ---------- Główny render ---------- */
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
          /* Sesja wygasła — wracamy do ekranu logowania */
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
    refreshTimer = setInterval(function () {
      if (document.visibilityState === "visible") {
        fetchAdminActivity();
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

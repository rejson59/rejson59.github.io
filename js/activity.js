/*!
 * Aktywność na żywo — szczegółowe statystyki strony i projektów
 * Pobiera dane z RPC public.get_activity_overview (Supabase) co 8 sekund.
 */
(function (window, document) {
  "use strict";

  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

  var REFRESH_MS = 8000;
  var SITE_SLUG = "rejson59.github.io";

  var numFmt = new Intl.NumberFormat("pl-PL");
  var lastData = null;
  var refreshTimer = null;

  function fmt(n) {
    return numFmt.format(Math.max(0, Number(n) || 0));
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  /* ---------- Render wierszy projektów ---------- */
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

  function renderIdentified(users) {
    var wrap = document.getElementById("act-users");
    if (!wrap) return;

    if (!Array.isArray(users) || !users.length) {
      wrap.innerHTML =
        '<span class="act-histogram-empty">Brak zalogowanych użytkowników online — zaloguj się w Społeczności, a pojawisz się tutaj ze swoimi otwartymi stronami.</span>';
      return;
    }

    wrap.innerHTML = users.map(function (u) {
      var name = String(u.username || "?");
      var initial = (name.trim().charAt(0) || "?").toUpperCase();
      var projects = Array.isArray(u.projects) ? u.projects : [];
      var projHtml = projects
        .map(function (slug) {
          var isPage = String(slug).toLowerCase() === SITE_SLUG.toLowerCase();
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

  function renderHistogram(histo) {
    var wrap = document.getElementById("act-histogram");
    var emptyEl = document.getElementById("act-histogram-empty");
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

  function render(data) {
    if (!data || typeof data !== "object") return;
    var totals = data.totals || {};
    var multi = data.multi || {};
    var projects = Array.isArray(data.projects) ? data.projects : [];

    animateNum(document.getElementById("kpi-online"), totals.online_total);
    animateNum(document.getElementById("kpi-views-today"), totals.views_today_total);
    animateNum(document.getElementById("kpi-multi"), multi.multi_project_visitors);
    animateNum(document.getElementById("kpi-max-open"), multi.max_open_projects);
    animateNum(document.getElementById("kpi-views-total"), totals.views_total);
    animateNum(document.getElementById("kpi-unique-total"), totals.unique_visitors_total);

    var multiCard = document.getElementById("kpi-multi-card");
    if (multiCard) {
      multiCard.classList.toggle("is-hot", (Number(multi.multi_project_visitors) || 0) > 0);
    }

    renderHistogram(multi.open_projects_histogram);
    renderIdentified(data.identified_users);

    var rows = document.getElementById("act-rows");
    if (rows) {
      var html = projects.map(rowHTML).join("");
      if (rows.innerHTML !== html) rows.innerHTML = html;
    }

    var updated = document.getElementById("act-updated");
    if (updated) {
      var now = new Date();
      var hh = ("0" + now.getHours()).slice(-2);
      var mm = ("0" + now.getMinutes()).slice(-2);
      var ss = ("0" + now.getSeconds()).slice(-2);
      updated.textContent = "ostatnia aktualizacja: " + hh + ":" + mm + ":" + ss;
    }
  }

  /* ---------- Pobieranie danych ---------- */
  function fetchActivity() {
    if (!window.fetch) return Promise.resolve(null);
    return fetch(SUPABASE_URL + "/rest/v1/rpc/get_activity_overview", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_window_seconds: 90 }),
      cache: "no-store"
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        lastData = data;
        render(data);
        return data;
      })
      .catch(function () {
        var updated = document.getElementById("act-updated");
        if (updated && !lastData) {
          updated.textContent = "nie udało się pobrać danych — ponawiam…";
        }
        return null;
      });
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (document.visibilityState === "visible") fetchActivity();
    }, REFRESH_MS);
  }

  /* ---------- Motyw jasny/ciemny ---------- */
  function setupTheme() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) { /* ignorujemy */ }
    });
  }

  function init() {
    setupTheme();
    fetchActivity();
    scheduleRefresh();

    var refreshBtn = document.getElementById("act-refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        fetchActivity();
      });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") fetchActivity();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);

/*!
 * Rejson59 Live View, Click & Online Presence Tracker
 * (Supabase Realtime + 15-min Anti-Spam Cooldown + Live Online Presence)
 * Działa zarówno na stronie głównej https://rejson59.github.io/, jak i po podpięciu
 * bezpośrednio na dowolnej podstronie projektu:
 * <script src="https://rejson59.github.io/js/view-tracker.js" defer></script>
 */
(function (window, document) {
  "use strict";

  if (window.RejsonViews) return;

  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

  var SITE_SLUG = "rejson59.github.io";
  var COOLDOWN_SECONDS = 900; /* 15 minut blokady czasowej przed nabijaniem odświeżeń */
  var PRESENCE_WINDOW_SECONDS = 90; /* aktywne osoby na stronie w oknie 90 sekund */
  var VISITOR_KEY = "rejson_views_visitor_id_v1";
  var SESSION_KEY = "rejson_views_session_id_v1";
  var COOLDOWN_PREFIX = "rejson_views_cd_v1:";
  var CACHE_COUNTS_KEY = "rejson_views_counts_cache_v1";

  var countsMap = {}; /* lower(slug) -> { slug, views, unique, viewsToday } */
  var onlineMap = {}; /* lower(slug) -> number of active online users */
  var canonicalSlugMap = {}; /* lower(slug) -> canonicalSlug */
  var currentActiveSlug = SITE_SLUG;
  var subscribers = [];
  var ws = null;
  var wsHeartbeat = null;
  var wsReconnectTimer = null;
  var presenceDebounceTimer = null;
  var bc = null;

  try {
    if ("BroadcastChannel" in window) {
      bc = new BroadcastChannel("rejson_views_live_v1");
      bc.onmessage = function (ev) {
        if (!ev || !ev.data) return;
        if (ev.data.slug != null && typeof ev.data.views === "number") {
          applyCountUpdate(
            ev.data.slug,
            ev.data.views,
            ev.data.unique,
            true,
            typeof ev.data.viewsToday === "number" ? ev.data.viewsToday : undefined
          );
        }
        if (ev.data.onlineMap && typeof ev.data.onlineMap === "object") {
          applyOnlineMap(ev.data.onlineMap);
        }
        if (typeof ev.data.totalOnline === "number") {
          applyTotalOnline(ev.data.totalOnline, true);
        }
      };
    }
  } catch (e) { /* BroadcastChannel opcjonalny */ }

  /* ---------- Identyfikator odwiedzającego oraz sesji ---------- */
  function randomHex(bytes) {
    var out = "";
    if (window.crypto && window.crypto.getRandomValues) {
      var arr = new Uint8Array(bytes);
      window.crypto.getRandomValues(arr);
      for (var i = 0; i < arr.length; i++) {
        out += ("0" + arr[i].toString(16)).slice(-2);
      }
    } else {
      out = Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
    return out;
  }

  function getVisitorId() {
    var id = "";
    try {
      id = localStorage.getItem(VISITOR_KEY) || "";
      if (!id || id.length < 16) {
        var screenSig = [
          (window.screen && window.screen.width) || 0,
          (window.screen && window.screen.height) || 0,
          (window.screen && window.screen.colorDepth) || 0,
          Intl.DateTimeFormat().resolvedOptions().timeZone || ""
        ].join("x");
        id = "rv1_" + randomHex(16) + "_" + screenSig.replace(/[^a-zA-Z0-9_-]/g, "");
        localStorage.setItem(VISITOR_KEY, id);
      }
    } catch (e) {
      id = "rv1_fallback_" + [
        (window.screen && window.screen.width) || 0,
        (window.screen && window.screen.height) || 0,
        navigator.language || "pl"
      ].join("_");
    }
    return id;
  }

  function getSessionId() {
    var sid = "";
    try {
      sid = sessionStorage.getItem(SESSION_KEY) || "";
      if (!sid || sid.length < 12) {
        sid = getVisitorId() + "_tab_" + randomHex(6);
        sessionStorage.setItem(SESSION_KEY, sid);
      }
    } catch (e) {
      sid = getVisitorId();
    }
    return sid;
  }

  function isLocalCooldownActive(slug) {
    var key = COOLDOWN_PREFIX + String(slug || "").toLowerCase();
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return false;
      var ts = parseInt(raw, 10);
      if (isNaN(ts)) return false;
      return (Date.now() - ts) < (COOLDOWN_SECONDS * 1000);
    } catch (e) {
      return false;
    }
  }

  function markLocalCooldown(slug, seconds) {
    var key = COOLDOWN_PREFIX + String(slug || "").toLowerCase();
    var ttl = typeof seconds === "number" && seconds > 0 ? seconds : COOLDOWN_SECONDS;
    try {
      var effectiveStart = Date.now() - ((COOLDOWN_SECONDS - ttl) * 1000);
      localStorage.setItem(key, String(effectiveStart));
    } catch (e) { /* ignorujemy */ }
  }

  /* ---------- Dzień dzisiejszy wg strefy Europe/Warsaw (licznik "kliknięcia dziś") ---------- */
  function todayWarsawDateStr(dateObj) {
    var now = dateObj instanceof Date ? dateObj : new Date();
    try {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Warsaw",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(now);
      var y = "", m = "", d = "";
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === "year") y = parts[i].value;
        else if (parts[i].type === "month") m = parts[i].value;
        else if (parts[i].type === "day") d = parts[i].value;
      }
      if (y && m && d) return y + "-" + m + "-" + d;
    } catch (e) { /* fallback poniżej */ }
    return now.toISOString().slice(0, 10);
  }

  /* ---------- Cache stanu liczników w localStorage (natychmiastowy start) ---------- */
  function loadCachedCounts() {
    try {
      var raw = localStorage.getItem(CACHE_COUNTS_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        var cacheDate = typeof parsed.__cacheDate === "string" ? parsed.__cacheDate : "";
        var today = todayWarsawDateStr();
        Object.keys(parsed).forEach(function (k) {
          var item = parsed[k];
          if (item && typeof item.views === "number") {
            countsMap[k.toLowerCase()] = {
              slug: item.slug || k,
              views: item.views,
              unique: item.unique || 0,
              /* Licznik dzienny z cache uznajemy tylko, gdy cache pochodzi z dzisiejszego dnia */
              viewsToday: cacheDate === today ? (Number(item.viewsToday) || 0) : 0
            };
            canonicalSlugMap[k.toLowerCase()] = item.slug || k;
          }
        });
      }
    } catch (e) { /* ignorujemy */ }
  }

  function saveCachedCounts() {
    try {
      var payload = { __cacheDate: todayWarsawDateStr() };
      Object.keys(countsMap).forEach(function (k) {
        var entry = countsMap[k];
        if (entry && typeof entry.views === "number") {
          payload[k] = {
            slug: entry.slug,
            views: entry.views,
            unique: entry.unique || 0,
            viewsToday: entry.viewsToday || 0
          };
        }
      });
      localStorage.setItem(CACHE_COUNTS_KEY, JSON.stringify(payload));
    } catch (e) { /* ignorujemy */ }
  }

  /* ---------- Odczyt i aktualizacja stanu ---------- */
  function getCount(slug) {
    if (!slug) return 0;
    var entry = countsMap[String(slug).toLowerCase()];
    return entry && typeof entry.views === "number" ? entry.views : 0;
  }

  /* Łączna liczba unikalnych osób, które wyświetliły dany projekt (raz na użytkownika) */
  function getUniqueCount(slug) {
    if (!slug) return 0;
    var entry = countsMap[String(slug).toLowerCase()];
    return entry && typeof entry.unique === "number" ? entry.unique : 0;
  }

  /* Liczba kliknięć / wejść naliczonych dzisiaj (dzień wg czasu polskiego, reset o północy) */
  function getTodayCount(slug) {
    if (!slug) return 0;
    var entry = countsMap[String(slug).toLowerCase()];
    return entry && typeof entry.viewsToday === "number" ? entry.viewsToday : 0;
  }

  function getOnlineCount(slug) {
    if (!slug) return 0;
    var key = String(slug).toLowerCase();
    var count = Number(onlineMap[key]) || 0;
    /* Jeśli użytkownik właśnie przebywa na tej stronie w głównym oknie, zawsze jest min. 1 osoba online */
    if (window.self === window.top && key === String(currentActiveSlug || "").toLowerCase()) {
      return Math.max(1, count);
    }
    return Math.max(0, count);
  }

  var numFmt = new Intl.NumberFormat("pl-PL");
  function fmtViews(n) {
    return numFmt.format(Math.max(0, Number(n) || 0));
  }

  function bumpElement(el) {
    if (!el) return;
    el.classList.remove("is-bumped");
    void el.offsetWidth;
    el.classList.add("is-bumped");
  }

  /* ---------- Płynna animacja naliczania się liczników ---------- */
  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var counterRevealObserver = null;

  function ensureCounterRevealObserver() {
    if (counterRevealObserver || !("IntersectionObserver" in window)) return;
    counterRevealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el._inViewForCounter = true;
        counterRevealObserver.unobserve(el);
        if (typeof el._pendingTargetVal === "number") {
          runCounterAnimation(el, el._pendingTargetVal, false, el._pendingBadgeEl);
        }
      });
    }, { threshold: 0.1 });
  }

  function runCounterAnimation(numEl, targetValue, shouldBump, badgeEl) {
    if (!numEl) return;
    var target = Math.max(0, Number(targetValue) || 0);

    if (reduceMotion) {
      numEl._currentVal = target;
      numEl._targetVal = target;
      numEl._hasAnimatedOnce = true;
      numEl.textContent = fmtViews(target);
      return;
    }

    var firstTime = !numEl._hasAnimatedOnce;
    var prevTarget = typeof numEl._targetVal === "number" ? numEl._targetVal : 0;

    if (!firstTime && prevTarget === target) {
      return;
    }

    var from = firstTime ? 0 : (typeof numEl._currentVal === "number" ? numEl._currentVal : prevTarget);
    numEl._hasAnimatedOnce = true;
    numEl._targetVal = target;

    if (numEl._countRaf) {
      cancelAnimationFrame(numEl._countRaf);
      numEl._countRaf = null;
    }

    if (shouldBump && badgeEl) {
      bumpElement(badgeEl);
    }

    if (firstTime || target > 0 || from !== target) {
      numEl.classList.remove("is-rolling");
      void numEl.offsetWidth;
      numEl.classList.add("is-rolling");
    }

    if (from === target) {
      numEl._currentVal = target;
      numEl.textContent = fmtViews(target);
      return;
    }

    numEl.classList.add("is-counting");
    var diff = Math.abs(target - from);
    var duration = Math.min(960, Math.max(520, Math.round(460 + Math.log10(diff + 1) * 230)));
    var startTs = null;

    function step(ts) {
      if (!startTs) startTs = ts;
      var p = Math.min(1, (ts - startTs) / duration);
      var eased = 1 - Math.pow(1 - p, 4);
      var cur = Math.round(from + (target - from) * eased);
      if (numEl._currentVal !== cur) {
        numEl._currentVal = cur;
        numEl.textContent = fmtViews(cur);
      }
      if (p < 1) {
        numEl._countRaf = requestAnimationFrame(step);
      } else {
        numEl._currentVal = target;
        numEl.textContent = fmtViews(target);
        numEl.classList.remove("is-counting");
        numEl._countRaf = null;
      }
    }

    numEl._countRaf = requestAnimationFrame(step);
  }

  function animateCounterValue(numEl, targetValue, shouldBump, badgeEl, immediate) {
    if (!numEl) return;
    var target = Math.max(0, Number(targetValue) || 0);
    numEl._pendingTargetVal = target;
    numEl._pendingBadgeEl = badgeEl || null;

    if (immediate || numEl._inViewForCounter || !("IntersectionObserver" in window)) {
      numEl._inViewForCounter = true;
      runCounterAnimation(numEl, target, shouldBump, badgeEl);
      return;
    }

    if (!numEl._observedForCounter) {
      numEl._observedForCounter = true;
      ensureCounterRevealObserver();
      counterRevealObserver.observe(numEl);
    }
  }

  function applyCountUpdate(slug, views, unique, animate, viewsToday) {
    if (!slug || typeof views !== "number" || views < 0) return;
    var key = String(slug).toLowerCase();
    var prev = countsMap[key] ? countsMap[key].views : null;
    var canonical = canonicalSlugMap[key] || slug;
    canonicalSlugMap[key] = canonical;

    countsMap[key] = {
      slug: canonical,
      views: views,
      unique: typeof unique === "number" ? unique : (countsMap[key] ? countsMap[key].unique : 0),
      viewsToday: typeof viewsToday === "number" && viewsToday >= 0
        ? viewsToday
        : (countsMap[key] ? (countsMap[key].viewsToday || 0) : 0)
    };

    var changed = prev !== views;
    if (changed) saveCachedCounts();

    updateDOMCounters(canonical, views, animate && prev !== null && views > prev);

    if (changed) {
      subscribers.slice().forEach(function (fn) {
        try { fn(canonical, views, countsMap); } catch (e) { /* ignorujemy */ }
      });
    }
  }

  /* ---------- Łączna liczba unikalnych osób online na całej domenie ---------- */
  var totalOnlineCount = 0;

  function getTotalOnlineCount() {
    /* Jeśli przeglądamy stronę w głównym oknie, na pewno jest min. 1 osoba online */
    if (window.self === window.top) {
      return Math.max(1, totalOnlineCount);
    }
    return totalOnlineCount;
  }

  function applyTotalOnline(n, shouldBump) {
    var num = Math.max(0, Number(n) || 0);
    var changed = num !== totalOnlineCount;
    totalOnlineCount = num;
    var totalEl = document.getElementById("site-total-online-count");
    var totalBadge = document.getElementById("site-total-online-badge");
    if (totalBadge) totalBadge.classList.add("is-ready");
    if (totalEl) {
      animateCounterValue(totalEl, getTotalOnlineCount(), Boolean(shouldBump && changed), totalBadge, true);
    }
  }

  function applyOnlineMap(activeCountsObj) {
    if (!activeCountsObj || typeof activeCountsObj !== "object") return;
    var nextMap = {};
    Object.keys(activeCountsObj).forEach(function (slug) {
      var n = Number(activeCountsObj[slug]) || 0;
      if (n > 0) {
        nextMap[slug.toLowerCase()] = n;
        if (!canonicalSlugMap[slug.toLowerCase()]) {
          canonicalSlugMap[slug.toLowerCase()] = slug;
        }
      }
    });
    onlineMap = nextMap;
    refreshOnlineDOMCounters();
  }

  function updateDOMCounters(slug, views, shouldBump) {
    var key = String(slug || "").toLowerCase();

    /* 1. Główny licznik strony w prawym górnym rogu (kliknięcia dzisiaj) */
    if (key === SITE_SLUG.toLowerCase()) {
      var siteCountEl = document.getElementById("site-views-count");
      var siteBadgeEl = document.getElementById("site-views-badge");
      if (siteBadgeEl) siteBadgeEl.classList.add("is-ready");
      if (siteCountEl) {
        animateCounterValue(siteCountEl, getTodayCount(slug), shouldBump, siteBadgeEl, true);
      }
      var siteUniqueEl = document.getElementById("site-unique-count");
      var siteUniqueBadge = document.getElementById("site-unique-badge");
      if (siteUniqueBadge) siteUniqueBadge.classList.add("is-ready");
      if (siteUniqueEl) {
        animateCounterValue(siteUniqueEl, getUniqueCount(slug), shouldBump, siteUniqueBadge, true);
      }
    }

    /* 2. Liczniki kliknięć (dziś) i unikalnych wyświetleń na kartach projektów */
    var badges = document.querySelectorAll("[data-project-views]");
    for (var i = 0; i < badges.length; i++) {
      var badge = badges[i];
      var bSlug = (badge.getAttribute("data-project-views") || "").toLowerCase();
      if (bSlug === key) {
        var numEl = badge.querySelector(".card-views-num");
        if (numEl) animateCounterValue(numEl, getTodayCount(slug), shouldBump, badge, false);
      }
    }

    var uniqueBadges = document.querySelectorAll("[data-project-unique]");
    for (var u = 0; u < uniqueBadges.length; u++) {
      var uBadge = uniqueBadges[u];
      var uSlug = (uBadge.getAttribute("data-project-unique") || "").toLowerCase();
      if (uSlug === key) {
        var uNumEl = uBadge.querySelector(".card-unique-num");
        if (uNumEl) {
          var uVal = getUniqueCount(slug);
          var uChanged = uBadge._lastUniqueVal !== undefined && uBadge._lastUniqueVal !== uVal;
          uBadge._lastUniqueVal = uVal;
          animateCounterValue(uNumEl, uVal, shouldBump || uChanged, uBadge, false);
        }
      }
    }
  }

  function refreshOnlineDOMCounters() {
    var siteOnlineEl = document.getElementById("site-online-count");
    var siteOnlineBadge = document.getElementById("site-online-badge");
    if (siteOnlineEl) {
      var siteOnline = getOnlineCount(SITE_SLUG);
      var siteChanged = siteOnlineEl._lastOnlineVal !== undefined && siteOnlineEl._lastOnlineVal !== siteOnline;
      siteOnlineEl._lastOnlineVal = siteOnline;
      animateCounterValue(siteOnlineEl, siteOnline, siteChanged, siteOnlineBadge, true);
    }

    var onlineEls = document.querySelectorAll("[data-project-online]");
    for (var i = 0; i < onlineEls.length; i++) {
      var el = onlineEls[i];
      var slug = el.getAttribute("data-project-online") || "";
      var cnt = getOnlineCount(slug);
      var numEl = el.querySelector(".card-online-num");
      var changed = el._lastOnlineVal !== undefined && el._lastOnlineVal !== cnt;
      el._lastOnlineVal = cnt;
      if (numEl) animateCounterValue(numEl, cnt, changed, el, false);
      el.classList.toggle("is-active-now", cnt > 0);
    }

    /* Łączny licznik wszystkich osób online na całej stronie i w projektach */
    var totalEl = document.getElementById("site-total-online-count");
    var totalBadge = document.getElementById("site-total-online-badge");
    if (totalEl) {
      var totalVal = getTotalOnlineCount();
      var totalChanged = totalEl._lastOnlineVal !== undefined && totalEl._lastOnlineVal !== totalVal;
      totalEl._lastOnlineVal = totalVal;
      animateCounterValue(totalEl, totalVal, totalChanged, totalBadge, true);
    }
  }

  function refreshAllDOMCounters() {
    var siteViews = getTodayCount(SITE_SLUG);
    var siteCountEl = document.getElementById("site-views-count");
    var siteBadgeEl = document.getElementById("site-views-badge");
    if (siteCountEl && countsMap[SITE_SLUG.toLowerCase()]) {
      if (siteBadgeEl) siteBadgeEl.classList.add("is-ready");
      animateCounterValue(siteCountEl, siteViews, false, siteBadgeEl, true);
    }

    var siteUniqueEl = document.getElementById("site-unique-count");
    var siteUniqueBadge = document.getElementById("site-unique-badge");
    if (siteUniqueEl && countsMap[SITE_SLUG.toLowerCase()]) {
      if (siteUniqueBadge) siteUniqueBadge.classList.add("is-ready");
      animateCounterValue(siteUniqueEl, getUniqueCount(SITE_SLUG), false, siteUniqueBadge, true);
    }

    var badges = document.querySelectorAll("[data-project-views]");
    for (var i = 0; i < badges.length; i++) {
      var badge = badges[i];
      var slug = badge.getAttribute("data-project-views") || "";
      var numEl = badge.querySelector(".card-views-num");
      if (numEl) {
        animateCounterValue(numEl, getTodayCount(slug), false, badge, false);
      }
    }

    var uniqueBadges = document.querySelectorAll("[data-project-unique]");
    for (var u = 0; u < uniqueBadges.length; u++) {
      var uBadge = uniqueBadges[u];
      var uSlug = uBadge.getAttribute("data-project-unique") || "";
      var uNumEl = uBadge.querySelector(".card-unique-num");
      if (uNumEl) {
        animateCounterValue(uNumEl, getUniqueCount(uSlug), false, uBadge, false);
      }
    }

    refreshOnlineDOMCounters();
  }

  /* ---------- Komunikacja z Supabase (REST + RPC) ---------- */
  function supaHeaders() {
    return {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
  }

  function fetchAllCounts() {
    if (!window.fetch) return Promise.resolve(countsMap);
    return fetch(
      SUPABASE_URL + "/rest/v1/page_views?select=project_slug,views_count,unique_visitors_count,views_today_count,views_today_date",
      {
        method: "GET",
        headers: supaHeaders(),
        cache: "no-store"
      }
    )
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (rows) {
        if (Array.isArray(rows)) {
          var anyChanged = false;
          var todayStr = todayWarsawDateStr();
          rows.forEach(function (r) {
            if (r && r.project_slug) {
              var slug = r.project_slug;
              var views = Number(r.views_count) || 0;
              var unique = Number(r.unique_visitors_count) || 0;
              /* Licznik dzienny obowiązuje tylko, gdy data wiersza to dzisiejszy dzień (czas polski) */
              var viewsToday = r.views_today_date === todayStr
                ? (Number(r.views_today_count) || 0)
                : 0;
              var key = String(slug).toLowerCase();
              var prev = countsMap[key] ? countsMap[key].views : null;
              var prevToday = countsMap[key] ? (countsMap[key].viewsToday || 0) : null;
              var canonical = canonicalSlugMap[key] || slug;
              canonicalSlugMap[key] = canonical;
              countsMap[key] = {
                slug: canonical,
                views: views,
                unique: unique,
                viewsToday: viewsToday
              };
              if (prev !== views || prevToday !== viewsToday) anyChanged = true;
            }
          });
          if (anyChanged) {
            saveCachedCounts();
            refreshAllDOMCounters();
            subscribers.slice().forEach(function (fn) {
              try { fn(SITE_SLUG, getCount(SITE_SLUG), countsMap); } catch (e) { /* ignorujemy */ }
            });
          }
        }
        return countsMap;
      })
      .catch(function () {
        return countsMap;
      });
  }

  function sendPresenceHeartbeat(slug, action) {
    if (!window.fetch || window.self !== window.top) return Promise.resolve(null);
    var targetSlug = String(slug || currentActiveSlug || SITE_SLUG).trim();
    if (!targetSlug) return Promise.resolve(null);
    var key = targetSlug.toLowerCase();

    return fetch(SUPABASE_URL + "/rest/v1/rpc/heartbeat_page_presence", {
      method: "POST",
      headers: supaHeaders(),
      body: JSON.stringify({
        p_slug: canonicalSlugMap[key] || targetSlug,
        p_session_id: getSessionId(),
        p_action: action || "ping",
        p_window_seconds: PRESENCE_WINDOW_SECONDS,
        /* Stały identyfikator przeglądarki — kilka otwartych kart tej samej osoby
           liczy się jako jedna obecność na całej stronie i w projektach. */
        p_visitor_id: getVisitorId()
      }),
      keepalive: true,
      cache: "no-store"
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Presence " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.active_counts) {
          applyOnlineMap(data.active_counts);
          if (bc) {
            try {
              bc.postMessage({ onlineMap: data.active_counts });
            } catch (e) { /* ignorujemy */ }
          }
        }
        if (data && typeof data.total_online === "number") {
          applyTotalOnline(data.total_online, true);
          if (bc) {
            try {
              bc.postMessage({ totalOnline: data.total_online });
            } catch (e) { /* ignorujemy */ }
          }
        }
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  /* Lekkie odpytanie łącznej liczby unikalnych osób online (deduplikacja po przeglądarce) */
  function fetchTotalOnline() {
    if (!window.fetch) return Promise.resolve(null);
    return fetch(SUPABASE_URL + "/rest/v1/rpc/count_total_online", {
      method: "POST",
      headers: supaHeaders(),
      body: JSON.stringify({ p_window_seconds: PRESENCE_WINDOW_SECONDS }),
      keepalive: true,
      cache: "no-store"
    })
      .then(function (res) {
        if (!res.ok) throw new Error("TotalOnline " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && typeof data.total_online === "number") {
          applyTotalOnline(data.total_online, true);
        }
        if (data && data.active_counts) {
          applyOnlineMap(data.active_counts);
        }
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  var pendingRegistrations = {};

  function registerView(slug, options) {
    var opts = options || {};
    var cleanSlug = String(slug || "").trim();
    if (!cleanSlug) return Promise.resolve(null);

    /* Nigdy nie nabijamy wejść z wnętrza miniatur <iframe> na stronie głównej */
    if (!opts.allowIframe && window.self !== window.top) {
      return Promise.resolve(null);
    }

    var key = cleanSlug.toLowerCase();

    /* Natychmiast zaznaczamy obecność na otwieranym projekcie i wysyłamy ping obecności */
    if (key !== SITE_SLUG.toLowerCase()) {
      onlineMap[key] = Math.max(1, Number(onlineMap[key]) || 0);
      refreshOnlineDOMCounters();
      sendPresenceHeartbeat(cleanSlug, "ping");
    }

    if (pendingRegistrations[key]) return pendingRegistrations[key];

    /* Jeśli w tej przeglądarce dla tego projektu aktywna jest jeszcze 15-minutowa
       blokada czasowa, nie nabijamy sztucznie licznika przy odświeżaniu strony */
    if (isLocalCooldownActive(cleanSlug)) {
      return Promise.resolve({
        project_slug: cleanSlug,
        views_count: getCount(cleanSlug),
        counted: false,
        cached_cooldown: true
      });
    }

    if (!window.fetch) return Promise.resolve(null);

    var body = JSON.stringify({
      p_slug: canonicalSlugMap[key] || cleanSlug,
      p_visitor_id: getVisitorId(),
      p_cooldown_seconds: COOLDOWN_SECONDS
    });

    var req = fetch(SUPABASE_URL + "/rest/v1/rpc/register_page_view", {
      method: "POST",
      headers: supaHeaders(),
      body: body,
      keepalive: true,
      cache: "no-store"
    })
      .then(function (res) {
        delete pendingRegistrations[key];
        if (!res.ok) throw new Error("RPC " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.project_slug != null) {
          var nextWait = Number(data.next_eligible_in_seconds) || COOLDOWN_SECONDS;
          markLocalCooldown(data.project_slug, nextWait);
          var views = Number(data.views_count) || 0;
          var unique = Number(data.unique_visitors_count) || 0;
          var viewsToday = Number(data.views_today_count) || 0;
          applyCountUpdate(data.project_slug, views, unique, Boolean(data.counted), viewsToday);
          if (bc && data.counted) {
            try {
              bc.postMessage({ slug: data.project_slug, views: views, unique: unique, viewsToday: viewsToday });
            } catch (e) { /* ignorujemy */ }
          }
        }
        return data;
      })
      .catch(function () {
        delete pendingRegistrations[key];
        return null;
      });

    pendingRegistrations[key] = req;
    return req;
  }

  /* ---------- Supabase Realtime WebSocket (aktualizacja na żywo) ---------- */
  function connectRealtime() {
    if (!("WebSocket" in window) || ws) return;

    var wsUrl =
      SUPABASE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:") +
      "/realtime/v1/websocket?apikey=" +
      encodeURIComponent(SUPABASE_ANON_KEY) +
      "&vsn=1.0.0";

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      ws = null;
      return;
    }

    var refCounter = 1;
    function nextRef() {
      refCounter += 1;
      return String(refCounter);
    }

    ws.onopen = function () {
      var joinPayload = {
        topic: "realtime:public:live_metrics",
        event: "phx_join",
        payload: {
          config: {
            broadcast: { self: false },
            presence: { key: "" },
            postgres_changes: [
              {
                event: "*",
                schema: "public",
                table: "page_views"
              },
              {
                event: "*",
                schema: "public",
                table: "page_presence"
              }
            ]
          }
        },
        ref: nextRef()
      };
      try {
        ws.send(JSON.stringify(joinPayload));
      } catch (e) { /* ignorujemy */ }

      clearInterval(wsHeartbeat);
      wsHeartbeat = setInterval(function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              topic: "phoenix",
              event: "heartbeat",
              payload: {},
              ref: nextRef()
            }));
          } catch (e) { /* ignorujemy */ }
        }
      }, 25000);
    };

    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (!msg) return;
        var payload = msg.payload;
        var dataObj = payload && payload.data ? payload.data : payload;
        var table = dataObj && dataObj.table;
        var record =
          (dataObj && (dataObj.record || dataObj.new)) ||
          (payload && (payload.record || payload.new));

        if (table === "page_presence") {
          clearTimeout(presenceDebounceTimer);
          presenceDebounceTimer = setTimeout(function () {
            sendPresenceHeartbeat(currentActiveSlug, "ping");
          }, 350);
          return;
        }

        if (record && record.project_slug && record.views_count !== undefined) {
          applyCountUpdate(
            record.project_slug,
            Number(record.views_count) || 0,
            Number(record.unique_visitors_count) || 0,
            true,
            record.views_today_date === todayWarsawDateStr()
              ? (Number(record.views_today_count) || 0)
              : 0
          );
        }
      } catch (e) { /* ignorujemy */ }
    };

    ws.onclose = function () {
      clearInterval(wsHeartbeat);
      ws = null;
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(function () {
        if (document.visibilityState === "visible") connectRealtime();
      }, 6000);
    };

    ws.onerror = function () {
      try {
        if (ws) ws.close();
      } catch (e) { /* ignorujemy */ }
    };
  }

  /* ---------- Auto-detekcja bezpośrednich wejść na stronę projektu ---------- */
  function detectCurrentSlug() {
    var scriptEl =
      document.currentScript ||
      document.querySelector('script[src*="view-tracker.js"]') ||
      document.querySelector("script[data-rejson-project]");
    if (scriptEl && scriptEl.dataset && scriptEl.dataset.project) {
      return scriptEl.dataset.project.trim();
    }

    var host = (window.location.hostname || "").toLowerCase();
    var parts = (window.location.pathname || "/")
      .split("/")
      .filter(function (s) {
        return s && !/\.html?$/i.test(s);
      });

    if (host === "rejson59.github.io") {
      return parts.length ? parts[0] : SITE_SLUG;
    }
    if (host.endsWith(".vercel.app")) {
      return host.replace(".vercel.app", "").split("-git-")[0];
    }
    if (parts.length && host !== "localhost" && host !== "127.0.0.1") {
      return parts[0];
    }
    return SITE_SLUG;
  }

  function checkReferrerProjectVisit() {
    try {
      var ref = document.referrer || "";
      if (!ref) return;
      var url = new URL(ref);
      var host = url.hostname.toLowerCase();
      if (host === "rejson59.github.io") {
        var parts = (url.pathname || "/").split("/").filter(function (s) {
          return s && !/\.html?$/i.test(s);
        });
        if (parts.length > 0 && parts[0].toLowerCase() !== SITE_SLUG.toLowerCase()) {
          registerView(parts[0]);
        }
      }
    } catch (e) { /* ignorujemy */ }
  }

  function checkQueryParamVisit() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var proj = params.get("project") || params.get("open") || "";
      if (proj && /^[A-Za-z0-9._-]+$/.test(proj)) {
        registerView(proj);
      }
    } catch (e) { /* ignorujemy */ }
  }

  /* ---------- Dymki wyjaśniające (po najechaniu myszką lub kliknięciu/dotknięciu) ---------- */
  var tooltipEl = null;
  var activeTooltipTarget = null;
  var tooltipPinnedByClick = false;

  function ensureTooltipEl() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.id = "metric-tooltip-popover";
    tooltipEl.className = "metric-tooltip-popover";
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function positionTooltip(target) {
    if (!tooltipEl || !target || tooltipEl.hidden) return;
    var rect = target.getBoundingClientRect();
    var popRect = tooltipEl.getBoundingClientRect();
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = document.documentElement.clientHeight || window.innerHeight;
    var pad = 10;

    var top = rect.bottom + 8;
    if (top + popRect.height + pad > vh && rect.top - popRect.height - 8 > pad) {
      top = rect.top - popRect.height - 8;
    }

    var left = rect.left + rect.width / 2 - popRect.width / 2;
    if (left < pad) left = pad;
    if (left + popRect.width + pad > vw) left = Math.max(pad, vw - popRect.width - pad);

    tooltipEl.style.top = Math.round(top) + "px";
    tooltipEl.style.left = Math.round(left) + "px";
  }

  var tooltipListenersAttached = false;

  function onTooltipViewportChange() {
    if (activeTooltipTarget && tooltipEl && !tooltipEl.hidden) {
      positionTooltip(activeTooltipTarget);
    }
  }

  function attachTooltipViewportListeners() {
    if (tooltipListenersAttached) return;
    tooltipListenersAttached = true;
    window.addEventListener("scroll", onTooltipViewportChange, { passive: true });
    window.addEventListener("resize", onTooltipViewportChange);
  }

  function detachTooltipViewportListeners() {
    if (!tooltipListenersAttached) return;
    tooltipListenersAttached = false;
    window.removeEventListener("scroll", onTooltipViewportChange);
    window.removeEventListener("resize", onTooltipViewportChange);
  }

  function showTooltipFor(target, pinned) {
    if (!target) return;
    var text = target.getAttribute("data-tooltip") || "";
    if (!text) return;
    var title = target.getAttribute("data-tooltip-title") || "";
    var isOnline = target.classList.contains("is-online");
    var valEl = target.querySelector(".online-count, .views-count, .card-online-num, .card-views-num");
    var valText = "";
    if (valEl) {
      if (typeof valEl._pendingTargetVal === "number") {
        valText = fmtViews(valEl._pendingTargetVal);
      } else if (typeof valEl._targetVal === "number") {
        valText = fmtViews(valEl._targetVal);
      } else {
        valText = (valEl.textContent || "0").trim();
      }
    }

    var pop = ensureTooltipEl();
    pop.className = "metric-tooltip-popover " + (isOnline ? "is-online-tip" : "is-clicks-tip");

    var badgeChip = valText
      ? '<span class="metric-tip-value mono">' +
          (isOnline ? '<span class="online-aura-dot" aria-hidden="true"></span>' : "") +
          valText + (isOnline ? " online" : "") +
        "</span>"
      : "";

    pop.innerHTML =
      '<div class="metric-tip-head">' +
        '<strong class="metric-tip-title">' + title + "</strong>" +
        badgeChip +
      "</div>" +
      '<p class="metric-tip-desc">' + text + "</p>";

    pop.hidden = false;
    activeTooltipTarget = target;
    tooltipPinnedByClick = Boolean(pinned);
    attachTooltipViewportListeners();
    positionTooltip(target);
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.hidden = true;
    activeTooltipTarget = null;
    tooltipPinnedByClick = false;
    detachTooltipViewportListeners();
  }

  function bindMetricTooltips() {
    document.addEventListener("pointerover", function (ev) {
      if (ev.pointerType && ev.pointerType !== "mouse") return;
      var target = ev.target && ev.target.closest ? ev.target.closest("[data-tooltip]") : null;
      if (!target) return;
      if (tooltipPinnedByClick && activeTooltipTarget === target) return;
      showTooltipFor(target, false);
    });

    document.addEventListener("pointerout", function (ev) {
      if (ev.pointerType && ev.pointerType !== "mouse") return;
      if (tooltipPinnedByClick) return;
      var target = ev.target && ev.target.closest ? ev.target.closest("[data-tooltip]") : null;
      if (!target) return;
      var related = ev.relatedTarget;
      if (related && target.contains(related)) return;
      if (activeTooltipTarget === target) hideTooltip();
    });

    document.addEventListener("click", function (ev) {
      var target = ev.target && ev.target.closest ? ev.target.closest("[data-tooltip]") : null;
      if (target) {
        ev.preventDefault();
        ev.stopPropagation();
        if (activeTooltipTarget === target && tooltipPinnedByClick && tooltipEl && !tooltipEl.hidden) {
          hideTooltip();
        } else {
          showTooltipFor(target, true);
        }
        return;
      }
      if (tooltipEl && !tooltipEl.hidden) {
        hideTooltip();
      }
    });
  }

  function bindCardClickTracking() {
    function handleCardInteraction(ev) {
      if (ev.type === "auxclick" && ev.button !== 1) return;
      var target = ev.target;
      if (!target || !target.closest) return;
      var link = target.closest("a[href]");
      if (!link) return;
      var card = link.closest(".project-card");
      if (!card) return;

      var repoName = card.getAttribute("data-repo") || "";
      if (!repoName) {
        var titleEl = card.querySelector(".card-title");
        if (titleEl) repoName = (titleEl.textContent || "").trim();
      }
      if (repoName) {
        registerView(repoName);
      }
    }

    document.addEventListener("click", handleCardInteraction, true);
    document.addEventListener("auxclick", handleCardInteraction, true);
  }

  function isInsideCardThumbnail() {
    try {
      if (window.name === "rejson-card-preview") return true;
      if (window.self !== window.top && window.frameElement) {
        var fe = window.frameElement;
        if (
          fe.classList &&
          (fe.classList.contains("card-preview-iframe") || fe.hasAttribute("data-card-preview"))
        ) {
          return true;
        }
        if (fe.closest && fe.closest(".card-preview-frame")) {
          return true;
        }
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function registerGlobalServiceWorker() {
    try {
      if (
        "serviceWorker" in navigator &&
        !isInsideCardThumbnail()
      ) {
        navigator.serviceWorker
          .register("/sw.js?v=2", { scope: "/", updateViaCache: "none" })
          .then(function (reg) {
            try {
              if (reg && typeof reg.update === "function") reg.update();
            } catch (e2) {}
          })
          .catch(function () {
            /* ignorujemy */
          });
      }
    } catch (e) { /* ignorujemy */ }
  }

  /* ---------- Inicjalizacja ---------- */
  function init() {
    currentActiveSlug = detectCurrentSlug();
    loadCachedCounts();
    refreshAllDOMCounters();
    registerGlobalServiceWorker();

    /* 1. Pobieramy aktualny stan wszystkich liczników, obecności na żywo
       oraz łącznej liczby unikalnych osób online z Supabase */
    fetchAllCounts().then(function () {
      refreshAllDOMCounters();
      if (!isInsideCardThumbnail()) {
        registerView(currentActiveSlug);
        sendPresenceHeartbeat(currentActiveSlug, "ping");
        if (currentActiveSlug === SITE_SLUG) {
          checkReferrerProjectVisit();
          checkQueryParamVisit();
        }
      }
    });
    if (!isInsideCardThumbnail()) {
      fetchTotalOnline();
    }

    /* 2. Podpinamy zliczanie kliknięć w projekty oraz dymki wyjaśniające liczników */
    bindCardClickTracking();
    bindMetricTooltips();

    /* 3. Uruchamiamy połączenie na żywo (Supabase Realtime WebSocket + szybki heartbeat obecności) */
    if (!isInsideCardThumbnail()) {
      connectRealtime();

      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
          fetchAllCounts();
          sendPresenceHeartbeat(currentActiveSlug, "ping");
          fetchTotalOnline();
          if (!ws) connectRealtime();
        }
      });

      window.addEventListener("pagehide", function () {
        sendPresenceHeartbeat(currentActiveSlug, "leave");
      });

      /* Heartbeat obecności co 6 sekund — liczniki LIVE odświeżają się niemal natychmiast */
      setInterval(function () {
        if (document.visibilityState === "visible") {
          sendPresenceHeartbeat(currentActiveSlug, "ping");
        }
      }, 6000);

      /* Stan liczników wejść co 12 sekund (zmiany przychodzą też od razu przez Realtime) */
      setInterval(function () {
        if (document.visibilityState === "visible") {
          fetchAllCounts();
        }
      }, 12000);
    }
  }

  window.RejsonViews = {
    getCount: getCount,
    getUniqueCount: getUniqueCount,
    getTodayCount: getTodayCount,
    getOnlineCount: getOnlineCount,
    getTotalOnlineCount: getTotalOnlineCount,
    registerView: registerView,
    fetchAllCounts: fetchAllCounts,
    refreshDOM: refreshAllDOMCounters,
    onChange: function (fn) {
      if (typeof fn === "function") subscribers.push(fn);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);

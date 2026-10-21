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

  var countsMap = {}; /* lower(slug) -> { slug, views, unique } */
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
          applyCountUpdate(ev.data.slug, ev.data.views, ev.data.unique, true);
        }
        if (ev.data.onlineMap && typeof ev.data.onlineMap === "object") {
          applyOnlineMap(ev.data.onlineMap);
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

  /* ---------- Cache stanu liczników w localStorage (natychmiastowy start) ---------- */
  function loadCachedCounts() {
    try {
      var raw = localStorage.getItem(CACHE_COUNTS_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        Object.keys(parsed).forEach(function (k) {
          var item = parsed[k];
          if (item && typeof item.views === "number") {
            countsMap[k.toLowerCase()] = {
              slug: item.slug || k,
              views: item.views,
              unique: item.unique || 0
            };
            canonicalSlugMap[k.toLowerCase()] = item.slug || k;
          }
        });
      }
    } catch (e) { /* ignorujemy */ }
  }

  function saveCachedCounts() {
    try {
      localStorage.setItem(CACHE_COUNTS_KEY, JSON.stringify(countsMap));
    } catch (e) { /* ignorujemy */ }
  }

  /* ---------- Odczyt i aktualizacja stanu ---------- */
  function getCount(slug) {
    if (!slug) return 0;
    var entry = countsMap[String(slug).toLowerCase()];
    return entry && typeof entry.views === "number" ? entry.views : 0;
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

  function applyCountUpdate(slug, views, unique, animate) {
    if (!slug || typeof views !== "number" || views < 0) return;
    var key = String(slug).toLowerCase();
    var prev = countsMap[key] ? countsMap[key].views : null;
    var canonical = canonicalSlugMap[key] || slug;
    canonicalSlugMap[key] = canonical;

    countsMap[key] = {
      slug: canonical,
      views: views,
      unique: typeof unique === "number" ? unique : (countsMap[key] ? countsMap[key].unique : 0)
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

    /* 1. Główny licznik strony w prawym górnym rogu */
    if (key === SITE_SLUG.toLowerCase()) {
      var siteCountEl = document.getElementById("site-views-count");
      var siteBadgeEl = document.getElementById("site-views-badge");
      if (siteCountEl) {
        siteCountEl.textContent = fmtViews(views);
      }
      if (siteBadgeEl) {
        siteBadgeEl.classList.add("is-ready");
        if (shouldBump) bumpElement(siteBadgeEl);
      }
    }

    /* 2. Liczniki na kartach projektów (wyróżnionych i pozostałych) */
    var badges = document.querySelectorAll("[data-project-views]");
    for (var i = 0; i < badges.length; i++) {
      var badge = badges[i];
      var bSlug = (badge.getAttribute("data-project-views") || "").toLowerCase();
      if (bSlug === key) {
        var numEl = badge.querySelector(".card-views-num");
        if (numEl) numEl.textContent = fmtViews(views);
        if (shouldBump) bumpElement(badge);
      }
    }
  }

  function refreshOnlineDOMCounters() {
    var siteOnlineEl = document.getElementById("site-online-count");
    if (siteOnlineEl) {
      var siteOnline = getOnlineCount(SITE_SLUG);
      siteOnlineEl.textContent = fmtViews(siteOnline);
    }

    var onlineEls = document.querySelectorAll("[data-project-online]");
    for (var i = 0; i < onlineEls.length; i++) {
      var el = onlineEls[i];
      var slug = el.getAttribute("data-project-online") || "";
      var cnt = getOnlineCount(slug);
      var numEl = el.querySelector(".card-online-num");
      if (numEl) numEl.textContent = fmtViews(cnt);
      el.classList.toggle("is-active-now", cnt > 0);
    }
  }

  function refreshAllDOMCounters() {
    var siteViews = getCount(SITE_SLUG);
    var siteCountEl = document.getElementById("site-views-count");
    var siteBadgeEl = document.getElementById("site-views-badge");
    if (siteCountEl && countsMap[SITE_SLUG.toLowerCase()]) {
      siteCountEl.textContent = fmtViews(siteViews);
      if (siteBadgeEl) siteBadgeEl.classList.add("is-ready");
    }

    var badges = document.querySelectorAll("[data-project-views]");
    for (var i = 0; i < badges.length; i++) {
      var badge = badges[i];
      var slug = badge.getAttribute("data-project-views") || "";
      var numEl = badge.querySelector(".card-views-num");
      if (numEl) {
        numEl.textContent = fmtViews(getCount(slug));
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
      SUPABASE_URL + "/rest/v1/page_views?select=project_slug,views_count,unique_visitors_count",
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
          rows.forEach(function (r) {
            if (r && r.project_slug) {
              applyCountUpdate(
                r.project_slug,
                Number(r.views_count) || 0,
                Number(r.unique_visitors_count) || 0,
                false
              );
            }
          });
          saveCachedCounts();
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
        p_window_seconds: PRESENCE_WINDOW_SECONDS
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
          applyCountUpdate(data.project_slug, views, unique, Boolean(data.counted));
          if (bc && data.counted) {
            try {
              bc.postMessage({ slug: data.project_slug, views: views, unique: unique });
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
            true
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

  function showTooltipFor(target, pinned) {
    if (!target) return;
    var text = target.getAttribute("data-tooltip") || "";
    if (!text) return;
    var title = target.getAttribute("data-tooltip-title") || "";
    var isOnline = target.classList.contains("is-online");
    var valEl = target.querySelector(".online-count, .views-count, .card-online-num, .card-views-num");
    var valText = valEl ? (valEl.textContent || "0").trim() : "";

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
    positionTooltip(target);
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.hidden = true;
    activeTooltipTarget = null;
    tooltipPinnedByClick = false;
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

    window.addEventListener("scroll", function () {
      if (activeTooltipTarget && tooltipEl && !tooltipEl.hidden) {
        positionTooltip(activeTooltipTarget);
      }
    }, { passive: true });

    window.addEventListener("resize", function () {
      if (activeTooltipTarget && tooltipEl && !tooltipEl.hidden) {
        positionTooltip(activeTooltipTarget);
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

  function registerGlobalServiceWorker() {
    try {
      if (
        "serviceWorker" in navigator &&
        window.self === window.top &&
        (window.location.hostname || "").toLowerCase() === "rejson59.github.io"
      ) {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {
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

    /* 1. Pobieramy aktualny stan wszystkich liczników oraz obecności na żywo z Supabase */
    fetchAllCounts().then(function () {
      refreshAllDOMCounters();
      if (window.self === window.top) {
        registerView(currentActiveSlug);
        sendPresenceHeartbeat(currentActiveSlug, "ping");
        if (currentActiveSlug === SITE_SLUG) {
          checkReferrerProjectVisit();
          checkQueryParamVisit();
        }
      }
    });

    /* 2. Podpinamy zliczanie kliknięć w projekty oraz dymki wyjaśniające liczników */
    bindCardClickTracking();
    bindMetricTooltips();

    /* 3. Uruchamiamy połączenie na żywo (Supabase Realtime WebSocket + heartbeat obecności) */
    if (window.self === window.top) {
      connectRealtime();

      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
          fetchAllCounts();
          sendPresenceHeartbeat(currentActiveSlug, "ping");
          if (!ws) connectRealtime();
        }
      });

      window.addEventListener("pagehide", function () {
        sendPresenceHeartbeat(currentActiveSlug, "leave");
      });

      setInterval(function () {
        if (document.visibilityState === "visible") {
          fetchAllCounts();
          sendPresenceHeartbeat(currentActiveSlug, "ping");
        }
      }, 20000);
    }
  }

  window.RejsonViews = {
    getCount: getCount,
    getOnlineCount: getOnlineCount,
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

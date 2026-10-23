/* ==========================================================================
   Rejson Widgets — Konfiguracja chmury Supabase + Klient REST/Auth + Fallback
   Bezpieczny klucz publiczny (anon) — pełna ochrona przez Postgres RLS + RPC
   ========================================================================== */

(function (global) {
  "use strict";

  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

  var SESSION_STORAGE_KEY = "rejson_widgets_admin_session_v1";
  var LOCAL_MIRROR_KEY = "rejson_widgets_mirror_v1";
  var VOTER_STORAGE_KEY = "rejson_widgets_voter_id_v1";
  var REQUEST_TIMEOUT_MS = 4200;

  /* Początkowe dane zapasowe (gdy przeglądarka jest offline lub w izolowanym środowisku) */
  var FALLBACK_SUBMISSIONS = [];

  function getVoterKey() {
    try {
      var existing = localStorage.getItem(VOTER_STORAGE_KEY);
      if (existing && existing.length >= 16) return existing;
      var generated =
        "rjv_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 12) +
        Math.random().toString(36).slice(2, 10);
      localStorage.setItem(VOTER_STORAGE_KEY, generated);
      return generated;
    } catch (e) {
      return "rjv_session_" + Math.random().toString(36).slice(2, 16);
    }
  }

  function loadMirror() {
    try {
      var raw = localStorage.getItem(LOCAL_MIRROR_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) return parsed;
      }
    } catch (e) { /* ignore */ }
    var initial = {
      items: FALLBACK_SUBMISSIONS.map(function (x) {
        return Object.assign({}, x);
      }),
      votedIds: {}
    };
    saveMirror(initial);
    return initial;
  }

  function saveMirror(state) {
    try {
      localStorage.setItem(LOCAL_MIRROR_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function getStoredSession() {
    try {
      var raw = localStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setStoredSession(session) {
    try {
      if (!session) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return;
      }
      var expiresAt = session.expires_at
        ? session.expires_at * 1000
        : Date.now() + (session.expires_in || 3600) * 1000;
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at_ms: expiresAt,
          user: session.user || null,
          sandbox: Boolean(session.sandbox)
        })
      );
    } catch (e) { /* ignore */ }
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    var opts = Object.assign({}, options || {});
    if (controller) {
      opts.signal = controller.signal;
      timer = setTimeout(function () {
        controller.abort();
      }, timeoutMs || REQUEST_TIMEOUT_MS);
    }
    return fetch(url, opts).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  async function getValidAccessToken() {
    var session = getStoredSession();
    if (!session || !session.access_token) return null;
    if (session.sandbox) return null;
    if (session.expires_at_ms && session.expires_at_ms - Date.now() > 60 * 1000) {
      return session.access_token;
    }
    if (!session.refresh_token) return session.access_token;

    try {
      var res = await fetchWithTimeout(
        SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token",
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ refresh_token: session.refresh_token })
        },
        REQUEST_TIMEOUT_MS
      );
      if (!res.ok) {
        setStoredSession(null);
        return null;
      }
      var refreshed = await res.json();
      setStoredSession(refreshed);
      return refreshed.access_token;
    } catch (e) {
      return session.access_token;
    }
  }

  async function rpc(fnName, params, useAuth) {
    var token = useAuth ? await getValidAccessToken() : null;
    var res = await fetchWithTimeout(
      SUPABASE_URL + "/rest/v1/rpc/" + fnName,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + (token || SUPABASE_ANON_KEY),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(params || {})
      },
      REQUEST_TIMEOUT_MS
    );

    var text = await res.text();
    var data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = text;
    }
    if (!res.ok) {
      var errMsg =
        (data && (data.message || data.error_description || data.msg || data.hint)) ||
        "Błąd zapytania Supabase (" + res.status + ")";
      var err = new Error(errMsg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function restTable(path, method, body, extraHeaders) {
    var token = await getValidAccessToken();
    var headers = Object.assign(
      {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + (token || SUPABASE_ANON_KEY),
        "Content-Type": "application/json"
      },
      extraHeaders || {}
    );
    var res = await fetchWithTimeout(
      SUPABASE_URL + "/rest/v1/" + path,
      {
        method: method || "GET",
        headers: headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      },
      REQUEST_TIMEOUT_MS
    );
    var text = await res.text();
    var data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = text;
    }
    if (!res.ok) {
      var errMsg =
        (data && (data.message || data.error_description || data.msg)) ||
        "Błąd operacji bazodanowej (" + res.status + ")";
      var err = new Error(errMsg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function signUpOwner(email, password) {
    var cleanEmail = String(email || "").trim().toLowerCase();
    var res = await fetchWithTimeout(
      SUPABASE_URL + "/auth/v1/signup",
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: cleanEmail, password: password })
      },
      6000
    );
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var msg = data.msg || data.error_description || data.message || "";
      if (/already registered|already exists/i.test(msg)) {
        return signInOwner(cleanEmail, password, true);
      }
      throw new Error(msg || "Nie udało się utworzyć konta administratora.");
    }
    var session = data.access_token ? data : data.session;
    if (!session || !session.access_token) {
      return signInOwner(cleanEmail, password, true);
    }
    setStoredSession(session);
    await rpc("claim_initial_admin", {}, true);
    return session;
  }

  async function signInOwner(email, password, shouldClaimIfNeeded) {
    var cleanEmail = String(email || "").trim().toLowerCase();
    var res = await fetchWithTimeout(
      SUPABASE_URL + "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: cleanEmail, password: password })
      },
      6000
    );
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      throw new Error(
        data.error_description || data.msg || data.message || "Nieprawidłowy e-mail lub hasło."
      );
    }
    setStoredSession(data);
    if (shouldClaimIfNeeded) {
      await rpc("claim_initial_admin", {}, true);
    } else {
      var check = await rpc("admin_setup_status", {}, true);
      if (!check || !check.is_admin) {
        if (check && !check.initialized) {
          await rpc("claim_initial_admin", {}, true);
        } else {
          setStoredSession(null);
          throw new Error("To konto nie posiada uprawnień administratora Rejson Widgets.");
        }
      }
    }
    return data;
  }

  function computeSummaryFromMirror() {
    var mirror = loadMirror();
    var items = mirror.items || [];
    var byProj = {};
    var bugs = 0;
    var ideas = 0;
    var inProg = 0;
    var done = 0;
    var votes = 0;
    items.forEach(function (it) {
      if (it.type === "bug") bugs++;
      else ideas++;
      if (it.status === "planned" || it.status === "in_progress") inProg++;
      if (it.status === "completed") done++;
      votes += Number(it.upvotes_count || 0);
      var k = it.project_slug || "rejson59";
      if (!byProj[k]) {
        byProj[k] = {
          project_slug: k,
          project_name: it.project_name || k,
          count: 0,
          votes: 0
        };
      }
      byProj[k].count++;
      byProj[k].votes += Number(it.upvotes_count || 0);
    });
    return {
      total_items: items.length,
      bugs_count: bugs,
      ideas_count: ideas,
      in_progress_count: inProg,
      completed_count: done,
      total_votes: votes,
      projects: Object.keys(byProj).map(function (k) {
        return byProj[k];
      }),
      offline_mirror: true
    };
  }

  /* Trwały 4-cyfrowy identyfikator przeglądarki (odcisk) — ten sam algorytm
     co na stronie głównej (view-tracker.js), więc tożsamość jest spójna
     w panelu admina między tablicą, widgetem i stroną. */
  function fingerprintId() {
    try {
      var scr = window.screen || {};
      var parts = [
        navigator.userAgent || "",
        navigator.language || "",
        (navigator.languages || []).join(","),
        navigator.platform || "",
        scr.width || 0, scr.height || 0,
        scr.availWidth || 0, scr.availHeight || 0,
        scr.colorDepth || 0, scr.pixelDepth || 0,
        window.devicePixelRatio || 1,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
        navigator.maxTouchPoints || 0,
        navigator.cookieEnabled ? 1 : 0,
        navigator.doNotTrack || ""
      ];
      var str = parts.join("|");
      var h = 0x811c9dc5;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      return String(1000 + (h % 9000));
    } catch (e) {
      return "";
    }
  }

  global.RejsonCloud = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    getVoterKey: getVoterKey,
    fpId: fingerprintId,
    getStoredSession: getStoredSession,
    setStoredSession: setStoredSession,
    rpc: rpc,
    restTable: restTable,
    signUpOwner: signUpOwner,
    signInOwner: signInOwner,
    loadMirror: loadMirror,
    saveMirror: saveMirror,
    computeSummaryFromMirror: computeSummaryFromMirror
  };
})(window);

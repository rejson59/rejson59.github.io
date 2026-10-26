/* ==========================================================================
   Panel admina — zakładka „Błędy"
   Automatyczne raporty techniczne (tabela error_reports, RPC get_admin_errors)
   oraz załączniki ze zgłoszeń użytkowników (feedback_media + podpisane URL-e).
   ========================================================================== */
(function () {
  "use strict";

  var state = {
    items: [],
    media: [],
    status: "new",
    loaded: false,
    loading: false,
    mediaLoaded: false,
    mediaLoading: false
  };

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
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + " mln";
    if (n >= 10000) return Math.round(n / 1000) + " tys.";
    return String(n);
  }

  function relTime(iso) {
    var t = Date.parse(iso);
    if (!t) return "";
    var diff = Math.round((Date.now() - t) / 1000);
    if (diff < 60) return "przed chwilą";
    if (diff < 3600) return Math.round(diff / 60) + " min temu";
    if (diff < 86400) return Math.round(diff / 3600) + " godz. temu";
    return Math.round(diff / 86400) + " dni temu";
  }

  function api() {
    return window.RejsonCloud || null;
  }

  function adminRpc(fn, params) {
    var cloud = api();
    if (!cloud || !cloud.rpc) return Promise.reject(new Error("brak połączenia"));
    return cloud.rpc(fn, params || {}, true);
  }

  var KIND_META = {
    js: { label: "Błąd JS", icon: "💥" },
    promise: { label: "Obietnica", icon: "🌀" },
    network: { label: "Sieć", icon: "📡" },
    preview: { label: "Podgląd", icon: "🖼" },
    slow: { label: "Wolno", icon: "🐢" },
    manual: { label: "Ręcznie", icon: "✍️" }
  };

  var STATUS_META = {
    new: { label: "Nowy", cls: "is-new" },
    triaged: { label: "W trakcie", cls: "is-triaged" },
    fixed: { label: "Naprawiony", cls: "is-fixed" },
    ignored: { label: "Ignorowany", cls: "is-ignored" }
  };

  /* ------------------------------------------------------------------ */
  /*  Wczytywanie                                                        */
  /* ------------------------------------------------------------------ */

  function fetchErrors() {
    if (state.loading) return Promise.resolve();
    state.loading = true;

    var list = $("errors-list");
    if (list && !state.loaded) {
      list.innerHTML = '<div class="adm-empty">Wczytuję raporty…</div>';
    }

    return adminRpc("get_admin_errors", {
      p_limit: 100,
      p_status: state.status || null
    })
      .then(function (rows) {
        state.items = Array.isArray(rows) ? rows : [];
        state.loaded = true;
        renderErrors();
      })
      .catch(function (err) {
        if (list) {
          list.innerHTML =
            '<div class="adm-empty">Nie udało się wczytać raportów' +
            (err && err.message ? ": " + esc(err.message) : ".") +
            "</div>";
        }
      })
      .then(function () {
        state.loading = false;
      });
  }

  function fetchMedia() {
    if (state.mediaLoading) return Promise.resolve();
    state.mediaLoading = true;

    return adminRpc("get_admin_feedback_media", { p_limit: 24 })
      .then(function (rows) {
        state.media = Array.isArray(rows) ? rows : [];
        state.mediaLoaded = true;
        renderMedia();
        return signAllMedia();
      })
      .catch(function () {
        var wrap = $("errors-media");
        if (wrap) wrap.innerHTML = '<div class="adm-empty">Nie udało się wczytać załączników.</div>';
      })
      .then(function () {
        state.mediaLoading = false;
      });
  }

  function signAllMedia() {
    var cloud = api();
    if (!cloud || !cloud.signedUrl) return Promise.resolve();

    var jobs = state.media.slice(0, 24).map(function (m) {
      return cloud
        .signedUrl("feedback-media", m.storage_path, 3600)
        .then(function (url) {
          m.signedUrl = url || "";
        })
        .catch(function () {
          m.signedUrl = "";
        });
    });

    return Promise.all(jobs).then(renderMedia);
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  function renderErrors() {
    var list = $("errors-list");
    var kpis = $("errors-kpis");
    var note = $("errors-tab-note");
    if (!list) return;

    var items = state.items;
    var totalOcc = 0;
    var last24 = 0;
    var now = Date.now();

    items.forEach(function (it) {
      totalOcc += Number(it.occurrences) || 0;
      if (now - (Date.parse(it.last_seen_at) || 0) < 86400000) last24++;
    });

    if (note) note.textContent = items.length ? fmt(items.length) : "0";
    if (note) note.classList.toggle("is-hot", items.length > 0);

    if (kpis) {
      kpis.innerHTML =
        '<div class="err-kpi"><span class="err-kpi-num">' + fmt(items.length) + '</span><span class="err-kpi-label">unikalnych błędów</span></div>' +
        '<div class="err-kpi"><span class="err-kpi-num">' + fmt(totalOcc) + '</span><span class="err-kpi-label">wystąpień łącznie</span></div>' +
        '<div class="err-kpi"><span class="err-kpi-num">' + fmt(last24) + '</span><span class="err-kpi-label">aktywnych w 24 h</span></div>';
    }

    if (!items.length) {
      list.innerHTML =
        '<div class="adm-empty">' +
        (state.status === "new"
          ? "Cisza — żadnych nowych błędów. Strona działa czysto. 🎉"
          : "Brak raportów w tym filtrze.") +
        "</div>";
      return;
    }

    list.innerHTML = items
      .map(function (it) {
        var kind = KIND_META[it.kind] || KIND_META.js;
        var status = STATUS_META[it.status] || STATUS_META.new;
        var trail = Array.isArray(it.interactions) ? it.interactions : [];
        var trailHtml = trail.length
          ? trail
              .map(function (t) {
                return (
                  '<span class="err-step mono">' +
                  esc(t.a || "?") + " " + esc(t.el || "?") +
                  "</span>"
                );
              })
              .join("")
          : '<span class="err-none">brak śladu kliknięć</span>';

        var diag = it.diagnostics || {};
        var diagBits = [];
        if (diag.online === false) diagBits.push("offline");
        if (diag.connection) diagBits.push(diag.connection);
        if (diag.loadMs) diagBits.push(Math.round(diag.loadMs / 1000) + " s");

        return (
          '<article class="err-card err-kind--' + esc(it.kind) + " " + status.cls + '">' +
          '<header class="err-card-head">' +
          '<span class="err-kind" title="' + esc(kind.label) + '">' + kind.icon + " " + esc(kind.label) + "</span>" +
          '<span class="err-count" title="Liczba wystąpień">×' + fmt(it.occurrences) + "</span>" +
          '<span class="err-msg">' + esc(it.message) + "</span>" +
          "</header>" +
          '<div class="err-meta mono">' +
          (it.page_url ? "<span>" + esc(it.page_url) + "</span>" : "") +
          (it.browser ? "<span>" + esc(it.browser) + "</span>" : "") +
          (it.os ? "<span>" + esc(it.os) + "</span>" : "") +
          (it.viewport ? "<span>" + esc(it.viewport) + "</span>" : "") +
          (diagBits.length ? "<span>" + esc(diagBits.join(" · ")) + "</span>" : "") +
          '<span title="' + esc(it.last_seen_at) + '">' + relTime(it.last_seen_at) + "</span>" +
          "</div>" +
          '<details class="err-details">' +
          "<summary>Szczegóły techniczne</summary>" +
          (it.stack ? '<pre class="err-stack">' + esc(it.stack) + "</pre>" : '<p class="err-none">brak stosu wywołań</p>') +
          '<div class="err-trail"><span class="err-trail-label">Ostatnie kroki:</span>' + trailHtml + "</div>" +
          "</details>" +
          '<footer class="err-actions">' +
          '<button type="button" class="btn btn-glass btn-sm" data-err-status="fixed" data-err-id="' + esc(it.id) + '">✅ Naprawione</button>' +
          '<button type="button" class="btn btn-glass btn-sm" data-err-status="triaged" data-err-id="' + esc(it.id) + '">🔧 W trakcie</button>' +
          '<button type="button" class="btn btn-glass btn-sm" data-err-status="ignored" data-err-id="' + esc(it.id) + '">🔕 Ignoruj</button>' +
          '<span class="err-status-chip">' + esc(status.label) + "</span>" +
          "</footer>" +
          "</article>"
        );
      })
      .join("");
  }

  function bytesLabel(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function renderMedia() {
    var wrap = $("errors-media");
    if (!wrap) return;

    if (!state.media.length) {
      wrap.innerHTML = '<div class="adm-empty">Brak załączników. Pojawią się tutaj, gdy ktoś dołączy zrzut lub nagranie do zgłoszenia.</div>';
      return;
    }

    wrap.innerHTML = state.media
      .map(function (m) {
        var isImage = /^image\//.test(m.mime || "");
        var isVideo = /^video\//.test(m.mime || "");
        var preview = "";
        if (m.signedUrl && isImage) {
          preview = '<a class="err-media-thumb" href="' + esc(m.signedUrl) + '" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="' + esc(m.signedUrl) + '" alt=""></a>';
        } else if (m.signedUrl && isVideo) {
          preview = '<video class="err-media-thumb" src="' + esc(m.signedUrl) + '" controls preload="metadata"></video>';
        } else {
          preview = '<span class="err-media-thumb err-media-thumb--none">' + (isVideo ? "🎬" : "🖼") + "</span>";
        }

        return (
          '<article class="err-media-card">' +
          preview +
          '<div class="err-media-body">' +
          '<span class="err-media-title">' + esc(m.title || "Zgłoszenie") + "</span>" +
          '<span class="err-media-sub mono">' + esc(m.project_name || "") + (m.type ? " · " + esc(m.type) : "") + "</span>" +
          '<span class="err-media-sub mono">' + esc(bytesLabel(m.bytes)) +
          (m.duration_ms ? " · " + Math.round(m.duration_ms / 1000) + " s" : "") +
          " · " + relTime(m.created_at) + "</span>" +
          (m.page_url ? '<span class="err-media-sub mono">' + esc(m.page_url) + "</span>" : "") +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  /* ------------------------------------------------------------------ */
  /*  Akcje                                                             */
  /* ------------------------------------------------------------------ */

  function setStatus(id, status) {
    return adminRpc("admin_set_error_status", { p_id: id, p_status: status })
      .then(function () {
        state.items = state.items.filter(function (it) {
          return !(it.id === id && state.status && status !== state.status);
        });
        renderErrors();
      })
      .catch(function () {
        var list = $("errors-list");
        if (list) list.classList.add("is-shake");
        setTimeout(function () {
          if (list) list.classList.remove("is-shake");
        }, 400);
      });
  }

  function bind() {
    var list = $("errors-list");
    if (list && !list._rjBound) {
      list._rjBound = true;
      list.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-err-status]") : null;
        if (!btn) return;
        btn.disabled = true;
        setStatus(btn.getAttribute("data-err-id"), btn.getAttribute("data-err-status"));
      });
    }

    var filter = $("errors-status-filter");
    if (filter && !filter._rjBound) {
      filter._rjBound = true;
      filter.addEventListener("change", function () {
        state.status = filter.value;
        state.loaded = false;
        fetchErrors();
      });
    }

    var refresh = $("errors-refresh");
    if (refresh && !refresh._rjBound) {
      refresh._rjBound = true;
      refresh.addEventListener("click", function () {
        state.loaded = false;
        fetchErrors();
        fetchMedia();
      });
    }
  }

  window.RJAdminErrors = {
    bind: bind,
    load: function () {
      bind();
      return Promise.all([fetchErrors(), fetchMedia()]);
    },
    reset: function () {
      state = {
        items: [],
        media: [],
        status: "new",
        loaded: false,
        loading: false,
        mediaLoaded: false,
        mediaLoading: false
      };
    }
  };
})();

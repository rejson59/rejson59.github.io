/* ==========================================================================
   Rejson Widgets — Publiczna Tablica Pomysłów i Błędów
   - dane na żywo z Supabase (list_public_board + get_ecosystem_summary)
   - polubienia ❤ tym samym kluczem co pigułka widgetu
   - w trybie offline: lokalne demo z pamięci podręcznej przeglądarki
   ========================================================================== */

(function () {
  "use strict";

  var cloud = window.RejsonCloud || null;

  var STATUS_LABELS = {
    new: "Nowe",
    under_review: "Rozważane",
    planned: "Planowane",
    in_progress: "W realizacji",
    completed: "Wdrożone",
    closed: "Zamknięte"
  };

  var state = {
    items: [],
    summary: null,
    typeFilter: "all",
    projectFilter: "all",
    sortBy: "top",
    online: false,
    loading: true
  };

  var feedEl = document.getElementById("board-feed");
  var emptyEl = document.getElementById("board-empty");
  var liveBadge = document.getElementById("board-live-badge");
  var liveLabel = document.getElementById("board-live-label");
  var updatedEl = document.getElementById("board-updated");
  var cloudStateEl = document.getElementById("board-cloud-state");
  var projectSelect = document.getElementById("filter-project");
  var sortSelect = document.getElementById("filter-sort");
  var refreshBtn = document.getElementById("btn-refresh");
  var toastEl = document.getElementById("board-toast");
  var typeButtons = Array.prototype.slice.call(document.querySelectorAll("[data-type-filter]"));

  var kpiTotal = document.getElementById("kpi-total");
  var kpiIdeas = document.getElementById("kpi-ideas");
  var kpiBugs = document.getElementById("kpi-bugs");
  var kpiVotes = document.getElementById("kpi-votes");
  var kpiProgress = document.getElementById("kpi-progress");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fmtTime(date) {
    return date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function likesWord(n) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (n === 1) return "osobie";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "osobom";
    return "osobom";
  }

  var toastTimer = 0;
  function notify(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, 2600);
  }

  /* Motyw jasny/ciemny */
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
  });

  function setLiveState(online) {
    state.online = online;
    liveBadge.classList.toggle("is-live", online);
    liveBadge.classList.toggle("is-offline", !online);
    liveLabel.textContent = online ? "Na żywo" : "Tryb offline (demo)";
    if (cloudStateEl) {
      cloudStateEl.textContent = online
        ? "Tryb: dane na żywo z chmury Supabase"
        : "Tryb: dane demo z pamięci przeglądarki";
    }
  }

  function isUuid(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""));
  }

  /* ---------- Pobieranie danych ---------- */
  async function syncBoard() {
    var fetched = false;

    if (cloud) {
      try {
        var rows = await cloud.rpc("list_public_board", {
          p_project_slug: null,
          p_voter_key: cloud.getVoterKey(),
          p_limit: 100
        });
        if (Array.isArray(rows)) {
          state.items = rows;
          fetched = true;
        }
        try {
          var summary = await cloud.rpc("get_ecosystem_summary", {});
          if (summary && typeof summary === "object") state.summary = summary;
        } catch (e2) { /* statystyki opcjonalne — liczymy z listy */ }
      } catch (e) {
        fetched = false;
      }
    }

    if (!fetched) {
      /* Fallback: dane demo z lokalnego lustra przeglądarki */
      var mirror = cloud ? cloud.loadMirror() : { items: [], votedIds: {} };
      state.items = (mirror.items || []).map(function (it) {
        return Object.assign({}, it, {
          has_voted: Boolean(mirror.votedIds && mirror.votedIds[it.id])
        });
      });
      state.summary = cloud ? cloud.computeSummaryFromMirror() : null;
    }

    state.loading = false;
    setLiveState(fetched);
    updatedEl.textContent = "Aktualizacja: " + fmtTime(new Date());
    renderKpis();
    renderProjectFilter();
    renderFeed();
  }

  /* ---------- Statystyki ---------- */
  function computeLocalSummary() {
    var s = { total: 0, ideas: 0, bugs: 0, votes: 0, progress: 0 };
    state.items.forEach(function (it) {
      s.total++;
      if (it.type === "bug") s.bugs++;
      else s.ideas++;
      s.votes += Number(it.upvotes_count || 0);
      if (it.status === "planned" || it.status === "in_progress") s.progress++;
    });
    return s;
  }

  function renderKpis() {
    var sum = state.summary;
    var local = computeLocalSummary();
    var total = sum && typeof sum.total_items === "number" ? sum.total_items : local.total;
    var ideas = sum && typeof sum.ideas_count === "number" ? sum.ideas_count : local.ideas;
    var bugs = sum && typeof sum.bugs_count === "number" ? sum.bugs_count : local.bugs;
    var votes = sum && typeof sum.total_votes === "number" ? sum.total_votes : local.votes;
    var progress =
      sum && typeof sum.in_progress_count === "number" ? sum.in_progress_count : local.progress;

    kpiTotal.textContent = total;
    kpiIdeas.textContent = ideas;
    kpiBugs.textContent = bugs;
    kpiVotes.textContent = votes;
    kpiProgress.textContent = progress;
  }

  /* ---------- Filtr projektów ---------- */
  var prevProjectOptions = "";
  function renderProjectFilter() {
    var map = {};
    var list = [];
    state.items.forEach(function (it) {
      var slug = it.project_slug || "rejson59";
      var key = String(slug).toLowerCase();
      if (!map[key]) {
        map[key] = true;
        list.push({ slug: slug, name: it.project_name || slug });
      }
    });
    list.sort(function (a, b) {
      return String(a.slug).localeCompare(String(b.slug), "pl");
    });
    var sig = list
      .map(function (p) {
        return p.slug;
      })
      .join("|");
    if (sig === prevProjectOptions) return;
    prevProjectOptions = sig;

    var current = projectSelect.value || "all";
    projectSelect.innerHTML =
      '<option value="all">Wszystkie projekty</option>' +
      list
        .map(function (p) {
          return '<option value="' + esc(p.slug) + '">' + esc(p.name) + "</option>";
        })
        .join("");
    var stillExists = current === "all" || list.some(function (p) {
      return p.slug === current;
    });
    projectSelect.value = stillExists ? current : "all";
    state.projectFilter = projectSelect.value;
  }

  /* ---------- Lista ---------- */
  function filteredItems() {
    var list = state.items.filter(function (it) {
      if (it.status === "closed") return false;
      if (state.typeFilter !== "all" && it.type !== state.typeFilter) return false;
      if (state.projectFilter !== "all" && String(it.project_slug) !== state.projectFilter) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (state.sortBy === "new") {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      var diff = Number(b.upvotes_count || 0) - Number(a.upvotes_count || 0);
      if (diff !== 0) return diff;
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return list;
  }

  function renderFeed() {
    if (state.loading) return;
    var list = filteredItems();
    emptyEl.hidden = list.length > 0;

    feedEl.innerHTML = list
      .map(function (it, i) {
        var isBug = it.type === "bug";
        var statusLabel = STATUS_LABELS[it.status] || null;
        var statusDone = it.status === "completed";
        return (
          '<article class="board-item' +
          (it.is_pinned ? " is-pinned" : "") +
          '" style="animation-delay:' +
          Math.min(i * 40, 400) +
          'ms">' +
          '  <button type="button" class="board-vote' +
          (it.has_voted ? " is-voted" : "") +
          '" data-vote="' +
          esc(it.id) +
          '" title="' +
          (it.has_voted ? "Cofnij polubienie" : "Polub — pokaż, że Ci się podoba") +
          '" aria-label="' +
          (it.has_voted ? "Cofnij polubienie tego zgłoszenia" : "Polub to zgłoszenie — pokaż, że Ci się podoba") +
          '">' +
          '    <svg class="board-vote-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
          '    <span class="board-vote-num">' +
          Number(it.upvotes_count || 0) +
          "</span>" +
          "  </button>" +
          '  <div class="board-item-body">' +
          '    <div class="board-item-badges">' +
          '      <span class="tag ' +
          (isBug ? "tag-bug" : "tag-idea") +
          '">' +
          (isBug ? "🐞 Błąd" : "💡 Pomysł") +
          "</span>" +
          '      <span class="tag tag-proj">' +
          esc(it.project_name || it.project_slug || "—") +
          "</span>" +
          (it.is_pinned ? '<span class="tag tag-pin">📌 Przypięte</span>' : "") +
          (statusLabel && statusLabel !== "Nowe"
            ? '<span class="tag tag-status' +
              (statusDone ? " is-done" : "") +
              '">' +
              esc(statusLabel) +
              "</span>"
            : "") +
          "    </div>" +
          '    <h3 class="board-item-title">' +
          esc(it.title) +
          "</h3>" +
          (it.description
            ? '<p class="board-item-desc">' + esc(it.description) + "</p>"
            : "") +
          '    <div class="board-item-meta">' +
          '      <span class="board-likes-hint">' +
          "👍 Podoba się <b>" +
          Number(it.upvotes_count || 0) +
          "</b> " +
          likesWord(Number(it.upvotes_count || 0)) +
          "</span>" +
          "      <span>" +
          esc(it.author_name || "Anonim") +
          "</span>" +
          "      <span>" +
          fmtDate(it.created_at) +
          "</span>" +
          "    </div>" +
          (it.admin_reply
            ? '<p class="board-admin-reply"><b>Odpowiedź Rejsona:</b> ' +
              esc(it.admin_reply) +
              "</p>"
            : "") +
          "  </div>" +
          "</article>"
        );
      })
      .join("");
  }

  /* ---------- Głosowanie ---------- */
  async function toggleVote(id) {
    var item = null;
    for (var i = 0; i < state.items.length; i++) {
      if (String(state.items[i].id) === String(id)) {
        item = state.items[i];
        break;
      }
    }
    if (!item) return;

    item.has_voted = !item.has_voted;
    item.upvotes_count = Math.max(0, Number(item.upvotes_count || 0) + (item.has_voted ? 1 : -1));
    renderFeed();
    renderKpis();

    if (!state.online || !cloud || !isUuid(id)) {
      /* Tryb offline/demo — zapamiętaj głos w lustrze przeglądarki */
      if (cloud) {
        var mirror = cloud.loadMirror();
        mirror.votedIds = mirror.votedIds || {};
        if (item.has_voted) mirror.votedIds[id] = true;
        else delete mirror.votedIds[id];
        var local = null;
        (mirror.items || []).forEach(function (m) {
          if (String(m.id) === String(id)) local = m;
        });
        if (local) local.upvotes_count = item.upvotes_count;
        cloud.saveMirror(mirror);
      }
      return;
    }

    try {
      var res = await cloud.rpc("toggle_upvote", {
        p_submission_id: id,
        p_voter_key: cloud.getVoterKey()
      });
      if (res && typeof res.upvotes_count === "number") {
        item.has_voted = Boolean(res.voted);
        item.upvotes_count = res.upvotes_count;
        renderFeed();
        renderKpis();
      }
    } catch (e) {
      notify("Nie udało się zapisać głosu w chmurze.");
    }
  }

  feedEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-vote]");
    if (btn) toggleVote(btn.getAttribute("data-vote"));
  });

  /* ---------- Filtry i odświeżanie ---------- */
  typeButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      typeButtons.forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      state.typeFilter = btn.getAttribute("data-type-filter");
      renderFeed();
    });
  });

  projectSelect.addEventListener("change", function () {
    state.projectFilter = projectSelect.value;
    renderFeed();
  });

  sortSelect.addEventListener("change", function () {
    state.sortBy = sortSelect.value;
    renderFeed();
  });

  refreshBtn.addEventListener("click", function () {
    syncBoard().then(function () {
      notify(state.online ? "Tablica odświeżona na żywo." : "Brak połączenia z chmurą — tryb offline.");
    });
  });

  /* Automatyczne odświeżanie danych co 30 sekund (tylko gdy karta jest widoczna) */
  setInterval(function () {
    if (document.visibilityState === "visible") syncBoard();
  }, 30000);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") syncBoard();
  });

  syncBoard();
})();

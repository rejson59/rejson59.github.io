/* ==========================================================================
   Rejson Widgets — Logika Panelu Admina (Supabase Auth + RLS + AI Prompt Gen)
   ========================================================================== */

(function () {
  "use strict";

  var STATUS_META = {
    new: "Nowe",
    under_review: "Rozważane",
    planned: "Planowane",
    in_progress: "W trakcie",
    completed: "Wdrożone",
    closed: "Zamknięte"
  };

  var SEVERITY_META = {
    low: "Drobny",
    normal: "Normalny",
    high: "Poważny",
    critical: "Krytyczny"
  };

  var state = {
    mode: "loading", // "setup" | "login" | "dashboard"
    sandboxMode: false,
    adminEmail: "",
    items: [],
    selectedId: null,
    projectFilter: "all",
    typeFilter: "all",
    statusFilter: "all",
    sortBy: "newest",
    search: ""
  };

  var authView = document.getElementById("auth-view");
  var dashView = document.getElementById("dash-view");
  var authTitle = document.getElementById("auth-title");
  var authSub = document.getElementById("auth-sub");
  var authForm = document.getElementById("auth-form");
  var authEmail = document.getElementById("auth-email");
  var authPass = document.getElementById("auth-pass");
  var authSubmitBtn = document.getElementById("auth-submit-btn");
  var authError = document.getElementById("auth-error");
  var sandboxEnterBtn = document.getElementById("btn-sandbox-enter");
  var modeBadge = document.getElementById("cloud-mode-badge");
  var logoutBtn = document.getElementById("btn-logout");

  var feedEl = document.getElementById("submissions-feed");
  var inspectorEl = document.getElementById("inspector-panel");
  var projPillsEl = document.getElementById("project-pills");
  var toastEl = document.getElementById("admin-toast");

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return isNaN(d)
      ? "—"
      : d.toLocaleString("pl-PL", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit"
        });
  }

  var toastTimer = 0;
  function notify(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, 2800);
  }

  /* Motyw jasny/ciemny */
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
  });

  /* Sprawdzenie statusu chmury Supabase przy starcie */
  async function initAdmin() {
    try {
      var status = await window.RejsonCloud.rpc("admin_setup_status", {}, true);
      if (status && status.is_admin) {
        state.sandboxMode = false;
        state.adminEmail = status.admin_email || "";
        await enterDashboard();
        return;
      }
      state.mode = status && status.initialized ? "login" : "setup";
      renderAuthScreen(false);
    } catch (err) {
      /* Środowisko bez wyjścia na zewnętrzną sieć -> pokazujemy ekran z opcją Sandbox 1-klik */
      state.mode = "setup";
      renderAuthScreen(true);
    }
  }

  function renderAuthScreen(offlineHint) {
    authView.hidden = false;
    dashView.hidden = true;
    logoutBtn.hidden = true;
    authError.hidden = true;

    if (state.mode === "setup") {
      authTitle.textContent = "Pierwsza aktywacja Panelu Rejson59";
      authSub.textContent = offlineHint
        ? "Połączenie zewnętrzne jest ograniczone w tej sieci — kliknij poniżej „Otwórz Podgląd Sandbox”, aby przetestować pełny Panel Admina lokalnie."
        : "Utwórz swoje konto właściciela w Supabase Auth. Po pierwszym utworzeniu dostęp administracyjny zostanie na stałe zablokowany wyłącznie dla Twojego konta.";
      authSubmitBtn.textContent = "Utwórz konto właściciela i otwórz Panel";
    } else {
      authTitle.textContent = "Logowanie do Panelu Admina";
      authSub.textContent =
        "Zaloguj się kontem właściciela Supabase, aby zarządzać zgłoszeniami ze wszystkich stron Rejson59.";
      authSubmitBtn.textContent = "Zaloguj się do Panelu";
    }
  }

  authForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    authError.hidden = true;
    authSubmitBtn.disabled = true;
    var email = authEmail.value.trim();
    var pass = authPass.value;

    try {
      if (state.mode === "setup") {
        await window.RejsonCloud.signUpOwner(email, pass);
      } else {
        await window.RejsonCloud.signInOwner(email, pass, false);
      }
      state.sandboxMode = false;
      state.adminEmail = email;
      await enterDashboard();
    } catch (err) {
      authError.textContent = err.message || "Nie udało się połączyć z Supabase Auth.";
      authError.hidden = false;
    } finally {
      authSubmitBtn.disabled = false;
    }
  });

  sandboxEnterBtn.addEventListener("click", async function () {
    state.sandboxMode = true;
    state.adminEmail = "tryb-demo@rejson59";
    await enterDashboard();
  });

  logoutBtn.addEventListener("click", function () {
    window.RejsonCloud.setStoredSession(null);
    state.sandboxMode = false;
    state.mode = "login";
    initAdmin();
  });

  async function enterDashboard() {
    authView.hidden = true;
    dashView.hidden = false;
    logoutBtn.hidden = false;
    modeBadge.textContent = state.sandboxMode
      ? "Tryb Sandbox Demo (lokalny)"
      : "Chmura Supabase Live · " + (state.adminEmail || "Owner");
    await fetchAllSubmissions();
  }

  async function fetchAllSubmissions() {
    if (state.sandboxMode) {
      var mirror = window.RejsonCloud.loadMirror();
      state.items = (mirror.items || []).slice();
    } else {
      try {
        var rows = await window.RejsonCloud.restTable(
          "submissions?select=*&order=created_at.desc",
          "GET"
        );
        state.items = Array.isArray(rows) ? rows : [];
      } catch (err) {
        notify("Błąd odczytu chmury: " + err.message);
      }
    }

    if (
      state.items.length > 0 &&
      (!state.selectedId ||
        !state.items.some(function (x) {
          return x.id === state.selectedId;
        }))
    ) {
      state.selectedId = state.items[0].id;
    }
    renderAll();
  }

  function renderKPIs() {
    var total = state.items.length;
    var fresh = state.items.filter(function (x) {
      return x.status === "new";
    }).length;
    var bugs = state.items.filter(function (x) {
      return x.type === "bug";
    });
    var critBugs = bugs.filter(function (x) {
      return x.severity === "high" || x.severity === "critical";
    }).length;
    var ideas = state.items.filter(function (x) {
      return x.type === "idea";
    }).length;
    var votes = state.items.reduce(function (acc, x) {
      return acc + Number(x.upvotes_count || 0);
    }, 0);

    var projs = {};
    state.items.forEach(function (x) {
      projs[x.project_slug] = (projs[x.project_slug] || 0) + 1;
    });

    document.getElementById("kpi-total").textContent = String(total);
    document.getElementById("kpi-projects-note").textContent =
      "Z " + Object.keys(projs).length + " aktywnych stron";
    document.getElementById("kpi-new").textContent = String(fresh);
    document.getElementById("kpi-bugs").textContent = String(bugs.length);
    document.getElementById("kpi-bugs-crit").textContent =
      critBugs > 0 ? critBugs + " o wysokim priorytecie" : "Brak błędów krytycznych";
    document.getElementById("kpi-ideas").textContent = String(ideas);
    document.getElementById("kpi-votes").textContent = votes + " polubień łącznie";

    /* Pigułki projektów */
    var pillsHTML =
      '<button type="button" class="pill-opt ' +
      (state.projectFilter === "all" ? "is-active" : "") +
      '" data-proj-pill="all">Wszystkie (' +
      total +
      ")</button>" +
      Object.keys(projs)
        .sort(function (a, b) {
          return projs[b] - projs[a];
        })
        .map(function (slug) {
          return (
            '<button type="button" class="pill-opt ' +
            (state.projectFilter === slug ? "is-active" : "") +
            '" data-proj-pill="' +
            esc(slug) +
            '">' +
            esc(slug) +
            " (" +
            projs[slug] +
            ")</button>"
          );
        })
        .join("");

    projPillsEl.innerHTML = pillsHTML;
  }

  function getFilteredItems() {
    var q = state.search.trim().toLowerCase();
    var list = state.items.filter(function (it) {
      if (state.projectFilter !== "all" && it.project_slug !== state.projectFilter) return false;
      if (state.typeFilter !== "all" && it.type !== state.typeFilter) return false;
      if (state.statusFilter !== "all" && it.status !== state.statusFilter) return false;
      if (!q) return true;
      var hay = [
        it.title,
        it.description,
        it.project_slug,
        it.author_name,
        it.author_contact,
        it.page_url,
        JSON.stringify(it.diagnostics || {})
      ]
        .join(" ")
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    var sevRank = { critical: 4, high: 3, normal: 2, low: 1 };
    list.sort(function (a, b) {
      if (state.sortBy === "votes") return (b.upvotes_count || 0) - (a.upvotes_count || 0);
      if (state.sortBy === "priority") {
        return (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0);
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return list;
  }

  function renderFeed() {
    var filtered = getFilteredItems();
    if (!filtered.length) {
      feedEl.innerHTML =
        '<div class="glass-card" style="padding:28px;text-align:center;color:var(--muted)">Brak zgłoszeń spełniających wybrane filtry.</div>';
      return;
    }

    feedEl.innerHTML = filtered
      .map(function (it) {
        var selected = it.id === state.selectedId;
        return (
          '<button type="button" class="sub-row ' +
          (selected ? "is-selected" : "") +
          '" data-select-id="' +
          esc(it.id) +
          '">' +
          '  <div class="sub-top">' +
          '    <div class="badge-row">' +
          '      <span class="tag-badge mono">' +
          esc(it.project_slug) +
          "</span>" +
          '      <span class="tag-badge ' +
          (it.type === "bug" ? "tag-bug" : "tag-idea") +
          '">' +
          (it.type === "bug" ? "Błąd" : "Pomysł") +
          "</span>" +
          '      <span class="tag-badge st-' +
          esc(it.status) +
          '">' +
          esc(STATUS_META[it.status] || it.status) +
          "</span>" +
          (!it.is_public ? '<span class="tag-badge">Prywatne</span>' : "") +
          (it.is_demo ? '<span class="tag-badge">DEMO</span>' : "") +
          "    </div>" +
          '    <span class="mono" style="font-size:12px;color:#fb7185">❤ ' +
          Number(it.upvotes_count || 0) +
          "</span>" +
          "  </div>" +
          '  <h3 class="sub-title">' +
          esc(it.title) +
          "</h3>" +
          (it.description ? '<p class="sub-snippet">' + esc(it.description) + "</p>" : "") +
          '  <div class="sub-foot">' +
          "    <span>" +
          esc(it.author_name || "Anonim") +
          "</span>" +
          "    <span>" +
          esc(fmtDate(it.created_at)) +
          "</span>" +
          "  </div>" +
          "</button>"
        );
      })
      .join("");
  }

  function renderInspector() {
    var item = state.items.find(function (x) {
      return x.id === state.selectedId;
    });
    if (!item) {
      inspectorEl.innerHTML =
        '<p style="margin:0;color:var(--muted)">Wybierz zgłoszenie z listy po lewej stronie, aby zobaczyć szczegóły, logi błędów i wysłać odpowiedź.</p>';
      return;
    }

    var diag = item.diagnostics || {};
    var errs = Array.isArray(diag.consoleErrors) ? diag.consoleErrors : [];
    var hasDiag = Boolean(diag.browser || diag.os || diag.viewport || errs.length);

    inspectorEl.innerHTML =
      "<div>" +
      '  <div class="sub-top" style="margin-bottom:10px">' +
      '    <div class="badge-row">' +
      '      <span class="tag-badge mono">' +
      esc(item.project_slug) +
      "</span>" +
      '      <span class="tag-badge ' +
      (item.type === "bug" ? "tag-bug" : "tag-idea") +
      '">' +
      (item.type === "bug"
        ? "Błąd · " + (SEVERITY_META[item.severity] || "Normalny")
        : "Pomysł · " + item.category) +
      "</span>" +
      "    </div>" +
      (item.page_url
        ? '<a href="' +
          esc(item.page_url) +
          '" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--accent)">Otwórz stronę ↗</a>'
        : "") +
      "  </div>" +
      '  <h2 style="font-size:20px;margin-bottom:8px">' +
      esc(item.title) +
      "</h2>" +
      '  <p style="margin:0;font-size:14.5px;color:var(--text);white-space:pre-wrap">' +
      esc(item.description || "(Brak dodatkowego opisu)") +
      "</p>" +
      '  <p class="mono" style="margin:10px 0 0;font-size:12px;color:var(--muted)">Autor: ' +
      esc(item.author_name || "Anonim") +
      (item.author_contact ? " · Kontakt prywatny: " + esc(item.author_contact) : "") +
      " · " +
      esc(fmtDate(item.created_at)) +
      "</p>" +
      "</div>" +
      '<div class="insp-section">' +
      '  <span class="insp-label">Zmień status zgłoszenia</span>' +
      '  <div class="pill-group">' +
      Object.keys(STATUS_META)
        .map(function (stKey) {
          return (
            '<button type="button" class="pill-opt ' +
            (item.status === stKey ? "is-active" : "") +
            '" data-set-status="' +
            stKey +
            '">' +
            STATUS_META[stKey] +
            "</button>"
          );
        })
        .join("") +
      "  </div>" +
      '  <div style="display:flex;gap:18px;margin-top:12px;flex-wrap:wrap;font-size:13px">' +
      '    <label style="display:flex;align-items:center;gap:7px;cursor:pointer">' +
      '      <input type="checkbox" id="chk-is-public" ' +
      (item.is_public ? "checked" : "") +
      "> Widoczne na publicznej tablicy" +
      "    </label>" +
      '    <label style="display:flex;align-items:center;gap:7px;cursor:pointer">' +
      '      <input type="checkbox" id="chk-is-pinned" ' +
      (item.is_pinned ? "checked" : "") +
      "> Przypnij na samej górze" +
      "    </label>" +
      "  </div>" +
      "</div>" +
      '<div class="insp-section">' +
      '  <label class="insp-label" for="admin-reply-box">Oficjalna odpowiedź Rejson59 (widoczna w widżecie)</label>' +
      '  <textarea class="reply-textarea" id="admin-reply-box" placeholder="Np. Dzięki za zgłoszenie! Poprawka właśnie wleciała na GitHub Pages…">' +
      esc(item.admin_reply || "") +
      "</textarea>" +
      '  <div style="display:flex;gap:8px;margin-top:8px">' +
      '    <button type="button" class="btn btn-primary btn-sm" id="btn-save-reply">Zapisz odpowiedź</button>' +
      "  </div>" +
      "</div>" +
      (hasDiag
        ? '<div class="insp-section">' +
          '  <span class="insp-label">Automatyczna diagnostyka urządzenia i błędy JS</span>' +
          '  <div class="diag-grid">' +
          '    <div class="diag-cell"><span>Przeglądarka</span>' +
          esc(diag.browser || "—") +
          "</div>" +
          '    <div class="diag-cell"><span>System operacyjny</span>' +
          esc(diag.os || "—") +
          "</div>" +
          '    <div class="diag-cell"><span>Ekran / Viewport</span>' +
          esc(diag.viewport || "—") +
          "</div>" +
          '    <div class="diag-cell"><span>Język / Dotyk</span>' +
          esc((diag.language || "pl") + (diag.touch ? " · Ekran dotykowy" : " · Mysz + klawiatura")) +
          "</div>" +
          "  </div>" +
          (errs.length
            ? '<pre class="code-block" style="margin-top:10px;font-size:11.5px">' +
              esc(errs.join("\n")) +
              "</pre>"
            : "") +
          "</div>"
        : "") +
      '<div class="insp-section" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between">' +
      '  <div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '    <button type="button" class="btn btn-primary btn-sm" id="btn-copy-ai-prompt">Kopiuj prompt dla AI</button>' +
      '    <button type="button" class="btn btn-glass btn-sm" id="btn-open-gh-issue">GitHub Issue w repo ↗</button>' +
      "  </div>" +
      '  <button type="button" class="btn btn-glass btn-sm" id="btn-delete-item" style="color:var(--danger)">Usuń</button>' +
      "</div>";
  }

  function renderAll() {
    renderKPIs();
    renderFeed();
    renderInspector();
  }

  async function patchSelectedItem(patch, successMsg) {
    var idx = state.items.findIndex(function (x) {
      return x.id === state.selectedId;
    });
    if (idx === -1) return;
    var id = state.items[idx].id;
    Object.assign(state.items[idx], patch);
    renderAll();

    if (state.sandboxMode) {
      var mirror = window.RejsonCloud.loadMirror();
      var mIdx = mirror.items.findIndex(function (m) {
        return m.id === id;
      });
      if (mIdx !== -1) Object.assign(mirror.items[mIdx], patch);
      window.RejsonCloud.saveMirror(mirror);
      notify(successMsg || "Zapisano (Sandbox)");
      return;
    }

    try {
      await window.RejsonCloud.restTable(
        "submissions?id=eq." + encodeURIComponent(id),
        "PATCH",
        patch,
        { Prefer: "return=representation" }
      );
      notify(successMsg || "Zapisano w chmurze Supabase");
    } catch (err) {
      notify("Błąd zapisu: " + err.message);
    }
  }

  function buildAIPrompt(item) {
    var diag = item.diagnostics || {};
    var errs = Array.isArray(diag.consoleErrors) && diag.consoleErrors.length
      ? "\nPrzechwycone błędy konsoli JS:\n" + diag.consoleErrors.join("\n")
      : "";
    return [
      "Repozytorium: rejson59/" + item.project_slug,
      item.page_url ? "Adres strony live: " + item.page_url : "",
      "Typ zgłoszenia: " + (item.type === "bug" ? "Naprawa błędu (" + item.severity + ")" : "Nowa funkcja / Update"),
      "Tytuł: " + item.title,
      "Opis od użytkownika:\n" + (item.description || "(brak dodatkowego opisu)"),
      diag.browser
        ? "Środowisko użytkownika: " + diag.browser + ", " + diag.os + ", viewport " + diag.viewport
        : "",
      errs,
      "\nZbadaj przyczynę w kodzie projektu rejson59/" +
        item.project_slug +
        " i wdróż czyste, kompletne rozwiązanie."
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  /* Obsługa kliknięć na liście i w inspektorze */
  feedEl.addEventListener("click", function (e) {
    var row = e.target.closest("[data-select-id]");
    if (!row) return;
    state.selectedId = row.dataset.selectId;
    renderFeed();
    renderInspector();
  });

  projPillsEl.addEventListener("click", function (e) {
    var pill = e.target.closest("[data-proj-pill]");
    if (!pill) return;
    state.projectFilter = pill.dataset.projPill;
    renderAll();
  });

  document.querySelectorAll("[data-type-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.typeFilter = btn.dataset.typeFilter;
      document.querySelectorAll("[data-type-filter]").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      renderFeed();
    });
  });

  document.getElementById("filter-status").addEventListener("change", function (e) {
    state.statusFilter = e.target.value;
    renderFeed();
  });

  document.getElementById("sort-by").addEventListener("change", function (e) {
    state.sortBy = e.target.value;
    renderFeed();
  });

  document.getElementById("admin-search").addEventListener("input", function (e) {
    state.search = e.target.value;
    renderFeed();
  });

  document.getElementById("btn-refresh").addEventListener("click", function () {
    fetchAllSubmissions().then(function () {
      notify("Dane odświeżone");
    });
  });

  document.getElementById("btn-clear-demo").addEventListener("click", async function () {
    if (state.sandboxMode) {
      var mirror = window.RejsonCloud.loadMirror();
      mirror.items = mirror.items.filter(function (x) {
        return !x.is_demo;
      });
      window.RejsonCloud.saveMirror(mirror);
      await fetchAllSubmissions();
      notify("Usunięto przykładowe wpisy DEMO");
      return;
    }
    try {
      var res = await window.RejsonCloud.rpc("clear_demo_submissions", {}, true);
      await fetchAllSubmissions();
      notify("Usunięto wpisów DEMO: " + ((res && res.deleted) || 0));
    } catch (err) {
      notify("Błąd: " + err.message);
    }
  });

  inspectorEl.addEventListener("click", async function (e) {
    var stBtn = e.target.closest("[data-set-status]");
    if (stBtn) {
      patchSelectedItem({ status: stBtn.dataset.setStatus }, "Zmieniono status zgłoszenia");
      return;
    }

    if (e.target.id === "btn-save-reply") {
      var val = document.getElementById("admin-reply-box").value.trim();
      patchSelectedItem(
        {
          admin_reply: val || null,
          admin_replied_at: val ? new Date().toISOString() : null
        },
        "Odpowiedź zapisana — jest już widoczna w widżecie!"
      );
      return;
    }

    if (e.target.id === "btn-copy-ai-prompt") {
      var cur = state.items.find(function (x) {
        return x.id === state.selectedId;
      });
      if (cur) {
        navigator.clipboard.writeText(buildAIPrompt(cur)).then(function () {
          notify("Skopiowano gotowy prompt naprawczy dla AI!");
        });
      }
      return;
    }

    if (e.target.id === "btn-open-gh-issue") {
      var item = state.items.find(function (x) {
        return x.id === state.selectedId;
      });
      if (item) {
        var repoName =
          item.project_slug === "rejson59.github.io"
            ? "rejson59.github.io"
            : item.project_slug;
        var issueUrl =
          "https://github.com/rejson59/" +
          encodeURIComponent(repoName) +
          "/issues/new?title=" +
          encodeURIComponent("[" + (item.type === "bug" ? "Bug" : "Update") + "] " + item.title) +
          "&body=" +
          encodeURIComponent(buildAIPrompt(item));
        window.open(issueUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (e.target.id === "btn-delete-item") {
      var targetId = state.selectedId;
      if (!targetId) return;
      state.items = state.items.filter(function (x) {
        return x.id !== targetId;
      });
      state.selectedId = state.items[0] ? state.items[0].id : null;
      renderAll();

      if (state.sandboxMode) {
        var m = window.RejsonCloud.loadMirror();
        m.items = m.items.filter(function (x) {
          return x.id !== targetId;
        });
        window.RejsonCloud.saveMirror(m);
        notify("Zgłoszenie usunięte");
      } else {
        await window.RejsonCloud.restTable(
          "submissions?id=eq." + encodeURIComponent(targetId),
          "DELETE"
        );
        notify("Zgłoszenie usunięte z bazy Supabase");
      }
    }
  });

  inspectorEl.addEventListener("change", function (e) {
    if (e.target.id === "chk-is-public") {
      patchSelectedItem(
        { is_public: e.target.checked },
        e.target.checked ? "Upubliczniono na tablicy" : "Ukryto przed publiczną tablicą"
      );
    } else if (e.target.id === "chk-is-pinned") {
      patchSelectedItem(
        { is_pinned: e.target.checked },
        e.target.checked ? "Przypięto na górze tablicy" : "Odpięto zgłoszenie"
      );
    }
  });

  initAdmin();
})();

/* rejson59.github.io — lista projektów pobierana na żywo z API GitHuba.
   Najpierw renderujemy ostatnio zapisane dane z cache / kopii zapasowej
   (projects-data.js), a równolegle — oraz przy powrocie na kartę i cyklicznie
   w tle — odpytujemy API GitHuba z użyciem ETag (If-None-Match). Dzięki temu
   zmiana opisu, usunięcie lub dodanie repozytorium na GitHubie od razu
   aktualizuje stronę na żywo bez przeładowywania ramek podglądu. */

(function () {
  "use strict";

  var GH_USER = "rejson59";
  var API_URL = "https://api.github.com/users/" + GH_USER + "/repos?per_page=100&sort=updated";
  var CACHE_KEY = "rejson_repos_cache_v2";

  /* Repozytoria infrastrukturalne — to nie projekty, więc nie pokazujemy ich jako kart. */
  var EXCLUDED = { "rejson59": true, "rejson59.github.io": true };

  /* Projekty wyróżnione w górnej sekcji — nie duplikujemy ich w dolnej siatce projektów. */
  var FEATURED = { "Jakuplayer": true, "JoyPad": true, "mconline": true, "VibeAnimations": true };

  /* Opisy dla projektów, które nie mają opisu na GitHubie (na podstawie ich README).
     Gdy dodasz opis w ustawieniach repozytorium na GitHubie, zastąpi on tekst stąd. */
  var DESCRIPTION_OVERRIDES = {
    "X-Offline": "Apka w stylu X (Twitter): posty przeglądane w podglądzie zapisują się w telefonie, żeby dało się je czytać później bez internetu. Bez API i serwerów — wszystko dzieje się lokalnie.",
    "ReysonAI": "ReysonAI 2.0 — lekki, samorozwijający się system AI mówiący po polsku, napisany w czystym Pythonie bez żadnych zależności. Działa nawet na 4 GB RAM, także całkowicie bez internetu.",
    "PomyslyNaProjekty": "Zbiór pomysłów i notatek na przyszłe projekty.",
    "MiraOS": "MiraOS — eksperymentalny interfejs systemu operacyjnego, udostępniony w repozytorium jako paczka ZIP.",
    "lumen-os": "LumenOS — nowoczesna symulacja systemu operacyjnego działającego w przeglądarce (paczka ZIP w repozytorium)."
  };

  var FALLBACK_DESC = "Projekt w początkowej fazie rozwoju — opis nie został jeszcze dodany na GitHubie. Szczegóły znajdziesz w repozytorium.";

  /* Kolory języków zgodne z GitHubem (github.com/github-linguist) */
  var LANG_COLORS = {
    "JavaScript": "#f1e05a", "TypeScript": "#3178c6", "Python": "#3572A5",
    "Kotlin": "#A97BFF", "C#": "#178600", "C++": "#f34b7d", "C": "#555555",
    "HTML": "#e34c26", "CSS": "#663399", "Java": "#b07219", "Go": "#00ADD8",
    "Rust": "#dea584", "Shell": "#89e051", "PHP": "#4F5D95", "Ruby": "#701516",
    "Swift": "#F05138", "Dart": "#00B4AB", "Lua": "#000080"
  };

  /* ---------- Stan ---------- */
  var state = { query: "", liveOnly: false, lang: "all", sort: "updated" };
  var allProjects = [];
  var gridProjects = [];
  var firstRenderDone = false;
  var cardCache = {}; /* name -> { el, sig, liveUrl } */

  /* ---------- Elementy ---------- */
  var grid = document.getElementById("grid");
  var emptyState = document.getElementById("empty-state");
  var resultCount = document.getElementById("result-count");
  var searchInput = document.getElementById("search");
  var langSelect = document.getElementById("filter-lang");
  var sortSelect = document.getElementById("sort");
  var dataStatus = document.getElementById("data-status");
  var originsMoreBtn = document.getElementById("origins-more-btn");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip[data-live]"));

  /* ---------- Pomocnicze ---------- */
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var dateFmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" });
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : dateFmt.format(d);
  }

  function liveUrlFor(repo) {
    var home = (repo.homepage || "").trim();
    if (home) return home;
    if (repo.has_pages) return "https://" + GH_USER + ".github.io/" + repo.name + "/";
    return null;
  }

  function latestActivity(repo) {
    var u = repo.updated_at ? new Date(repo.updated_at).getTime() : 0;
    var p = repo.pushed_at ? new Date(repo.pushed_at).getTime() : 0;
    var max = Math.max(u || 0, p || 0);
    return max ? new Date(max).toISOString() : (repo.updated_at || repo.created_at);
  }

  function normalize(repo) {
    return {
      name: repo.name,
      description: (repo.description && repo.description.trim()) ||
        DESCRIPTION_OVERRIDES[repo.name] || FALLBACK_DESC,
      url: repo.html_url,
      liveUrl: liveUrlFor(repo),
      language: repo.language || null,
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      topics: repo.topics || [],
      created: repo.created_at,
      updated: latestActivity(repo)
    };
  }

  function prepare(repos) {
    return repos
      .filter(function (r) { return r && !EXCLUDED[r.name] && !r.fork; })
      .map(normalize);
  }

  /* ---------- Ikony SVG ---------- */
  var ICON_GITHUB = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.02 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 1.28 1.12.72 1.63.4.55 0 1.14-.01 2.06 0 1.09.01.82.72 1.84-.55 6.29-1.51C23.5 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>';
  var ICON_ARROW = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>';
  var ICON_STAR = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9L6.6 19.7l1.1-6L3.2 9.4l6.1-.8z"/></svg>';
  var ICON_FORK = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="12" cy="19" r="2.5"/><path d="M6 7.5v3a2.5 2.5 0 0 0 2.5 2.5H12M18 7.5v3A2.5 2.5 0 0 1 15.5 13H12M12 13v3.5"/></svg>';

  /* ---------- Renderowanie kart ---------- */
  function badgesHTML(p) {
    var lang = p.language
      ? '<span class="lang"><span class="lang-dot" style="background:' +
        esc(LANG_COLORS[p.language] || "#8b949e") + '"></span>' + esc(p.language) + "</span>"
      : "";
    var liveBadge = p.liveUrl ? '<span class="live-badge">LIVE</span>' : "";
    return lang + liveBadge;
  }

  function metaHTML(p) {
    var meta = '<span class="meta-item mono">Aktualizacja: ' + esc(fmtDate(p.updated)) + "</span>";
    if (p.stars > 0) meta += '<span class="meta-item">' + ICON_STAR + esc(p.stars) + "</span>";
    if (p.forks > 0) meta += '<span class="meta-item">' + ICON_FORK + esc(p.forks) + "</span>";
    return meta;
  }

  function actionsHTML(p) {
    var liveBtn = p.liveUrl
      ? '<a class="btn btn-live btn-sm" href="' + esc(p.liveUrl) + '" target="_blank" rel="noopener noreferrer">Wersja live ' + ICON_ARROW + "</a>"
      : "";
    var codeBtn = '<a class="btn btn-ghost btn-sm" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' +
      ICON_GITHUB + " Kod źródłowy</a>";
    return liveBtn + codeBtn;
  }

  function cardHTML(p, index) {
    var num = ("0" + (index + 1)).slice(-2);
    var topics = p.topics.length
      ? '<ul class="card-topics">' + p.topics.slice(0, 5).map(function (t) {
          return "<li>" + esc(t) + "</li>";
        }).join("") + "</ul>"
      : '<ul class="card-topics" hidden></ul>';

    var preview = p.liveUrl
      ? '<a class="card-preview" href="' + esc(p.liveUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Podgląd ' + esc(p.name) + ' — otwórz live">' +
          '<div class="card-preview-frame" aria-hidden="true"><iframe src="' + esc(p.liveUrl) + '" loading="lazy" tabindex="-1" aria-hidden="true"></iframe><div class="card-preview-topbar"><span class="card-preview-dot"></span><span class="card-preview-dot"></span><span class="card-preview-dot"></span><span class="card-preview-url">' + esc(p.liveUrl.replace(/^https?:\/\//, "")) + '</span></div></div><span class="card-preview-hint">otwórz ↗</span></a>'
      : "";

    return (
      '<article class="project-card reveal" data-tilt data-repo="' + esc(p.name) + '">' +
        '<div class="card-inner">' +
          '<div class="card-sheen" aria-hidden="true"></div>' +
          '<div class="card-top">' +
            '<span class="card-index mono">/ ' + num + "</span>" +
            '<span class="card-badges">' + badgesHTML(p) + "</span>" +
          "</div>" +
          preview +
          '<h3 class="card-title"><a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.name) + "</a></h3>" +
          '<p class="card-desc">' + esc(p.description) + "</p>" +
          topics +
          '<p class="card-meta">' + metaHTML(p) + "</p>" +
          '<div class="card-actions">' + actionsHTML(p) + "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function projectSig(p) {
    return [
      p.name, p.description, p.url, p.liveUrl || "",
      p.language || "", p.stars, p.forks,
      (p.topics || []).join(","), p.updated
    ].join("|");
  }

  function getOrUpdateCard(p, index) {
    var num = ("0" + (index + 1)).slice(-2);
    var sig = projectSig(p);
    var entry = cardCache[p.name];

    if (!entry || entry.liveUrl !== (p.liveUrl || "")) {
      var temp = document.createElement("div");
      temp.innerHTML = cardHTML(p, index);
      var el = temp.firstElementChild;
      var inner = el.querySelector(".card-inner");
      if (canTilt && inner) attachTilt(el, inner, 6);
      entry = { el: el, sig: sig, liveUrl: p.liveUrl || "" };
      cardCache[p.name] = entry;
      return el;
    }

    var cardEl = entry.el;
    var idxEl = cardEl.querySelector(".card-index");
    if (idxEl) idxEl.textContent = "/ " + num;

    if (entry.sig !== sig) {
      var badgesEl = cardEl.querySelector(".card-badges");
      if (badgesEl) badgesEl.innerHTML = badgesHTML(p);
      var titleLink = cardEl.querySelector(".card-title a");
      if (titleLink) {
        titleLink.href = p.url;
        titleLink.textContent = p.name;
      }
      var descEl = cardEl.querySelector(".card-desc");
      if (descEl) descEl.textContent = p.description;
      var topicsEl = cardEl.querySelector(".card-topics");
      if (topicsEl) {
        if (p.topics.length) {
          topicsEl.hidden = false;
          topicsEl.innerHTML = p.topics.slice(0, 5).map(function (t) {
            return "<li>" + esc(t) + "</li>";
          }).join("");
        } else {
          topicsEl.hidden = true;
          topicsEl.innerHTML = "";
        }
      }
      var metaEl = cardEl.querySelector(".card-meta");
      if (metaEl) metaEl.innerHTML = metaHTML(p);
      var actionsEl = cardEl.querySelector(".card-actions");
      if (actionsEl) actionsEl.innerHTML = actionsHTML(p);
      entry.sig = sig;
    }

    return cardEl;
  }

  function sortProjects(list) {
    var copy = list.slice();
    if (state.sort === "name") {
      copy.sort(function (a, b) { return a.name.localeCompare(b.name, "pl"); });
    } else if (state.sort === "created") {
      copy.sort(function (a, b) { return new Date(b.created) - new Date(a.created); });
    } else if (state.sort === "stars") {
      copy.sort(function (a, b) {
        return (b.stars - a.stars) || (new Date(b.updated) - new Date(a.updated));
      });
    } else {
      // domyślnie: najpierw LIVE (mają podgląd/produkt), potem surowe repo — w każdej grupie wg ostatniej aktualizacji
      copy.sort(function (a, b) {
        var aLive = a.liveUrl ? 1 : 0;
        var bLive = b.liveUrl ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;
        return new Date(b.updated) - new Date(a.updated);
      });
    }
    return copy;
  }

  function pluralProjects(n) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (n === 1) return "projekt";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "projekty";
    return "projektów";
  }

  function filteredProjects() {
    var q = state.query.trim().toLowerCase();
    var list = gridProjects.filter(function (p) {
      if (state.liveOnly && !p.liveUrl) return false;
      if (state.lang !== "all" && p.language !== state.lang) return false;
      if (q && (p.name + " " + p.description).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    return sortProjects(list);
  }

  function render() {
    var list = filteredProjects();
    var desiredSet = {};
    var desiredEls = list.map(function (p, i) {
      desiredSet[p.name] = true;
      return getOrUpdateCard(p, i);
    });

    /* Usuwamy z DOM karty, których już nie ma na liście (usunięte repo lub odfiltrowane) */
    Array.prototype.slice.call(grid.children).forEach(function (child) {
      var repoName = child.getAttribute("data-repo");
      if (!repoName || !desiredSet[repoName]) {
        grid.removeChild(child);
      }
    });

    /* Ustawiamy kolejność kart bez niepotrzebnego odpinania już załadowanych iframe */
    desiredEls.forEach(function (el, i) {
      var currentAtPos = grid.children[i];
      if (currentAtPos !== el) {
        grid.insertBefore(el, currentAtPos || null);
      }
    });

    emptyState.hidden = list.length > 0;
    resultCount.textContent = "Wyświetlono " + list.length + " z " + gridProjects.length + " projektów";
    revealCards();
  }

  function updateStats() {
    var live = allProjects.filter(function (p) { return p.liveUrl; }).length;
    var langs = {};
    allProjects.forEach(function (p) { if (p.language) langs[p.language] = true; });
    document.getElementById("stat-total").textContent = allProjects.length;
    document.getElementById("stat-live").textContent = live;
    document.getElementById("stat-langs").textContent = Object.keys(langs).length;
    if (originsMoreBtn) {
      originsMoreBtn.textContent = "Zobacz pozostałe " + gridProjects.length + " " + pluralProjects(gridProjects.length) + " ↓";
    }
  }

  function updateLangFilter() {
    var counts = {};
    gridProjects.forEach(function (p) {
      if (p.language) counts[p.language] = (counts[p.language] || 0) + 1;
    });
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var current = langSelect.value || "all";
    langSelect.innerHTML =
      '<option value="all">Wszystkie technologie</option>' +
      names.map(function (n) {
        return '<option value="' + esc(n) + '">' + esc(n) + " (" + counts[n] + ")</option>";
      }).join("");
    langSelect.value = names.indexOf(current) >= 0 ? current : "all";
    state.lang = langSelect.value;
  }

  function setProjects(repos, isLive) {
    allProjects = prepare(repos);
    gridProjects = allProjects.filter(function (p) { return !FEATURED[p.name]; });
    updateStats();
    updateLangFilter();
    render();
    if (isLive) {
      dataStatus.textContent = "Dane: na żywo z API GitHuba";
      dataStatus.classList.add("is-live");
    } else if (window.PROJECTS_GENERATED_AT) {
      dataStatus.textContent = "Dane: kopia zapasowa z " + window.PROJECTS_GENERATED_AT;
      dataStatus.classList.remove("is-live");
    }
  }

  /* ---------- Pojawianie się kart ---------- */
  var revealObserver = null;
  function revealCards() {
    var cards = grid.querySelectorAll(".reveal:not(.in)");
    if (!cards.length) return;
    if (firstRenderDone || !("IntersectionObserver" in window)) {
      cards.forEach(function (c) { c.classList.add("in"); });
      firstRenderDone = true;
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            revealObserver.unobserve(e.target);
          }
        });
      }, { threshold: 0.08 });
    }
    cards.forEach(function (c, i) {
      c.style.transitionDelay = (i % 3) * 60 + "ms";
      revealObserver.observe(c);
    });
    firstRenderDone = true;
  }

  /* ---------- Efekt 3D (tilt + połysk za kursorem) ---------- */
  var canTilt =
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function attachTilt(wrapper, target, maxDeg) {
    var raf = null;
    function onMove(ev) {
      var rect = wrapper.getBoundingClientRect();
      var px = (ev.clientX - rect.left) / rect.width;
      var py = (ev.clientY - rect.top) / rect.height;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        target.style.transition = "transform 0.08s ease-out";
        target.style.transform =
          "rotateY(" + ((px - 0.5) * 2 * maxDeg).toFixed(2) + "deg) " +
          "rotateX(" + ((0.5 - py) * 2 * maxDeg).toFixed(2) + "deg)";
        target.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        target.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      });
    }
    function onLeave() {
      if (raf) cancelAnimationFrame(raf);
      target.style.transition = "transform 0.45s cubic-bezier(0.22, 0.8, 0.3, 1)";
      target.style.transform = "rotateY(0deg) rotateX(0deg)";
    }
    wrapper.addEventListener("pointermove", onMove);
    wrapper.addEventListener("pointerleave", onLeave);
  }

  /* Karta profilu w hero oraz statyczne karty wyróżnione (Jakuplayer, JoyPad) */
  (function initStaticTilt() {
    if (!canTilt) return;
    var profile = document.querySelector(".profile-card");
    if (profile) attachTilt(profile, profile, 4);
    document.querySelectorAll(".showcase-item .project-card[data-tilt]").forEach(function (card) {
      var inner = card.querySelector(".card-inner");
      if (inner) attachTilt(card, inner, 5);
    });
  })();

  /* ---------- Filtry i wyszukiwarka ---------- */
  var searchTimer = null;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = searchInput.value;
      render();
    }, 120);
  });

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.classList.remove("is-active"); });
      chip.classList.add("is-active");
      state.liveOnly = chip.dataset.live === "live";
      render();
    });
  });

  langSelect.addEventListener("change", function () {
    state.lang = langSelect.value;
    render();
  });

  sortSelect.addEventListener("change", function () {
    state.sort = sortSelect.value;
    render();
  });

  document.getElementById("reset-filters").addEventListener("click", function () {
    state = { query: "", liveOnly: false, lang: "all", sort: state.sort };
    searchInput.value = "";
    langSelect.value = "all";
    chips.forEach(function (c) { c.classList.toggle("is-active", c.dataset.live === "all"); });
    render();
  });

  /* ---------- Motyw jasny/ciemny ---------- */
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* ignorujemy */ }
  });

  /* ---------- Synchronizacja na żywo z API GitHuba (ETag + localStorage) ---------- */
  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.data) && parsed.data.length) return parsed;
    } catch (e) { /* ignorujemy */ }
    return null;
  }

  function writeCache(etag, data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        etag: etag || "",
        data: data,
        savedAt: Date.now()
      }));
    } catch (e) { /* ignorujemy */ }
  }

  var fetchInFlight = false;
  var lastCheckAt = 0;

  function syncWithGitHub(force) {
    if (!window.fetch || fetchInFlight) return;
    var now = Date.now();
    if (!force && now - lastCheckAt < 10000) return;
    fetchInFlight = true;
    lastCheckAt = now;

    var cached = readCache();
    var headers = { "Accept": "application/vnd.github+json" };
    if (cached && cached.etag) {
      headers["If-None-Match"] = cached.etag;
    }

    var controller = window.AbortController ? new AbortController() : null;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;

    fetch(API_URL, {
      cache: "no-store",
      headers: headers,
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        clearTimeout(timeout);
        if (res.status === 304 && cached && cached.data) {
          setProjects(cached.data, true);
          return null;
        }
        if (!res.ok) return Promise.reject(new Error(res.status));
        var newEtag = res.headers ? res.headers.get("ETag") : "";
        return res.json().then(function (data) {
          return { etag: newEtag, data: data };
        });
      })
      .then(function (result) {
        fetchInFlight = false;
        if (result && Array.isArray(result.data) && result.data.length) {
          writeCache(result.etag, result.data);
          setProjects(result.data, true);
        }
      })
      .catch(function () {
        clearTimeout(timeout);
        fetchInFlight = false;
      });
  }

  /* ---------- Start ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();

  var initialCache = readCache();
  if (initialCache && initialCache.data) {
    setProjects(initialCache.data, true);
  } else if (window.PROJECTS_FALLBACK) {
    setProjects(window.PROJECTS_FALLBACK, false);
  }

  syncWithGitHub(true);

  /* Automatyczne odświeżanie po powrocie na kartę oraz cyklicznie w tle */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") syncWithGitHub(false);
  });
  window.addEventListener("focus", function () {
    syncWithGitHub(false);
  });
  setInterval(function () {
    if (document.visibilityState === "visible") syncWithGitHub(false);
  }, 45000);
})();

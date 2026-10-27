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
  var FEATURED = { "RejStream": true, "Jakuplayer": true, "JoyPad": true, "mconline": true, "VibeAnimations": true };

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
  var state = { query: "", liveOnly: false, lang: "all", sort: "created" };
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
    if (repo.has_pages || repo.name === "rejson-widgets") {
      return "https://" + GH_USER + ".github.io/" + repo.name + "/";
    }
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
  var ICON_ARROW = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>';
  var ICON_STAR = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9L6.6 19.7l1.1-6L3.2 9.4l6.1-.8z"/></svg>';
  var ICON_FORK = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="12" cy="19" r="2.5"/><path d="M6 7.5v3a2.5 2.5 0 0 0 2.5 2.5H12M18 7.5v3A2.5 2.5 0 0 1 15.5 13H12M12 13v3.5"/></svg>';
  var ICON_CLICK = '<svg class="icon icon-click" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 2v2"/><path d="M5.6 4.4l1.4 1.4"/><path d="M16.4 4.4l-1.4 1.4"/><path d="M9 13V8a2 2 0 0 1 4 0v3h2a4 4 0 0 1 4 4v1a6 6 0 0 1-6 6h-1.5a5.5 5.5 0 0 1-4.6-2.5L4.3 15.6a1.7 1.7 0 0 1 2.5-2.2L9 15V13z"/></svg>';
  var ICON_EYE = '<svg class="icon icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var numFmt = new Intl.NumberFormat("pl-PL");

  function projectViewsCount(name) {
    /* Licznik kliknięć pokazuje wejścia z dzisiejszego dnia (czas polski) */
    if (window.RejsonViews && typeof window.RejsonViews.getTodayCount === "function") {
      return window.RejsonViews.getTodayCount(name);
    }
    return window.RejsonViews ? window.RejsonViews.getCount(name) : 0;
  }

  function projectOnlineCount(name) {
    return window.RejsonViews && typeof window.RejsonViews.getOnlineCount === "function"
      ? window.RejsonViews.getOnlineCount(name)
      : 0;
  }

  /* ---------- Renderowanie kart ---------- */
  function badgesHTML(p) {
    var online = projectOnlineCount(p.name);
    var onlineActiveClass = online > 0 ? " is-active-now" : "";
    var onlineBadge =
      '<button class="card-metric is-online mono' + onlineActiveClass + '" type="button" data-project-online="' + esc(p.name) + '" data-tooltip-title="Osoby w projekcie (LIVE)" data-tooltip="Liczba osób aktualnie korzystających z projektu ' + esc(p.name) + ' na żywo." aria-label="Osoby aktualnie w projekcie ' + esc(p.name) + '">' +
        '<span class="online-aura-dot" aria-hidden="true"></span>' +
        '<span class="card-online-num">0</span>' +
      "</button>";
    var viewsBadge =
      '<button class="card-metric is-clicks mono" type="button" data-project-views="' + esc(p.name) + '" data-tooltip-title="Kliknięcia dzisiaj" data-tooltip="Liczba otwarć projektu ' + esc(p.name) + ' dzisiaj — licznik resetuje się o północy czasu polskiego (z 15-min ochroną przed spamem)." aria-label="Liczba kliknięć w projekt ' + esc(p.name) + ' dzisiaj">' +
        ICON_CLICK +
        '<span class="card-views-num">0</span>' +
      "</button>";
    var uniqueBadge =
      '<button class="card-metric is-unique mono" type="button" data-project-unique="' + esc(p.name) + '" data-tooltip-title="Osoby, które wyświetliły projekt" data-tooltip="Liczba różnych osób, które kiedykolwiek wyświetliły projekt ' + esc(p.name) + ' — każdy użytkownik liczony jest tylko raz." aria-label="Liczba unikalnych osób, które wyświetliły projekt ' + esc(p.name) + '">' +
        ICON_EYE +
        '<span class="card-unique-num">0</span>' +
      "</button>";
    var lang = p.language
      ? '<span class="lang"><span class="lang-dot" style="background:' +
        esc(LANG_COLORS[p.language] || "#8b949e") + '"></span>' + esc(p.language) + "</span>"
      : "";
    var liveBadge = p.liveUrl ? '<span class="live-badge">LIVE</span>' : "";
    return onlineBadge + viewsBadge + uniqueBadge + lang + liveBadge;
  }

  function metaHTML(p) {
    var meta = "";
    if (p.created) {
      meta += '<span class="meta-item mono">Utworzono: ' + esc(fmtDate(p.created)) + "</span>";
    }
    if (p.updated) {
      meta += '<span class="meta-item mono">Aktualizacja: ' + esc(fmtDate(p.updated)) + "</span>";
    }
    if (p.stars > 0) meta += '<span class="meta-item">' + ICON_STAR + esc(p.stars) + "</span>";
    if (p.forks > 0) meta += '<span class="meta-item">' + ICON_FORK + esc(p.forks) + "</span>";
    return meta;
  }

  function actionsHTML(p) {
    var liveBtn = p.liveUrl
      ? '<a class="btn btn-live btn-sm" href="' + esc(p.liveUrl) + '" target="_blank" rel="noopener noreferrer">Wersja live ' + ICON_ARROW + "</a>"
      : "";
    var feedbackBtn = '<button class="btn btn-feedback btn-sm" type="button" data-feedback-project="' + esc(p.name) + '" data-rj-keep>' +
      '<span class="feedback-pill-dot" aria-hidden="true"></span>Zgłoś błąd / pomysł</button>';
    return liveBtn + feedbackBtn;
  }

  function cardHTML(p, index) {
    var num = ("0" + (index + 1)).slice(-2);
    var topics = p.topics.length
      ? '<ul class="card-topics">' + p.topics.slice(0, 5).map(function (t) {
          return "<li>" + esc(t) + "</li>";
        }).join("") + "</ul>"
      : '<ul class="card-topics" hidden></ul>';

    var cleanHost = p.liveUrl ? p.liveUrl.replace(/^https?:\/\//, "") : "";
    var preview = p.liveUrl
      ? '<a class="card-preview" href="' + esc(p.liveUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Podgląd ' + esc(p.name) + ' — otwórz live">' +
          '<div class="card-preview-frame" aria-hidden="true"><iframe data-src="' + esc(p.liveUrl) + '" name="rejson-card-preview" data-card-preview="1" tabindex="-1" aria-hidden="true"></iframe><div class="card-preview-topbar"><span class="card-preview-dot"></span><span class="card-preview-dot"></span><span class="card-preview-dot"></span><span class="card-preview-url">' + esc(cleanHost) + '</span></div></div><span class="card-preview-hint">otwórz ↗</span></a>'
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
          '<h3 class="card-title"><a href="' + esc(p.liveUrl || p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.name) + "</a></h3>" +
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
      (p.topics || []).join(","), p.created, p.updated
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
    copy.sort(function (a, b) {
      /* Projekty bez działającej strony (GitHub Pages / live) zawsze na dole */
      var liveDiff = (b.liveUrl ? 1 : 0) - (a.liveUrl ? 1 : 0);
      if (liveDiff !== 0) return liveDiff;

      if (state.sort === "name") {
        return a.name.localeCompare(b.name, "pl");
      }
      if (state.sort === "views") {
        var diff = projectViewsCount(b.name) - projectViewsCount(a.name);
        if (diff !== 0) return diff;
        return new Date(b.created) - new Date(a.created);
      }
      if (state.sort === "oldest") {
        return new Date(a.created) - new Date(b.created);
      }
      if (state.sort === "updated") {
        return new Date(b.updated) - new Date(a.updated);
      }
      if (state.sort === "stars") {
        return (b.stars - a.stars) || (new Date(b.created) - new Date(a.created));
      }
      /* domyślnie ("created"): od najnowszych projektów według daty utworzenia */
      return new Date(b.created) - new Date(a.created);
    });
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
    if (window.RejsonViews && typeof window.RejsonViews.refreshDOM === "function") {
      window.RejsonViews.refreshDOM();
    }
    revealCards();
    observePreviewFrames(grid);
  }

  function animateStatNumber(el, targetValue) {
    if (!el) return;
    var target = Math.max(0, Number(targetValue) || 0);
    if (el._statTarget === target && el._statAnimated) return;
    var from = el._statAnimated ? (Number(el._statCurrent) || 0) : 0;
    el._statTarget = target;
    el._statAnimated = true;

    if (el._statRaf) cancelAnimationFrame(el._statRaf);
    el.classList.remove("is-rolling");
    void el.offsetWidth;
    el.classList.add("is-rolling", "is-counting");

    var duration = 760;
    var startTs = null;
    function step(ts) {
      if (!startTs) startTs = ts;
      var p = Math.min(1, (ts - startTs) / duration);
      var eased = 1 - Math.pow(1 - p, 4);
      var cur = Math.round(from + (target - from) * eased);
      if (el._statCurrent !== cur) {
        el._statCurrent = cur;
        el.textContent = numFmt.format(cur);
      }
      if (p < 1) {
        el._statRaf = requestAnimationFrame(step);
      } else {
        el._statCurrent = target;
        el.textContent = numFmt.format(target);
        el.classList.remove("is-counting");
        el._statRaf = null;
      }
    }
    el._statRaf = requestAnimationFrame(step);
  }

  function updateStats() {
    var live = allProjects.filter(function (p) { return p.liveUrl; }).length;
    var langs = {};
    allProjects.forEach(function (p) { if (p.language) langs[p.language] = true; });
    animateStatNumber(document.getElementById("stat-total"), allProjects.length);
    animateStatNumber(document.getElementById("stat-live"), live);
    animateStatNumber(document.getElementById("stat-langs"), Object.keys(langs).length);
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

  function updateFeaturedMeta() {
    allProjects.forEach(function (p) {
      if (!FEATURED[p.name]) return;
      var el = document.querySelector('[data-featured-meta="' + p.name + '"]');
      if (el) {
        el.innerHTML = metaHTML(p);
      }
    });
  }

  function setProjects(repos, isLive) {
    allProjects = prepare(repos);
    gridProjects = allProjects.filter(function (p) { return !FEATURED[p.name]; });
    updateFeaturedMeta();
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

  /* ---------- Zamrażanie podglądów (screenshot / zamrożony ekran) na słabszych urządzeniach ----------
     - Na mocniejszych urządzeniach (komputery >4 rdzenie i >4 GB RAM) ramki <iframe> ładują się
       normalnie i pozostają żywe tak jak wcześniej.
     - Na słabszych urządzeniach (telefony, tablety, <=4 GB RAM lub <=4 rdzenie CPU):
       przy wejściu na stronę ramki od razu się pobierają, a chwilę po wyrenderowaniu
       zamieniają w zamrożony ekran / screenshot (konwersja <canvas>/WebGL do statycznego <img>,
       zapis zrzutu w IndexedDB, zwolnienie kontekstu WebGL oraz zatrzymanie pętli
       requestAnimationFrame/setInterval/CSS). Dzięki temu nie trzeba czekać podczas scrollowania,
       a przewijanie działa całkowicie bez lagów. */
  var isWeakDevice = (function () {
    try {
      if (navigator.connection && navigator.connection.saveData) return true;
      if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true;
      if (window.matchMedia("(pointer: coarse), (max-width: 820px)").matches) return true;
    } catch (e) { /* ignorujemy */ }
    return false;
  })();

  var SNAPSHOT_DB_NAME = "rejson_iframe_snapshots_v2";
  var SNAPSHOT_STORE = "snapshots";
  var FREEZE_DELAY_MS = 5000; /* ~5 sekund na pełne zakończenie animacji ładowania wewnątrz projektu */
  var snapshotDbPromise = null;

  function openSnapshotDb() {
    if (snapshotDbPromise) return snapshotDbPromise;
    snapshotDbPromise = new Promise(function (resolve) {
      try {
        if (!("indexedDB" in window)) {
          resolve(null);
          return;
        }
        try {
          window.indexedDB.deleteDatabase("rejson_iframe_snapshots_v1");
        } catch (e0) { /* ignorujemy */ }
        var req = window.indexedDB.open(SNAPSHOT_DB_NAME, 1);
        req.onupgradeneeded = function (ev) {
          var db = ev.target.result;
          if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
            db.createObjectStore(SNAPSHOT_STORE);
          }
        };
        req.onsuccess = function (ev) {
          resolve(ev.target.result);
        };
        req.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
    return snapshotDbPromise;
  }

  function snapshotCacheKey(repoName) {
    var isPortrait = window.matchMedia("(max-width: 640px)").matches ? "m" : "d";
    return String(repoName || "") + ":" + isPortrait;
  }

  function getCachedSnapshot(key) {
    return openSnapshotDb().then(function (db) {
      if (!db || !key) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(SNAPSHOT_STORE, "readonly");
          var req = tx.objectStore(SNAPSHOT_STORE).get(key);
          req.onsuccess = function () {
            resolve(req.result || null);
          };
          req.onerror = function () {
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  function saveCachedSnapshot(key, dataUrl) {
    if (!key || !dataUrl) return;
    openSnapshotDb().then(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction(SNAPSHOT_STORE, "readwrite");
        tx.objectStore(SNAPSHOT_STORE).put(dataUrl, key);
      } catch (e) { /* ignorujemy */ }
    });
  }

  function releaseIframeRuntime(iframe) {
    if (!iframe) return;
    try {
      if (iframe.contentWindow && iframe.contentWindow.location) {
        iframe.contentWindow.location.replace("about:blank");
      } else {
        iframe.setAttribute("src", "about:blank");
      }
    } catch (e) {
      iframe.setAttribute("src", "about:blank");
    }
    iframe.style.display = "none";
  }

  /* Zamrażanie jest bezpieczne WYŁĄCZNIE wtedy, gdy mamy naprawdę działający
     obraz. Zepsuty zrzut (albo brak dostępu do dokumentu) nie może zostawić
     podglądu jako samego tła — dlatego każdy zrzut najpierw dekodujemy,
     a klasę is-frozen nadajemy dopiero po sukcesie. */
  function deleteCachedSnapshot(key) {
    if (!key) return;
    openSnapshotDb().then(function (db) {
      if (!db) return;
      try {
        db.transaction(SNAPSHOT_STORE, "readwrite").objectStore(SNAPSHOT_STORE)["delete"](key);
      } catch (e) { /* ignorujemy */ }
    });
  }

  function restoreIframeRuntime(iframe) {
    if (!iframe) return;
    try { iframe.style.display = ""; } catch (e) { /* ignorujemy */ }
  }

  function removeSnapshotFromFrame(frame) {
    if (!frame) return;
    var img = frame.querySelector(".card-preview-snapshot");
    if (img && img.parentNode) img.parentNode.removeChild(img);
  }

  function applySnapshotImgToFrame(frame, iframe, dataUrl, cacheKey) {
    if (!frame || !dataUrl) return Promise.resolve(false);

    return new Promise(function (resolve) {
      var img = frame.querySelector(".card-preview-snapshot");
      if (!img) {
        img = document.createElement("img");
        img.className = "card-preview-snapshot";
        img.alt = "";
        img.decoding = "async";
        frame.insertBefore(img, frame.firstChild);
      }

      var settled = false;

      function fail() {
        if (settled) return;
        settled = true;
        removeSnapshotFromFrame(frame);
        frame.classList.remove("is-frozen");
        restoreIframeRuntime(iframe);
        if (cacheKey) deleteCachedSnapshot(cacheKey); /* zepsuty zrzut nie może wracać */
        resolve(false);
      }

      function done() {
        if (settled) return;
        settled = true;
        frame.classList.add("is-frozen");
        if (iframe) releaseIframeRuntime(iframe);
        resolve(true);
      }

      img.onload = function () {
        if (!img.naturalWidth || !img.naturalHeight) { fail(); return; }
        done();
      };
      img.onerror = fail;
      img.src = dataUrl;

      setTimeout(function () {
        if (settled) return;
        if (img.complete && img.naturalWidth > 0) done();
        else fail();
      }, 2500);
    });
  }

  /* Canvas, który jeszcze nic nie namalował (czarne tło), nie nadaje się na zrzut —
     inaczej "zamrożony" podgląd zostawał czarną plamą na zawsze. */
  function isCanvasNearlyBlack(canvas) {
    try {
      var probe = document.createElement("canvas");
      probe.width = 8;
      probe.height = 8;
      var ctx = probe.getContext("2d", { willReadFrequently: true });
      if (!ctx) return false;
      ctx.drawImage(canvas, 0, 0, 8, 8);
      var px = ctx.getImageData(0, 0, 8, 8).data;
      var sum = 0;
      for (var i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
      return sum / (px.length / 4) < 8;
    } catch (e) {
      return false;
    }
  }

  function freezeIframeAsStaticScreen(frame, iframe, cacheKey) {
    if (!frame || !iframe || frame._frozenDone) return;
    if (frame.classList.contains("is-frozen")) return; /* już pokazuje statyczny obraz */
    frame._frozenDone = true;

    var win = null;
    var doc = null;
    try {
      win = iframe.contentWindow;
      doc = iframe.contentDocument || (win && win.document);
    } catch (e) {
      win = null;
      doc = null;
    }

    /* Brak dostępu do dokumentu — NIE zamrażamy. Wcześniej zostawał po tym
       sam gradient, bo is-frozen blokował wczytanie żywej ramki. */
    if (!win || !doc) {
      frame._frozenDone = false;
      frame._freezeScheduled = false;
      return;
    }

    /* Pusty dokument (about:blank, jeszcze nic nie wczytane) też nie nadaje się
       do zamrożenia — inaczej utrwalilibyśmy pustkę. */
    var docReady = false;
    try {
      var docHref = (doc.location && doc.location.href) || "";
      var bodyKids = doc.body ? doc.body.children.length : 0;
      var bodyText = doc.body ? (doc.body.textContent || "").trim().length : 0;
      docReady = !!docHref && docHref !== "about:blank" && (bodyKids > 0 || bodyText > 0);
    } catch (e) {
      docReady = true; /* cross-origin — nie sprawdzimy, ufamy przeglądarce */
    }

    if (!docReady) {
      frame._frozenDone = false;
      frame._freezeScheduled = false;
      return;
    }

    var committed = false;
    function commitFrozen() {
      if (committed) return;
      committed = true;
      frame.classList.add("is-frozen");
    }

    var executed = false;
    function performFreeze() {
      if (executed) return;
      executed = true;

      try {
        var vw = win.innerWidth || 1;
        var vh = win.innerHeight || 1;
        var canvases = Array.prototype.slice.call(doc.querySelectorAll("canvas"));
        var fullScreenSnapshot = null;

        canvases.forEach(function (canvas) {
          try {
            if (!canvas.width || !canvas.height) return;
            if (isCanvasNearlyBlack(canvas)) return; /* czysty czarny kadr = jeszcze nie namalowany */
            var dataUrl = canvas.toDataURL("image/jpeg", 0.82);
            if (!dataUrl || dataUrl.length < 256) return;

            var rect = canvas.getBoundingClientRect();
            if (canvases.length === 1 && rect.width >= vw * 0.75 && rect.height >= vh * 0.75) {
              fullScreenSnapshot = dataUrl;
            }

            var img = doc.createElement("img");
            img.src = dataUrl;
            img.alt = "";
            img.className = canvas.className || "";
            img.style.cssText = canvas.style.cssText || "";
            if (!img.style.width) img.style.width = (rect.width || canvas.width) + "px";
            if (!img.style.height) img.style.height = (rect.height || canvas.height) + "px";
            img.style.pointerEvents = "none";

            if (canvas.parentNode) {
              canvas.parentNode.replaceChild(img, canvas);
            }

            var gl =
              canvas.getContext("webgl2") ||
              canvas.getContext("webgl") ||
              canvas.getContext("experimental-webgl");
            if (gl) {
              var loseExt = gl.getExtension("WEBGL_lose_context");
              if (loseExt) loseExt.loseContext();
            }
            canvas.width = 1;
            canvas.height = 1;
          } catch (err) { /* ignorujemy pojedynczy canvas */ }
        });

        /* Jeśli cała zawartość ramki to pełnoekranowy canvas 3D/2D i nie ma nad nim nakładek UI,
           zapisujemy zrzut w IndexedDB i zwalniamy cały iframe */
        var bodyChildren = doc.body ? doc.body.children.length : 0;
        if (fullScreenSnapshot && bodyChildren <= 2) {
          applySnapshotImgToFrame(frame, iframe, fullScreenSnapshot, cacheKey).then(function (ok) {
            if (ok) saveCachedSnapshot(cacheKey, fullScreenSnapshot);
            else if (frame) frame._freezeScheduled = false;
          });
          return;
        }

        /* Zatrzymujemy wideo/audio wewnątrz ramki */
        Array.prototype.slice.call(doc.querySelectorAll("video, audio")).forEach(function (m) {
          try {
            m.muted = true;
            m.pause();
          } catch (err) { /* ignorujemy */ }
        });

        /* Wstrzykujemy arkusz zamrażający wszystkie animacje CSS i przejścia */
        var style = doc.createElement("style");
        style.textContent =
          "*, *::before, *::after {" +
          "  animation: none !important;" +
          "  animation-play-state: paused !important;" +
          "  transition: none !important;" +
          "  will-change: auto !important;" +
          "  backdrop-filter: none !important;" +
          "  -webkit-backdrop-filter: none !important;" +
          "}" +
          "html, body {" +
          "  overflow: hidden !important;" +
          "  pointer-events: none !important;" +
          "  user-select: none !important;" +
          "}";
        (doc.head || doc.documentElement).appendChild(style);

        /* Zatrzymujemy wszystkie pętle JS (requestAnimationFrame, setInterval, setTimeout) */
        var noop = function () { return 0; };
        var maxTimerId = win.setTimeout(noop, 0);
        for (var id = Math.max(1, maxTimerId - 2500); id <= maxTimerId + 40; id++) {
          win.clearTimeout(id);
          win.clearInterval(id);
          if (win.cancelAnimationFrame) win.cancelAnimationFrame(id);
        }
        win.requestAnimationFrame = noop;
        win.webkitRequestAnimationFrame = noop;
        win.setInterval = noop;
        win.setTimeout = noop;

        /* dopiero teraz wolno oznaczyć ramkę jako zamrożoną */
        commitFrozen();
      } catch (e) { /* ignorujemy */ }
    }

    try {
      if (win.requestAnimationFrame) {
        win.requestAnimationFrame(performFreeze);
      }
      setTimeout(performFreeze, 140);
    } catch (e) {
      performFreeze();
    }
  }

  function observePreviewFrames(root) {
    /* Na mocniejszych urządzeniach zostawiamy ramki żywe i ładowane standardowo */
    if (!isWeakDevice) return;

    var scope = root || document;
    var frames = scope.querySelectorAll(".card-preview-frame");
    frames.forEach(function (frame) {
      if (frame._weakHandled) return;
      frame._weakHandled = true;

      var iframe = frame.querySelector("iframe");
      if (!iframe) return;

      var card = frame.closest(".project-card");
      var repoName = card ? (card.getAttribute("data-repo") || "") : (iframe.getAttribute("data-src") || iframe.getAttribute("src") || "");
      var key = snapshotCacheKey(repoName);

      /* Na słabszych urządzeniach pobieramy ramki od razu przy wejściu (bez czekania na scroll),
         żeby od razu zamrozić je w gotowe ekrany/screenshoty */
      iframe.removeAttribute("loading");

      /* Żywa ramka: zamrożenie dopiero po pełnym wczytaniu, z bezpiecznikiem */
      function armLiveLoad() {
        function scheduleFreeze() {
          if (frame._freezeScheduled) return;
          frame._freezeScheduled = true;
          setTimeout(function () {
            freezeIframeAsStaticScreen(frame, iframe, key);
          }, FREEZE_DELAY_MS);
        }

        iframe.addEventListener("load", scheduleFreeze, { once: true });
        try {
          if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
            scheduleFreeze();
          }
        } catch (e) { /* cross-origin */ }
      }

      getCachedSnapshot(key).then(function (cachedDataUrl) {
        if (!cachedDataUrl) {
          armLiveLoad();
          return;
        }
        /* Zrzut z cache musi się poprawnie zdekodować — inaczej czyścimy go
           i pozwalamy ramce wczytać się normalnie (zamiast wiecznego tła). */
        applySnapshotImgToFrame(frame, iframe, cachedDataUrl, key).then(function (ok) {
          if (ok) return;
          restoreIframeRuntime(iframe);
          armLiveLoad();
        });
      });
    });
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

  /* ---------- Motyw jasny/ciemny oraz mobilne menu hamburger ---------- */
  var menuToggle = document.getElementById("menu-toggle");
  var siteNav = document.getElementById("site-nav");

  function closeMobileMenu() {
    if (!menuToggle || !siteNav) return;
    menuToggle.setAttribute("aria-expanded", "false");
    siteNav.classList.remove("is-open");
  }

  if (menuToggle && siteNav) {
    menuToggle.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var isOpen = siteNav.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    siteNav.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("a")) {
        closeMobileMenu();
      }
    });

    document.addEventListener("click", function (ev) {
      if (!siteNav.classList.contains("is-open")) return;
      if (!siteNav.contains(ev.target) && !menuToggle.contains(ev.target)) {
        closeMobileMenu();
      }
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeMobileMenu();
    });
  }

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

  observePreviewFrames(document);

  var initialCache = readCache();
  if (initialCache && initialCache.data) {
    setProjects(initialCache.data, true);
  } else if (window.PROJECTS_FALLBACK) {
    setProjects(window.PROJECTS_FALLBACK, false);
  }

  syncWithGitHub(true);

  /* Zachęta do tablicy pomysłów — licznik zgłoszeń i głosów na żywo */
  (function fillBoardCtaCounts() {
    var el = document.getElementById("board-cta-counts");
    if (!el || !window.fetch) return;
    var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
    var SUPABASE_ANON_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";
    fetch(SUPABASE_URL + "/rest/v1/rpc/get_ecosystem_summary", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_project_slug: null }),
      cache: "no-store"
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;
        var items = Number(data.total_items) || 0;
        var votes = Number(data.total_votes) || 0;
        if (items > 0) {
          el.innerHTML = 'już <strong class="mono">' + items + (items === 1 ? " zgłoszenie" : " zgłoszeń") + "</strong> i <strong class=\"mono\">" + votes + (votes === 1 ? " głos" : " głosów") + "</strong> od społeczności";
        }
      })
      .catch(function () { /* zostaje tekst domyślny */ });
  })();

  if (window.RejsonViews && typeof window.RejsonViews.onChange === "function") {
    window.RejsonViews.onChange(function () {
      if (state.sort === "views") {
        render();
      }
    });
  }

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

/* ---------- Soczyste przyciski live: żelkowe trzęsienie po kliknięciu ---------- */
(function () {
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function jelly(btn) {
    if (!btn || (reduce && reduce.matches)) return;
    btn.classList.remove("is-jelly");
    void btn.offsetWidth; /* wymusza restart animacji przy szybkim ponownym kliknięciu */
    btn.classList.add("is-jelly");
  }

  function liveButtonFrom(ev) {
    var t = ev.target;
    return t && t.closest ? t.closest(".btn-live") : null;
  }

  document.addEventListener("pointerdown", function (ev) {
    var btn = liveButtonFrom(ev);
    if (btn) jelly(btn);
  }, { passive: true });

  /* Enter na linku nie generuje pointerdown — animujemy też klawiaturę */
  document.addEventListener("click", function (ev) {
    if (ev.detail !== 0) return;
    var btn = liveButtonFrom(ev);
    if (btn) jelly(btn);
  });

  document.addEventListener("animationend", function (ev) {
    if (ev.animationName === "rj-jelly" && ev.target && ev.target.classList) {
      ev.target.classList.remove("is-jelly");
    }
  });
})();

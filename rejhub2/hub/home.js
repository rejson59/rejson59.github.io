/* RejHub 2.0 — strona główna: gablota, rejestr, podglądy */
(function () {
  "use strict";

  var PROJECTS = Array.isArray(window.REJHUB_PROJECTS) ? window.REJHUB_PROJECTS : [];
  var FEATURED = PROJECTS.filter(function (p) { return p.featured; });
  var REST = PROJECTS.filter(function (p) { return !p.featured; });
  var FINE_POINTER = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function el(id) { return document.getElementById(id); }

  function shortUrl(url) {
    if (!url) return "brak podglądu";
    return String(url).replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  var MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

  function formatDate(iso) {
    if (!iso) return "—";
    var parts = iso.split("-");
    if (parts.length < 3) return iso;
    return String(Number(parts[2])) + " " + MONTHS[Number(parts[1]) - 1] + " " + parts[0];
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  /* ———————————————————————————————— podgląd w ramce ———————————————————————————————— */

  function mountPreview(screen, project, onReady) {
    var old = screen.querySelector("iframe");
    if (old) old.remove();
    screen.setAttribute("data-loaded", "false");

    var fallback = screen.querySelector(".screen-fallback");
    if (fallback) {
      fallback.setAttribute("data-visible", "false");
      var nameNode = fallback.querySelector("strong");
      if (nameNode) nameNode.textContent = project.name;
    }

    if (!project.url) {
      if (fallback) fallback.setAttribute("data-visible", "true");
      return null;
    }

    var iframe = document.createElement("iframe");
    iframe.src = project.url;
    iframe.loading = "eager";
    iframe.tabIndex = -1;
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("scrolling", "no");
    iframe.referrerPolicy = "no-referrer";
    iframe.setAttribute("data-preview", "1");

    var failedTimer = window.setTimeout(function () {
      if (iframe.getAttribute("data-ready") !== "true" && fallback) {
        fallback.setAttribute("data-visible", "true");
      }
    }, 8000);

    iframe.addEventListener("load", function () {
      window.clearTimeout(failedTimer);
      iframe.setAttribute("data-ready", "true");
      screen.setAttribute("data-loaded", "true");
      if (fallback) fallback.setAttribute("data-visible", "false");
      if (typeof onReady === "function") onReady();
    });

    screen.appendChild(iframe);
    fitPreview(screen, iframe);
    observeScreen(screen);
    return iframe;
  }

  /* Podgląd renderuje się w szerokości desktopu i jest pomniejszany,
     żeby cała strona zmieściła się w małej ramce. */
  var PREVIEW_WIDTH = 1280;
  var fitted = typeof WeakMap !== "undefined" ? new WeakMap() : null;

  function fitPreview(screen, iframe) {
    var frame = iframe || screen.querySelector("iframe[data-preview]");
    if (!frame) return;
    var width = screen.clientWidth || 640;
    var height = screen.clientHeight || Math.round(width * 0.625);
    var scale = Math.min(1, width / PREVIEW_WIDTH);
    frame.style.width = PREVIEW_WIDTH + "px";
    frame.style.height = Math.round(height / scale) + "px";
    frame.style.transform = "scale(" + scale + ")";
    frame.style.transformOrigin = "top left";
  }

  function observeScreen(screen) {
    if (!fitted || typeof ResizeObserver === "undefined") return;
    if (fitted.has(screen)) return;
    var observer = new ResizeObserver(function () { fitPreview(screen); });
    observer.observe(screen);
    fitted.set(screen, observer);
  }

  function tint(screen, project) {
    var accent = project.accent || ["#6d7dff", "#33d6c0"];
    screen.style.setProperty("--tint-a", hexToRgba(accent[0], 0.55));
    screen.style.setProperty("--tint-b", hexToRgba(accent[1], 0.45));
  }

  function hexToRgba(hex, alpha) {
    var value = String(hex || "").replace("#", "");
    if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    var num = parseInt(value, 16);
    if (Number.isNaN(num)) return "rgba(109, 125, 255, " + alpha + ")";
    return "rgba(" + ((num >> 16) & 255) + ", " + ((num >> 8) & 255) + ", " + (num & 255) + ", " + alpha + ")";
  }

  /* ———————————————————————————————— gablota ———————————————————————————————— */

  var stage, screen, index = 0, animating = false;

  function renderVitrine(nextIndex, direction) {
    if (!FEATURED.length) return;
    index = (nextIndex + FEATURED.length) % FEATURED.length;
    var project = FEATURED[index];

    if (direction && !animating) {
      animating = true;
      stage.setAttribute("data-anim", direction === 1 ? "in-right" : "in-left");
      window.setTimeout(function () {
        stage.removeAttribute("data-anim");
        animating = false;
      }, 360);
    }

    tint(screen, project);
    mountPreview(screen, project);

    el("v-name").textContent = project.name;
    el("v-blurb").textContent = project.blurb || project.tagline;
    el("counter").textContent = pad(index + 1) + " / " + pad(FEATURED.length);
    el("frame-url").textContent = shortUrl(project.url);
    el("frame-open").href = project.url || project.repo || "#";
    el("v-open").href = project.url || project.repo || "#";
    el("v-repo").href = project.repo || project.url || "#";
    el("v-created").textContent = formatDate(project.created);
    el("v-updated").textContent = formatDate(project.updated);
    el("v-lang").textContent = project.language || "—";

    var tags = el("v-tags");
    tags.textContent = "";
    (project.tags || []).forEach(function (tag) {
      var span = document.createElement("span");
      span.textContent = tag;
      tags.appendChild(span);
    });

    Array.prototype.forEach.call(document.querySelectorAll("#rail button[data-index]"), function (button) {
      var active = Number(button.getAttribute("data-index")) === index;
      button.setAttribute("aria-current", active ? "true" : "false");
      button.setAttribute("aria-selected", active ? "true" : "false");
      if (active) {
        /* Przewijamy tylko listwę w bok — nigdy całej strony. */
        var rail = button.parentNode;
        var target = button.offsetLeft - rail.clientWidth / 2 + button.offsetWidth / 2;
        if (rail.scrollTo) rail.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
      }
    });
  }

  function buildRail() {
    var rail = el("rail");
    rail.textContent = "";
    FEATURED.forEach(function (project, i) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = project.name;
      button.setAttribute("role", "tab");
      button.setAttribute("data-index", String(i));
      button.addEventListener("click", function () { renderVitrine(i, i > index ? 1 : -1); });
      rail.appendChild(button);
    });
    var sep = document.createElement("span");
    sep.className = "rail-sep";
    sep.textContent = "·";
    rail.appendChild(sep);
    var all = document.createElement("button");
    all.type = "button";
    all.textContent = "wszystkie ↓";
    all.addEventListener("click", function () {
      var target = el("rejestr");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    rail.appendChild(all);
  }

  function bindVitrine() {
    el("prev").addEventListener("click", function () { renderVitrine(index - 1, -1); });
    el("next").addEventListener("click", function () { renderVitrine(index + 1, 1); });

    stage.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") { event.preventDefault(); renderVitrine(index - 1, -1); }
      if (event.key === "ArrowRight") { event.preventDefault(); renderVitrine(index + 1, 1); }
    });

    var startX = 0, startY = 0, tracking = false, locked = false;

    stage.addEventListener("pointerdown", function (event) {
      if (event.target.closest("a, button")) return;
      tracking = true;
      locked = false;
      startX = event.clientX;
      startY = event.clientY;
    });

    stage.addEventListener("pointermove", function (event) {
      if (!tracking) return;
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      if (!locked && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        locked = true;
        stage.setPointerCapture && stage.setPointerCapture(event.pointerId);
      }
    });

    function finish(event) {
      if (!tracking) return;
      tracking = false;
      var dx = event.clientX - startX;
      if (locked && Math.abs(dx) > 56) {
        renderVitrine(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      }
      locked = false;
    }

    stage.addEventListener("pointerup", finish);
    stage.addEventListener("pointercancel", function () { tracking = false; locked = false; });
  }

  /* ———————————————————————————————— rejestr ———————————————————————————————— */

  var EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>';

  function buildRegistry() {
    var list = el("registry");
    list.textContent = "";
    el("reg-count").textContent = String(REST.length);

    REST.forEach(function (project, i) {
      var li = document.createElement("li");
      li.className = "reg-row";
      li.setAttribute("data-name", project.name);

      var num = document.createElement("span");
      num.className = "reg-num";
      num.textContent = pad(i + 1);

      var main = document.createElement("a");
      main.className = "reg-main";
      main.href = project.url || project.repo || "#";
      main.target = "_blank";
      main.rel = "noopener noreferrer";
      var name = document.createElement("span");
      name.className = "reg-name";
      name.textContent = project.name;
      var tag = document.createElement("span");
      tag.className = "reg-tag";
      tag.textContent = project.tagline || "";
      main.appendChild(name);
      main.appendChild(tag);

      var lang = document.createElement("span");
      lang.className = "reg-lang";
      lang.textContent = project.language || "—";

      var year = document.createElement("span");
      year.className = "reg-year";
      year.textContent = project.created ? project.created.slice(0, 4) : "—";

      var peekBtn = document.createElement("button");
      peekBtn.type = "button";
      peekBtn.className = "reg-peek";
      peekBtn.innerHTML = EYE;
      peekBtn.setAttribute("aria-label", "Podgląd projektu " + project.name);
      peekBtn.disabled = !project.url;
      peekBtn.addEventListener("click", function () { toggleRow(li, project); });

      var panel = document.createElement("div");
      panel.className = "reg-panel";
      var inner = document.createElement("div");
      inner.className = "reg-panel-inner";
      var panelScreen = document.createElement("div");
      panelScreen.className = "screen";
      var shimmer = document.createElement("div");
      shimmer.className = "shimmer";
      var fallback = document.createElement("div");
      fallback.className = "screen-fallback";
      fallback.innerHTML = '<strong>' + escapeHtml(project.name) + '</strong><span>Podgląd chwilowo niedostępny</span>';
      panelScreen.appendChild(shimmer);
      panelScreen.appendChild(fallback);
      inner.appendChild(panelScreen);
      var desc = document.createElement("p");
      desc.textContent = project.blurb || project.tagline || "";
      panel.appendChild(inner);
      panel.appendChild(desc);

      li.appendChild(num);
      li.appendChild(main);
      li.appendChild(lang);
      li.appendChild(year);
      li.appendChild(peekBtn);
      li.appendChild(panel);

      if (project.url) {
        li.addEventListener("pointerenter", function () { schedulePeek(li, project); });
        li.addEventListener("pointerleave", function () { hidePeek(); });
      }

      list.appendChild(li);
    });
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function toggleRow(row, project) {
    var open = row.getAttribute("data-open") === "true";
    Array.prototype.forEach.call(document.querySelectorAll('.reg-row[data-open="true"]'), function (other) {
      other.removeAttribute("data-open");
      var frame = other.querySelector(".reg-panel iframe");
      if (frame) frame.remove();
    });
    if (open) return;
    row.setAttribute("data-open", "true");
    var panelScreen = row.querySelector(".reg-panel .screen");
    if (panelScreen) mountPreview(panelScreen, project);
  }

  /* pływający podgląd (tylko mysz) */
  var peek, peekScreen, peekTimer = null, peekProject = null;

  function schedulePeek(row, project) {
    if (!FINE_POINTER || !peek) return;
    hidePeek();
    peekTimer = window.setTimeout(function () {
      var rect = row.getBoundingClientRect();
      var width = 380;
      var left = Math.max(12, Math.min(window.innerWidth - width - 12, window.innerWidth - width - 24));
      var top = Math.min(Math.max(12, rect.top + rect.height / 2 - 130), window.innerHeight - 300);
      peek.style.left = left + "px";
      peek.style.top = top + "px";
      el("peek-url").textContent = shortUrl(project.url);
      peekProject = project;
      tint(peekScreen, project);
      mountPreview(peekScreen, project);
      peek.setAttribute("data-visible", "true");
    }, 260);
  }

  function hidePeek() {
    if (peekTimer) { window.clearTimeout(peekTimer); peekTimer = null; }
    if (!peek) return;
    peek.setAttribute("data-visible", "false");
    if (peekProject) {
      var frame = peekScreen.querySelector("iframe");
      if (frame) frame.remove();
      peekScreen.setAttribute("data-loaded", "false");
      peekProject = null;
    }
  }

  /* ———————————————————————————————— reszta strony ———————————————————————————————— */

  function renderUpdates() {
    var box = el("updates");
    var latest = PROJECTS.slice().sort(function (a, b) {
      return String(b.updated).localeCompare(String(a.updated));
    }).slice(0, 3);

    latest.forEach(function (project) {
      var link = document.createElement("a");
      link.className = "update";
      link.href = project.url || project.repo || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.innerHTML =
        '<span class="u-name">' + escapeHtml(project.name) + "</span>" +
        '<span class="u-tag">' + escapeHtml(project.tagline || "") + "</span>" +
        '<span class="u-date">zmiana · ' + formatDate(project.updated) + "</span>";
      box.appendChild(link);
    });
  }

  function renderStats() {
    el("stat-projects").textContent = String(PROJECTS.length);
    el("stat-featured").textContent = String(FEATURED.length);
    var newest = PROJECTS.reduce(function (acc, p) {
      return p.updated > acc ? p.updated : acc;
    }, "");
    el("stat-updated").textContent = formatDate(newest);

    var hour = new Date().getHours();
    var greeting = hour < 5 ? "Dobrej nocy" : hour < 12 ? "Dzień dobry" : hour < 18 ? "Dobry dzień" : "Dobry wieczór";
    var today = new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
    el("hello").textContent = greeting + " · " + today;
  }

  function bindLogout() {
    var logout = el("logout");
    if (!logout) return;
    logout.addEventListener("click", function () {
      logout.disabled = true;
      logout.textContent = "Wylogowuję…";
      fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).finally(function () {
        window.location.replace("/w-budowie");
      });
    });
  }

  function bindReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (item) { item.setAttribute("data-shown", "true"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-shown", "true");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    Array.prototype.forEach.call(items, function (item) { observer.observe(item); });
  }

  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    stage = el("stage");
    screen = el("screen");
    peek = el("peek");
    peekScreen = el("peek-screen");

    renderStats();
    buildRail();
    renderVitrine(0);
    bindVitrine();
    buildRegistry();
    renderUpdates();
    bindLogout();
    bindReveal();

    window.addEventListener("scroll", hidePeek, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

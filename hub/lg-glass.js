/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/*!
 * RejHub 2.0 — szkło z prawdziwym załamaniem krawędzi (v1).
 *
 * Zwykły `backdrop-filter: blur()` rozmywa to, co jest pod panelem. Prawdziwe
 * szkło — jak na filmiku „Liquid glass vs CSS blur” — dodatkowo *ugina* obraz
 * przy krawędzi: linie i napisy pod szkłem wyginają się przy ramce, a środek
 * zostaje czytelny. Robi to `feDisplacementMap`: mapa odkształceń mówi, o ile
 * piksel ma się przesunąć, a filtr SVG stosuje ją do tła panelu.
 *
 * Jak to działa:
 *   1. dla każdego elementu liczymy mapę (canvas → PNG w data URI):
 *        - przezroczysty środek  → brak przesunięcia,
 *        - przy krawędzi kolor    → przesunięcie do wewnątrz (soczewka),
 *      kanał R = przesunięcie X, G = przesunięcie Y, 128 = bez zmian,
 *   2. mapa trafia do ukrytego <filter> jako `feImage` → `feDisplacementMap`,
 *   3. CSS nakłada filtr przez `backdrop-filter: url(#…)`.
 *
 * Czego to nie robi: nie dobiera kolorów, nie rysuje tła. Wygląd (obramowanie,
 * refleks, cień) jest w `hub/lg-glass.css` i działa także bez tego pliku.
 *
 * Ograniczenia, o których trzeba wiedzieć:
 *   - `url()` w `backdrop-filter` obsługuje dziś tylko Chromium. Safari i
 *     Firefox dostają czysty blur z arkusza — bez błędu i bez załamania.
 *   - mapa jest przeliczana dopiero po zmianie rozmiaru (ResizeObserver),
 *     bo dla danego prostokąta jest stała.
 *   - każdy panel to jedna warstwa kompozytora: nie zakładamy tego na wszystko,
 *     tylko na powierzchnie z `data-lg` (albo z listy selektorów).
 */
(function (window, document) {
  "use strict";

  if (window.RJLiquidGlass) return;

  /* ---------- konfiguracja ---------- */
  var MAP_VERSION = "1";

  /* Ile pikseli szeroka jest wstęga załamania przy krawędzi. Grubsza wstęga
     = bardziej „szklana” ramka, ale więcej pracy dla GPU. */
  var EDGE_BAND = 16;

  /* Siła przesunięcia w pikselach (maksymalne wychylenie na krawędzi).
     Wartość dodatnia wypycha obraz do wewnątrz — tak działa soczewka
     wypukła, czyli szkło. Skala rośnie z rozmiarem panelu: 14 px na małej
     karcie wygląda mocno, a na pełnoekranowym panelu byłoby niewidoczne. */
  var SCALE_MIN = 22;
  var SCALE_MAX = 58;
  var SCALE_RATIO = 0.11;

  /* Chromium sprawdzamy po obecności Houdini? Nie — po prostu próbujemy
     zastosować filtr i sprawdzamy, czy przeglądarka go przyjęła. */
  function supportsBackdropUrl() {
    try {
      if (!window.CSS || !CSS.supports) return false;
      /* Wartość jest poprawna składniowo tylko tam, gdzie url() w
         backdrop-filter jest obsługiwany. */
      return CSS.supports("backdrop-filter", "url(#rj-lg-probe)") ||
             CSS.supports("-webkit-backdrop-filter", "url(#rj-lg-probe)");
    } catch (e) { return false; }
  }

  function reducedTransparency() {
    try { return window.matchMedia("(prefers-reduced-transparency: reduce)").matches; }
    catch (e) { return false; }
  }

  var state = {
    ready: false,
    supported: false,
    uid: 0,
    items: [] // { el, id, scale, band, w, h }
  };

  function noop() {}

  /* ---------- mapa odkształceń ---------- */

  /* Rysuje prostokąt o zaokrąglonych narożnikach wypełniony „neutralnym”
     szarym (128), a przy krawędzi — gradientem do wewnątrz, który koduje
     przesunięcie. Kanał R przesuwa w osi X, G w osi Y.

     Dla narożnika wektor przesunięcia jest skierowany po przekątnej, dlatego
     liczymy odległość od zaokrąglonego obrysu, a nie od prostokąta — inaczej
     narożniki wyglądałyby jak dwie osobne soczewki. */
  function buildMap(w, h, radius, scale, band) {
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;

    var img = ctx.createImageData(w, h);
    var data = img.data;
    var r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
    var b = Math.max(2, Math.min(band, Math.min(w, h) / 2));

    /* neutralny kolor = 128 (bez przesunięcia) */
    for (var i = 0; i < data.length; i += 4) {
      data[i] = 128; data[i + 1] = 128; data[i + 2] = 0; data[i + 3] = 255;
    }

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        /* odległość od najbliższej krawędzi prostokąta */
        var dx = Math.min(x, w - 1 - x);
        var dy = Math.min(y, h - 1 - y);
        var dRect = Math.min(dx, dy);

        /* odległość od zaokrąglonego obrysu (narożniki) */
        var d = dRect;
        var nx = 0, ny = 0;
        if (dx < r && dy < r) {
          var cx = x < r ? r : w - 1 - r;
          var cy = y < r ? r : h - 1 - r;
          var vx = x - cx, vy = y - cy;
          var len = Math.sqrt(vx * vx + vy * vy) || 1;
          d = r - len;
          nx = vx / len; ny = vy / len;
        } else if (dx <= dy) {
          nx = x < w / 2 ? 1 : -1; ny = 0;
        } else {
          nx = 0; ny = y < h / 2 ? 1 : -1;
        }

        /* t: 1 na krawędzi → 0 na końcu wstęgi. Poza wstęgą nie ma
           przesunięcia — środek MUSI zostać neutralny (128/128). Gdyby
           przesuwał się choć o pół piksela, cały panel „uciekałby” w bok
           i tekst pod szkłem rozjeżdżał się na płaskich tłach. */
        var strength = d < b ? 1 - d / b : 0;
        if (strength === 0) { continue; }

        /* Soczewka wypukła: obraz ucieka do środka. `feDisplacementMap` liczy
           (kanał/255 − 0,5) × scale, więc neutralne 128 to zero, a 255 to
           +scale/2. Chcemy przesunięcia do wewnątrz, czyli znak zależy od
           kierunku normalnej. */
        var push = (scale / 2) * strength;
        var vX = 128 + nx * push;
        var vY = 128 + ny * push;

        var p = (y * w + x) * 4;
        data[p] = vX < 0 ? 0 : vX > 255 ? 255 : vX;
        data[p + 1] = vY < 0 ? 0 : vY > 255 ? 255 : vY;
      }
    }

    ctx.putImageData(img, 0, 0);
    try { return canvas.toDataURL("image/png"); }
    catch (e) { return null; }
  }

  /* ---------- filtr SVG ---------- */

  /* Filtr „nic nie rób”. Jest celem domyślnej wartości `--lg-filter`
     w arkuszu, żeby panel nie odwoływał się do nieistniejącego id. */
  function ensureNeutralFilter() {
    if (document.getElementById("rj-lg-none")) return;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("id", "rj-lg-none-svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    var filter = document.createElementNS(ns, "filter");
    filter.setAttribute("id", "rj-lg-none");
    /* Pusty filtr przepuszcza obraz bez zmian. */
    svg.appendChild(filter);
    document.body.appendChild(svg);
  }

  function ensureDefs() {
    var defs = document.getElementById("rj-lg-defs");
    if (defs) return defs;
    defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    defs.setAttribute("id", "rj-lg-defs");
    defs.setAttribute("aria-hidden", "true");
    defs.setAttribute("focusable", "false");
    /* Zero rozmiaru, ale nie `display:none` — filtry w `display:none`
       przestają działać w części przeglądarek. */
    defs.setAttribute("width", "0");
    defs.setAttribute("height", "0");
    defs.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    document.body.appendChild(defs);
    return defs;
  }

  function addFilter(id, mapUrl, scale) {
    var ns = "http://www.w3.org/2000/svg";
    var filter = document.createElementNS(ns, "filter");
    filter.setAttribute("id", id);
    /* Obszar filtra musi być większy niż panel, inaczej przesunięte piksele
       zostaną obcięte przy krawędzi. */
    filter.setAttribute("x", "-20%");
    filter.setAttribute("y", "-20%");
    filter.setAttribute("width", "140%");
    filter.setAttribute("height", "140%");
    filter.setAttribute("color-interpolation-filters", "sRGB");

    var image = document.createElementNS(ns, "feImage");
    image.setAttribute("href", mapUrl);
    image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", mapUrl);
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute("result", "map");

    var disp = document.createElementNS(ns, "feDisplacementMap");
    disp.setAttribute("in", "SourceGraphic");
    disp.setAttribute("in2", "map");
    disp.setAttribute("scale", String(scale));
    disp.setAttribute("xChannelSelector", "R");
    disp.setAttribute("yChannelSelector", "G");

    filter.appendChild(image);
    filter.appendChild(disp);
    return { filter: filter, feImage: image, disp: disp };
  }

  /* ---------- podłączenie do elementu ---------- */

  function readNumber(el, name, fallback) {
    var raw = el.getAttribute(name);
    if (raw === null || raw === "") return fallback;
    var num = parseFloat(raw);
    return isFinite(num) ? num : fallback;
  }

  function radiusOf(el) {
    try {
      var cs = window.getComputedStyle(el);
      var r = parseFloat(cs.borderTopLeftRadius);
      if (isFinite(r) && r > 0) return r;
    } catch (e) { /* ignorujemy */ }
    return 18;
  }

  function mount(el) {
    if (!el || el.__rjLiquidGlass) return;
    var rect = el.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    /* Poniżej 24 px mapa jest mniejsza niż wstęga — efekt nie ma sensu. */
    if (w < 24 || h < 24) return;

    /* `data-lg-scale` wygrywa, gdy autor strony chce konkretną wartość. */
    var scale = readNumber(el, "data-lg-scale", 0);
    if (!scale) {
      scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.min(w, h) * SCALE_RATIO));
    }
    var band = readNumber(el, "data-lg-band", EDGE_BAND);
    var radius = radiusOf(el);

    var mapUrl = buildMap(w, h, radius, scale, band);
    if (!mapUrl) return;

    var id = "rj-lg-" + (++state.uid);
    var built = addFilter(id, mapUrl, scale);
    ensureDefs().appendChild(built.filter);

    el.__rjLiquidGlass = {
      id: id,
      w: w,
      h: h,
      scale: scale,
      band: band,
      radius: Math.round(radius),
      filter: built.filter,
      feImage: built.feImage,
      disp: built.disp,
      observer: null
    };

    /* Arkusz czyta filtr z tej zmiennej — dzięki temu jeden element może
       mieć własną mapę, a reszta nie musi nic wiedzieć o JS. */
    el.style.setProperty("--lg-filter", "url(#" + id + ")");
    el.classList.add("rj-lg-on");

    /* Rozmiar się zmienił → stara mapa jest nieaktualna. Przeliczamy po
       chwili spokoju, żeby nie robić tego przy każdym pikselu animacji. */
    if (window.ResizeObserver) {
      var timer = 0;
      var observer = new ResizeObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(function () { refresh(el); }, 180);
      });
      observer.observe(el);
      el.__rjLiquidGlass.observer = observer;
    }
  }

  function refresh(el) {
    var item = el && el.__rjLiquidGlass;
    if (!item) return;
    var rect = el.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    if (w < 24 || h < 24) return;
    var radius = radiusOf(el);
    var scale = readNumber(el, "data-lg-scale", 0);
    if (!scale) {
      scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.min(w, h) * SCALE_RATIO));
    }
    if (w === item.w && h === item.h && Math.round(radius) === item.radius && scale === item.scale) return;

    var mapUrl = buildMap(w, h, radius, scale, item.band);
    item.scale = scale;
    item.disp.setAttribute("scale", String(scale));
    if (!mapUrl) return;
    item.feImage.setAttribute("href", mapUrl);
    item.feImage.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", mapUrl);
    item.w = w;
    item.h = h;
    item.radius = Math.round(radius);
  }

  function unmount(el) {
    var item = el && el.__rjLiquidGlass;
    if (!item) return;
    try { if (item.observer) item.observer.disconnect(); } catch (e) { /* ignorujemy */ }
    try { if (item.filter && item.filter.parentNode) item.filter.parentNode.removeChild(item.filter); } catch (e) { /* ignorujemy */ }
    el.classList.remove("rj-lg-on");
    try { el.style.removeProperty("--lg-filter"); } catch (e) { /* ignorujemy */ }
    try { delete el.__rjLiquidGlass; } catch (e) { el.__rjLiquidGlass = null; }
  }

  /* ---------- wybór elementów ---------- */

  /* Domyślnie załamanie dostają tylko duże powierzchnie: karty, panele,
     dock wyspy i modale. Małe przyciski zostają na zwykłym szkle z arkusza —
     inaczej każdy z nich byłby osobną warstwą i telefon by zwolnił. */
  var SELECTOR = [
    "[data-lg]",
    ".rj-lg",                          /* opt-in z HTML */
    ".card.rj-lg-surface",
    /* Karty, które realnie są szkłem w starych warstwach (glass2.css). */
    ".rjapp-card",
    ".project-card",
    ".rj-home-stats",
    ".projects-toolbar",
    ".toolbar",
    ".board-toolbar",
    ".comm-online-card",
    ".rejchat-rules",
    ".rejchat-info-tip",
    ".comm-auth-inner",
    ".services-window",
    ".services-window-top",
    ".rj-side-ad",
    ".rj-chat-alert-panel",
    ".rj-header-profile",
    ".nav-more-panel",
    ".mobile-menu"
  ].join(",");

  function collect(root) {
    var found = [];
    try { found = Array.prototype.slice.call((root || document).querySelectorAll(SELECTOR)); }
    catch (e) { return found; }
    return found;
  }

  function scan(root) {
    if (!state.supported || reducedTransparency()) return;
    var list = collect(root);
    for (var i = 0; i < list.length; i++) mount(list[i]);
  }

  /* ---------- start ---------- */

  function init() {
    if (state.ready) return;
    state.ready = true;
    ensureNeutralFilter();
    state.supported = supportsBackdropUrl();
    if (!state.supported) {
      /* Safari/Firefox: arkusz daje im czyste szkło bez załamania. */
      document.documentElement.classList.add("rj-lg-no-refract");
      return;
    }
    document.documentElement.classList.add("rj-lg-refract");
    scan(document);

    /* Nowe karty pojawiają się po wczytaniu danych (Supabase), więc
       obserwujemy drzewo zamiast podpinać się do każdego skryptu osobno. */
    if (window.MutationObserver) {
      var pending = 0;
      var observer = new MutationObserver(function (records) {
        var touched = false;
        for (var r = 0; r < records.length; r++) {
          if (records[r].addedNodes && records[r].addedNodes.length) { touched = true; break; }
        }
        if (!touched) return;
        clearTimeout(pending);
        pending = setTimeout(function () { scan(document); }, 120);
      });
      try {
        observer.observe(document.body, { childList: true, subtree: true });
      } catch (e) { /* ignorujemy */ }
    }

    /* Zmiana motywu zmienia promienie i kolory — przeliczamy mapy. */
    window.addEventListener("rj:theme-change", function () {
      state.items = [];
      scan(document);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.RJLiquidGlass = Object.freeze({
    refresh: refresh,
    mount: mount,
    unmount: unmount,
    scan: scan,
    supported: function () { return state.supported; }
  });
})(window, document);

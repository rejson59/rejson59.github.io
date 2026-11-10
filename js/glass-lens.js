/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/* ==========================================================================
   Soczewka Liquid Glass — Apple-like refraction dla zwykłego DOM.

   Elementy z atrybutem `data-glass-lens` dostają własny filtr SVG:
   mapa bevela (SDF zaokrąglonego prostokąta → PNG w kanwie) + feDisplacementMap.
   Dzięki temu krawędź naprawdę załamuje tło, zamiast tylko je rozmywać.

   Zasady:
   - brak wsparcia dla `backdrop-filter: url(...)` → nic nie robimy,
     zostaje sam blur z CSS (strona wygląda dobrze, tylko bez soczewki),
   - brak kanwy 2D (np. jsdom, stary silnik) → to samo, cicho,
   - rozmiar elementu zmienia się → mapa i filtr są przeliczane,
   - save-data / „reduce transparency” → soczewka wyłączona.

   Użycie:
     <section data-glass-lens>…</section>
     <script src="/js/glass-lens.js?v=1" defer></script>
   ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  if (!doc || !doc.querySelectorAll) return;

  var targets = doc.querySelectorAll("[data-glass-lens]");
  if (!targets.length) return;

  function supported() {
    try {
      if (!window.CSS || !window.CSS.supports) return false;
      return (
        CSS.supports("backdrop-filter", "url(#rj-lens-probe)") ||
        CSS.supports("-webkit-backdrop-filter", "url(#rj-lens-probe)")
      );
    } catch (e) {
      return false;
    }
  }

  function lightDevice() {
    try {
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && conn.saveData) return true;
    } catch (e) { /* brak API */ }
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-transparency: reduce)").matches) return true;
    } catch (e2) { /* brak zapytania */ }
    return false;
  }

  if (!supported() || lightDevice()) {
    doc.documentElement.classList.add("no-glass-lens");
    return;
  }

  var NS = "http://www.w3.org/2000/svg";
  var MAX_MAP = 340;        /* najdłuższy bok mapy w px — reszta jest rozciągana */
  var seq = 0;
  var root = null;

  function defs() {
    if (root && root.isConnected) return root;
    root = doc.createElementNS(NS, "svg");
    root.setAttribute("class", "rj-lens-defs");
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("focusable", "false");
    root.style.cssText = "position:fixed;width:0;height:0;opacity:0;pointer-events:none";
    (doc.body || doc.documentElement).appendChild(root);
    return root;
  }

  /* Mapa normalnych z bevela krawędzi. Identyczna matematyka jak w pigułce:
     sdf prostokąta zaokrąglonego, w paśmie bevela gradient → R,G kanały. */
  function lensMap(cssW, cssH, radiusCss, bevelCss) {
    try {
      var k = Math.min(1, MAX_MAP / Math.max(cssW, cssH));
      var w = Math.max(8, Math.round(cssW * k));
      var h = Math.max(8, Math.round(cssH * k));
      var radius = Math.max(1, radiusCss * k);
      var bevel = Math.max(1.5, bevelCss * k);

      var canvas = doc.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext && canvas.getContext("2d");
      if (!ctx) return "";

      var img = ctx.createImageData(w, h);
      var d = img.data;
      var hw = w / 2;
      var hh = h / 2;
      var rad = Math.min(radius, hw - 1, hh - 1);
      var iw = hw - rad;
      var ih = hh - rad;

      for (var y = 0; y < h; y++) {
        var py = y + 0.5 - hh;
        var ay = Math.abs(py) - ih;
        for (var x = 0; x < w; x++) {
          var px = x + 0.5 - hw;
          var ax = Math.abs(px) - iw;
          var qx = Math.max(ax, 0);
          var qy = Math.max(ay, 0);
          var outD = Math.hypot(qx, qy);
          var inD = Math.min(Math.max(ax, ay), 0);
          var sdf = outD + inD - rad;

          var nx = 0;
          var ny = 0;
          if (sdf > -bevel && sdf <= 2) {
            var t = Math.min(1, Math.max(0, (sdf + bevel) / bevel));
            var prof = Math.pow(Math.sin(t * Math.PI * 0.5), 1.7);
            var gx = 0;
            var gy = 0;
            if (ax > 0 || ay > 0) {
              var len = Math.max(outD, 0.0001);
              gx = (qx / len) * (px < 0 ? -1 : 1);
              gy = (qy / len) * (py < 0 ? -1 : 1);
            } else if (ax > ay) {
              gx = px < 0 ? -1 : 1;
            } else {
              gy = py < 0 ? -1 : 1;
            }
            nx = -gx * prof;
            ny = -gy * prof;
          }

          var i = (y * w + x) * 4;
          d[i] = Math.round(128 + nx * 127);
          d[i + 1] = Math.round(128 + ny * 127);
          d[i + 2] = 128;
          d[i + 3] = 255;
        }
      }

      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL("image/png");
    } catch (e) {
      return "";
    }
  }

  function makeFilter(id, href, scale) {
    var filter = doc.createElementNS(NS, "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("x", "0%");
    filter.setAttribute("y", "0%");
    filter.setAttribute("width", "100%");
    filter.setAttribute("height", "100%");
    filter.setAttribute("color-interpolation-filters", "sRGB");

    var image = doc.createElementNS(NS, "feImage");
    image.setAttribute("href", href);
    image.setAttribute("x", "0");
    image.setAttribute("y", "0");
    image.setAttribute("width", "100%");
    image.setAttribute("height", "100%");
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute("result", "map");

    var displace = doc.createElementNS(NS, "feDisplacementMap");
    displace.setAttribute("in", "SourceGraphic");
    displace.setAttribute("in2", "map");
    displace.setAttribute("scale", String(scale));
    displace.setAttribute("xChannelSelector", "R");
    displace.setAttribute("yChannelSelector", "G");

    filter.appendChild(image);
    filter.appendChild(displace);
    return filter;
  }

  function radiusOf(el) {
    try {
      var cs = window.getComputedStyle(el);
      var raw = cs.borderTopLeftRadius || cs.borderRadius || "22px";
      var value = parseFloat(raw);
      return isFinite(value) ? value : 22;
    } catch (e) {
      return 22;
    }
  }

  function geometry(el) {
    var w = el.offsetWidth || 0;
    var h = el.offsetHeight || 0;
    var radius = Math.min(radiusOf(el), Math.min(w, h) / 2);
    var bevel = Math.max(12, Math.min(30, radius * 0.95, Math.min(w, h) * 0.22));
    var scale = Math.max(9, Math.min(18, bevel * 0.62));
    return { w: w, h: h, radius: radius, bevel: bevel, scale: scale };
  }

  function paint(el, state, href) {
    var filter = state.filter;
    var image = filter.firstChild;
    var displace = filter.lastChild;
    if (href) image.setAttribute("href", href);
    displace.setAttribute("scale", String(state.scale));
  }

  function build(el, state) {
    var geom = geometry(el);
    if (geom.w < 60 || geom.h < 60) return false;
    state.scale = geom.scale;
    var href = lensMap(geom.w, geom.h, geom.radius, geom.bevel);
    if (!href) return false;
    paint(el, state, href);
    return true;
  }

  function attach(el) {
    if (el.__rjLens) return;
    var geom = geometry(el);
    if (geom.w < 60 || geom.h < 60) return;

    var href = lensMap(geom.w, geom.h, geom.radius, geom.bevel);
    if (!href) return;

    var id = "rj-lens-" + seq++;
    var filter = makeFilter(id, href, geom.scale);
    defs().appendChild(filter);

    var state = { filter: filter, scale: geom.scale };
    el.__rjLens = state;
    el.style.setProperty("--glass-lens", "url(#" + id + ")");
    el.setAttribute("data-lens", "on");

    /* Bezpiecznik: gdyby silnik przyjął składnię, ale nie namalował filtra,
       wracamy do samego blura z CSS zamiast zostawiać szkło bez rozmycia. */
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        try {
          var used = window.getComputedStyle(el).backdropFilter ||
            window.getComputedStyle(el).webkitBackdropFilter || "";
          if (used && used !== "none" && used.indexOf("url(") === -1) {
            el.removeAttribute("data-lens");
            el.style.removeProperty("--glass-lens");
            if (state.observer && state.observer.disconnect) state.observer.disconnect();
            el.__rjLens = null;
          }
        } catch (e) { /* zostawiamy jak jest */ }
      });
    }

    /* Rozmiar zmienia się przy zmianie szerokości okna — mapa musi oddychać. */
    if (typeof ResizeObserver === "function") {
      var lastW = geom.w;
      var lastH = geom.h;
      var pending = 0;
      var observer = new ResizeObserver(function () {
        if (pending) return;
        pending = window.requestAnimationFrame(function () {
          pending = 0;
          var now = geometry(el);
          if (Math.abs(now.w - lastW) < 6 && Math.abs(now.h - lastH) < 6) return;
          lastW = now.w;
          lastH = now.h;
          build(el, state);
        });
      });
      observer.observe(el);
      state.observer = observer;
    }
  }

  for (var i = 0; i < targets.length; i++) attach(targets[i]);

  /* Zmiana motywu nie zmienia geometrii, ale strona może dobudować sekcje. */
  window.addEventListener("rj:lens-refresh", function () {
    var list = doc.querySelectorAll("[data-glass-lens]");
    for (var j = 0; j < list.length; j++) attach(list[j]);
  });
})();

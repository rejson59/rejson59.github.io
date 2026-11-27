/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/*!
 * RejHub 3.0 — silnik szkła (lg3.js)
 *
 * ============================================================================
 *  CO BYŁO ŹLE (i dlaczego użytkownik to zauważył)
 * ============================================================================
 *
 * Poprzednia wersja malowała tapetę WEWNĄTRZ tafli i odkształcała JĄ filtrem.
 * To jest sztuczne tło: tafla nie czyta tego, co naprawdę leży pod nią, tylko
 * własną kopię tapety. Widać to natychmiast, gdy ktokolwiek położy na stronie
 * coś innego niż tapetę — obraz, film, inną taflę — bo szkło tego nie zna.
 * Do tego kopię trzeba było ręcznie wyrównywać do okna przy każdym przewinięciu,
 * co dało trzy rundy walki z „obrazem, który nie zgadza się z tłem”.
 *
 * ============================================================================
 *  JAK JEST TERAZ
 * ============================================================================
 *
 * Prawdziwe szkło: `backdrop-filter: url(#filtr)` — przeglądarka sama podaje
 * filtrowi piksele, które leżą POD elementem. Zero kopii, zero wyrównywania,
 * zero przewijania do przeliczania. Ugięcie działa na tym, co naprawdę jest
 * pod taflą (łącznie z innymi taflami, obrazami i animacjami).
 *
 * Według liquidglassdesign.com (listopad 2026) ścieżka `backdrop-filter: url()`
 * działa w Chromium. Safari jej nie renderuje (WebKit bug 245510), a Firefox
 * tylko dla filtrów GPU. Dlatego:
 *
 *   1. WARSTWA CSS (zawsze) — tint + blur + saturacja + rant. Wygląda dobrze
 *      bez ugięcia, bo każdy z Safari i Firefoksa widzi tylko ją.
 *   2. WARSTWA REFRAKCJI (tylko tam, gdzie działa) — dokładana przez skrypt.
 *
 * Detekcja przez `navigator.userAgentData.brands` (tylko Chromium), a nie przez
 * `@supports`: `url()` jest poprawną składnią dla parsera, więc `@supports`
 * przejdzie także tam, gdzie nic się nie narysuje.
 *
 * UWAGA O SKŁADNI: nie łączymy `url()` z `blur()` w jednej deklaracji.
 * Safari odrzuca CAŁĄ wartość, jeśli jakakolwiek jej część jest nieznana —
 * traci wtedy także blur. Ugięcie idzie osobną klasą, nadpisaną po blurze.
 */
(function (window, document) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var MAX_LENSES = 8;
  var READY = "lg3-ready";

  /* ---------- bezpieczniki ---------- */

  /* Filtr odkształcenia jest kosztowny. Na słabym telefonie, przy włączonym
     trybie oszczędzania albo gdy użytkownik prosi o mniej przezroczystości,
     lepiej pokazać spokojne szkło bez ugięcia niż zamulić stronę. */
  function disabled() {
    try {
      if (window.localStorage && localStorage.getItem("rj_potato") === "on") return "potato";
    } catch (e) { /* ignorujemy */ }
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-transparency: reduce)").matches) {
        return "reduced-transparency";
      }
    } catch (e) { /* ignorujemy */ }
    return "";
  }

  /* Czy ta przeglądarka naprawdę narysuje `backdrop-filter: url()`?
     Sprawdzamy markę (Chromium), bo to jedyny silnik, który to renderuje.
     `@supports` tu nie wystarcza — patrz komentarz na górze. */
  function canRefract() {
    try {
      var d = navigator.userAgentData;
      if (d && d.brands) {
        for (var i = 0; i < d.brands.length; i++) {
          if (d.brands[i].brand === "Chromium") return true;
        }
        return false;
      }
    } catch (e) { /* brak API — schodzimy do UA */ }

    /* Starsze Chromium bez `userAgentData`. Kolejność ma znaczenie:
       Edge i Opera też mają „Chrome/" w UA, ale wszystkie trzy to Chromium
       i wszystkie renderują ten filtr — więc wystarczy samo „Chrome/". */
    var ua = navigator.userAgent || "";
    return /Chrome\//.test(ua);
  }

  /* ---------- geometria ---------- */

  /* Odległość punktu od zaokrąglonego prostokąta.
     Zwraca { d: odległość do obrysu, nx, ny: normalna skierowana do wnętrza }. */
  function edgeDistance(x, y, w, h, r) {
    var cx = Math.min(Math.max(x, r), w - r);
    var cy = Math.min(Math.max(y, r), h - r);
    var dx = x - cx;
    var dy = y - cy;
    var len = Math.sqrt(dx * dx + dy * dy);

    if (len > r * 0.0001) {
      return { d: r - len, nx: dx / len, ny: dy / len };
    }

    var left = x, right = w - x, top = y, bottom = h - y;
    var m = Math.min(left, right, top, bottom);
    if (m === left) return { d: x, nx: 1, ny: 0 };
    if (m === right) return { d: w - x, nx: -1, ny: 0 };
    if (m === top) return { d: y, nx: 0, ny: 1 };
    return { d: h - y, nx: 0, ny: -1 };
  }

  /* Profil fazy: nachylenie powierzchni w funkcji t = d / band.
     t = 0 → krawędź, t = 1 → wnętrze. Zwraca 0..1.

     Sześcian, nie kwadrat. Przy kwadracie ugięcie było największe tuż przy
     krawędzi i od razu „puchło" przez całą wstęgę — na ekranie dawało jasną
     smugę zamiast załamania. Sześcian trzyma szczyt wąsko i szybko wygasa,
     więc widać wyraźny „walec", a obraz tuż za nim zostaje czysty. */
  function bevelSlope(t) {
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    var u = 1 - t;
    return u * u * u;
  }

  /* ---------- mapa odkształceń ---------- */

  var MAP_CACHE = {};

  /* Mapa ma DOKŁADNIE rozmiar elementu — bez zapasu.

     Poprzednio warstwa soczewki była większa od panelu o `pad` i mapa musiała
     to nadganiać. Przy `backdrop-filter` problem znika: filtr działa na
     obszarze elementu, więc mapa 1:1 jest z nim zgodna z definicji. */
  function buildMap(w, h, r, scale, band) {
    var key = [w, h, Math.round(r), Math.round(scale), Math.round(band)].join(":");
    if (MAP_CACHE[key]) return MAP_CACHE[key];

    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;

    var img = ctx.createImageData(w, h);
    var data = img.data;
    var rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    var bb = Math.max(2, Math.min(band, Math.min(w, h) / 2));
    var half = scale / 2;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var p = (y * w + x) * 4;
        /* 128/128 = brak przesunięcia (środek skali). */
        var vx = 128, vy = 128;

        var e = edgeDistance(x + 0.5, y + 0.5, w, h, rr);
        if (e.d < bb) {
          var k = bevelSlope(e.d / bb);
          if (k > 0.0005) {
            /* Soczewka wypukła: obraz ucieka DO ŚRODKA, czyli przeciwnie do
               normalnej skierowanej do wnętrza. */
            vx = 128 - e.nx * k * half;
            vy = 128 - e.ny * k * half;
          }
        }
        data[p] = vx < 0 ? 0 : vx > 255 ? 255 : vx;
        data[p + 1] = vy < 0 ? 0 : vy > 255 ? 255 : vy;
        data[p + 2] = 0;
        data[p + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    var url = canvas.toDataURL("image/png");
    MAP_CACHE[key] = url;
    return url;
  }

  /* ---------- filtr SVG ---------- */

  function ensureDefs() {
    var defs = document.getElementById("lg3-defs");
    if (!defs) {
      defs = document.createElementNS(NS, "svg");
      defs.setAttribute("id", "lg3-defs");
      defs.setAttribute("aria-hidden", "true");
      defs.setAttribute("focusable", "false");
      /* NIE `display:none` — element SVG z filtrem musi istnieć w drzewie. */
      defs.style.cssText =
        "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
      document.body.appendChild(defs);
    }
    return defs;
  }

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  function buildFilter(id, mapUrl, scale, chroma) {
    /* Obszar filtra = element (0/0/100%/100%). Przy `backdrop-filter` filtr
       dostaje dokładnie obszar elementu, więc `feImage` bez `preserveAspectRatio`
       rozciąga mapę 1:1 na ten sam obszar. */
    var f = el("filter", {
      id: id,
      x: "0", y: "0", width: "100%", height: "100%",
      "color-interpolation-filters": "sRGB"
    });

    f.appendChild(el("feImage", {
      href: mapUrl,
      preserveAspectRatio: "none",
      result: "map"
    }));

    var d = Math.max(0, Math.min(1, chroma));
    var lo = scale * (1 - d);
    var mid = scale;
    var hi = scale * (1 + d);

    /* Trzy przebiegi o różnej sile = rozszczepienie chromatyczne
       (R mocniej, G środkowo, B słabiej). */
    var passes = [
      [lo, "warpR"],
      [mid, "warpG"],
      [hi, "warpB"]
    ];
    passes.forEach(function (p) {
      f.appendChild(el("feDisplacementMap", {
        "in": "SourceGraphic",
        "in2": "map",
        "scale": String(p[0]),
        "xChannelSelector": "R",
        "yChannelSelector": "G",
        "result": p[1]
      }));
    });

    var mats = [
      ["onlyR", "warpR", "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
      ["onlyG", "warpG", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"],
      ["onlyB", "warpB", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"]
    ];
    mats.forEach(function (m) {
      f.appendChild(el("feColorMatrix", {
        "in": m[1], "type": "matrix", "values": m[2], "result": m[0]
      }));
    });

    f.appendChild(el("feBlend", { in: "onlyR", in2: "onlyG", mode: "screen", result: "rg" }));
    f.appendChild(el("feBlend", { in: "rg", in2: "onlyB", mode: "screen", result: "rgb" }));

    return f;
  }

  /* ---------- montaż ---------- */

  var uid = 0;
  var lensCount = 0;

  function radiusOf(node) {
    var c = window.getComputedStyle(node);
    var r = parseFloat(c.borderTopLeftRadius) || 0;
    return Math.min(r, Math.min(node.offsetWidth, node.offsetHeight) / 2);
  }

  /* Panel dostaje klasę `lg3-refract` — to ONA włącza ugięcie w CSS.
     Warstwy (sheen/edge/glow) rysuje CSS, nie JS: nie ma tu już żadnego
     malowania tapety, więc nie ma czego synchronizować. */
  function mount(node) {
    if (!node || node.__lg3) return;
    var w = Math.round(node.offsetWidth);
    var h = Math.round(node.offsetHeight);
    if (w < 40 || h < 30) return;
    if (lensCount >= MAX_LENSES) return;

    var band = parseFloat(node.getAttribute("data-lg3-band")) || 34;
    var scale = parseFloat(node.getAttribute("data-lg3-scale")) || 64;
    var chroma = node.hasAttribute("data-lg3-chroma")
      ? parseFloat(node.getAttribute("data-lg3-chroma")) : 0.10;

    var id = "lg3-" + (++uid);

    var mapUrl = buildMap(w, h, radiusOf(node), scale, band);
    if (mapUrl) {
      ensureDefs().appendChild(buildFilter(id, mapUrl, scale, chroma));
      /* Kolejność ma znaczenie: klasa z `url()` jest w CSS PO blura, więc
         nadpisuje łańcuch tylko tam, gdzie ugięcie naprawdę działa. */
      node.style.setProperty("--lg3-filter", "url(#" + id + ")");
      node.classList.add("lg3-refract");
    }

    node.classList.add("lg3-on");
    node.__lg3 = { id: id, w: w, h: h };
    lensCount++;
  }

  function unmount(node) {
    if (!node || !node.__lg3) return;
    var o = node.__lg3;
    try {
      var f = document.getElementById(o.id);
      if (f) f.parentNode.removeChild(f);
    } catch (e) { /* ignorujemy */ }
    node.__lg3 = null;
    node.classList.remove("lg3-on");
    node.classList.remove("lg3-refract");
    try { node.style.removeProperty("--lg3-filter"); } catch (e) { /* ignorujemy */ }
    if (lensCount > 0) lensCount--;
  }

  /* ---------- refleks podążający za kursorem ---------- */

  function trackPointer() {
    if (!window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var nodes = null;
    var raf = 0;
    var px = 50, py = 0;

    function apply() {
      raf = 0;
      if (!nodes) nodes = document.querySelectorAll("[data-lg3]");
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].style.setProperty("--lg3-px", px + "%");
        nodes[i].style.setProperty("--lg3-py", py + "%");
      }
    }

    document.addEventListener("pointermove", function (e) {
      px = Math.round((e.clientX / window.innerWidth) * 100);
      py = Math.round((e.clientY / window.innerHeight) * 100);
      if (!raf) raf = window.requestAnimationFrame(apply);
    }, { passive: true });
  }

  /* ---------- start ---------- */

  var seen = null;

  function scan(root) {
    var list = (root || document).querySelectorAll("[data-lg3]");
    if (!seen) seen = window.WeakSet ? new WeakSet() : null;

    for (var i = 0; i < list.length; i++) {
      var node = list[i];
      if (seen && seen.has(node)) continue;
      if (seen) seen.add(node);
      mount(node);
    }
  }

  function init() {
    if (!document.body) return;

    var why = disabled();
    if (why) {
      document.documentElement.setAttribute("data-lg3-off", why);
      return;   /* CSS daje wtedy ciemniejszy zapas — patrz html[data-lg3-off] */
    }

    /* Warstwa CSS (tint, rant, sheen) działa od razu i wszędzie.
       `lg3-ready` mówi arkuszowi: możesz zdjąć zapas „bez JS". */
    document.documentElement.classList.add(READY);

    /* Refrakcja tylko tam, gdzie naprawdę się narysuje. Klasa na <html>
       pozwala arkuszowi odróżnić „szkło pełne" od „szkło bez ugięcia"
       (Safari, Firefox) bez sięgania po hacki. */
    if (!canRefract()) return;
    document.documentElement.classList.add("lg3-refract-on");

    scan(document);
    trackPointer();

    /* Nowe panele w drzewie (np. karty doładowane z JS). */
    if (window.MutationObserver) {
      var t = 0;
      new MutationObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) {
          if (recs[i].addedNodes && recs[i].addedNodes.length) {
            clearTimeout(t);
            t = setTimeout(function () { scan(document); }, 150);
            return;
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }

    /* Zmiana rozmiaru: mapa musi mieć nowe wymiary, inaczej faza rozjedzie
       się z obrysem. Przeliczamy z opóźnieniem, bo pętla jest kosztowna. */
    var rz = 0;
    window.addEventListener("resize", function () {
      clearTimeout(rz);
      rz = setTimeout(function () {
        var list = document.querySelectorAll("[data-lg3]");
        for (var i = 0; i < list.length; i++) {
          var n = list[i];
          if (n.__lg3) unmount(n);
          mount(n);
        }
      }, 250);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.RJGlass3 = Object.freeze({
    refresh: function () {
      var list = document.querySelectorAll("[data-lg3]");
      for (var i = 0; i < list.length; i++) {
        if (list[i].__lg3) unmount(list[i]);
        mount(list[i]);
      }
    },
    mount: mount,
    unmount: unmount,
    scan: scan,
    canRefract: canRefract
  });
})(window, document);

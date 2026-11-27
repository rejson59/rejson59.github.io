/* ==========================================================================
   lg3.js — silnik „liquid glass" v3
   --------------------------------------------------------------------------
   Czym różni się od hub/lg-glass.js (v2):

   1. PROFIL. v2 używał sin(π·t^0.72) — funkcji, która rośnie od zera na
      krawędzi. Kierunek był odwrócony: prawdziwy fazowany brzeg soczewki
      ugina obraz NAJMOCNIEJ tuż przy krawędzi i wygasa do zera w środku.
      Dlatego v2 dawał miękką smugę zamiast załamania.

      Tutaj: h(t) = 1 − (1−t)³  (wysokość powierzchni),
             dh/dt = 3(1−t)²    (nachylenie = siła ugięcia).
      Nachylenie jest największe na krawędzi i gładko (C¹) wygasa.
      „Gładko" to sedno — brak skoków = brak widocznego szwu.

   2. WĄSKA WSTĘGA, DUŻE UGIĘCIE. Szeroka wstęga (72 px) przy małej skali
      rozmywa efekt na dużym obszarze i wygląda jak mgła. Wąska (26–40 px)
      przy dużej skali daje czytelny „walec" na krawędzi.

   3. ROZSZCZEPIENIE. Trzy przebiegi feDisplacementMap o skalach
      S·(1−d), S, S·(1+d). d ≈ 0.10 — tyle wystarczy, żeby na krawędzi
      powstała tęcza, ale obraz w środku zostaje ostry.

   4. ODDYCHANIE. Warstwa soczewki dostaje delikatny ruch (translate 1 px
      w 9 s) i podążający za kursorem refleks. To ten detal sprawia, że
      szkło wygląda jak materiał, a nie jak nadruk.

   Wejście: element z [data-lg3], opcjonalnie
     data-lg3-band  — szerokość wstęgi w px (domyślnie 34)
     data-lg3-scale — maksymalne przesunięcie w px (domyślnie 64)
     data-lg3-chroma— rozszczepienie 0..1 (domyślnie 0.10)

   Wyjście: element dostaje klasę .lg3-on i <span class="lg3-lens">.
   ========================================================================== */
(function (window, document) {
  "use strict";

  if (window.RJGlass3) return;

  var NS = "http://www.w3.org/2000/svg";
  var LENS = "lg3-lens";
  var MAX_LENSES = 8;

  /* ---------- bezpieczniki ----------
     Filtr SVG z trzema przebiegami odkształcenia jest kosztowny. Na słabym
     telefonie, przy włączonym trybie oszczędzania albo gdy użytkownik prosi
     o mniej przezroczystości, lepiej pokazać spokojne szkło bez ugięcia niż
     zamulić stronę. */
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
  var MAP_CACHE = {};
  var uid = 0;
  var lensCount = 0;

  /* ---------- geometria ---------- */

  /* Odległość punktu od zaokrąglonego prostokąta.
     Zwraca { d: odległość do obrysu, nx, ny: normalna do wnętrza }. */
  function edgeDistance(x, y, w, h, r) {
    var cx = Math.min(Math.max(x, r), w - r);
    var cy = Math.min(Math.max(y, r), h - r);
    var dx = x - cx;
    var dy = y - cy;
    var len = Math.sqrt(dx * dx + dy * dy);

    if (len > r * 0.0001) {
      /* narożnik: normalna to promień okręgu */
      return { d: r - len, nx: dx / len, ny: dy / len };
    }

    /* krawędź prosta: najbliższa ściana */
    var left = x, right = w - x, top = y, bottom = h - y;
    var m = Math.min(left, right, top, bottom);
    if (m === left) return { d: x, nx: 1, ny: 0 };
    if (m === right) return { d: w - x, nx: -1, ny: 0 };
    if (m === top) return { d: y, nx: 0, ny: 1 };
    return { d: h - y, nx: 0, ny: -1 };
  }

  /* Profil fazy: nachylenie powierzchni w funkcji t = d / band.
     t = 0 → krawędź, t = 1 → wnętrze. Zwraca 0..1.

     EKSPONENT 3 (nie 2). Przy kwadracie ugięcie było największe na samej
     krawędzi i od razu „puchło" przez całą wstęgę — na ekranie dawało to
     jasną smugę zamiast załamania. Sześcian trzyma szczyt wąsko przy
     krawędzi i szybko wygasa, więc widać wyraźny „walec" i czysty obraz
     tuż za nim. */
  function bevelSlope(t) {
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    var u = 1 - t;
    return u * u * u;
  }

  /* ---------- mapa odkształceń ---------- */

  /* `pad` — o ile warstwa soczewki jest większa od panelu w każdą stronę.
     Mapa MUSI mieć rozmiar warstwy, nie panelu: `feImage` nie zawsze
     rozciąga obraz do obszaru filtra i wtedy mapa ląduje z przesunięciem
     o `pad` (zmierzone 27.11 — to była przyczyna „obraz ucieka w tafie").
     Sam obrys panelu jest wsunięty o `pad`, a wszystko na zewnątrz zostaje
     neutralne (i tak jest przycinane przez panel). */
  function buildMap(w, h, pad, r, scale, band) {
    var key = [w, h, pad, Math.round(r), Math.round(scale), Math.round(band)].join(":");
    if (MAP_CACHE[key]) return MAP_CACHE[key];

    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;

    var img = ctx.createImageData(w, h);
    var data = img.data;
    /* Wymiary PANELU (bez zapasu) i jego promień. */
    var pw = Math.max(1, w - 2 * pad);
    var ph = Math.max(1, h - 2 * pad);
    var rr = Math.max(0, Math.min(r, Math.min(pw, ph) / 2));
    var bb = Math.max(2, Math.min(band, Math.min(pw, ph) / 2));
    var half = scale / 2;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var p = (y * w + x) * 4;
        /* neutralne 128/128 = brak przesunięcia */
        var vx = 128, vy = 128;

        /* Współrzędne względem panelu; poza panelem zostaje neutralnie. */
        var px = x + 0.5 - pad;
        var py = y + 0.5 - pad;
        if (px < 0 || py < 0 || px > pw || py > ph) {
          data[p] = 128; data[p + 1] = 128; data[p + 2] = 0; data[p + 3] = 255;
          continue;
        }

        var e = edgeDistance(px, py, pw, ph, rr);
        if (e.d < bb) {
          var t = e.d / bb;
          var k = bevelSlope(t);
          if (k > 0.0005) {
            /* Soczewka wypukła: obraz ucieka DO ŚRODKA, czyli przeciwnie
               do normalnej skierowanej do wnętrza. */
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
    /* OBSZAR FILTRA MUSI BYĆ RÓWNY ELEMENTOWI (0/0/100%/100%).

       Wcześniej (i w v2) było tu -15%/130%, „żeby przesunięte piksele nie
       zostały obcięte". Skutek był odwrotny do zamierzonego: `feImage`
       rozciąga mapę odkształceń na CAŁY obszar filtra, więc faza soczewki
       wypadała poza widoczną taflę, a jej wnętrze dostawało jednolite
       przesunięcie. Na ekranie: obraz w tafli „uciekał" o kilkadziesiąt
       pikseli i linie tapety nie przechodziły przez krawędź (zmierzone
       27.11: przesunięcie ~70 px przy skali 62).
       Zapas na przesunięte piksele załatwia PADDING warstwy soczewki
       (patrz mount), nie obszar filtra. */
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
    var mid = scale;
    var lo = scale * (1 - d);
    var hi = scale * (1 + d);

    /* Trzy przebiegi: R mocniej, G środkowo, B słabiej. */
    var passes = [
      ["dispR", lo, "warpR"],
      ["dispG", mid, "warpG"],
      ["dispB", hi, "warpB"]
    ];
    passes.forEach(function (p) {
      f.appendChild(el("feDisplacementMap", {
        "in": "SourceGraphic",
        "in2": "map",
        "scale": String(p[1]),
        "xChannelSelector": "R",
        "yChannelSelector": "G",
        "result": p[2]
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

    f.appendChild(el("feBlend", {
      in: "onlyR", in2: "onlyG", mode: "screen", result: "rg"
    }));
    f.appendChild(el("feBlend", {
      in: "rg", in2: "onlyB", mode: "screen", result: "rgb"
    }));

    return f;
  }

  /* ---------- montaż ---------- */

  function radiusOf(node) {
    var c = window.getComputedStyle(node);
    var r = parseFloat(c.borderTopLeftRadius) || 0;
    /* 999px → promień rzeczywisty (połowa krótszego boku) */
    return Math.min(r, Math.min(node.offsetWidth, node.offsetHeight) / 2);
  }

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

    /* Zapas liczony PRZED mapą — mapa musi znać rozmiar warstwy. */
    var pad = Math.ceil(band * 1.5) + Math.ceil(scale / 2) + 2;
    var mapUrl = buildMap(w + 2 * pad, h + 2 * pad, pad, radiusOf(node), scale, band);
    if (!mapUrl) return;

    var id = "lg3-" + (++uid);
    ensureDefs().appendChild(buildFilter(id, mapUrl, scale, chroma));

    var lens = document.createElement("span");
    lens.className = LENS;
    lens.setAttribute("aria-hidden", "true");
    /* Soczewka wychodzi POZA panel o szerokość wstęgi.

       Bez tego ugięte piksele z krawędzi nie mają dokąd uciec: warstwa
       kończy się razem z panelem, więc `filter` obcina je i na ekranie
       zostaje ostra linia zamiast załamania (dokładnie to widać na
       zbliżeniu z 27.11). Zapas jest przycinany przez `overflow: clip`
       panelu — ustawianym niżej. */
    lens.style.inset = "-" + pad + "px";
    lens.setAttribute("data-lg3-pad", String(pad));
    paintBackdrop(lens);
    lens.style.filter = "url(#" + id + ")";

    node.insertBefore(lens, node.firstChild);
    /* Panel musi przyciąć soczewkę do swojego obrysu — inaczej jej zapas
       wystaje poza taflę. `clip` nie tworzy kontekstu przewijania, więc
       nie psuje przyklejonego paska. */
    var ov = "";
    try { ov = window.getComputedStyle(node).overflow; } catch (e) { ov = ""; }
    if (ov === "visible" || ov === "") {
      node.setAttribute("data-lg3-clip", "1");
      node.style.overflow = "clip";
    }
    node.classList.add("lg3-on");
    node.__lg3 = { id: id, lens: lens, w: w, h: h };

    lensCount++;
    lens.setAttribute("data-lg3-pad", String(pad));
    if (NATURAL) syncLens(lens, node);
  }

  function unmount(node) {
    if (!node || !node.__lg3) return;
    var o = node.__lg3;
    try {
      o.lens.parentNode.removeChild(o.lens);
      var f = document.getElementById(o.id);
      if (f) f.parentNode.removeChild(f);
    } catch (e) { /* ignorujemy */ }
    node.__lg3 = null;
    node.classList.remove("lg3-on");
    if (node.getAttribute("data-lg3-clip") === "1") {
      try { node.style.removeProperty("overflow"); } catch (e) { /* ignorujemy */ }
      node.removeAttribute("data-lg3-clip");
    }
    if (lensCount > 0) lensCount--;
  }

  /* Soczewka musi namalować DOKŁADNIE ten sam fragment tapety, który leży
     pod panelem — inaczej obraz „nie zgadza się" z tłem, linie się łamią
     i całość wygląda jak wklejony obrazek, a nie jak szkło.

     ZMIERZONE 27.11 (dwa razy, bo pierwszy wniosek był odwrotny):

     1. `background-size: cover` z `background-attachment: fixed` liczy się
        WZGLĘDEM ELEMENTU, nie okna. Soczewka 579×279 dostawała więc tapetę
        powiększoną pod siebie.
     2. Sam `filter` na elemencie zmienia zachowanie tła: `fixed` przestaje
        działać względem okna i tło zaczyna być pozycjonowane od narożnika
        ELEMENTU. Sprawdzone eksperymentem: dwie identyczne tafle, jedna
        z filtrem — pokazują różne fragmenty tapety.

     Dlatego nie polegamy na `fixed`. Liczymy rozmiar `cover` jawnie i
     przesuwamy tło o minus pozycję elementu w oknie, czyli odtwarzamy
     widok „jakby tło było przyklejone do okna". Przy przewijaniu trzeba
     to przeliczyć — stąd sync() niżej. */
  var NATURAL = null;
  var WALL = "/hub/wallpaper-2560.webp";

  function coverSize(nw, nh) {
    /* `documentElement.clientWidth` to szerokość pola widzenia BEZ paska
       przewijania — dokładnie ta, względem której `background-size: cover`
       skaluje tło strony. `innerWidth` bywa o ~15 px większe. */
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = window.innerHeight;
    var k = Math.max(vw / nw, vh / nh);
    return { w: nw * k, h: nh * k, vw: vw, vh: vh };
  }

  /* Ustawia tło soczewki tak, żeby pokrywało się z tłem strony.

     TU BYŁ BŁĄD (27.11) — trzy rzeczy naraz:

     1. Tło liczy się od NAROŻNIKA ELEMENTU, nie okna (`background-attachment:
        fixed` przestaje działać, gdy element ma `filter`). Dlatego pozycja
        musi być skompensowana o pozycję elementu — i to o TĘ, którą
        naprawdę widzi przeglądarka, czyli jego wewnętrzne pole.
     2. Elementem, który maluje tło, jest WARSTWA SOCZEWKI, a nie panel.
        Soczewka jest o `pad` większa od panelu i przesunięta o −pad, więc
        jej pozycja ≠ pozycja panelu. Branie pozycji panelu przesuwało
        tapetę o `pad` w obie osie.
     3. Rozmiar skali liczy się z okna, ale okno to `clientWidth/Height`
        (bez paska przewijania), nie `innerWidth`. */
  function syncLens(lens, node) {
    if (!NATURAL) return;
    var c = coverSize(NATURAL.w, NATURAL.h);
    lens.style.backgroundSize = Math.round(c.w) + "px " + Math.round(c.h) + "px";

    /* Bierzemy pole soczewki; padreduje ono panel, więc wynik jest spójny
       z tym, co widzi przeglądarka. */
    var pad = parseFloat(lens.getAttribute("data-lg3-pad")) || 0;
    var nw = node.offsetWidth + 2 * pad;
    var nh = node.offsetHeight + 2 * pad;
    var x = (c.vw - c.w) / 2;
    var y = (c.vh - c.h) / 2;

    /* Tło jest mniejsze niż warstwa tylko wtedy, gdy panel jest węższy od
       kadru — wtedy warstwa ma własny rozmiar i pozycja liczy się od zera. */
    if (nw < c.vw) x = (c.vw - c.w) / 2;
    if (nh < c.vh) y = (c.vh - c.h) / 2;

    lens.style.backgroundPosition = Math.round(x) + "px " + Math.round(y) + "px";
  }

  var syncing = false;
  function syncAll() {
    if (!NATURAL || syncing) return;
    syncing = true;
    var list = document.querySelectorAll("." + LENS);
    for (var i = 0; i < list.length; i++) {
      var node = list[i].parentNode;
      if (node) syncLens(list[i], node);
    }
    syncing = false;
  }

  function paintBackdrop(node) {
    node.style.backgroundImage = 'url("' + WALL + '")';
    node.style.backgroundRepeat = "no-repeat";
    /* Bez `fixed` — patrz komentarz wyżej. Pozycję liczymy sami. */
    node.style.backgroundAttachment = "scroll";

    if (NATURAL) return;
    var im = new Image();
    im.onload = function () {
      NATURAL = { w: im.naturalWidth, h: im.naturalHeight };
      syncAll();
    };
    im.src = WALL;
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

  var seen = null;   /* WeakSet zamontowanych */

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
      return;   /* CSS daje wtedy ciemny zapas — patrz html[data-lg3-off] */
    }

    scan(document);
    trackPointer();

    /* Tło soczewki jest wyrównywane do okna ręcznie, więc przy przewijaniu
       trzeba je przeliczyć — inaczej obraz pod szkłem „odjeżdża". */
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        syncAll();
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

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

    /* Zmiana rozmiaru: mapy trzeba przeliczyć (nowe wymiary). */
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
    scan: scan
  });
})(window, document);

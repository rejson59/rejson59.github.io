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
  var EDGE_BAND = 72;

  /* Siła przesunięcia w pikselach (maksymalne wychylenie na krawędzi).
     Wartość dodatnia wypycha obraz do wewnątrz — tak działa soczewka
     wypukła, czyli szkło. Skala rośnie z rozmiarem panelu: 14 px na małej
     karcie wygląda mocno, a na pełnoekranowym panelu byłoby niewidoczne.

     v3 (26.11): blur zniknął z materiału, więc załamanie jest JEDYNYM
     efektem, jaki ma szkło. Poprzednie 40-110 px ginęło — przy braku
     rozmycia trzeba je było podnieść, inaczej panel wygląda jak zwykły
     prostokąt z ramką. Teraz ugięcie widać na pierwszy rzut oka. */
  var SCALE_MIN = 88;
  var SCALE_MAX = 230;
  var SCALE_RATIO = 0.34;

  /* ---------- soczewka jako warstwa (v3) ----------

     DLACZEGO TAK, A NIE `backdrop-filter: url(#…)`:

     `url()` w `backdrop-filter` jest w Chromium PRZYJMOWANE, ale po cichu
     ignorowane — `getComputedStyle` pokaże `url(#rj-lg-3)`, a mimo to obraz
     pod panelem pozostanie nieugięty. Sprawdzone na tapecie w paski: pasy
     pod `blur(6px) url(#…)` były idealnie proste. To dlatego „załamanie”
     nigdy nie działało, mimo zielonych testów i poprawnych filtrów w DOM.

     `filter: url(#…)` na zwykłym elemencie działa bez zarzutu. Dlatego
     silnik wstawia do panelu warstwę `.rj-lg-lens`, maluje na niej tapetę
     w tym samym miejscu co `body::before` (`background-attachment: fixed`)
     i przepuszcza ją przez filtr ugięcia. Treść panelu leży wyżej (z-index),
     więc soczewka jest tylko tłem — tekst pozostaje ostry i czytelny.

     Koszt: jedna dodatkowa warstwa na panel. Dlatego tylko duże powierzchnie
     (patrz LENS_MIN_AREA) i twardy limit LENS_MAX. */
  var LENS_CLASS = "rj-lg-lens";
  var LENS_MAX = 10;          /* bezpiecznik: tyle paneli naraz, maksymalnie */
  var LENS_MIN_AREA = 9000;   /* px² — mniejsze elementy nie są tego warte */
  var lensCount = 0;
  var lensObserver = null;

  /* Soczewka jest kosztowna: to osobna warstwa kompozytora z filtrem SVG,
     przemalowywana przy każdym przewinięciu (tapeta jest `fixed`). Na stronie
     z 43 kartami projektów trzymanie ich wszystkich naraz zamuliłoby nawet
     mocny telefon. Dlatego soczewka żyje TYLKO na panelach widocznych
     w oknie — wchodzi przy wejściu w kadr, znika przy wyjściu. Efekt jest
     identyczny, a koszt stały: tyle warstw, ile widać, nie ile jest na stronie. */
  function watchVisibility(el) {
    if (!window.IntersectionObserver) { addLens(el); return; }
    if (!lensObserver) {
      lensObserver = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          var node = e.target;
          if (!node.__rjLiquidGlass) continue;
          if (e.isIntersecting) {
            if (addLens(node) && node.__rjLens) {
              node.__rjLens.style.filter = lensFilter(node.__rjLiquidGlass.id);
            }
          } else {
            removeLens(node);
          }
        }
      }, { rootMargin: "120px 0px" });
    }
    lensObserver.observe(el);
  }

  function removeLens(el) {
    if (!el || !el.__rjLens) return;
    try { el.__rjLens.parentNode.removeChild(el.__rjLens); } catch (e) { /* ignorujemy */ }
    el.__rjLens = null;
    /* Zdejmujemy TYLKO własne nadpisanie — `overflow` ustawiony przez
       stronę (np. karty z podglądem) musi zostać nietknięty. */
    if (el.getAttribute("data-rj-lens-overflow") === "1") {
      try { el.style.removeProperty("overflow"); } catch (e) { /* ignorujemy */ }
      el.removeAttribute("data-rj-lens-overflow");
    }
    if (lensCount > 0) lensCount--;
  }

  /* Adres tapety. Bierzemy go z `body::before`, żeby soczewka zawsze
     pokazywała DOKŁADNIE to samo, co tło strony — także po zmianie tapety
     w arkuszu, bez zmiany tego pliku. */
  function backdropUrl() {
    try {
      var bg = window.getComputedStyle(document.body, "::before");
      var img = bg.backgroundImage || "";
      var m = img.match(/url\((["']?)([^"')]+)\1\)/);
      if (m && m[2]) return m[2];
    } catch (e) { /* ignorujemy */ }
    return "/hub/wallpaper-2560.webp";
  }

  /* Przepisuje wszystkie warstwy tła z `body::before` na soczewkę.
     `background-attachment` zostaje `fixed` (z arkusza), więc obraz
     pokrywa się z tłem strony piksel w piksel. */
  function copyBackdrop(span) {
    var img = "", size = "", pos = "", rep = "";
    try {
      var bg = window.getComputedStyle(document.body, "::before");
      img = bg.backgroundImage || "";
      size = bg.backgroundSize || "";
      pos = bg.backgroundPosition || "";
      rep = bg.backgroundRepeat || "";
    } catch (e) { /* ignorujemy */ }
    if (!img || img === "none") img = "url(\"" + backdropUrl() + "\")";
    span.style.backgroundImage = img;
    if (size) span.style.backgroundSize = size;
    if (pos) span.style.backgroundPosition = pos;
    if (rep) span.style.backgroundRepeat = rep;
  }

  /* Filtr, który strona nakłada na samą tapetę (`body::before`).
     Soczewka kopiuje obraz tapety, więc MUSI dostać ten sam filtr —
     inaczej wnętrze panelu jest jaśniejsze od otoczenia i tekst ginie.
     Wycinamy z niego `url(...)`, żeby nie wciągnąć filtrów SVG. */
  function backdropTone() {
    try {
      var f = window.getComputedStyle(document.body, "::before").filter || "";
      f = f.replace(/url\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
      return f === "none" ? "" : f;
    } catch (e) { return ""; }
  }

  /* Pełny filtr warstwy: ugięcie + tony tapety. */
  function lensFilter(id) {
    var t = backdropTone();
    return "url(#" + id + ")" + (t ? " " + t : "");
  }

  function ensureLensStyles() {
    if (document.getElementById("rj-lg-lens-style")) return;
    var st = document.createElement("style");
    st.id = "rj-lg-lens-style";
    /* `background-attachment: fixed` ustawia tapetę względem OKNA, a nie
       panelu — dzięki temu soczewka pokrywa się piksel w piksel z tłem
       strony. Bez tego obraz “pływałby” przy przewijaniu. */
    st.textContent =
      "." + LENS_CLASS + "{position:absolute!important;inset:0!important;border-radius:inherit;" +
      "pointer-events:none;z-index:1;background-repeat:no-repeat;background-attachment:fixed;" +
      "background-size:cover;background-position:center}" +
      /* KLUCZ (v6): REFLEKS.
         Soczewka jest dzieckiem panelu, więc maluje się NAD jego tłem —
         a tło panelu (`background-image`) to właśnie refleks i tint.
         Efekt: refleks był rysowany, ale soczewka go zakrywała.
         Pomiar: lewy górny róg karty bez soczewki = 63,56,88 (jasny),
         z soczewką = 5,0,23 (czarno). Stąd „brak refleksji”.
         Dlatego soczewka odtwarza refleks na sobie (::before) i dostaje
         krawędziowe światło (::after) — teraz refleks żyje NAD obrazem. */
      "." + LENS_CLASS + "::before{content:'';position:absolute;inset:0;border-radius:inherit;" +
      "pointer-events:none;background:var(--rj-lg-sheen,none)}" +
      /* Światło krawędzi: jasna linia u góry, tęczowa obwódka — to one
         dają wrażenie grubości tafli i „odbicia” na ramce. */
      "." + LENS_CLASS + "::after{content:'';position:absolute;inset:0;border-radius:inherit;" +
      "pointer-events:none;background:var(--rj-lg-edge,none);opacity:.9}" +
      /* Cienkie paski (topbar) mają mało własnego krycia, a soczewka
         wnosi ostry obraz tapety — tekst zaczynał na nim ginąć.
         Dla niskich paneli tło soczewki jest mocniejsze. */

      /* Treść musi być nad soczewką. `:not` chroni samą warstwę przed
         dostaniem `z-index`, które zerwałoby jej `position:absolute`. */
      ".rj-lg-on{position:relative}" +
      ".rj-lg-on>:not(." + LENS_CLASS + "){position:relative;z-index:2}";
    document.head.appendChild(st);
  }

  function addLens(el) {
    if (el.querySelector(":scope > ." + LENS_CLASS)) return true;
    if (lensCount >= LENS_MAX) return false;
    var r = el.getBoundingClientRect();
    if (r.width * r.height < LENS_MIN_AREA) return false;

    var span = document.createElement("span");
    span.className = LENS_CLASS;
    span.setAttribute("aria-hidden", "true");
    /* Pasek do ~90 px wysokości dostaje mocniejszą warstwę tonalną —
       soczewka w cienkim pasie „zjada” tło i tekst traci kontrast. */
    if (r.height <= 90) span.setAttribute("data-narrow", "");
    /* KLUCZ (v4): soczewka musi malować DOKŁADNIE to samo, co tło strony —
       wszystkie warstwy, nie tylko tapetę. Wcześniej brała sam `url()`
       tapety, więc przykrywała delikatną siatkę, którą refrakcja ma giąć.
       Efekt: filtr działał, ale nie miał czego odkształcić. */
    copyBackdrop(span);
    el.insertBefore(span, el.firstChild);
    /* Soczewka ma `position:absolute; inset:0`, więc sama nie wystaje poza
       panel — przycinanie NIE jest potrzebne do poprawnego wyglądu.
       A jest szkodliwe: na kartach z podglądem (`overflow` ustawia im
       później JS) `clip` ucinał zawartość przy powrocie do góry strony.
       Dlatego przycinamy tylko wtedy, gdy panel i tak przycina. */
    var ov = "";
    try { ov = window.getComputedStyle(el).overflow; } catch (e) { ov = ""; }
    if (ov === "visible" || ov === "") {
      el.setAttribute("data-rj-lens-overflow", "1");
      try { el.style.overflow = "clip"; } catch (e) { /* ignorujemy */ }
    }
    lensCount++;
    el.__rjLens = span;
    return true;
  }

  /* Aberracja chromatyczna: krawędź rozszczepia światło jak pryzmat.
     v3 podnosi ją z 0.10 do 0.16 — przy czystym szkole (bez mgły)
     to ona odpowiada za wrażenie „grubej tafli”. */
  var CHROMA = 0.22;

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

        /* Profil soczewki: największe ugięcie tuż ZA krawędzią, potem
           łagodne wygasanie do zera. Liniowy spadek „od krawędzi” dawał
           efekt niewidoczny — obraz uginał się najmocniej dokładnie tam,
           gdzie obcinał go border-radius, więc zostawał tylko wąski pasek.
           Poza wstęgą nie ma przesunięcia: środek MUSI zostać neutralny
           (128/128), inaczej cały panel ucieka w bok. */
        var strength = 0;
        if (d < b) {
          var t = d / b;                  /* 0 na krawędzi → 1 na końcu wstęgi */
          /* sin(pi*t) ma szczyt w połowie wstęgi i zero na obu końcach. */
          strength = Math.sin(Math.PI * Math.pow(t, 0.72));
        }
        if (strength <= 0.001) { continue; }

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
    disp.setAttribute("result", "bent");

    filter.appendChild(image);
    filter.appendChild(disp);

    /* Aberracja chromatyczna: krawędź rozszczepia światło jak pryzmat.
       Dwa dodatkowe przesunięcia o różnej sile — jedno w kanale R,
       drugie w B — i złożenie z powrotem. Bez tego ugięcie wygląda
       „cyfrowo”: obraz się przesuwa, ale nie ma wrażenia grubego szkła. */
    var chroma = scale * CHROMA;
    var dispR = document.createElementNS(ns, "feDisplacementMap");
    dispR.setAttribute("in", "bent");
    dispR.setAttribute("in2", "map");
    dispR.setAttribute("scale", String(scale + chroma * 2));
    dispR.setAttribute("xChannelSelector", "R");
    dispR.setAttribute("yChannelSelector", "G");
    dispR.setAttribute("result", "warpR");

    var dispB = document.createElementNS(ns, "feDisplacementMap");
    dispB.setAttribute("in", "bent");
    dispB.setAttribute("in2", "map");
    dispB.setAttribute("scale", String(scale - chroma * 2));
    dispB.setAttribute("xChannelSelector", "R");
    dispB.setAttribute("yChannelSelector", "G");
    dispB.setAttribute("result", "warpB");

    /* Rozdziel kanały: R z jednego przebiegu, G ze środkowego, B z drugiego. */
    var keepR = document.createElementNS(ns, "feColorMatrix");
    keepR.setAttribute("in", "warpR");
    keepR.setAttribute("type", "matrix");
    keepR.setAttribute("values", "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0");
    keepR.setAttribute("result", "onlyR");

    var keepG = document.createElementNS(ns, "feColorMatrix");
    keepG.setAttribute("in", "bent");
    keepG.setAttribute("type", "matrix");
    keepG.setAttribute("values", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0");
    keepG.setAttribute("result", "onlyG");

    var keepB = document.createElementNS(ns, "feColorMatrix");
    keepB.setAttribute("in", "warpB");
    keepB.setAttribute("type", "matrix");
    keepB.setAttribute("values", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0");
    keepB.setAttribute("result", "onlyB");

    var blend1 = document.createElementNS(ns, "feBlend");
    blend1.setAttribute("in", "onlyR");
    blend1.setAttribute("in2", "onlyG");
    blend1.setAttribute("mode", "screen");
    blend1.setAttribute("result", "rg");

    var blend2 = document.createElementNS(ns, "feBlend");
    blend2.setAttribute("in", "rg");
    blend2.setAttribute("in2", "onlyB");
    blend2.setAttribute("mode", "screen");

    filter.appendChild(dispR);
    filter.appendChild(dispB);
    filter.appendChild(keepR);
    filter.appendChild(keepG);
    filter.appendChild(keepB);
    filter.appendChild(blend1);
    filter.appendChild(blend2);

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

  /* Na wąskim ekranie ta sama siła ugięcia wygląda znacznie mocniej —
     panel jest mały, więc wstęga krawędzi zajmuje większą jego część
     i powstają jasne smugi zamiast szkła. Dlatego szerokość wstęgi
     i siła skali skalują się z szerokością okna. */
  function edgeBandFor() {
    var vw = window.innerWidth || 1440;
    if (vw <= 520) return Math.round(EDGE_BAND * 0.45);
    if (vw <= 900) return Math.round(EDGE_BAND * 0.70);
    return EDGE_BAND;
  }

  function scaleCap() {
    var vw = window.innerWidth || 1440;
    if (vw <= 520) return 0.55;
    if (vw <= 900) return 0.78;
    return 1;
  }

  /* BŁĄD, KTÓRY TU BYŁ (naprawiony 26.11):
     `Math.max(SCALE_MIN, ...)` podnosił ugięcie do 88 px NAWET na pasku
     o wysokości 56 px. Soczewka przesuwała piksele dalej, niż sięga sam
     element, więc cienki topbar zamieniał się w rozmazane, tęczowe smugi
     (przy 88 px na pasku 56 px to nie refrakcja, tylko destrukcja obrazu).
     Teraz ugięcie NIGDY nie przekracza ułamka krótszego boku: przy
     proporcji 0.34 maksymalnie 34% wysokości. Duże panele dostają pełne
     SCALE_MAX, bo tam min(w,h) jest duże — wzór sam się skaluje. */
  var SCALE_MAX_RATIO = 0.38;

  function scaleFor(w, h) {
    var short = Math.min(w, h);
    var raw = Math.max(SCALE_MIN, Math.min(SCALE_MAX, short * SCALE_RATIO));
    /* Twardy sufit proporcjonalny — to on chroni cienkie paski. */
    var cap = Math.max(10, short * SCALE_MAX_RATIO);
    return Math.min(raw, cap) * scaleCap();
  }

  /* Wstęga też nie może być szersza niż panel. Na topbarze 56 px wstęga
     72 px obejmowała CAŁY pasek, więc „krawędź” była wszędzie i nigdzie. */
  function bandFor(w, h) {
    var short = Math.min(w, h);
    return Math.max(8, Math.min(edgeBandFor(), Math.round(short * 0.30)));
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
    if (!scale) scale = scaleFor(w, h);
    var band = readNumber(el, "data-lg-band", bandFor(w, h));
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

    /* Soczewka: warstwa z tapetą przepuszczona przez filtr ugięcia.
       `filter` na span-ie, a nie na panelu — inaczej filtr objąłby też
       tekst i cała treść by się rozjechała. */
    ensureLensStyles();
    watchVisibility(el);

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
    if (!scale) scale = scaleFor(w, h);
    item.band = bandFor(w, h);
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
    if (el.__rjLens && el.__rjLiquidGlass) {
      el.__rjLens.style.filter = lensFilter(el.__rjLiquidGlass.id);
    }
  }

  function unmount(el) {
    var item = el && el.__rjLiquidGlass;
    if (!item) return;
    try { if (item.observer) item.observer.disconnect(); } catch (e) { /* ignorujemy */ }
    try { if (item.filter && item.filter.parentNode) item.filter.parentNode.removeChild(item.filter); } catch (e) { /* ignorujemy */ }
    el.classList.remove("rj-lg-on");
    removeLens(el);
    try { if (lensObserver) lensObserver.unobserve(el); } catch (e) { /* ignorujemy */ }
    try { el.style.removeProperty("overflow"); } catch (e) { /* ignorujemy */ }
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
    /* UWAGA: .rj-home-stats CELOWO tu nie ma. To przezroczysty pas o pełnej
       szerokości, a materiał nosi dopiero pigułka `.header-metrics` w środku.
       Soczewka na tym pasie malowała surową tapetę na całej szerokości —
       nad hero pojawiał się jasny, pusty baner zamiast szkła. */
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
    ".mobile-menu",
    /* Karty treści: nauka (RejClass), narzędzia, pliki. To one są
       największą powierzchnią szkła na podstronach. */
    ".rjc-subject",
    ".rjc-note-definitions",
    ".rjc-note-everyday",
    ".rjc-bio-point",
    ".e-topic",
    ".lesson-card",
    ".topic-card",
    /* v3: hero i duże kontenery podstron. Bez wpisu tutaj nie dostają
       filtra, a przy braku bluru zostałyby zwykłym prostokątem z ramką —
       dokładnie tym, na co użytkownik narzekał („to nie wygląda jak
       szkło, tylko jak ciemny blok”). */
    ".hero",
    ".rjapp-hero",
    ".tools-hero",
    ".services-hero",
    ".rjc-hero",
    ".partner-hero",
    ".lic-hero",
    ".cn-hero",
    ".profile-card",
    /* Górny pasek to najbardziej widoczna szklana powierzchnia na stronie —
       bez wpisu tutaj zostawał jedynym panelem bez refrakcji. */
    ".rj-shared-header",
    /* v7: topbar i panele nagłówka. Wcześniej nie miały soczewki, więc ich
       `--lg-filter` był pusty i szkło na pasku było „inne” niż na kartach —
       jedyny element bez ugięcia na całej stronie. */
    ".site-header",
    ".topbar"
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

/* Testy przeglądarkowe loadera (jsdom) — zachowanie, nie wygląd.
 *
 * Uruchomienie:
 *   cd scripts/jsdom && npm install && node loader.test.js
 *
 * Sprawdzają to, czego nie widać w statycznym teście HTML:
 *  - pasek postępu: kroki, monotoniczność, limit 90%, dobicie, reset,
 *  - kolejność zdarzeń przy chowaniu nakładki,
 *  - nakładka NIE MOŻE zostać na ekranie (ani zamarznąć w połowie znikania),
 *  - pasek NIE MOŻE się cofać przy przejściu na podstronę,
 *  - podglądy: maszyna stanów, bramka loadera, start pojedynczo,
 *  - słabe urządzenie: zastój wątku, wolne klatki.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const LOADER = fs.readFileSync(path.join(ROOT, "js", "loader.js"), "utf8");

/* Szybkie warianty watchdogów — inaczej testy trwałyby minutami. */
const LOADER_FAST = LOADER
  .replace("var PREVIEW_TIMEOUT_MS = 15000;", "var PREVIEW_TIMEOUT_MS = 120;")
  .replace("var PREVIEW_RETRY_MS = 15000;", "var PREVIEW_RETRY_MS = 160;")
  .replace("}, 1200);", "}, 60);")
  .replace("[700, 1800, 4000].forEach", "[].forEach");

const bodyStart = HTML.indexOf("<body>");
const bootStart = HTML.indexOf("<!-- Loader startuje NATYCHMIAST");
const bootEnd = HTML.indexOf("</script>", bootStart) + 9;
const overlayHtml = HTML.slice(bodyStart, bootStart);
const bootCode = HTML.slice(bootStart, bootEnd)
  .replace(/^[\s\S]*?<script>/, "")
  .replace(/<\/script>$/, "");

const out = [];
const check = (name, cond, detail) => {
  out.push(!!cond);
  console.log((cond ? "  ✔ " : "  ✘ ") + name + (detail ? "  [" + detail + "]" : ""));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cls = (el) => Array.from(el.classList).sort().join(" ");
const scale = (fill) => {
  const m = /scaleX\(([\d.]+)\)/.exec(fill.style.transform || "");
  return m ? parseFloat(m[1]) : 0;
};
const CARD = (i) => `<a class="card-preview" href="x${i}" target="_blank">
  <div class="card-preview-frame"><iframe data-src="https://rejson59.github.io/P${i}/"></iframe></div></a>`;

function mk(html, evalBoot, evalLoader) {
  const dom = new JSDOM("<!doctype html><html><body>" + html + "</body></html>", {
    url: "https://rejson59.github.io/", runScripts: "outside-only", pretendToBeVisual: true
  });
  dom.window.Element.prototype.animate = undefined;
  if (evalBoot) dom.window.eval(bootCode);
  if (evalLoader !== null) dom.window.eval(evalLoader === undefined ? LOADER_FAST : evalLoader);
  return dom;
}

(async () => {
  console.log("\n=== A. PASEK: KROKI, MONOTONICZNOŚĆ, LIMIT ===");
  {
    /* bez loader.js — testujemy sam kontroler paska w izolacji */
    const d = mk(overlayHtml, true, null);
    const w = d.window, doc = w.document;
    const bar = doc.querySelector(".rj-progress"), fill = doc.querySelector(".rj-progress-fill");

    check("kontroler istnieje", !!(w.RJProgress && w.RJProgress.set));
    check("markup: pasek + fill + shine", !!bar && !!fill && !!doc.querySelector(".rj-progress-shine"));

    const samples = [];
    const timer = setInterval(() => samples.push(scale(fill)), 60);
    await wait(1600);
    clearInterval(timer);

    check("pasek ruszył sam", samples.some((v) => v > 0.03));
    check("nigdy się nie cofa", samples.every((v, i) => i === 0 || v >= samples[i - 1] - 0.0001));
    check("nie przekracza 90% przed końcem", samples.every((v) => v <= 0.9001), "max=" + Math.max(...samples).toFixed(3));
    check("JS przejmuje pasek po pierwszym kroku", bar.classList.contains("is-managed"), bar.className);

    w.RJProgress.set(0.5);
    await wait(450);
    const po5 = scale(fill);
    check("set(0.5) podnosi poprzeczkę", po5 > 0.45, "scaleX=" + po5.toFixed(3));
    w.RJProgress.set(0.2);
    await wait(450);
    check("set() nie cofa paska", scale(fill) >= po5 - 0.0001, "scaleX=" + scale(fill).toFixed(3));
    w.RJProgress.set(1);
    await wait(450);
    check("set(1) i tak zatrzymuje się na 90%", scale(fill) <= 0.9001, "scaleX=" + scale(fill).toFixed(3));

    w.RJProgress.complete();
    await wait(60);
    check("complete() → 100%", Math.abs(scale(fill) - 1) < 0.0001, "scaleX=" + scale(fill).toFixed(4));
    check("complete() dodaje is-done", bar.classList.contains("is-done"), bar.className);

    w.RJProgress.reset();
    check("reset() → 0", scale(fill) === 0, "scaleX=" + scale(fill));
    check("reset() zdejmuje is-done", !bar.classList.contains("is-done"), bar.className);
    check("reset() przywraca startową animację CSS", !bar.classList.contains("is-managed"), bar.className);

    w.RJProgress.complete(true);
    check("complete(true) → 100% bez animacji", Math.abs(scale(fill) - 1) < 0.0001);
    check("complete(true) → klasa is-instant", bar.classList.contains("is-instant"), bar.className);
  }

  console.log("\n=== B. CHOWANIE NAKŁADKI: KOLEJNOŚĆ I SPRZĄTANIE ===");
  {
    const d = mk(overlayHtml, true, LOADER);
    const w = d.window, doc = w.document;
    const ov = doc.getElementById("rj-page-loader");
    const events = [];
    new w.MutationObserver(() => {
      if (ov.classList.contains("is-hidden")) events.push("hidden");
    }).observe(ov, { attributes: true, attributeFilter: ["class"] });
    const wrap = (name) => {
      const fn = w.RJProgress[name];
      w.RJProgress[name] = function () { events.push(name); return fn.apply(this, arguments); };
    };
    wrap("complete"); wrap("reset");

    w.dispatchEvent(new w.Event("load"));
    await wait(1900);
    console.log("   kolejność:", events.join(" → "));
    check("complete przed ukryciem", events.indexOf("complete") > -1 && events.indexOf("complete") < events.indexOf("hidden"), events.join(","));
    check("nakładka ukryta", ov.classList.contains("is-hidden"));
    check("nakładka znika z układu (nie może zakrywać strony)", ov.style.display === "none", "display=" + (ov.style.display || "brak"));
    check("pasek nie jest zerowany po ukryciu", !events.includes("reset"), events.join(","));
  }

  console.log("\n=== C. PRZEJŚCIE NA PODSTRONĘ NIE COFA PASKA ===");
  {
    const d = mk(overlayHtml, true, LOADER);
    const w = d.window, doc = w.document;
    const ov = doc.getElementById("rj-page-loader");
    const fill = doc.querySelector(".rj-progress-fill");

    w.dispatchEvent(new w.Event("load"));
    await wait(1900);

    const samples = [];
    const timer = setInterval(() => samples.push({ v: scale(fill), shown: ov.classList.contains("is-shown") }), 40);
    const link = doc.createElement("a");
    link.setAttribute("href", "/widzety");
    doc.body.appendChild(link);
    link.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await wait(900);
    clearInterval(timer);

    console.log("   wartości:", samples.filter((s) => s.shown).map((s) => s.v.toFixed(2)).join(" "));
    check("pasek zostaje pełny przy przejściu",
      samples.filter((s) => s.shown).every((s) => s.v > 0.9),
      "min=" + Math.min.apply(null, samples.filter((s) => s.shown).map((s) => s.v)).toFixed(2));
    check("nakładka wraca do układu przy pokazaniu", ov.style.display !== "none", "display=" + (ov.style.display || "brak"));
    check("nakładka jest pokazana", ov.classList.contains("is-shown") && !ov.classList.contains("is-hidden"), cls(ov));
  }

  console.log("\n=== D. NIKT NIE PAUZUJE ANIMACJI SAMEJ NAKŁADKI ===");
  {
    /* Regresja: pauseLoaderAnimations(true) łapało zanikanie nakładki
       i zamrażało ją w połowie znikania — strona zostawała zakryta. */
    const d = mk(overlayHtml, true, LOADER);
    const w = d.window, doc = w.document;
    const touched = [];
    w.Element.prototype.getAnimations = function () {
      touched.push(this.id || this.className);
      return [];
    };
    w.dispatchEvent(new w.Event("load"));
    await wait(1900);
    const ov = doc.getElementById("rj-page-loader");
    check("getAnimations nie dotyka nakładki", touched.every((n) => n !== "rj-page-loader"), touched.join(", ") || "brak wywołań");
    check("nakładka i tak znika z układu", ov.style.display === "none", "display=" + (ov.style.display || "brak"));
  }

  console.log("\n=== E. PŁYNNOŚĆ LOADERA (bez regresji) ===");
  {
    const d = new JSDOM("<!doctype html><html><body>" + overlayHtml + "</body></html>", {
      url: "https://rejson59.github.io/", runScripts: "outside-only", pretendToBeVisual: true
    });
    const calls = [];
    d.window.Element.prototype.animate = function (f, o) { calls.push({ el: this.className, delay: o && o.delay }); return { cancel() {} }; };
    d.window.eval(bootCode);
    const g = d.window.document.querySelector("#rj-page-loader .rj-dough");
    check("6 animacji kulek", calls.length === 6, String(calls.length));
    check("grupa ma is-waapi", g.classList.contains("is-waapi"), g.className);
    check("fala 0/130/260 ms", calls.filter((c) => c.el.includes("ball")).map((c) => c.delay).join(",") === "0,130,260");
    d.window.eval(LOADER);
    check("loader.js nie dubluje animacji", calls.length === 6, String(calls.length));
  }
  {
    const d = mk(overlayHtml + CARD(0), false, LOADER_FAST);
    d.window.Element.prototype.animate = () => ({ cancel() {} });
    d.window.RJLoader.scan(d.window.document);
    const p = d.window.document.querySelector(".card-preview");
    const iframe = p.querySelector("iframe");
    d.window.RJLoader.mountPreview(p);
    check("pod loaderem iframe nie startuje", !iframe.getAttribute("src"));
    check("zapamiętano chęć montowania", p._rjWantMount === true);
    d.window.dispatchEvent(new d.window.Event("load"));
    await wait(1600);
    check("po zniknięciu loadera iframe startuje", !!iframe.getAttribute("src"));
  }
  {
    const slow = new JSDOM("<!doctype html><html><body>" + overlayHtml + "</body></html>", {
      url: "https://rejson59.github.io/", runScripts: "outside-only", pretendToBeVisual: true
    });
    let t = 0;
    slow.window.requestAnimationFrame = (fn) => { t += 40; setTimeout(() => fn(t), 0); };
    slow.window.Element.prototype.animate = undefined;
    slow.window.eval(LOADER);
    await wait(140);
    check("25 fps → tryb lite", slow.window.document.getElementById("rj-page-loader").classList.contains("rj-loader--lite"));

    const fast = new JSDOM("<!doctype html><html><body>" + overlayHtml + "</body></html>", {
      url: "https://rejson59.github.io/", runScripts: "outside-only", pretendToBeVisual: true
    });
    let t2 = 0;
    fast.window.requestAnimationFrame = (fn) => { t2 += 16; setTimeout(() => fn(t2), 0); };
    fast.window.Element.prototype.animate = undefined;
    fast.window.eval(LOADER);
    await wait(140);
    check("60 fps → bez trybu lite", !fast.window.document.getElementById("rj-page-loader").classList.contains("rj-loader--lite"));
  }

  console.log("\n=== F. PODGLĄDY: MASZYNA STANÓW (bez regresji) ===");
  {
    const d = mk(CARD(0), false, LOADER_FAST), doc = d.window.document;
    const p = doc.querySelector(".card-preview"), f = doc.querySelector(".card-preview-frame"), i = doc.querySelector("iframe");
    f.classList.add("is-frozen"); f._frozenDone = true; i.style.display = "none";
    d.window.RJLoader.scan(doc);
    await wait(40);
    check("zdejmuje is-frozen", !f.classList.contains("is-frozen"));
    check("przywraca iframe", i.style.display !== "none");
    check("włącza loader", p.classList.contains("is-loading"), cls(p));
  }
  {
    const d = mk(CARD(0), false, LOADER_FAST), doc = d.window.document;
    const p = doc.querySelector(".card-preview"), f = doc.querySelector(".card-preview-frame");
    const img = doc.createElement("img");
    img.className = "card-preview-snapshot"; img.setAttribute("src", "data:image/jpeg;base64,zzz");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 0 });
    f.insertBefore(img, f.firstChild); f.classList.add("is-frozen");
    d.window.RJLoader.mountPreview(p);
    await wait(40);
    check("usuwa zepsuty obraz", !f.querySelector(".card-preview-snapshot"));
    check("przechodzi na żywą ramkę", p.classList.contains("is-loading"), cls(p));
  }
  {
    const d = mk(CARD(0), false, LOADER_FAST), doc = d.window.document;
    const p = doc.querySelector(".card-preview"), f = doc.querySelector(".card-preview-frame");
    const img = doc.createElement("img");
    img.className = "card-preview-snapshot"; img.setAttribute("src", "data:image/jpeg;base64,AAA");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 640 });
    f.insertBefore(img, f.firstChild); f.classList.add("is-frozen");
    d.window.RJLoader.mountPreview(p);
    check("dobry zrzut: is-frozen zostaje", f.classList.contains("is-frozen"));
    check("dobry zrzut: bez loadera", !p.classList.contains("is-loading"));
  }
  {
    const d = mk(CARD(0), false, LOADER_FAST), doc = d.window.document;
    const p = doc.querySelector(".card-preview");
    d.window.RJLoader.scan(doc);
    await wait(700);
    check("brak odpowiedzi → is-failed", p.classList.contains("is-failed"), cls(p));
    check("plakietka z nazwą", !!p.querySelector(".card-preview-fallback strong"));
    const btn = p.querySelector("[data-rj-retry]");
    check("przycisk ponowienia", !!btn);
    btn.dispatchEvent(new d.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await wait(40);
    check("ponowienie wznawia", p.classList.contains("is-loading"), cls(p));
  }
  {
    const d = mk(CARD(0), false, LOADER_FAST), doc = d.window.document;
    const p = doc.querySelector(".card-preview"), i = doc.querySelector("iframe");
    d.window.RJLoader.scan(doc);
    Object.defineProperty(i, "contentWindow", { value: { location: { href: "https://rejson59.github.io/P0/" } } });
    Object.defineProperty(i, "contentDocument", { value: { body: { children: [doc.createElement("div")], textContent: "x" } } });
    i.dispatchEvent(new d.window.Event("load"));
    await wait(80);
    check("wczytana treść → is-loaded", p.classList.contains("is-loaded"), cls(p));
  }
  {
    const d = mk(CARD(0), false, LOADER_FAST), doc = d.window.document;
    const p = doc.querySelector(".card-preview"), i = doc.querySelector("iframe");
    d.window.RJLoader.scan(doc);
    Object.defineProperty(i, "contentWindow", { value: { location: { href: "about:blank" } } });
    Object.defineProperty(i, "contentDocument", { value: { body: { children: [], textContent: "" } } });
    i.dispatchEvent(new d.window.Event("load"));
    await wait(500);
    check("about:blank nie jest sukcesem", p.classList.contains("is-failed"), cls(p));
  }

  console.log("\n=== G. SŁABE URZĄDZENIE: ZASTÓJ WĄTKU I ZRYW RAMek ===");
  {
    const cards = Array.from({ length: 5 }, (_, i) => CARD(i)).join("");
    const dom = new JSDOM("<!doctype html><html><body>" + overlayHtml + cards + "</body></html>", {
      url: "https://rejson59.github.io/", runScripts: "outside-only", pretendToBeVisual: true
    });
    const w = dom.window, doc = w.document;
    const freeze = { until: Date.now() + 900 };
    w.requestAnimationFrame = (fn) => setTimeout(() => {
      const left = Math.max(0, freeze.until - Date.now());
      setTimeout(() => fn(performance.now()), left + 120);
    }, 0);
    w.Element.prototype.animate = undefined;
    w.eval(bootCode);
    w.eval(LOADER_FAST);

    const fill = doc.querySelector(".rj-progress-fill");
    await wait(450);
    check("po zastoju wątku pasek nie jest pusty", scale(fill) > 0.01, "scaleX=" + scale(fill).toFixed(3));

    w.dispatchEvent(new w.Event("load"));
    let prev = 0, maxBurst = 0;
    const started = () => Array.from(doc.querySelectorAll("iframe")).filter((f) => f.getAttribute("src")).length;
    for (let i = 0; i < 80; i++) {
      await wait(25);
      const now = started();
      maxBurst = Math.max(maxBurst, now - prev);
      prev = now;
    }
    check("ramki startują pojedynczo, nie wszystkie naraz", maxBurst <= 2, "zryw: " + maxBurst);
    check("ostatecznie startują wszystkie", prev === 5, "uruchomione: " + prev);
  }

  console.log("\n=== H. E2E: PRAWDZIWA STRONA Z SERWERA ===");
  {
    let dom;
    try {
      dom = await JSDOM.fromURL("http://127.0.0.1:8000/index.html", {
        runScripts: "dangerously", resources: "usable", pretendToBeVisual: true
      });
    } catch (e) {
      console.log("  (pominięte — brak serwera na :8000; uruchom `python3 -m http.server 8000`)");
      dom = null;
    }
    if (dom) {
      const w = dom.window, doc = w.document;
      const ov = doc.getElementById("rj-page-loader");
      const fill = doc.querySelector(".rj-progress-fill");
      check("markup paska w DOM", !!doc.querySelector(".rj-progress") && !!fill);
      check("kontroler wystawiony", !!(w.RJProgress && w.RJProgress.set));

      const seen = [];
      const timer = setInterval(() => seen.push({ v: scale(fill), hidden: ov.classList.contains("is-hidden") }), 100);
      await wait(2800);
      clearInterval(timer);

      const hiddenAt = seen.findIndex((s) => s.hidden);
      const cycle = (hiddenAt > -1 ? seen.slice(0, hiddenAt + 1) : seen).map((s) => s.v);
      console.log("   przebieg:", seen.map((s) => s.v.toFixed(2)).join(" "));
      check("pasek ruszył", cycle.some((v) => v > 0.02));
      check("monotoniczny", cycle.every((v, i) => i === 0 || v >= cycle[i - 1] - 0.0001));
      check("nigdy > 100%", cycle.every((v) => v <= 1.0001));
      check("nakładka schowana", hiddenAt > -1);
      check("nakładka zdjęta z układu", ov.style.display === "none", "display=" + (ov.style.display || "brak"));
      check("pasek pełny przed schowaniem", hiddenAt > -1 && seen[hiddenAt].v > 0.98);
      check("loader.js załadowany", !!(w.RJLoader && w.RJLoader.scan));
    }
  }

  const ok = out.filter(Boolean).length;
  console.log("\n" + "=".repeat(56));
  console.log(ok === out.length ? `WYNIK: ${ok}/${out.length} ✔` : `WYNIK: ${ok}/${out.length} ✘`);
  process.exit(ok === out.length ? 0 : 1);
})();

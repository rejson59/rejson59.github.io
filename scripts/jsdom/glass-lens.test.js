/* Testy soczewki Liquid Glass (jsdom).
 *
 * Uruchomienie: cd scripts/jsdom && npm install && node glass-lens.test.js
 *
 * Po co: soczewka to delikatny dodatek — ma się włączać tylko tam, gdzie
 * przeglądarka naprawdę potrafi `backdrop-filter: url(...)`, a wszędzie indziej
 * zostawić samo szkło z CSS. Ten test pilnuje:
 *  - braku filtra i braku atrybutu, gdy wsparcia nie ma (albo gdy jest
 *    save-data / reduce-transparency),
 *  - poprawnej mapy: środek neutralny (128), krawędź wychylona,
 *  - sensownego zakresu `scale`, więc przesunięcie nie „rozjeżdża” tekstu,
 *  - braku wyjątku, gdy kanwa 2D jest niedostępna.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = fs.readFileSync(path.join(__dirname, "..", "..", "js", "glass-lens.js"), "utf8");

const out = [];
const check = (name, cond, detail) => {
  out.push(!!cond);
  console.log((cond ? "  ✔ " : "  ✘ ") + name + (detail ? "  [" + detail + "]" : ""));
};

function mk(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    '<!doctype html><html><body>' +
      '<section class="card" data-glass-lens></section>' +
      "<article data-glass-lens></article>" +
      "<p>bez soczewki</p></body></html>",
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://rejson59.github.io/licencja" }
  );
  const w = dom.window;
  const d = w.document;

  const boxes = opts.boxes || [800, 420];
  [].forEach.call(d.querySelectorAll("[data-glass-lens]"), (el) => {
    Object.defineProperty(el, "offsetWidth", { value: boxes[0] });
    Object.defineProperty(el, "offsetHeight", { value: boxes[1] });
  });

  w.CSS = { supports: () => opts.supports !== false };
  w.navigator.connection = { saveData: !!opts.saveData };
  w.matchMedia = () => ({ matches: !!opts.reducedTransparency });

  let painted = null;
  if (opts.canvas !== false) {
    w.HTMLCanvasElement.prototype.getContext = function () {
      return {
        createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: (img) => { painted = img; }
      };
    };
    w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,R0w";
  } else {
    w.HTMLCanvasElement.prototype.getContext = () => null;
  }

  w.eval(SRC);
  return { w, d, painted: () => painted };
}

console.log("\n=== A. WSPARCIE: SOCZEWKA POWSTAJE ===");
{
  const t = mk({});
  const svg = t.d.querySelector("svg.rj-lens-defs");
  const filter = t.d.getElementById("rj-lens-0");
  const img = filter && filter.querySelector("feImage");
  const disp = filter && filter.querySelector("feDisplacementMap");
  const card = t.d.querySelector(".card");

  check("definicje SVG dopięte do strony", !!svg);
  check("filtr ma własne id", !!filter);
  check("mapa bevela jest obrazem PNG", img && /^data:image\/png;base64,/.test(img.getAttribute("href")));
  check("mapa rozciąga się na cały element", img && img.getAttribute("preserveAspectRatio") === "none");
  check("kanały przesunięcia R/G", disp && disp.getAttribute("xChannelSelector") === "R" && disp.getAttribute("yChannelSelector") === "G");
  const scale = Number(disp && disp.getAttribute("scale"));
  check("scale w bezpiecznym zakresie 9–18", scale >= 9 && scale <= 18, String(scale));
  check("karta dostała zmienną z filtrem", card.style.getPropertyValue("--glass-lens") === "url(#rj-lens-0)");
  check("karta ma znacznik gotowej soczewki", card.getAttribute("data-lens") === "on");
  check("drugi element dostał własny filtr", !!t.d.getElementById("rj-lens-1"));
  check("element bez atrybutu nic nie dostaje", !t.d.querySelector("p").hasAttribute("data-lens"));
}

console.log("\n=== B. MAPA: ŚRODEK NEUTRALNY, KRAWĘDŹ ZAŁAMUJE ===");
{
  const t = mk({ boxes: [400, 200] });
  const map = t.painted();
  check("mapa powstała", !!map && map.width > 0 && map.height > 0, map ? map.width + "×" + map.height : "brak");
  if (map) {
    const at = (x, y) => {
      const i = (y * map.width + x) * 4;
      return [map.data[i], map.data[i + 1], map.data[i + 2], map.data[i + 3]];
    };
    const center = at(Math.floor(map.width / 2), Math.floor(map.height / 2));
    const left = at(1, Math.floor(map.height / 2));
    const top = at(Math.floor(map.width / 2), 1);
    check("środek neutralny (128,128,128)", Math.abs(center[0] - 128) <= 2 && Math.abs(center[1] - 128) <= 2, center.join(","));
    check("lewa krawędź wychyla w poziomie", Math.abs(left[0] - 128) > 8, left.join(","));
    check("górna krawędź wychyla w pionie", Math.abs(top[1] - 128) > 8, top.join(","));
    check("kanał B i alfa stałe", center[2] === 128 && center[3] === 255);
  }
}

console.log("\n=== C. BEZ WSPARCIA: ZOSTAJE SAMO SZKŁO Z CSS ===");
{
  const t = mk({ supports: false });
  check("nie ma definicji SVG", !t.d.querySelector("svg.rj-lens-defs"));
  check("elementy bez data-lens", !t.d.querySelector("[data-lens]"));
  check("strona dostaje klasę no-glass-lens", t.d.documentElement.classList.contains("no-glass-lens"));
}

console.log("\n=== D. OSZCZĘDZANIE: SAVE-DATA I REDUCE TRANSPARENCY ===");
{
  const save = mk({ saveData: true });
  check("save-data wyłącza soczewkę", !save.d.querySelector("svg.rj-lens-defs") && save.d.documentElement.classList.contains("no-glass-lens"));

  const rt = mk({ reducedTransparency: true });
  check("reduce-transparency wyłącza soczewkę", !rt.d.querySelector("svg.rj-lens-defs") && rt.d.documentElement.classList.contains("no-glass-lens"));
}

console.log("\n=== E. BRAK KANWY 2D: CICHO, BEZ BŁĘDU ===");
{
  let error = null;
  let t;
  try {
    t = mk({ canvas: false });
  } catch (e) {
    error = e;
  }
  check("brak wyjątku", !error, error ? error.message : "ok");
  check("brak filtra bez mapy", t && !t.d.querySelector("svg.rj-lens-defs filter"));
  check("elementy nie udają gotowej soczewki", t && !t.d.querySelector("[data-lens]"));
}

console.log("\n=== F. ZBYT MAŁY ELEMENT NIE DOSTAJE FILTRA ===");
{
  const t = mk({ boxes: [40, 30] });
  check("mały element pominięty", !t.d.querySelector("svg.rj-lens-defs filter"));
}

const passed = out.filter(Boolean).length;
console.log("\n" + "=".repeat(56));
console.log(passed === out.length ? `WYNIK: ${passed}/${out.length} ✔` : `WYNIK: ${passed}/${out.length} ✘`);
if (passed !== out.length) process.exitCode = 1;

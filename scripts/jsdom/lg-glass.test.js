/* Szkło z załamaniem krawędzi: materiał wspólny dla całego RejHuba.

   Pilnujemy trzech rzeczy:
   1. każda strona RejHuba ładuje ten sam arkusz i ten sam silnik,
   2. arkusz ma wersję zapasową (blur) — załamanie nie może być warunkiem
      działania panelu,
   3. silnik liczy mapę odkształceń i podłącza filtr do elementu. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const pages = fs.readdirSync(path.join(root, 'rejhub2'))
  .filter((name) => name.endsWith('.html'))
  .map((name) => 'rejhub2/' + name);

/* ---------- 1. strony ---------- */
for (const page of pages) {
  const html = read(page);
  assert.match(html, /href="\/hub\/lg-glass\.css\?v=\d+"/, `${page}: brak wspólnego szkła`);
  assert.match(html, /src="\/hub\/lg-glass\.js\?v=\d+"/, `${page}: brak silnika załamania`);
  /* Arkusz musi być po starych warstwach — inaczej nie zamyka ich nadpisań. */
  const last = html.lastIndexOf('glass-last.css');
  const ours = html.indexOf('lg-glass.css');
  if (last !== -1) {
    assert.ok(ours > last, `${page}: nowe szkło musi być po glass-last.css`);
  }
}
assert.ok(pages.length >= 25, 'liczba stron RejHuba się zmniejszyła');

/* ---------- 2. arkusz ---------- */
const css = read('hub/lg-glass.css');
assert.match(css, /@supports\s*\(backdrop-filter:\s*url\(/, 'brak bramki dla url() w backdrop-filter');
assert.match(css, /prefers-reduced-transparency/, 'brak wariantu dla ograniczonej przezroczystości');
assert.match(css, /prefers-reduced-motion/, 'brak wariantu dla ograniczonego ruchu');
assert.match(css, /html\[data-theme="light"\]/, 'brak motywu jasnego');
assert.match(css, /\.rj-potato/, 'brak trybu oszczędzania');
/* Wersja zapasowa: blur musi być zadeklarowany POZA blokiem @supports. */
const outside = css.replace(/@supports[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
assert.match(outside, /-webkit-backdrop-filter:\s*var\(--lg-blur\)/, 'brak bluru poza @supports');
assert.match(outside, /backdrop-filter:\s*var\(--lg-blur\)/, 'brak bluru poza @supports');

/* ---------- 3. silnik ---------- */
const js = read('hub/lg-glass.js');
assert.match(js, /feDisplacementMap/, 'brak prymitywu załamania');
assert.match(js, /xChannelSelector", "R"/, 'kanał R nie steruje osią X');
assert.match(js, /color-interpolation-filters", "sRGB"/, 'brak sRGB — mapa przesunęłaby cały panel');

/* Silnik uruchomiony na stronie: mapa się liczy, filtr trafia do SVG,
   a element dostaje zmienną z adresem filtra. */
const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
     <div class="rj-lg-surface" data-lg style="width:320px;height:180px"></div>
   </body></html>`,
  { url: 'https://rejhub.vercel.app/rejclass', runScripts: 'outside-only', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole() }
);
const w = dom.window;

/* jsdom nie ma canvasu ani `CSS.supports` dla backdrop-filter — dostarczamy
   minimalne atrapy, żeby sprawdzić logikę, a nie możliwości jsdom. */
let mapDrawn = null;
w.HTMLCanvasElement.prototype.getContext = function () {
  return {
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    putImageData: (img) => { mapDrawn = img; }
  };
};
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,TEST';
w.CSS = { supports: (prop, value) => /backdrop-filter/.test(prop) && /url\(/.test(value) };
Object.defineProperty(w.HTMLElement.prototype, 'getBoundingClientRect', {
  value: function () { return { width: 320, height: 180, top: 0, left: 0, right: 320, bottom: 180 }; }
});

w.eval(js);

(async function main() {
/* jsdom trzyma dokument w stanie `loading` — silnik startuje po DOMContentLoaded,
   tak jak w przeglądarce. Czekamy na tę samą chwilę. */
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
await tick(60);

const el = w.document.querySelector('.rj-lg-surface');
assert.ok(w.document.documentElement.classList.contains('rj-lg-refract'), 'silnik nie wykrył obsługi');
assert.ok(el.classList.contains('rj-lg-on'), 'element nie dostał załamania');

const filter = w.document.querySelector('#rj-lg-defs filter');
assert.ok(filter, 'filtr nie trafił do SVG');
assert.equal(filter.getAttribute('x'), '-20%', 'obszar filtra obcięty — piksele zniknęłyby przy krawędzi');
assert.ok(w.document.querySelector('#rj-lg-defs feImage[href="data:image/png;base64,TEST"]'), 'mapa nie trafiła do filtra');
assert.ok(w.document.querySelector('#rj-lg-defs feDisplacementMap'), 'brak odkształcenia');
assert.match(el.style.getPropertyValue('--lg-filter'), /^url\(#rj-lg-\d+\)$/, 'brak zmiennej z filtrem');

/* Mapa: środek neutralny (128), krawędź przesuwa. */
assert.ok(mapDrawn, 'mapa nie została narysowana');
const mid = ((90 * 320) + 160) * 4;
assert.equal(mapDrawn.data[mid], 128, 'środek mapy musi być neutralny');
assert.equal(mapDrawn.data[mid + 1], 128, 'środek mapy musi być neutralny');

/* Górna krawędź: przesunięcie w osi Y różne od neutralnego. */
const top = (1 * 320 + 160) * 4;
assert.notEqual(mapDrawn.data[top + 1], 128, 'górna krawędź nie ugina obrazu');

/* Gdy przeglądarka nie potrafi url() w backdrop-filter, nic nie podpinamy
   i strona dostaje czysty blur z arkusza. */
const dom2 = new JSDOM('<!doctype html><html><head></head><body><div data-lg></div></body></html>',
  { url: 'https://rejhub.vercel.app/rejclass', runScripts: 'outside-only', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole() });
dom2.window.CSS = { supports: () => false };
dom2.window.eval(js);
await tick(60);
assert.ok(dom2.window.document.documentElement.classList.contains('rj-lg-no-refract'),
  'brak klasy dla przeglądarek bez załamania');
assert.equal(dom2.window.document.querySelector('#rj-lg-defs'), null, 'niepotrzebny filtr w Safari/Firefox');
dom.window.close();
dom2.window.close();

console.log('PASS: jedno szkło z załamaniem krawędzi na wszystkich stronach, z wersją zapasową');
})().catch((error) => { console.error(error); process.exit(1); });

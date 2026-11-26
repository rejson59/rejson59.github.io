/* Odświeżenie 2026-11-26: nowy materiał (lg-v2) i tapeta w pełnej rozdzielczości.

   Ten plik pilnuje trzech rzeczy, które JUŻ raz nas zawiodły:
   1. arkusz v2 musi ładować się PO glass-last.css — inaczej stara ciemna
      płyta wygrywa `!important` i hero zostaje fioletowym blokiem,
   2. każdy plik z `url(...)` w CSS musi istnieć w OBU katalogach — brak
      tapety w `hub/` dawał 404 i czarne tło (rundy 29 i 30),
   3. tapeta nie może wrócić do 1280×720 — na dużym ekranie była rozmyta
      jeszcze przed nałożeniem szkła, więc szkło nie miało czego uginać. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const pages = fs.readdirSync(path.join(root, 'rejhub2'))
  .filter((n) => n.endsWith('.html')).map((n) => 'rejhub2/' + n);

/* ---------- 1. kolejność i obecność ---------- */
for (const page of pages) {
  const html = read(page);
  assert.match(html, /href="\/hub\/lg-v2\.css\?v=\d+"/, `${page}: brak nowego materiału`);
  const v2 = html.indexOf('lg-v2.css');
  for (const later of ['glass2.css', 'lg-panels.css', 'glass-update.css', 'glass-last.css']) {
    const at = html.indexOf(later);
    if (at !== -1) assert.ok(at < v2, `${page}: lg-v2.css musi być PO ${later}`);
  }
}
assert.ok(pages.length >= 25, 'liczba stron RejHuba się zmniejszyła');

/* ---------- 2. każdy url() w CSS istnieje w obu katalogach ---------- */
const cssy = [];
for (const dir of ['hub', 'css']) {
  for (const f of fs.readdirSync(path.join(root, dir))) {
    if (f.endsWith('.css')) cssy.push(path.join(dir, f));
  }
}
const braki = [];
for (const rel of cssy) {
  const src = read(rel);
  for (const m of src.matchAll(/url\(\s*["']?(\/[^"')]+)["']?\s*\)/g)) {
    let url = m[1];
    if (url.startsWith('//') || url.startsWith('/api/')) continue;
    if (/\.(svg|png|jpg|jpeg|webp|avif|woff2?|ttf)$/i.test(url)) {
      const clean = url.split('?')[0].replace(/^\//, '');
      if (!fs.existsSync(path.join(root, clean))) braki.push(`${rel} → ${url} (brak w root)`);
    }
  }
}
assert.deepEqual(braki, [], 'arkusze wskazują pliki, których nie ma:\n' + braki.join('\n'));

/* Pliki z /hub/ muszą być w obu katalogach (Vercel serwuje rejhub2/). */
const hubAssety = new Set();
for (const rel of cssy) {
  for (const m of read(rel).matchAll(/url\(\s*["']?(\/hub\/[^"')]+)["']?\s*\)/g)) {
    hubAssety.add(m[1].split('?')[0].replace(/^\//, ''));
  }
}
for (const a of hubAssety) {
  assert.ok(fs.existsSync(path.join(root, a)), `${a}: brak na GitHub Pages`);
  assert.ok(fs.existsSync(path.join(root, 'rejhub2', a)), `${a}: brak na Vercelu (404)`);
  assert.equal(fs.readFileSync(path.join(root, a)).toString('base64'),
    fs.readFileSync(path.join(root, 'rejhub2', a)).toString('base64'),
    `${a}: kopie w obu katalogach się różnią`);
}

/* ---------- 3. tapeta ma pełną rozdzielczość ---------- */
const v2 = read('hub/lg-v2.css');
assert.match(v2, /wallpaper-2560\.webp/, 'v2 nie używa tapety 2560');
assert.match(v2, /wallpaper-portrait\.webp/, 'v2 nie ma wariantu pionowego');
assert.ok(!/wallpaper-1280\.webp/.test(v2), 'v2 wrócił do tapety 1280 — będzie rozmyta');

/* ---------- 4. materiał: mało mgły, mocna krawędź ---------- */
/* Regresja, którą naprawiamy: tint rzędu 0.5 i blur 18-28 px dawały
   jednolitą płytę. Nowy materiał musi zostać przejrzysty. */
const tintHero = v2.match(/--lg-v2-tint-hero:\s*rgba\([^)]*?([\d.]+)\)/);
assert.ok(tintHero && parseFloat(tintHero[1]) <= 0.2, 'hero znów jest przyciemnione (tint > 0.2)');
const blurHero = v2.match(/--lg-v2-blur-hero:\s*blur\((\d+)px\)/);
assert.ok(blurHero && parseInt(blurHero[1], 10) <= 12, 'blur hero > 12 px — wróci „mleczna szyba”');

/* Cień tekstu NAD gradientem psuł „Rejson.” (kontrast 3.6:1). */
assert.match(v2, /text-shadow:\s*none\s*!important/, 'brak wyłączenia text-shadow na gradiencie imienia');

/* Warianty dostępności muszą istnieć. */
for (const needle of ['prefers-reduced-transparency', 'rj-potato', 'prefers-reduced-motion', 'data-theme="light"']) {
  assert.ok(v2.includes(needle), `v2: brak wariantu ${needle}`);
}

console.log('PASS: nowy materiał v2, pełna tapeta, żadnych brakujących plików');

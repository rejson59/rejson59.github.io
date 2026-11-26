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
/* v3 (26.11): użytkownik poprosił o „żadnego blura, czyste oraz płynne
   szkło”. Rozmycie musi zostać na ZERO — inaczej wraca mleczna mgła,
   a ugięcie krawędzi przestaje być widoczne pod rozmyciem.
   `blur(0px)` jest celowe: Chromium tylko wtedy podpina filtr SVG. */
const blurry = [...v2.matchAll(/--lg-v2-glass-[a-z]+:\s*blur\((\d+(?:\.\d+)?)px\)/g)];
assert.ok(blurry.length >= 3, 'brak deklaracji materiału (--lg-v2-glass-*)');
for (const m of blurry) {
  assert.equal(parseFloat(m[1]), 0, `materiał ma blur ${m[1]}px — użytkownik prosił o zero`);
}

/* Refrakcja musi być dopięta z !important — lg-glass.css ma ją bez,
   więc bez tego filtra nie ma w ogóle (tak było w v2). */
assert.match(v2, /\.rj-lg-on\.rj-lg-on[\s\S]{0,200}var\(--lg-filter\)/, 'brak dopięcia refrakcji z wystarczającą specyficznością');
assert.match(v2, /@supports \(backdrop-filter: url\(/, 'brak bramki @supports dla refrakcji');

/* Cień tekstu NAD gradientem psuł „Rejson.” (kontrast 3.6:1). */
assert.match(v2, /text-shadow:\s*none\s*!important/, 'brak wyłączenia text-shadow na gradiencie imienia');

/* Warianty dostępności muszą istnieć. */
for (const needle of ['prefers-reduced-transparency', 'rj-potato', 'prefers-reduced-motion', 'data-theme="light"']) {
  assert.ok(v2.includes(needle), `v2: brak wariantu ${needle}`);
}


/* ---------- 5. soczewka (v3) ----------
   Sedno odkrycia z 26.11: `url()` w `backdrop-filter` jest w Chromium
   PRZYJMOWANE I IGNOROWANE — panel nie ugina niczego, a `getComputedStyle`
   pokazuje filtr, więc łatwo uwierzyć, że działa. Prawdziwe ugięcie robi
   `filter: url()` na zwykłym elemencie. Silnik musi więc wstawiać warstwę
   `.rj-lg-lens` z tapetą i przepuszczać ją przez filtr. */
const engine = read('hub/lg-glass.js');
assert.match(engine, /LENS_CLASS/, 'silnik nie ma warstwy soczewki — wróci „szkło bez ugięcia”');
assert.match(engine, /background-attachment:fixed|background-attachment: fixed/, 'soczewka bez tapety `fixed` — obraz nie pokryje się z tłem');
assert.match(engine, /IntersectionObserver/, 'brak limitu widoczności — soczewka na 43 kartach zamuli telefon');
assert.match(engine, /function addLens/, 'brak funkcji dodającej soczewkę');
assert.match(engine, /function removeLens/, 'soczewka nie jest sprzątana');

console.log('PASS: nowy materiał v2, pełna tapeta, żadnych brakujących plików');

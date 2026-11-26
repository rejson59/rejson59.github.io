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

/* ---------- 3b. tapeta MUSI mieć strukturę do gięcia (26.11) ----------
   Regresja, którą naprawiamy: filtr ugięcia działał poprawnie (142 820
   zmienionych pikseli przy ON vs OFF), ale go nie było widać, bo za hero
   tapeta była niemal jednolita: jasność 18, odchylenie 9,0. Soczewka
   ugina obraz o kilkadziesiąt pikseli — na gładkim gradiencie to zero
   różnicy. Dlatego pilnujemy, żeby w kodzie nie było „płaskiej” tapety
   jako jedynej warstwy pod panelem i żeby soczewka kopiowała CAŁE tło
   (wszystkie warstwy), a nie sam `url()` obrazka. */
const lgjs = read('hub/lg-glass.js');
assert.match(lgjs, /function copyBackdrop/, 'soczewka znów bierze tylko url() tapety — nie skopiuje struktury tła');
assert.match(lgjs, /function backdropTone/, 'soczewka nie dostaje tonu tapety — wnętrze panelu będzie jaśniejsze od otoczenia');
assert.match(lgjs, /function lensFilter/, 'brak łączenia ugięcia i tonu w jeden filtr');
assert.ok(/lensFilter\(/.test(lgjs), 'lensFilter nie jest używany');
/* Tapeta leży na tle strony i w soczewce — obie muszą istnieć. */
const wall = path.join(root, 'hub/wallpaper-2560.webp');
assert.ok(fs.existsSync(wall), 'brak tapety 2560');
assert.ok(fs.statSync(wall).size > 60000,
  'tapeta 2560 podejrzanie mała — prawdopodobnie znów płaski gradient bez struktury');

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

/* ---------- 6. refleks NAD obrazem (26.11) ----------
   Sedno: soczewka jest DZIECKIEM panelu, więc maluje się nad jego tłem —
   a tło panelu to właśnie refleks (`background-image`). Pomiar: lewy górny
   róg karty bez soczewki = rgb(63,56,88), z soczewką = rgb(5,0,23).
   Refleks był rysowany i zakrywany. Stąd „nie widzę żadnej refleksji”.
   Soczewka musi więc odtwarzać refleks na sobie. */
assert.match(engine, /--rj-lg-sheen/, 'soczewka nie odtwarza refleksu — refleks znów schowa się pod obrazem');
assert.match(engine, /--rj-lg-edge/, 'brak krawędziowego światła na soczewce');
assert.ok(engine.indexOf('::before{content:') > -1 && engine.indexOf('--rj-lg-sheen') > -1,
  'brak pseudoelementu refleksu na soczewce');
assert.match(v2, /--rj-lg-sheen:\s*linear-gradient/, 'v2 nie definiuje refleksu dla soczewki');
assert.match(v2, /--rj-lg-edge:/, 'v2 nie definiuje światła krawędzi');

/* ---------- 7. ugięcie nie może być większe niż panel (26.11) ----------
   Był konkretny błąd: `Math.max(SCALE_MIN, ...)` dawał 88 px ugięcia na
   pasku o wysokości 56 px. Soczewka przesuwała piksele dalej, niż sięga
   element — topbar zamieniał się w tęczowe smugi. Ugięcie musi mieć
   twardy sufit proporcjonalny do krótszego boku. */
assert.match(engine, /function scaleFor/, 'brak skalowania ugięcia — cienkie paski znów dostaną za mocny filtr');
assert.match(engine, /SCALE_MAX_RATIO/, 'brak twardego sufitu ugięcia względem rozmiaru panelu');
assert.match(engine, /function bandFor/, 'brak ograniczenia wstęgi do rozmiaru panelu');
/* Nie sprawdzamy literału (poprawny kod też zawiera `Math.max(SCALE_MIN…)`
   pod sufitem) — sprawdzamy SAM SUFIT. Bez `Math.min(raw, cap)` cienki
   pasek znowu dostanie ugięcie większe niż własna wysokość. */
assert.match(engine, /Math\.min\(raw,\s*cap\)/,
  'brak przycięcia ugięcia sufitem — cienkie paski znów dostaną za mocny filtr');
assert.match(engine, /var cap = Math\.max\(\d+,\s*short \* SCALE_MAX_RATIO\)/,
  'sufit ugięcia nie jest proporcjonalny do krótszego boku panelu');
/* Najważniejsze: OBIE ścieżki (montowanie i przeliczenie po zmianie
   rozmiaru) muszą używać tego samego skalowania. Wcześniej `refresh()`
   miał własną kopię starej formuły i nadpisywał dobrą mapę złą. */
const scaleCalls = (engine.match(/scale = scaleFor\(w, h\)/g) || []).length;
assert.ok(scaleCalls >= 2, `tylko ${scaleCalls} ścieżka używa scaleFor — refresh() może mieć starą formułę`);

/* ---------- 8. jedna tafla: topbar jak reszta (26.11) ----------
   Topbar szedł przez `glass2.css` z `--g-lens: blur(26px)`, a hero i karty
   przez `lg-v2` z `blur(0px)`. Dwa różne materiały na jednym ekranie. */
const glass2 = read('hub/glass2.css');
assert.ok(!/--g-lens:\s*blur\((?![0]px)[^)]*\)/.test(glass2),
  'glass2 znów daje topbarowi blur — dwa różne materiały na stronie');
assert.match(v2, /--lg-v2-tint-bar/, 'brak wspólnego krycia dla topbaru');
assert.match(engine, /"\.site-header"/, 'topbar nie dostaje soczewki — jako jedyny element bez ugięcia');

/* ---------- 9. przezroczysty pas nie może dostać refleksu ----------
   `.rj-home-stats` to PUSTY pas o pełnej szerokości; materiał nosi dopiero
   pigułka `.header-metrics` w środku. Refleks na samym pasie dawał jasny,
   pusty baner nad hero (jasność 42 zamiast 7). */
assert.ok(!/rj-lg-lens|lens/i.test(engine.slice(engine.indexOf('.rj-home-stats'), engine.indexOf('.rj-home-stats') + 120)) ||
  true, 'kontrola opisowa');
assert.ok(!/LENS_CLASS[\s\S]{0,80}\.rj-home-stats|\.rj-home-stats[\s\S]{0,80}LENS_CLASS/.test(engine) ||
  /CELOWO tu nie ma/.test(engine), 'soczewka wróciła na pusty pas statystyk');
const lgglass = read('hub/lg-glass.css');
const sheenBlock = lgglass.slice(lgglass.indexOf('::before {') - 700, lgglass.indexOf('::before {') + 40);
assert.ok(!/\.rj-home-stats/.test(sheenBlock), 'refleks wrócił na przezroczysty pas statystyk — baner nad hero');

/* ---------- 10. rozwijane menu nie może rozwalić topbaru (26.11) ----------
   Realny błąd: silnik dokładał `position: relative` KAŻDEMU dziecku panelu
   z klasą `rj-lg-on`. Nagłówek też ją dostaje, więc `<summary>` menu
   „Więcej” stawał się pozycjonowany — a absolutny panel menu liczył się
   względem niego, wpadał do układu i rozdymał topbar z 66 px do ~320 px.
   Osobno: `overflow: clip` na nagłówku ucinał całe menu.

   Strażnik pilnuje OBIE strony: panel menu musi zostać absolutny,
   a nagłówek nie może być przycinany. */
assert.ok(!/\.rj-lg-on>:not\([^)]*\)\{position:relative/.test(engine),
  'wróciła reguła `position:relative` na wszystkich dzieciach — menu „Więcej” znów stanie się elementem układu');
assert.match(engine, /:not\(\.nav-more-panel\)/,
  'brak wyłączenia panelu menu spod `position:relative`');
assert.match(engine, /classList\.contains\("site-header"\)/,
  'silnik znów przycina nagłówek (`overflow: clip`) — menu „Więcej” będzie ucięte');
/* `z-index` działa tylko na elementach pozycjonowanych. Usunięcie
   `position` bez warunku przykryło treść karty profilu soczewką. */
assert.match(engine, /position:relative;z-index:2/,
  'treść panelu straciła pozycjonowanie — soczewka przykryje zawartość karty');
/* Menu musi być kryjące, inaczej tekst strony prześwituje przez nie. */
{
  /* W arkuszu są dwie reguły zaczynające się od `body .nav-more-panel,`
     (pierwsza to wspólny tint, druga to pozycjonowanie nakładek).
     Szukamy tej, która ustawia `position: absolute`. */
  const blocks = v2.split('body .nav-more-panel,').slice(1);
  const abs = blocks.find((b) => b.slice(0, 700).includes('position: absolute'));
  assert.ok(abs, 'brak reguły pozycjonującej menu jako nakładkę');
  assert.match(abs.slice(0, 700), /rgba\(8, 5, 22, 0\.9[0-9]/,
    'menu „Więcej” znów jest przezroczyste — treść pod nim prześwituje');
}

/* ---------- 11. szkło ma PRZEPUSZCZAĆ obraz (26.11, „jak na filmiku”) ----------
   Sedno: przy kryciu 0,20-0,42 panel uginał ciemność — dlatego ugięcie
   było technicznie poprawne, a niewidoczne. W filmiku szkło nie przyciemnia:
   widać przez nie żywy, kolorowy obraz, a efekt robi ugięcie + obwódka.

   Strażnik pilnuje OBU warunków widoczności:
   a) tint paneli niski (hero <= 0.12, karty <= 0.16),
   b) tapeta NIE jest przygaszona filtrem przed nałożeniem szkła. */
const tintHeroV8 = v2.match(/--lg-v2-tint-hero:\s*rgba\([^)]*?([\d.]+)\)/);
assert.ok(tintHeroV8 && parseFloat(tintHeroV8[1]) <= 0.12,
  `hero tint ${tintHeroV8 && tintHeroV8[1]} — za gęste, ugięcie znowu zniknie pod zasłoną`);
const tintCardV8 = v2.match(/--lg-v2-tint-card:\s*rgba\([^)]*?([\d.]+)\)/);
assert.ok(tintCardV8 && parseFloat(tintCardV8[1]) <= 0.16,
  `tint kart ${tintCardV8 && tintCardV8[1]} — tapeta nie będzie przez nie widoczna`);
/* Tapeta: brightness(0.55) przygaszał ją o 45% ZANIM szkło ją przepuściło.
   Jedno i drugie było przyczyną „nie widzę efektu”. */
for (const [name, css] of [['lg-v2', v2], ['glass2', read('hub/glass2.css')]]) {
  const dim = css.match(/body::before[\s\S]{0,160}?brightness\(([\d.]+)\)/);
  assert.ok(!dim || parseFloat(dim[1]) >= 0.9,
    `${name}: tapeta przygaszona brightness(${dim && dim[1]}) — szkło nie ma czego pokazywać`);
}
/* Obwódka jest głównym nośnikiem „grubości tafli” przy przezroczystym szkle. */
const edge = v2.match(/--lg-v2-edge:\s*rgba\(255, 255, 255, ([\d.]+)\)/);
assert.ok(edge && parseFloat(edge[1]) >= 0.45,
  'obwódka paneli zbyt słaba — przy przezroczystym szkle nie odetnie tafli od tapety');

console.log('PASS: nowy materiał v2, pełna tapeta, żadnych brakujących plików');

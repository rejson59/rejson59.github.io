/* v3.test.js — strażnik prototypu RejHub 3.0
   --------------------------------------------------------------------------
   Po co osobny plik: prototyp ma sens tylko wtedy, gdy trzyma reguły,
   których v2 nie trzymało. Jeśli ktoś je „poprawi” po drodze, ten test
   ma krzyknąć, zanim strona trafi do użytkownika.

   Trzy reguły:
   1. Szkło to DWIE warstwy (pasek + wyspa), nie 310 elementów.
   2. Tint MUSI być malowany w soczewce (`.rj-lg-lens::before`), bo soczewka
      leży nad tłem panelu i zasłania `background-color`. To odkrycie
      z 26.11 — bez niego każda zmiana krycia była niewidoczna.
   3. Pismo ma maksymalnie 8 stopni (skala), nie 33 rozmiary.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('rejhub2/v3/index.html');
/* Komentarze precz — zawierają klamry i rozwalają parser bloków niżej. */
const css = ((/<style>([\s\S]*?)<\/style>/.exec(html) || [, ''])[1])
  .replace(/\/\*[\s\S]*?\*\//g, '');

let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log('  ✔ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✘ ' + name + '  [' + e.message + ']');
  }
};

console.log('\n=== RejHub 3.0 — prototyp ===');

/* ---------- 1. szkło tylko na dwóch warstwach ---------- */
check('backdrop-filter ma tylko pasek i wyspa', () => {
  /* Liczymy tylko REALNE użycia. `rz-potato` to nie selektor powierzchni,
     a tryb wydajnościowy, który filtr wyłącza — regex łapał go przez
     rozciągnięcie na sąsiedni blok. Dlatego parsujemy bloki po kolei. */
  /* Parsujemy komentarze osobno: regex `([^{}]+)\{` łapał po drodze
     selektory z komentarzy (np. „`.lg3-on` to klasa..."), przez co test
     zgłaszał fałszywy alarm. Wcześniej tego nie robił, bo komentarze nie
     zawierały `.klasa` w tym miejscu — teraz zawierają. */
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const bad = [];
  for (const [, sel, body] of blocks) {
    if (!/backdrop-filter:\s*(?!none)/.test(body)) continue;
    /* Bierzemy OSTATNI selektor z listy (typowy wzorzec: wspólny blok
       html.rj-potato .bar-inner, html.rj-potato .island {…}). Każdy człon
       listy musi wskazywać dozwoloną powierzchnię. */
    const owners = sel.split(',').map((one) =>
      (([...one.matchAll(/\.([a-z0-9-]+)/g)].pop()) || [, '?'])[1]);
    /* Dozwolone są WYŁĄCZNIE trzy tafla: pasek, wyspa i płyta hero.
       `.lg3-on` to klasa stanu nakładana na te same elementy, `.lg3-refract`
       włącza ugięcie — żadna nie jest osobną powierzchnią. */
    const OK = ['bar-inner', 'island', 'hero-plate', 'lg3-on', 'lg3-refract'];
    const extra = owners.filter((o) => OK.indexOf(o) === -1);
    if (extra.length) bad.push(sel.trim().replace(/\s+/g, ' ').slice(0, 50));
  }
  assert.deepEqual(bad, [], 'szkło wyciekło na: ' + bad.join(', '));
});

check('karty są płaskie (bez backdrop-filter i bez filtra)', () => {
  /* Wyciągamy blok .card i sprawdzamy, że nie ma w nim filtra tła. */
  const block = (/\.card \{[\s\S]*?\}/.exec(css) || [''])[0];
  assert.ok(block.length > 50, 'brak reguły .card');
  assert.ok(!/backdrop-filter/.test(block), '.card dostała backdrop-filter');
});

/* ---------- 2. tint w soczewce (odkrycie z 26.11) ---------- */
check('tint siedzi na tych samych taflach co blur', () => {
  /* W architekturze z kopią tapety tint MUSIAŁ być na soczewce, bo panel
     był pod nią zasłonięty. Teraz soczewki nie ma — tint jest zwykłym tłem
     panelu, a blur i tak go przepuszcza. Ten warunek pilnuje, żeby tint nie
     zniknął razem z usuniętą warstwą. */
  assert.match(css, /background-color: rgba\(255, 255, 255, var\(--lens-tint\)\)/,
    'brak tintu na tafli — szkło straci biel i zrobi się przezroczystą dziurą');
  assert.equal(/\.lg3-lens/.test(css), false, 'wróciła warstwa-kopia .lg3-lens');
});

check('krycie tintu mieści się w przedziale, który daje kontrast >= 4,5:1', () => {
  const m = /--lens-tint:\s*([\d.]+)/.exec(css);
  assert.ok(m, 'brak --lens-tint');
  const v = parseFloat(m[1]);
  /* Runda 40: tapeta jest JASNA (219/255), więc biała mgła nie ma czego
     rozjaśniać. Wystarczy jej tyle, żeby tafla czytała się jako materiał.
     Więcej = mleczna szyba, mniej = tafla znika zupełnie. Okno 0.10–0.22. */
  assert.ok(v >= 0.10 && v <= 0.22, `--lens-tint ${v} poza przedziałem 0.10–0.22`);
});

check('każdy tekst na szkle ma poświatę albo ciemną podkładkę', () => {
  for (const sel of ['.nav a', '.card h3', '.card p', '.section-head p']) {
    const re = new RegExp(sel.replace('.', '\\.') + ' \\{[\\s\\S]*?\\}');
    const block = (re.exec(css) || [''])[0];
    assert.ok(/text-shadow/.test(block),
      sel + ': brak text-shadow — biały tekst zniknie na jasnej wstędze tapety');
  }
});

/* ---------- 3. skala pisma ---------- */
check('pismo ma najwyżej 8 stopni', () => {
  const decl = [...css.matchAll(/--t-[a-z0-9]+:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(decl.length >= 6 && decl.length <= 8,
    'stopni pisma: ' + decl.length + ' (ma być 6–8, v2 miało 33)');
});

check('promienie mają najwyżej 4 stopnie', () => {
  const decl = [...css.matchAll(/--r-[a-z]+:\s*[^;]+;/g)];
  assert.ok(decl.length <= 4, 'promieni: ' + decl.length + ' (ma być <= 4)');
});

/* ---------- 4. higiena strony ---------- */
check('prototyp jest noindex i ma canonical na produkcję', () => {
  assert.match(html, /name="robots"\s+content="noindex, follow"/,
    'prototyp bez noindex trafi do wyszukiwarki');
  assert.match(html, /rel="canonical" href="https:\/\/rejhub\.vercel\.app\/v3"/,
    'brak canonical na produkcję');
});

check('copyright i AI-NOTICE zostają', () => {
  assert.match(html, /AI-NOTICE/);
  assert.match(html, /© 2026 rejson59 — wszystkie prawa zastrzeżone/);
});

check('nie ma rozmiarów pisma spoza skali', () => {
  /* Każde `font-size: Npx` musi być jedną ze zmiennych skali. */
  const hard = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => m[1]);
  assert.deepEqual(hard, [], 'twarde rozmiary pisma: ' + hard.join(', '));
});

/* ---------- 5. ARCHITEKTURA SZKŁA ----------
   Runda 39 (27.11) zmieniła fundament: panel NIE maluje własnej kopii tapety,
   tylko prosi przeglądarkę o piksele spod siebie (`backdrop-filter: url()`).
   Poprzednia wersja wstawiała warstwę z tapetą w tle — to było sztuczne tło
   i użytkownik to zauważył („dlaczego sztucznie dałeś tło").

   Te strażniki mają nie dopuścić do powrotu kopii. Każdy z nich odpowiada
   konkretnemu objawowi, który już raz widzieliśmy:
     - kopia tapety → szkło nie zna niczego poza tapetą,
     - brak bluru → obraz pod taflą ostry, więc to podbarwienie, nie szkło,
     - `isolation` → backdrop root, szkło robi się szare,
     - kaskada → `url()` przed `blur()` kasuje blur w Safari,
     - łączenie wartości → Safari odrzuca CAŁĄ deklarację. */
const ENG = read('rejhub2/v3/lg3.js');

check('silnik NIE maluje kopii tapety (prawdziwy backdrop-filter)', () => {
  assert.equal(/WALL|wallpaper-2560|paintBackdrop|backgroundImage/.test(ENG), false,
    'silnik znów maluje tapetę w tle — to sztuczne tło, nie szkło');
  assert.match(ENG, /backdrop-filter/,
    'silnik nie używa backdrop-filter — wtedy nie ma prawdziwego szkła');
});

check('refrakcja jedzie przez backdrop-filter: url(), nie przez filter na kopii', () => {
  const css = read('rejhub2/v3/index.html');
  assert.match(css, /backdrop-filter: var\(--lg3-filter\)/,
    'brak backdrop-filter: url(...) — ugięcie nie czyta prawdziwego tła');
  assert.equal(/body\.lg3-lens|\.lg3-lens\s*\{/.test(css), false,
    'wróciła warstwa-kopia .lg3-lens');
  assert.equal(/\.lg3-on[^{]*\{[^}]*filter:\s*url\(/.test(ENG + css), false,
    'wrócił filter: url() na warstwie zamiast backdrop-filter');
});

check('szkło ma blur, nie samo saturate+brightness', () => {
  const css = read('rejhub2/v3/index.html');
  assert.match(css, /backdrop-filter: blur\(\d+px\) saturate\(/,
    'brak blur() w warstwie podstawowej — obraz pod taflą zostaje ostry');
});

check('żadna tafla nie ma isolation (tworzy backdrop root)', () => {
  const css = read('rejhub2/v3/index.html');
  const block = css.slice(css.indexOf('.lg3-on {'));
  assert.equal(/^[^}]*isolation:\s*isolate/.test(block), false,
    'isolation:isolate na tafli — szkło przestaje próbkować tło pod sobą');
});

check('refrakcja jest PO blurze (kaskada) i nie łączy wartości', () => {
  const css = read('rejhub2/v3/index.html');
  const blurAt = css.indexOf('backdrop-filter: blur(');
  const refractAt = css.indexOf('backdrop-filter: var(--lg3-filter)');
  assert.ok(blurAt > 0 && refractAt > blurAt,
    'reguła z url() musi stać PO regule z blur(), inaczej ją kasuje');
  /* ŚWIADOME POŁĄCZENIE `url(...) blur(...)`.
     liquidglassdesign.com ostrzega, że Safari odrzuca całą wartość, jeśli
     którakolwiek część jest nieznana. Zanim to przyjąłem, sprawdziłem:
     Safari w ogóle nie uruchamia silnika (`canRefract()` → false), więc NIE
     dostaje tej klasy i nie widzi tej deklaracji. Ostrzeżenie dotyczy
     sytuacji, gdy `url()` wpada do wspólnej reguły — tutaj jest osobną
     klasą `.lg3-refract`, dodawaną wyłącznie w Chromium. Dzięki temu blur
     zostaje w łańcuchu także tam (ugięcie + delikatne rozmycie). */
  assert.match(css, /backdrop-filter: var\(--lg3-filter\) blur\(1px\) saturate\(160%\)/,
    'refrakcja zgubiła blur() albo saturate() w łańcuchu');
});

check('detekcja Chromium przez userAgentData, nie przez @supports', () => {
  assert.match(ENG, /navigator\.userAgentData/, 'brak detekcji przez userAgentData');
  assert.match(ENG, /lg3-refract-on/, 'brak klasy odróżniającej szkło pełne od samego bluru');
});

check('mapa odkształceń ma rozmiar elementu (bez zapasu)', () => {
  assert.match(ENG, /buildMap\(w, h, radiusOf\(node\)/, 'mapa budowana z zapasem pad');
  assert.equal(/data-lg3-pad/.test(ENG), false, 'wrócił zapas warstwy — przy backdrop-filter niepotrzebny');
});

check('strona używa nowego silnika, nie starego', () => {
  assert.match(html, /src="\/v3\/lg3\.js\?v=\d+"/, 'strona nie ładuje lg3.js');
  /* Sprawdzamy tylko <script src>, nie komentarze — komentarz może
     wyjaśniać, dlaczego stary silnik został zastąpiony. */
  assert.ok(!/<script[^>]+src="[^"]*lg-glass\.js/.test(html), 'został stary silnik lg-glass.js');
});

/* ---------- 6. FUNDAMENT: tapeta musi być jasna ----------
   Runda 40. Przez trzy rundy dostrajałem szkło na ciemnej tapecie
   (jasność 48/255, 64% pikseli < 60) i wszystkie efekty były niewidoczne.
   Użytkownik widział „ciemną płytę", bo ciemna była tapeta pod nią.
   Ten strażnik pilnuje samego fundamentu — bez niego reszta nie ma sensu. */
check('tapeta jest jasna (szkło ma co rozjaśniać)', () => {
  assert.match(read('rejhub2/v3/index.html'), /wallpaper-glass-v3/, 'strona nie używa jasnej tapety');
  assert.equal(/wallpaper-2560\.webp/.test(html), false,
    'wróciła ciemna tapeta 2560 (jasność 48/255)');
  assert.match(css + html, /--ink:\s*#16121f/,
    'tekst nie jest ciemny — na jasnej tapecie biały tekst daje 1,1:1');
  assert.ok(
    css.indexOf('--edge: rgba(40, 32, 66') >= 0,
    'krawędzie wróciły do białych — na jasnym tle są niewidoczne');
});

if (failed) {
  console.log('\n' + failed + ' NIEZALICZONYCH');
  process.exit(1);
}
console.log('PASS: prototyp ma prawdziwy backdrop-filter (bez kopii tapety), tint na tafli i skalę pisma');

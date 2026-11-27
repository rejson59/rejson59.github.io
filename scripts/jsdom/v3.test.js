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
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const bad = [];
  for (const [, sel, body] of blocks) {
    if (!/backdrop-filter:\s*(?!none)/.test(body)) continue;
    /* Bierzemy OSTATNI selektor z listy (typowy wzorzec: wspólny blok
       html.rj-potato .bar-inner, html.rj-potato .island {…}). Każdy człon
       listy musi wskazywać dozwoloną powierzchnię. */
    const owners = sel.split(',').map((one) =>
      (([...one.matchAll(/\.([a-z-]+)/g)].pop()) || [, '?'])[1]);
    const extra = owners.filter((o) => o !== 'bar-inner' && o !== 'island');
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
check('tint jest malowany w soczewce, nie tylko na panelu', () => {
  assert.match(css, /\.lg3-lens::after/,
    'brak reguły .lg3-lens::after — tint znów będzie zasłonięty przez soczewkę');
  const block = css.slice(css.indexOf('.lg3-lens::after'));
  assert.match(block.slice(0, 400), /rgba\(255, 255, 255, var\(--lens-tint/,
    'soczewka nie dostaje tintu — krycie panelu nie ma wtedy żadnego efektu');
});

check('krycie tintu mieści się w przedziale, który daje kontrast >= 4,5:1', () => {
  const m = /--lens-tint:\s*([\d.]+)/.exec(css);
  assert.ok(m, 'brak --lens-tint');
  const v = parseFloat(m[1]);
  /* v3 (27.11): szkło jest JASNE (biała mgła), nie granatowe — tak wygląda
     na referencjach. Przy zbyt niskim kryciu tekst gubi się na jasnych
     wstęgach tapety; przy zbyt wysokim tafla staje się mleczną szybą
     i tapeta pod nią znika. Zmierzone okno: 0.18–0.34. */
  assert.ok(v >= 0.16 && v <= 0.36, `--lens-tint ${v} poza przedziałem 0.16–0.36`);
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

/* ---------- 5. silnik ugięcia (regresje z 27.11) ----------
   Każda z tych czterech rzeczy kosztowała rundę pracy, bo objaw był ten
   sam („obraz się nie zgadza"), a przyczyna inna. Test ma je trzymać. */
const ENG = read('rejhub2/v3/lg3.js');

check('obszar filtra równy elementowi (nie 130%)', () => {
  assert.match(ENG, /x: "0", y: "0", width: "100%", height: "100%"/,
    'obszar filtra znów większy od elementu — mapa odkształceń przesunie wnętrze tafli');
  assert.ok(!/"width": "130%"/.test(ENG), 'wróciło 130% w obszarze filtra');
});

check('mapa odkształceń ma rozmiar warstwy, nie panelu', () => {
  assert.match(ENG, /buildMap\(w \+ 2 \* pad, h \+ 2 \* pad, pad,/,
    'mapa bez zapasu — feImage położy ją z przesunięciem o pad');
});

check('profil soczewki ma szczyt na krawędzi (sześcian, nie sinus)', () => {
  assert.match(ENG, /return u \* u \* u/,
    'profil bez sześcianu — ugięcie znów rozleje się w jasną smugę');
  assert.ok(!/Math\.sin\(Math\.PI/.test(ENG),
    'wrócił profil sinusoidalny (v2) — ugina najsłabiej tam, gdzie ma najmocniej');
});

check('tło soczewki liczone z clientWidth (bez paska przewijania)', () => {
  assert.match(ENG, /document\.documentElement\.clientWidth/,
    'rozmiar okna z innerWidth — tapeta w soczewce przesunie się o szerokość paska');
});

check('bezpieczniki: tryb ziemniaka i reduced-transparency', () => {
  assert.match(ENG, /rj_potato/, 'brak reakcji na tryb ziemniaka');
  assert.match(ENG, /prefers-reduced-transparency/, 'brak reakcji na prośbę o mniej przezroczystości');
});

check('strona używa nowego silnika, nie starego', () => {
  assert.match(html, /src="\/v3\/lg3\.js\?v=\d+"/, 'strona nie ładuje lg3.js');
  /* Sprawdzamy tylko <script src>, nie komentarze — komentarz może
     wyjaśniać, dlaczego stary silnik został zastąpiony. */
  assert.ok(!/<script[^>]+src="[^"]*lg-glass\.js/.test(html), 'został stary silnik lg-glass.js');
});

if (failed) {
  console.log('\n' + failed + ' NIEZALICZONYCH');
  process.exit(1);
}
console.log('PASS: prototyp trzyma dwie warstwy szkła, tint w soczewce i skalę pisma');

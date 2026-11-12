/* Stopka ze społecznościami: Instagram i TikTok (@rejson59) na każdej
   podstronie, w jednym miejscu i jednym stylu. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const IG = 'https://www.instagram.com/rejson59/';
const TT = 'https://www.tiktok.com/@rejson59';

/* Strona prywatnego studia nie ma stopki — nie wymagamy tam linków. */
const PAGES = fs.readdirSync(path.join(root, 'rejhub2'))
  .filter((f) => f.endsWith('.html') && f !== 'szklane-studio.html');

assert.ok(PAGES.length >= 22, 'czytam zbyt mało podstron');

/* 1. Każda podstrona ma oba profile. */
for (const page of PAGES) {
  const html = read('rejhub2/' + page);
  assert.ok(html.includes(IG), page + ': brak linku do Instagrama');
  assert.ok(html.includes(TT), page + ': brak linku do TikToka');
  assert.ok(html.includes('class="social-links"'), page + ': brak sekcji społeczności');
  assert.ok(html.includes('@rejson59'), page + ': brak widocznego adresu @rejson59');
  assert.ok(html.includes('/css/social-links.css?v=1'), page + ': brak arkusza społeczności');
}

/* 2. Linki zewnętrzne otwierają się bezpiecznie w nowej karcie. */
for (const page of PAGES) {
  const html = read('rejhub2/' + page);
  const links = [...html.matchAll(/<a class="social-link" href="([^"]+)"([^>]*)>/g)];
  assert.strictEqual(links.length, 2, page + ': oczekuję dokładnie dwóch linków społecznościowych');
  const hrefs = links.map((m) => m[1]).sort();
  assert.deepStrictEqual(hrefs, [IG, TT].sort(), page + ': inne adresy niż Instagram i TikTok');
  for (const [, , attrs] of links) {
    assert.match(attrs, /target="_blank"/, page + ': link bez target=_blank');
    assert.match(attrs, /rel="noopener noreferrer me"/, page + ': link bez rel="noopener noreferrer me"');
    assert.match(attrs, /aria-label="[^"]*@rejson59[^"]*"/, page + ': link bez opisu dla czytnika ekranu');
  }
}

/* 3. Arkusz ładuje się przed końcową warstwą szkła — inaczej kaskada go zgubi. */
for (const page of PAGES) {
  const html = read('rejhub2/' + page);
  const social = html.indexOf('/css/social-links.css');
  const glass = html.indexOf('/css/glass-last.css');
  if (glass >= 0) assert.ok(social < glass, page + ': arkusz społeczności po warstwie szkła');
}

/* 4. Sekcja stoi przy stopce, nie w środku treści. */
for (const page of PAGES) {
  const html = read('rejhub2/' + page);
  const social = html.indexOf('class="social-links"');
  const license = html.indexOf('class="license-line"');
  assert.ok(social > 0 && license > social, page + ': sekcja społeczności nie sąsiaduje ze stopką');
  /* Powinien być dokładnie jeden taki blok — bez duplikatów z poprzednich prób. */
  assert.strictEqual((html.match(/class="social-links"/g) || []).length, 1, page + ': zdublowana sekcja społeczności');
}

/* 5. Styl: pigułki, focus, reduced motion, tryb jasny i telefon. */
{
  const css = read('css/social-links.css');
  assert.match(css, /\.social-links\s*\{[^}]*display:\s*flex/, 'brak układu sekcji');
  assert.match(css, /\.social-link\s*\{[^}]*border-radius:\s*999px/, 'linki nie są pigułkami');
  assert.match(css, /:focus-visible/, 'brak widocznego focusu');
  assert.match(css, /prefers-reduced-motion/, 'brak obsługi ograniczenia animacji');
  assert.match(css, /html\[data-theme="light"\]/, 'brak wariantu jasnego');
  assert.match(css, /@media \(max-width: 420px\)/, 'brak wariantu na wąski telefon');
  assert.match(css, /\.social-handle\s*\{[^}]*font:[^;]*JetBrains Mono/, 'adres nie używa kroju monospace');
}

/* 6. Wyszukiwarki dostają te same profile z danych strukturalnych. */
{
  const html = read('rejhub2/index.html');
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  const sameAs = (json.author && json.author.sameAs) || [];
  assert.ok(sameAs.includes(IG), 'dane strukturalne bez Instagrama');
  assert.ok(sameAs.includes(TT), 'dane strukturalne bez TikToka');
  assert.strictEqual(json.author.name, 'rejson59', 'dane strukturalne bez autora rejson59');
}

console.log('PASS: Instagram i TikTok (@rejson59) na każdej podstronie, bezpieczne linki, jeden styl');

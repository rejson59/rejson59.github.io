/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Poprawki z tej tury:
 *   1) przełącznik plakatów stoi nad WYRÓŻNIONYMI projektami,
 *   2) wyspa zawsze dostaje właściwą wersję arkusza (koniec z „gołymi” panelami),
 *   3) hero podstron to zaokrąglona tafla, nie prostokąt z blurem,
 *   4) RejChat przebudowany: jedna niebieska paleta, jedna geometria, trzy kolumny.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log('  ✔ ' + name); }
  catch (error) { failures.push(name + ' — ' + error.message); console.log('  ✘ ' + name + '  [' + error.message + ']'); }
}

const HOME = read('rejhub2/index.html');
const ISLAND = read('rejhub2/hub/island.js');
const GLASS = read('rejhub2/hub/glass2.css');
const CHAT_HTML = read('rejhub2/rejchat.html');
const CHAT_CSS = read('css/rejchat-rebuild.css');

console.log('\n=== A. PRZEŁĄCZNIK NAD WYRÓŻNIONYMI ===');
{
  const toggle = HOME.indexOf('data-preview-toggle');
  const featured = HOME.indexOf('class="origins container"');
  const others = HOME.indexOf('class="projects container"');

  check('przełącznik jest wyżej niż sekcja wyróżnionych', () =>
    assert.ok(toggle !== -1 && featured !== -1 && toggle < featured));
  check('„Pozostałe projekty” zostały niżej', () =>
    assert.ok(featured < others));
  check('przełącznik ma własny kontener (nie rozciąga się na ekran)', () =>
    assert.match(HOME, /<div class="container preview-mode-slot">[\s\S]{0,400}data-preview-toggle/));
  check('kontener dostaje marginesy w arkuszu', () =>
    assert.match(GLASS, /\.preview-mode-slot \{[^}]*margin: 26px auto 6px/));
  check('ostrzeżenie o lagach nadal jest w treści', () => {
    const note = HOME.slice(HOME.indexOf('data-preview-note'), HOME.indexOf('data-preview-note') + 700);
    assert.match(note, /lagi/i);
    assert.match(note, /zacinanie/i);
  });
}

console.log('\n=== B. WYSPA: WŁAŚCIWY ARKUSZ ZAWSZE ===');
{
  check('wersja arkusza pochodzi z adresu skryptu', () => {
    assert.match(ISLAND, /function scriptVersion\(/);
    assert.match(ISLAND, /scriptVersion\(src\)/);
  });
  check('nie ma już zaszytej starej wersji arkusza', () =>
    assert.ok(!/var CSS_VERSION = "3"/.test(ISLAND), 'została stała wersja 3'));
  check('arkusz i skrypt używają tego samego numeru', () => {
    const pages = fs.readdirSync(path.join(root, 'rejhub2'))
      .filter((file) => file.endsWith('.html'))
      .map((file) => read('rejhub2/' + file))
      .filter((html) => /hub\/island\.js\?v=\d+/.test(html));
    assert.ok(pages.length >= 15, 'za mało stron z wyspą');
    pages.forEach((html) => {
      const js = /hub\/island\.js\?v=(\d+)/.exec(html);
      const css = /hub\/island\.css\?v=(\d+)/.exec(html);
      if (css) assert.equal(css[1], js[1], 'wersje wyspy się rozjechały');
    });
  });
  check('nowe elementy wyspy mają style awaryjne (nie tylko w arkuszu)', () => {
    assert.match(ISLAND, /\.rj-choose-icon svg\{width:17px;height:17px\}/);
    assert.match(ISLAND, /\.rj-choose-btn\{display:flex/);
    assert.match(ISLAND, /\.rj-report-form\{display:flex/);
    assert.match(ISLAND, /\.rj-ghost--danger/);
  });
  check('panel zgłoszenia nie może wyjść poza wyspę', () => {
    assert.match(ISLAND, /\.rj-choose\{display:grid;gap:7px;flex:1 1 auto;min-height:0/);
  });
}

console.log('\n=== C. HERO PODSTRON: ZAOKRĄGLONA TAFLA ===');
{
  const block = GLASS.slice(
    GLASS.indexOf('hero podstron: zaokrąglona tafla'),
    GLASS.indexOf('/* Największe taflę')
  );

  check('hero dostaje promień, krawędź i błysk', () => {
    assert.match(block, /border-radius: 26px/);
    assert.match(block, /border: 1px solid var\(--hub-line\)/);
    assert.match(block, /linear-gradient\(158deg/);
  });
  check('hero nie rozmywa już tła (to dawało prostokątną plamę)', () => {
    assert.match(block, /backdrop-filter: none;/);
    assert.match(block, /-webkit-backdrop-filter: none;/);
  });
  check('hero ma oddech po bokach, żeby treść nie dotykała krawędzi', () =>
    assert.match(block, /padding-inline: clamp\(16px, 2\.4vw, 30px\)/));
  check('jasny motyw ma własną wersję tej tafli', () =>
    assert.match(block, /html\[data-theme="light"\] body:is\(\.rj-file/));
  check('małe elementy w kartach nie rozmywają tła', () => {
    const small = GLASS.slice(GLASS.indexOf('Małe elementy wewnątrz kart'));
    assert.match(small, /\.file-item/);
    assert.match(small, /backdrop-filter: none !important/);
  });
}

console.log('\n=== D. REJCHAT PRZEBUDOWANY ===');
{
  check('arkusz przebudowy jest podpięty jako ostatni', () => {
    const links = Array.from(CHAT_HTML.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)).map((m) => m[1]);
    const last = links[links.length - 1];
    assert.match(last, /rejchat-rebuild\.css/);
  });
  check('jedna paleta: błękit na granacie', () => {
    assert.match(CHAT_CSS, /--rc-accent: #8bbdff/);
    assert.match(CHAT_CSS, /--rc-accent-strong: #4d8df6/);
    assert.match(CHAT_CSS, /--rc-bg: #081120/);
  });
  check('zero fioletu, zieleni i magenty w nowej warstwie', () => {
    ['#c8b8ff', '#a6efd6', '#675fbd', '#b7caff', 'magenta', 'fuchsia'].forEach((color) => {
      assert.ok(!CHAT_CSS.includes(color), 'został kolor ' + color);
    });
  });
  check('trzy kolumny na szerokim ekranie', () => {
    assert.match(CHAT_CSS, /grid-template-columns: 258px minmax\(0, 1fr\) 268px/);
    assert.match(CHAT_CSS, /\.rejchat-info \{\s*grid-column: 3/);
  });
  check('na telefonie jedna kolumna', () =>
    assert.match(CHAT_CSS, /@media \(max-width: 900px\)[\s\S]{0,200}grid-template-columns: minmax\(0, 1fr\)/));
  check('jedna geometria: 22 px paneli, 14 px elementów', () => {
    assert.match(CHAT_CSS, /--rc-radius: 22px/);
    assert.match(CHAT_CSS, /--rc-radius-sm: 14px/);
  });
  check('szkło tylko na dużych nieruchomych taflach', () => {
    const list = CHAT_CSS.slice(CHAT_CSS.indexOf('.comm-chat-list {'), CHAT_CSS.indexOf('.chat-msg {'));
    assert.ok(!/backdrop-filter/.test(list), 'lista wiadomości rozmywa tło');
    assert.match(CHAT_CSS, /\.comm-sidebar \{[\s\S]{0,400}backdrop-filter: blur\(16px\)/);
  });
  check('stary kolor nagłówka nie wraca', () =>
    assert.match(CHAT_CSS, /body\.rj-community \.comm-hero \{[\s\S]{0,400}background: var\(--rc-sheen\), var\(--rc-surface\)/));

  check('wszystkie zaczepy JS nadal są w HTML-u', () => {
    ['chat-list', 'chat-form', 'chat-input', 'chat-send', 'chat-public-view', 'chat-private-view',
      'dm-input', 'dm-messages', 'dm-send', 'post-content', 'post-submit', 'logout-btn',
      'chat-tab', 'posts-tab', 'channel-general', 'channel-links', 'channel-private',
      'composer-card', 'panel-chat', 'panel-posts']
      .forEach((id) => assert.ok(CHAT_HTML.includes('id="' + id + '"'), 'brak #' + id));
  });
  check('trzy główne obszary nadal istnieją', () => {
    ['comm-sidebar', 'comm-primary', 'rejchat-info', 'comm-layout', 'comm-hero']
      .forEach((name) => assert.ok(CHAT_HTML.includes(name), 'brak .' + name));
  });
  check('arkusz nie używa !important do zbijania wszystkiego', () => {
    const important = (CHAT_CSS.match(/!important/g) || []).length;
    assert.ok(important <= 2, 'za dużo !important: ' + important);
  });
}

console.log('\n========================================================');
if (failures.length) {
  console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
  failures.forEach((failure) => console.log(' - ' + failure));
  process.exit(1);
}
console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
console.log('PASS: przełącznik nad wyróżnionymi, wyspa z właściwym arkuszem, hero bez blur-kwadratów, RejChat po przebudowie');
process.exit(0);

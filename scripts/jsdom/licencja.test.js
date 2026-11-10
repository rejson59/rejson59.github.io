/* Strona licencji: jeden nagłówek, ukryty link „Przejdź do treści”, logo bez
   sieci, pigułka zgłoszeń i odblokowany ruch. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const pages = ['licencja.html', 'rejhub2/licencja.html'];
const css = fs.readFileSync(path.join(root, 'css/licencja.css'), 'utf8');
const LOGOS = { 'licencja.html': '/favicon.svg', 'rejhub2/licencja.html': '/hub/brand-mark.svg?v=1' };

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (error) { console.log('  ✘ ' + name + '  [' + error.message + ']'); fail++; }
}

for (const file of pages) {
  console.log('\n=== ' + file + ' ===');
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const LOGO = LOGOS[file];
  const dom = new JSDOM(html, { url: 'https://example.org/licencja' });
  const d = dom.window.document;

  check('dokładnie jedna marka w nagłówku',
    () => assert.equal(d.querySelectorAll('.rj-shared-header .brand').length, 1));
  check('logo to oryginalny obrazek marki (nie podmieniony SVG)',
    () => assert.equal(d.querySelectorAll('.rj-shared-header .brand img.brand-mark').length, 1));
  check('logo wskazuje plik marki tej witryny',
    () => assert.equal(d.querySelector('.rj-shared-header .brand img').getAttribute('src'), LOGO));
  check('nazwa marki bez zmian',
    () => assert.equal(d.querySelector('.rj-shared-header .brand-text').textContent.trim().split('.')[0],
      file === 'licencja.html' ? 'rejson59' : 'RejHub'));
  check('dokładnie jeden link „Przejdź do treści”',
    () => assert.equal(d.querySelectorAll('a.services-skip').length, 1));
  check('link prowadzi do treści',
    () => assert.equal(d.querySelector('a.services-skip').getAttribute('href'), '#tresc'));
  check('nagłówek jest tylko jeden',
    () => assert.equal(d.querySelectorAll('header').length, 1));
  check('jeden <main> z id treść',
    () => assert.equal(d.querySelectorAll('main#tresc').length, 1));
  /* RejHub 2.0 zgłasza przez wyspę (#244); stara strona zostaje przy pigułce. */
  check('zgłoszenia są podpięte',
    () => assert.ok(file === 'rejhub2/licencja.html'
      ? /hub\/island\.js\?v=\d+/.test(html) && /hub\/island\.css\?v=\d+/.test(html)
      : /widget\.js\?v=\d+/.test(html)));
  check('ruch odblokowany',
    () => assert.ok(html.includes('/js/motion-unlock.js?v=1')));
  check('soczewka podpięta',
    () => assert.ok(html.includes('/js/glass-lens.js')));
  check('hero i karty mają data-glass-lens',
    () => assert.ok(d.querySelectorAll('[data-glass-lens]').length >= 6));
  check('arkusz licencji w świeżej wersji',
    () => assert.match(html, /licencja\.css\?v=4/));
  check('nota licencyjna w stopce',
    () => assert.match(html, /wszystkie prawa zastrzeżone/i));
}

console.log('\n=== CSS: LINK POMIJAJĄCY JEST UKRYTY ===');
check('reguła dla .services-skip istnieje', () => assert.match(css, /\.rj-license \.services-skip[^{]*\{/));
check('link siedzi poza ekranem do czasu fokusu',
  () => assert.match(css, /top:\s*-120px/) && assert.match(css, /\.services-skip:focus[\s\S]{0,80}top:\s*12px/));
check('geometria kapsuły nagłówka zdefiniowana lokalnie',
  () => assert.match(css, /\.rj-license \.rj-shared-header\s*\{[\s\S]*?border-radius:\s*999px/));

console.log('\n' + '='.repeat(56));
console.log('WYNIK: ' + pass + '/' + (pass + fail) + (fail ? ' ✘' : ' ✔'));
if (fail) process.exitCode = 1;

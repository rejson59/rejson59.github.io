/* Zasady loaderów RejHuba:
   1. nakładka widoczna minimum 3 s,
   2. animacja znacznika zmienia się co sekundę (trzy różne),
   3. treść odsłania się dopiero po zniknięciu nakładki (nic nie nachodzi),
   4. brak backdrop-filter na nakładce (to on powodował zacinanie). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HUB = read('rejhub2/hub/loader.js');
const HUB_CSS = read('rejhub2/hub/loader.css');
const LEGACY = read('js/loader.js');
const LEGACY_CSS = read('css/loader.css');
const REVEAL = read('js/page-reveal.js');

function checkSources() {
  /* --- 3 sekundy minimum: oba harmonogramy --- */
  assert.match(LEGACY, /var MIN_SHOW_MS = 3000;/, 'js/loader.js musi trzymać 3 s');
  assert.match(LEGACY, /var FADE_MS = 320;/, 'js/loader.js musi znać czas zanikania');
  assert.match(HUB, /var MIN_MS = 3000;/, 'hub/loader.js musi trzymać 3 s');
  assert.match(HUB, /var STAGE_MS = 1000;/, 'nowa animacja co sekundę');
  assert.match(HUB, /var DIP_MS = 140;/, 'przygaszenie przy podmianie znacznika');

  /* --- pasek postępu na trzech stronach ze starym loaderem --- */
  ['index.html', 'rejchat.html', 'widzety.html'].forEach((file) => {
    const html = read('rejhub2/' + file);
    assert.match(html, /var CURVE_S = 3\.0;/, file + ': pasek musi mieć 3 s');
  });

  /* --- nakładka: bez rozmywania, pełne krycie --- */
  /* komentarze precz — sprawdzamy tylko realne deklaracje */
  const overlay = HUB_CSS.slice(HUB_CSS.indexOf('#rj-page-loader {'), HUB_CSS.indexOf('#rj-page-loader .rj-loader-box'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/backdrop-filter/.test(overlay), 'nakładka nie może rozmywać tła (to powodowało lagi)');
  assert.match(overlay, /background:/, 'nakładka ma pełne tło');
  assert.match(overlay, /transition: opacity 0\.32s/, 'czas zanikania musi być stały');

  /* --- jeden właściciel stylów nakładki --- */
  assert.ok(!/^#rj-page-loader\s*\{/m.test(LEGACY_CSS), 'css/loader.css nie może dublować nakładki');

  /* --- wejście strony startuje w klatce zanikania nakładki --- */
  assert.ok(!/LOADER_FADE_MS/.test(REVEAL), 'page-reveal nie może czekać dodatkowych 340 ms po loaderze');
  assert.match(REVEAL, /function whenReady\(callback\)/, 'page-reveal ma wspólną bramę startu');
  assert.match(REVEAL, /observer\.disconnect\(\);\s*fire\(\)/, 'start następuje od razu po is-hidden');
  /* --- dokładnie jeden właściciel odsłaniania --- */
  assert.match(LEGACY, /function revealContent\(\)/, 'js/loader.js oddaje odsłanianie page-reveal');
  assert.match(HUB, /function revealContent\(\)/, 'hub/loader.js oddaje odsłanianie page-reveal');
  [LEGACY, HUB].forEach((source, index) => {
    assert.match(source, /window\.RejReveal[^\n]*start[^\n]*=== "function"[^\n]*\) return;/,
      (index ? 'hub/loader.js' : 'js/loader.js') + ': bez RejReveal treść odsłania loader');
  });

  /* --- znacznik ma płynną podmianę --- */
  assert.match(HUB_CSS, /\.loader-mark\s*\{[^}]*transition: opacity 0\.14s/, 'znacznik przygasa przy podmianie');
}

const overlayMarkup =
  '<div id="rj-page-loader" aria-hidden="true"><div class="rj-loader-box">' +
  '<div class="loader-mark mark-orbit"><b><img src="/hub/brand-mark.svg" alt=""></b>' +
  '<span></span><span></span><span></span><span></span></div>' +
  '<div class="rj-loader-labels"><p class="rj-loader-caption">RejHub</p>' +
  '<div class="rj-progress"><span class="rj-progress-fill"></span></div>' +
  '<p class="rj-loader-stage">uruchamianie</p></div></div></div>';

/* Skrócone czasy, żeby test trwał sekundy, a nie minuty. */
function fast(source) {
  return source
    .replace('var MIN_MS = 3000;', 'var MIN_MS = 250;')
    .replace('var STAGE_MS = 1000;', 'var STAGE_MS = 60;')
    .replace('var FADE_MS = 320;', 'var FADE_MS = 40;')
    .replace('var DIP_MS = 140;', 'var DIP_MS = 10;')
    .replace('setTimeout(hide, 9000);', 'setTimeout(hide, 3000);');
}

function build(legacy) {
  const html = '<!doctype html><html class="rj-booting"><head><meta charset="utf-8"></head><body>' +
    overlayMarkup.replace('id="rj-page-loader"', legacy ? 'id="rj-page-loader" data-legacy="1"' : 'id="rj-page-loader"') +
    '<main>treść</main></body></html>';
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, { url: 'https://rejhub.vercel.app/licencja', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  dom.window.eval(fast(HUB));
  return dom;
}

async function checkRotation() {
  const dom = build(false);
  const w = dom.window;
  const d = w.document;
  const mark = d.querySelector('.loader-mark');
  const seen = [];
  const observer = new w.MutationObserver(() => {
    const current = Array.from(mark.classList).find((name) => name.startsWith('mark-'));
    if (!seen.includes(current)) seen.push(current);
  });
  observer.observe(mark, { attributes: true, attributeFilter: ['class'] });

  /* 4 sekundy w skróconej skali = cztery zmiany animacji */
  await wait(320);
  observer.disconnect();

  assert.equal(seen.length, 3, 'rotacja ma trzy różne animacje, bez powtórek: ' + seen.join(', '));
  assert.equal(d.querySelectorAll('.loader-mark').length, 1, 'w DOM jest tylko jeden znacznik — animacje nie nachodzą');

  /* nakładka chowa się po minimum, a treść odsłania dopiero po zaniknięciu */
  const overlay = d.getElementById('rj-page-loader');
  assert.ok(overlay.classList.contains('is-hidden'), 'nakładka schowana po minimum');
  await wait(80);
  assert.ok(!d.documentElement.classList.contains('rj-booting'), 'treść odsłonięta po zaniknięciu nakładki');

  /* rotacja zatrzymana — nic nie animuje się po schowaniu */
  const last = Array.from(mark.classList).find((name) => name.startsWith('mark-'));
  await wait(200);
  assert.equal(Array.from(mark.classList).find((name) => name.startsWith('mark-')), last, 'po schowaniu rotacja staje');

  dom.window.close();
}

async function checkHandoff() {
  const dom = build(false);
  const w = dom.window;
  const d = w.document;
  let starts = 0;
  w.RejReveal = { start() { starts += 1; } };

  await wait(340);
  assert.ok(d.getElementById('rj-page-loader').classList.contains('is-hidden'), 'nakładka schowana');
  assert.ok(d.documentElement.classList.contains('rj-booting'),
    'loader nie odsłania treści, gdy page-reveal przejął wejście');
  assert.equal(starts, 0, 'loader nie udaje page-reveal — startuje tylko prawdziwy skrypt');

  d.documentElement.classList.remove('rj-booting');
  dom.window.close();
}

async function checkLegacy() {
  const dom = build(true);
  const w = dom.window;
  const d = w.document;
  const overlay = d.getElementById('rj-page-loader');
  const mark = d.querySelector('.loader-mark');

  /* stara strona sama prowadzi chowanie (js/loader.js) — hub nie może jej chować */
  await wait(200);
  assert.ok(!overlay.classList.contains('is-hidden'), 'przy data-legacy hub nie chowa nakładki');
  assert.ok(!!Array.from(mark.classList).find((name) => name.startsWith('mark-')), 'rotacja znacznika działa też na starych stronach');

  /* a gdy stary loader schowa nakładkę, rotacja ma się zatrzymać */
  overlay.classList.add('is-hidden');
  await wait(40);
  const stopped = Array.from(mark.classList).find((name) => name.startsWith('mark-'));
  await wait(200);
  assert.equal(Array.from(mark.classList).find((name) => name.startsWith('mark-')), stopped, 'rotacja stopuje po schowaniu');

  dom.window.close();
}

(async function main() {
  checkSources();
  await checkRotation();
  await checkHandoff();
  await checkLegacy();
  console.log('loader-rules: wszystkie sprawdzenia przeszły');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

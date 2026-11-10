/* Wyspa na telefonie: rozmiary, klawiatura, brak czarnej plamy po awarii.
   Każde sprawdzenie odpowiada konkretnemu błędowi zgłoszonemu z telefonu:
   - panel szerszy niż ekran i ucięty przycisk zamykania,
   - klawiatura zasłaniająca pole zgłoszenia,
   - wyspa zostająca czarnym, martwym prostokątem po wyjątku. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const islandJs = path.join(root, 'rejhub2/hub/island.js');
const islandCss = path.join(root, 'rejhub2/hub/island.css');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const SIZES = {
  idle: 46, dock: 52, report: 236, search: 292, alerts: 296,
  now: 96, profile: 158, quick: 152, theme: 156, tasks: 208, panic: 160
};

function checkSources() {
  const source = read('rejhub2/hub/island.js');
  const css = read('rejhub2/hub/island.css');

  /* --- warstwa graficzna: źródło czarnych prostokątów na iOS --- */
  const islandRule = css
    .slice(css.indexOf('#rj-island-root .rj-island {'), css.indexOf('#rj-island-root .rj-island::before'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const islandNoComments = islandRule;
  assert.ok(!/will-change/.test(islandRule), 'wyspa nie może wymuszać warstwy graficznej przy zmianie rozmiaru');
  assert.ok(!/contain:\s*layout style paint/.test(islandNoComments), 'bez contain: paint — to on potrafi zostawić czarną warstwę');
  assert.match(islandRule, /max-width:\s*calc\(100vw - 16px\)/, 'wyspa nie może być szersza niż ekran');
  assert.match(islandRule, /var\(--rj-kb, 0px\)/, 'wyspa musi ustępować klawiaturze ekranowej');

  /* --- zawijanie treści zamiast wypychania poza krawędź --- */
  const viewRule = css.slice(css.indexOf('#rj-island-root .rj-view {'), css.indexOf('#rj-island-root .rj-island[data-state="idle"] .rj-view--idle'));
  assert.match(viewRule, /white-space:\s*normal/, 'panele mają zawijać tekst');
  assert.match(viewRule, /overflow:\s*hidden/, 'widok nie może malować poza wyspą');
  assert.match(css, /\.rj-view--dock\s*\{[^}]*white-space:\s*nowrap/, 'dock może zostać w jednej linii');

  /* --- dock: osiem przycisków w każdej szerokości --- */
  const dockBtn = css.slice(css.indexOf('#rj-island-root .rj-dock-btn {'), css.indexOf('#rj-island-root .rj-dock-btn svg'));
  assert.match(dockBtn, /flex:\s*1 1 0/, 'przyciski docku dzielą szerokość po równo');
  assert.match(dockBtn, /min-width:\s*0/, 'przyciski mogą się zwęzić na małym ekranie');

  /* --- iOS nie może powiększać strony przy dotknięciu pola --- */
  const phone = css.slice(css.indexOf('@media (max-width: 560px)'), css.indexOf('@media (max-width: 380px)'));
  assert.match(phone, /\.rj-field,\s*#rj-island-root textarea\.rj-input\s*\{\s*font-size:\s*16px/, 'pola na telefonie mają 16 px (bez zoomu Safari)');

  /* --- JS: klawiatura, obrót i pilnowanie stanu --- */
  assert.match(source, /window\.visualViewport/, 'wyspa słucha visualViewport');
  assert.match(source, /function health\(\)/, 'jest diagnostyka stanu wyspy');
  assert.match(source, /function watchdog\(\)/, 'jest pilnowacz stanu');
  assert.match(source, /function rebuild\(\)/, 'jest odbudowa uszkodzonej wyspy');
  assert.match(source, /function resetToIdle/, 'jest awaryjny powrót do spoczynku');
  assert.match(source, /isFinite\(target\)/, 'sprężyna odrzuca nieliczby');
  assert.match(source, /void 0|setInterval\(watchdog, 2500\)/, 'pilnowacz działa cyklicznie');
}

function buildPage() {
  return '<!doctype html><html lang="pl" data-theme="dark"><head><meta charset="utf-8">' +
    '<script src="/hub/island.js?v=3" data-project="rejhub" data-project-name="RejHub"></script>' +
    '</head><body><header class="rj-shared-header"><nav><a href="/rejchat">RejChat</a></nav></header>' +
    '<main><h1>Test</h1></main></body></html>';
}

/* Telefon 320×568 z działającą klawiaturą ekranową. */
function makePhone() {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(buildPage(), {
    url: 'https://rejhub.vercel.app/licencja',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;

  Object.defineProperty(w, 'innerWidth', { value: 320, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: 568, configurable: true });

  const listeners = {};
  const viewportMock = {
    width: 320,
    height: 568,
    offsetTop: 0,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    emit(type) { (listeners[type] || []).forEach((fn) => fn({ type })); }
  };
  Object.defineProperty(w, 'visualViewport', { value: viewportMock, configurable: true });

  w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  w.RJProfiles = { session: () => null, getMany: () => Promise.resolve([]) };

  w.eval(fs.readFileSync(islandJs, 'utf8'));
  return { dom, w, viewportMock };
}

function size(island) {
  return { w: parseFloat(island.style.width), h: parseFloat(island.style.height) };
}

async function checkPhone() {
  const { dom, w, viewportMock } = makePhone();
  const d = w.document;
  await wait(180);

  const island = d.querySelector('#rj-island-root .rj-island');
  assert.ok(island, 'wyspa zamontowana na telefonie');

  const idle = size(island);
  assert.ok(idle.w > 0 && idle.w <= 320 - 16, 'zwinięta wyspa mieści się na 320 px: ' + idle.w);
  assert.ok(idle.h >= 40 && idle.h <= 568 - 34, 'zwinięta wyspa mieści się w wysokości: ' + idle.h);

  /* --- każdy panel: rozmiar w ekranie, treść i wyjście --- */
  const states = Object.keys(SIZES).filter((name) => name !== "idle");
  for (const name of states) {
    w.RejIsland.open(name);
    await wait(30);

    assert.equal(island.dataset.state, name, name + ': stan się ustawia');
    const box = size(island);
    assert.ok(isFinite(box.w) && box.w > 0 && box.w <= 320, name + ': szerokość w ekranie (' + box.w + ')');
    assert.ok(isFinite(box.h) && box.h > 0 && box.h <= 568, name + ': wysokość w ekranie (' + box.h + ')');

    const view = island.querySelector('.rj-view--' + name);
    assert.ok(view, name + ': widok istnieje');
    const visible = view.textContent.trim().length > 0 || view.querySelectorAll('button, a, input, textarea').length > 0;
    assert.ok(visible, name + ': widok ma treść (nie czarna plama)');
    assert.equal(w.RejIsland.health(), 'ok', name + ': wyspa zdrowa');

    if (!['dock', 'now'].includes(name)) {
      assert.ok(view.querySelector('[data-close]'), name + ': jest czym zamknąć panel');
    }
    w.RejIsland.open('idle');
    await wait(15);
  }

  /* --- klawiatura: wyspa odsuwa się i kurczy --- */
  viewportMock.height = 268;
  viewportMock.emit('resize');
  await wait(40);
  const kb = parseFloat(d.getElementById('rj-island-root').style.getPropertyValue('--rj-kb'));
  assert.ok(kb >= 140 && kb <= 150, 'klawiatura podnosi wyspę o ~147 px, jest: ' + kb);

  w.RejIsland.open('report');
  await wait(30);
  const withKeyboard = size(island);
  assert.ok(withKeyboard.h <= 268 - 34, 'panel mieści się nad klawiaturą: ' + withKeyboard.h);
  assert.equal(w.RejIsland.health(), 'ok');

  /* --- powrót klawiatury --- */
  viewportMock.height = 568;
  viewportMock.emit('resize');
  w.RejIsland.open('idle');
  await wait(40);
  assert.equal(parseFloat(d.getElementById('rj-island-root').style.getPropertyValue('--rj-kb')), 0, 'bez klawiatury wyspa wraca na dół');

  dom.window.close();
}

async function checkRecovery() {
  const { dom, w } = makePhone();
  const d = w.document;
  await wait(180);
  const island = d.querySelector('#rj-island-root .rj-island');

  /* 1. Wyjątek w rysowaniu panelu (np. profil bez danych) nie może zostawić
        pustej czarnej wyspy — wracamy do spoczynku i mówimy o tym. */
  const goodSession = w.RJProfiles.session;
  w.RJProfiles.session = () => { throw new Error('awaria sesji'); };
  w.RejIsland.open('profile');
  await wait(40);
  assert.equal(island.dataset.state, 'idle', 'wyjątek w renderze wraca do spoczynku');
  assert.equal(w.RejIsland.health(), 'ok');
  assert.ok(/Nie udało się otworzyć panelu/.test(d.querySelector('.rj-toast').textContent), 'użytkownik dostaje komunikat');
  w.RJProfiles.session = goodSession;

  /* 2. Zły stan w atrybucie — pilnowacz przywraca poprawny. */
  island.dataset.state = 'nie-ma-takiego';
  assert.equal(w.RejIsland.health(), 'state');
  w.RejIsland.check();
  assert.equal(island.dataset.state, 'idle', 'nieznany stan wraca do idle');

  /* 3. Zepsuty rozmiar (NaN) — nie może rozciągnąć wyspy na ekran. */
  island.style.width = '0px';
  island.style.height = '0px';
  assert.equal(w.RejIsland.health(), 'size');
  w.RejIsland.check();
  const fixed = size(island);
  assert.ok(isFinite(fixed.w) && fixed.w <= 320, 'szerokość naprawiona');
  assert.ok(isFinite(fixed.h) && fixed.h <= 568, 'wysokość naprawiona');

  /* 4. Uszkodzone drzewo wyspy — odbudowa z pełnym dockiem. */
  d.getElementById('rj-island-root').innerHTML = '';
  assert.equal(w.RejIsland.health(), 'missing');
  w.RejIsland.check();
  const rebuilt = d.querySelector('#rj-island-root .rj-island');
  assert.ok(rebuilt, 'wyspa odbudowana po skasowaniu drzewa');
  assert.equal(d.querySelectorAll('.rj-dock-btn').length, 8, 'dock wrócił w komplecie');
  assert.equal(w.RejIsland.health(), 'ok');

  /* 5. Pusty panel (treść usunięta) nie może udawać czarnej wyspy. */
  w.RejIsland.open('alerts');
  await wait(20);
  d.querySelector('.rj-view--alerts .rj-panel').innerHTML = '<div></div>';
  assert.equal(w.RejIsland.health(), 'empty', 'pusty panel jest wykrywany');
  w.RejIsland.check();
  assert.equal(w.RejIsland.health(), 'ok', 'po kontroli wyspa jest sprawna');

  /* 6. Obrót telefonu nie zostawia rozmiaru z poprzedniej orientacji. */
  Object.defineProperty(w, 'innerWidth', { value: 568, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: 320, configurable: true });
  w.dispatchEvent(new w.Event('resize'));
  await wait(40);
  const rotated = size(island);
  assert.ok(rotated.w <= 568 && rotated.h <= 320, 'po obrocie wyspa mieści się w nowym ekranie');

  dom.window.close();
}

(async function main() {
  checkSources();
  await checkPhone();
  await checkRecovery();
  console.log('island-mobile: wszystkie sprawdzenia przeszły');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

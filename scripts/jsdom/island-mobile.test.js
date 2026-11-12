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
  idle: 46, dock: 52, report: 236, chat: 404, assistant: 470, alerts: 296,
  now: 112, profile: 158, quick: 152, theme: 156, tasks: 208, panic: 160
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

  /* --- strzałka schowania MUSI zostać w pigułce (zgłoszenie z telefonu) --- */
  const idleRule = css.slice(css.indexOf('#rj-island-root .rj-view--idle {'), css.indexOf('#rj-island-root .rj-collapse {'));
  assert.match(idleRule, /padding:\s*0 8px 0 7px/, 'zwinięta wyspa ma odkładać miejsce na strzałkę');
  const collapseRule = css.slice(css.indexOf('#rj-island-root .rj-collapse {'), css.indexOf('#rj-island-root .rj-collapse svg'));
  assert.match(collapseRule, /flex:\s*0 0 26px/, 'strzałka nie może się kurczyć');
  assert.match(collapseRule, /margin-left:\s*auto/, 'strzałka trzyma się prawej krawędzi');
  const titleRule = css.slice(css.indexOf('#rj-island-root .rj-title {'), css.indexOf('#rj-island-root .rj-title small'));
  assert.match(titleRule, /min-width:\s*0/, 'to tytuł ma się zwężać, nie przyciski');
  assert.match(titleRule, /text-overflow:\s*ellipsis/, 'długi tytuł kończy się wielokropkiem');
  assert.match(titleRule, /flex:\s*1 1 auto/, 'tytuł zajmuje wolną przestrzeń, ale jej nie wymusza');
  assert.match(source, /idle: \{ w: (\d+)/, 'zwinięta wyspa ma zdefiniowaną szerokość');
  assert.ok(Number(source.match(/idle: \{ w: (\d+)/)[1]) >= 200, 'pigułka musi pomieścić logo, tytuł i strzałkę');

  /* --- zawijanie treści zamiast wypychania poza krawędź --- */
  const viewRule = css.slice(css.indexOf('#rj-island-root .rj-view {'), css.indexOf('#rj-island-root .rj-island[data-state="idle"] .rj-view--idle'));
  assert.match(viewRule, /white-space:\s*normal/, 'panele mają zawijać tekst');
  assert.match(viewRule, /overflow:\s*hidden/, 'widok nie może malować poza wyspą');
  assert.match(css, /\.rj-view--dock\s*\{[^}]*white-space:\s*nowrap/, 'dock może zostać w jednej linii');

  /* --- dock: dziewięć przycisków w każdej szerokości --- */
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
  assert.match(source, /setInterval\(watchdog, 2500\)/, 'pilnowacz działa cyklicznie');

  /* --- awaryjne style: wyspa nie może zostać czarna bez arkusza --- */
  const critical = source.slice(source.indexOf('var CRITICAL_CSS'), source.indexOf('STATES.map'));
  assert.match(critical, /color:#f4f7fc/, 'krytyczne style ustawiają jasny tekst na czerni');
  assert.match(critical, /\.rj-panel\{[^}]*position:static/, 'reset .rj-panel unieważnia globalne .rj-panel z premium.css');
  assert.match(critical, /\.rj-dock-btn svg\{width:19px;height:19px\}/, 'ikony docku mają rozmiar bez arkusza');
  assert.match(source, /color-scheme:dark/, 'wyspa deklaruje ciemny schemat kolorów (bez auto-inwersji)');
  assert.match(source, /STATES\.map/, 'każdy stan ma awaryjną regułę widoczności');

  /* --- schowanie do uchwytu przy dolnej krawędzi --- */
  assert.match(source, /min: \{ w: 132, h: 28, r: 14 \}/, 'jest osobny rozmiar dla schowanej wyspy');
  assert.match(source, /COLLAPSE_KEY/, 'stan schowania jest zapamiętywany');
  assert.equal((source.match(/data-collapse/g) || []).length >= 2, true, 'strzałka w dół jest w idle i w docku');
  assert.match(source, /data-expand/, 'uchwyt rozwija wyspę');
  assert.match(css, /\.rj-island\.is-min\s*\{[^}]*bottom:\s*env\(safe-area-inset-bottom/, 'schowana wyspa klei się do dolnej krawędzi');
  assert.match(css, /\.rj-collapse\s*\{/, 'strzałka ma własny styl');
  assert.match(css, /\.rj-handle\s*\{/, 'uchwyt ma własny styl');

  /* --- izolacja od arkuszy strony --- */
  assert.match(source, /attachShadow/, 'wyspa montuje się w shadow DOM');
  assert.match(source, /attachShadow/, 'wyspa montuje się w shadow DOM');
  assert.match(css, /overflow:\s*clip/, 'wyspa używa overflow: clip (fokus nie przewinie treści)');
  assert.match(source, /island\.scrollTop = 0/, 'otwarcie panelu zeruje przewinięcie wyspy');
}

function buildPage() {
  return '<!doctype html><html lang="pl" data-theme="dark"><head><meta charset="utf-8">' +
    '<script src="/hub/island.js?v=8" data-project="rejhub" data-project-name="RejHub"></script>' +
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

  const host = d.getElementById('rj-island-root');
  assert.ok(host && host.shadowRoot, 'wyspa ma własne drzewo (shadow DOM)');
  const ui = (sel) => host.shadowRoot.querySelector(sel);
  const inner = () => host.shadowRoot.querySelector('#rj-island-root');
  const island = ui('.rj-island');
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

    if (name !== 'dock') {
      assert.ok(view.querySelector('[data-close]'), name + ': jest czym zamknąć panel');
    }
    w.RejIsland.open('idle');
    await wait(15);
  }

  /* --- schowanie strzałką i powrót uchwytem --- */
  w.RejIsland.open('idle');
  await wait(20);
  const collapseBtn = ui('.rj-view--idle [data-collapse]');
  assert.ok(collapseBtn, 'w zwiniętej wyspie jest strzałka w dół');
  collapseBtn.click();
  await wait(420);

  assert.equal(island.dataset.state, 'min', 'strzałka chowa wyspę');
  assert.ok(island.classList.contains('is-min'), 'schowana wyspa dostaje klasę is-min (klejenie do dołu)');
  const min = size(island);
  assert.ok(min.w <= 140 && min.w >= 100, 'uchwyt jest wąski: ' + min.w);
  assert.ok(min.h <= 34 && min.h >= 18, 'uchwyt jest niski: ' + min.h);
  assert.equal(w.localStorage.getItem('rj_island_collapsed_v1'), '1', 'schowanie jest zapamiętane');
  assert.equal(w.RejIsland.health(), 'ok', 'schowana wyspa jest zdrowa');

  const handle = ui('[data-expand]');
  assert.ok(handle, 'uchwyt ma przycisk rozwinięcia');
  handle.click();
  await wait(420);
  assert.equal(island.dataset.state, 'idle', 'uchwyt rozwija wyspę');
  assert.ok(!island.classList.contains('is-min'), 'po rozwinięciu wraca cień i zaokrąglenie dołu');
  assert.equal(w.localStorage.getItem('rj_island_collapsed_v1'), '0', 'rozwinięcie też jest zapamiętane');

  /* Uchwyt ma być też w docku — tam wyspa bywa najczęściej. */
  w.RejIsland.open('dock');
  await wait(20);
  assert.ok(ui('.rj-view--dock [data-collapse]'), 'dock ma własną strzałkę schowania');
  w.RejIsland.open('idle');
  await wait(20);

  /* --- klawiatura: wyspa odsuwa się i kurczy --- */
  viewportMock.height = 268;
  viewportMock.emit('resize');
  await wait(40);
  const kb = parseFloat(inner().style.getPropertyValue('--rj-kb'));
  assert.ok(kb >= 295 && kb <= 305, 'klawiatura podnosi wyspę nad siebie (300 px), jest: ' + kb);

  w.RejIsland.open('report');
  await wait(30);
  const withKeyboard = size(island);
  assert.ok(withKeyboard.h <= 268 - 34, 'panel mieści się nad klawiaturą: ' + withKeyboard.h);
  assert.ok(withKeyboard.h > 0, 'panel nad klawiaturą nie jest pusty');
  assert.equal(w.RejIsland.health(), 'ok');

  /* --- powrót klawiatury --- */
  viewportMock.height = 568;
  viewportMock.emit('resize');
  w.RejIsland.open('idle');
  await wait(40);
  assert.equal(parseFloat(inner().style.getPropertyValue('--rj-kb')) || 0, 0, 'bez klawiatury wyspa wraca na dół');

  dom.window.close();
}

async function checkRecovery() {
  const { dom, w } = makePhone();
  const d = w.document;
  await wait(180);
  const host = d.getElementById('rj-island-root');
  const ui = (sel) => host.shadowRoot.querySelector(sel);
  const inner = () => host.shadowRoot.querySelector('#rj-island-root');
  const island = ui('.rj-island');

  /* 1. Wyjątek w rysowaniu panelu (np. profil bez danych) nie może zostawić
        pustej czarnej wyspy — wracamy do spoczynku i mówimy o tym. */
  const goodSession = w.RJProfiles.session;
  w.RJProfiles.session = () => { throw new Error('awaria sesji'); };
  w.RejIsland.open('profile');
  await wait(40);
  assert.equal(island.dataset.state, 'idle', 'wyjątek w renderze wraca do spoczynku');
  assert.equal(w.RejIsland.health(), 'ok');
  assert.ok(/Nie udało się otworzyć panelu/.test(ui('.rj-toast').textContent), 'użytkownik dostaje komunikat');
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
  inner().innerHTML = '';
  assert.equal(w.RejIsland.health(), 'missing');
  w.RejIsland.check();
  const rebuilt = ui('.rj-island');
  assert.ok(rebuilt, 'wyspa odbudowana po skasowaniu drzewa');
  assert.equal(host.shadowRoot.querySelectorAll('.rj-dock-btn[data-open]').length, 9, 'dock wrócił w komplecie');
  assert.equal(w.RejIsland.health(), 'ok');

  /* 5. Pusty panel (treść usunięta) nie może udawać czarnej wyspy. */
  w.RejIsland.open('alerts');
  await wait(20);
  ui('.rj-view--alerts .rj-panel').innerHTML = '<div></div>';
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

/* Prawdziwa przyczyna czarnej wyspy na stronie głównej: premium.css ma
   globalne `.rj-panel` (position:absolute; top:calc(100% + 10px); z-index:9000),
   które wypychało panel poza wyspę. Wyspa musi być na to odporna — nawet gdy
   arkusz strony definiuje te same klasy. */
async function checkIsolation() {
  const { dom, w } = makePhone();
  const d = w.document;

  /* Dokładnie te reguły, które były w premium.css. */
  const pageStyle = d.createElement('style');
  pageStyle.textContent =
    '.rj-panel{position:absolute;top:calc(100% + 10px);right:0;z-index:9000;' +
    'width:min(380px,calc(100vw - 32px));border:1px solid #2b3244;background:#141a26;' +
    'box-shadow:0 24px 60px -20px #000;overflow:hidden}' +
    '.rj-panel-head{display:flex;justify-content:space-between;padding:13px 15px;' +
    'border-bottom:1px solid #2b3244;font-size:13px}' +
    '.rj-progress{position:relative;width:148px;height:5px;margin-top:-6px}';
  d.head.appendChild(pageStyle);

  await wait(180);

  const host = d.getElementById('rj-island-root');
  const sr = host.shadowRoot;
  const ui = (sel) => sr.querySelector(sel);

  /* 1. Arkusz strony nie widzi wnętrza wyspy. */
  assert.equal(host.querySelectorAll('.rj-panel').length, 0, 'strona nie może dosięgnąć paneli wyspy');
  assert.equal(d.querySelectorAll('.rj-panel').length, 0, 'globalne .rj-panel nie łapie paneli wyspy');
  assert.equal(d.getElementById('rj-island-text'), null, 'pola wyspy nie są w dokumencie strony');

  /* 2. Wyspa ma własny arkusz i własne drzewo. */
  const link = sr.querySelector('link[rel="stylesheet"]');
  assert.ok(link, 'wyspa sama wczytuje swój arkusz');
  assert.match(link.getAttribute('href'), /hub\/island\.css\?v=\d+$/, 'właściwy adres arkusza wyspy');

  /* 3. Panele wyspy są wewnątrz .rj-view i mają własny układ. */
  w.RejIsland.open('report');
  await wait(30);
  const panel = ui('.rj-view--report .rj-panel');
  assert.ok(panel, 'panel zgłoszenia istnieje we własnym drzewie');
  assert.equal(w.RejIsland.health(), 'ok');
  /* treść panelu nie została przeniesiona pod wyspę (skutek globalnego .rj-panel) */
  assert.ok(ui('.rj-view--report').contains(panel), 'panel siedzi w widoku');
  assert.ok(panel.querySelector('[data-send]'), 'panel ma swoje przyciski');

  /* 4. Panel nigdy nie jest przewinięty poza wyspę. */
  const islandEl = ui('.rj-island');
  islandEl.scrollTop = 40;
  w.RejIsland.open('alerts');
  await wait(30);
  assert.equal(islandEl.scrollTop, 0, 'otwarcie panelu zeruje przewinięcie wyspy');

  dom.window.close();
}

/* Schowanie ma zostać także na kolejnej podstronie — inaczej po każdym
   kliknięciu w link wyspa wracałaby na środek ekranu. */
async function checkPersistence() {
  const { dom, w } = makePhone();
  await wait(150);
  w.localStorage.setItem('rj_island_collapsed_v1', '1');

  const second = makePhone();
  second.w.localStorage.setItem('rj_island_collapsed_v1', '1');
  second.w.eval(fs.readFileSync(islandJs, 'utf8'));
  await wait(160);

  const host = second.w.document.getElementById('rj-island-root');
  const islandEl = host.shadowRoot.querySelector('.rj-island');
  assert.equal(islandEl.dataset.state, 'min', 'nowa podstrona startuje ze schowaną wyspą');
  assert.ok(islandEl.classList.contains('is-min'), 'klejenie do dołu działa od pierwszej klatki');

  dom.window.close();
  second.dom.window.close();
}

(async function main() {
  checkSources();
  await checkPhone();
  await checkPersistence();
  await checkIsolation();
  await checkRecovery();
  console.log('island-mobile: wszystkie sprawdzenia przeszły');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

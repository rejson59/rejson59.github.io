const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function frame(w, stamp) {
  const next = w.__rjQueue.shift();
  if (next) next(stamp);
}

function pump(w, from, to, step) {
  for (let t = from; t <= to; t += step) frame(w, t);
}

(async () => {
  /* ------------------------------------------------- A. podłączenie plików --- */
  const pages = fs.readdirSync(path.join(root, 'rejhub2')).filter((f) => f.endsWith('.html'));
  pages.forEach((file) => {
    const html = read('rejhub2/' + file);
    assert.ok(html.includes('/css/potato.css?v=1'), file + ': brak arkusza trybu ziemniaka');
    assert.ok(html.includes('/js/potato.js?v=1'), file + ': brak skryptu trybu ziemniaka');
    assert.ok(html.indexOf('potato.css') > html.indexOf('performance.css'), file + ': tryb ziemniaka musi ładować się po warstwie wydajności');
  });

  const css = read('css/potato.css');
  assert.match(css, /html\.rj-potato \{/);
  assert.match(css, /--gl-blur:\s*none/);
  assert.match(css, /backdrop-filter:\s*none !important/);
  assert.match(css, /animation-duration:\s*0\.001ms !important/);
  assert.match(css, /\.rj-potato-note/);
  assert.match(css, /html\.rj-potato\[data-theme="light"\]/, 'jasny motyw też musi być czytelny bez blura');

  const island = read('rejhub2/hub/island.js');
  assert.ok(island.includes('data-switch="potato"'), 'wyspa musi mieć przełącznik trybu ziemniaka');
  assert.ok(island.includes('window.RJPotato'), 'wyspa musi korzystać z RJPotato');

  const potato = read('js/potato.js');
  assert.match(potato, /rj_potato/, 'wybór musi być pamiętany');
  assert.match(potato, /requestAnimationFrame/, 'automat musi mierzyć klatki');
  assert.match(potato, /document\.hidden/, 'ukryta karta nie może liczyć się jako lag');

  /* --------------------------------------------- B. zachowanie w przeglądarce --- */
  function boot(options) {
    options = options || {};
    const dom = new JSDOM(
      '<!doctype html><html lang="pl"><head></head><body>' +
        '<div id="rj-island-root"><button data-switch="potato" aria-pressed="false"><span data-potato-state>x</span></button></div>' +
        '</body></html>',
      { url: 'https://rejhub.vercel.app/', runScripts: 'outside-only', pretendToBeVisual: true }
    );
    const w = dom.window;
    w.__rjQueue = [];
    w.requestAnimationFrame = (fn) => { w.__rjQueue.push(fn); return w.__rjQueue.length; };
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
    Object.defineProperty(w.navigator, 'connection', { value: options.saveData ? { saveData: true } : { saveData: false }, configurable: true });
    Object.defineProperty(w.navigator, 'deviceMemory', { value: options.memory || 8, configurable: true });
    Object.defineProperty(w.navigator, 'hardwareConcurrency', { value: options.cores || 8, configurable: true });
    if (options.stored) w.localStorage.setItem('rj_potato', options.stored);
    w.eval(potato);
    return w;
  }

  // 1. Auto: równe 60 fps nie może włączać trybu.
  let w = boot({});
  pump(w, 9000, 20000, 16);
  assert.equal(w.document.documentElement.classList.contains('rj-potato'), false, 'płynna strona nie może wchodzić w tryb ziemniaka');
  assert.equal(w.RJPotato.status().on, false);
  w.close();

  // 2. Auto: 25 fps przez dwa okna pomiarowe włącza tryb i pokazuje pigułkę.
  w = boot({});
  pump(w, 9000, 15000, 40);
  const html = w.document.documentElement;
  assert.equal(html.classList.contains('rj-potato'), true, 'spadki klatek muszą włączyć tryb ziemniaka');
  assert.equal(html.getAttribute('data-potato'), 'auto');
  assert.equal(html.getAttribute('data-potato-on'), '1');
  assert.equal(w.RJPotato.status().reason, 'fps');
  const note = w.document.getElementById('rj-potato-note');
  assert.ok(note && !note.hidden, 'użytkownik musi wiedzieć, że tryb się włączył');
  assert.equal(w.localStorage.getItem('rj_potato'), null, 'automat nie zapisuje wyboru za użytkownika');
  const sw = w.document.querySelector('[data-switch="potato"]');
  assert.equal(sw.getAttribute('aria-pressed'), 'true', 'przełącznik w wyspie musi pokazywać stan');
  assert.match(sw.querySelector('[data-potato-state]').textContent, /spadki płynności/);
  w.close();

  // 3. Zapisane „włączony” działa od pierwszego malowania.
  w = boot({ stored: 'on' });
  assert.equal(w.document.documentElement.classList.contains('rj-potato'), true);
  assert.equal(w.RJPotato.status().mode, 'on');
  assert.equal(w.__rjQueue.length, 0, 'ręcznie włączony tryb nie potrzebuje pomiaru klatek');
  w.close();

  // 4. Zapisane „wyłączony” wygrywa z automatem, dopóki użytkownik nie zmieni zdania.
  w = boot({ stored: 'off', saveData: true });
  assert.equal(w.document.documentElement.classList.contains('rj-potato'), false, 'ręczne wyłączenie musi wygrać z automatem');
  assert.equal(w.RJPotato.toggle(), 'on');
  assert.equal(w.document.documentElement.classList.contains('rj-potato'), true);
  assert.equal(w.localStorage.getItem('rj_potato'), 'on');
  assert.equal(w.RJPotato.toggle(), 'off');
  assert.equal(w.document.documentElement.classList.contains('rj-potato'), false);
  assert.equal(w.localStorage.getItem('rj_potato'), 'off');
  w.close();

  // 5. Słabe urządzenie (save-data) — tryb od razu, bez czekania na klatki.
  w = boot({ saveData: true });
  assert.equal(w.document.documentElement.classList.contains('rj-potato'), true);
  assert.equal(w.RJPotato.status().reason, 'save-data');
  w.close();

  // 6. Powrót do automatu zdejmuje klasę, gdy urządzenie jest w porządku.
  w = boot({ stored: 'on' });
  w.RJPotato.set('auto');
  assert.equal(w.document.documentElement.classList.contains('rj-potato'), false);
  assert.equal(w.RJPotato.status().mode, 'auto');
  pump(w, 9000, 15000, 40);
  assert.equal(w.document.documentElement.classList.contains('rj-potato'), true, 'po powrocie do automatu pomiar musi znowu działać');
  w.close();

  console.log('PASS: tryb ziemniaka — auto po spadkach FPS, ręczny wybór, słabe urządzenia, wyspa i CSS');
})().catch((e) => { console.error(e); process.exitCode = 1; });

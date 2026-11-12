/* Odblokowanie ruchu: animacje nie mogą zależeć od ustawień systemu. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/motion-unlock.js'), 'utf8');
const css = '<style>'
  + '@media (prefers-reduced-motion: reduce){ .card{animation:none!important} }'
  + '@media (min-width: 600px){ .card{color:red} }'
  + '</style>';

/* jsdom nie ma matchMedia — podstawiamy listę, która UDAJE ustawienie systemowe
   „ograniczony ruch”. Skrypt ma je nadpisać na false. */
function fakeMatchMedia(query) {
  const list = {
    media: query,
    matches: query.includes('prefers-reduced-motion'),
    onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }
  };
  return list;
}

function build(url = 'https://example.org/', html = '') {
  const dom = new JSDOM('<!doctype html><html><head>' + css + '</head><body>' + html + '</body></html>', {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  dom.window.matchMedia = fakeMatchMedia;
  return dom;
}

function mediaTexts(window) {
  const sheet = window.document.styleSheets[0];
  return Array.from(sheet.cssRules).map((rule) => rule.media ? rule.media.mediaText : '');
}

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (error) { console.log('  ✘ ' + name + '  [' + error.message + ']'); fail++; }
}

console.log('\n=== A. REGUŁY prefers-reduced-motion SĄ WYŁĄCZANE ===');
{
  const dom = build();
  const w = dom.window;
  w.eval(source);
  const texts = mediaTexts(w);
  check('blokada ruchu zamieniona na „not all”', () => assert.equal(texts[0], 'not all'));
  check('inne media bez zmian', () => assert.match(texts[1], /min-width/));
  check('strona oznaczona jako odblokowana',
    () => assert.equal(w.document.documentElement.getAttribute('data-motion-force'), 'on'));
  check('status zgłasza „on”', () => assert.equal(w.RejMotion.status(), 'on'));
  dom.window.close();
}

console.log('\n=== B. matchMedia NIE ZGŁASZA OGRANICZONEGO RUCHU ===');
{
  const dom = build();
  const w = dom.window;
  check('przed skryptem system zgłasza ograniczony ruch',
    () => assert.equal(w.matchMedia('(prefers-reduced-motion: reduce)').matches, true));
  w.eval(source);
  check('po skrypcie to samo zapytanie zwraca false',
    () => assert.equal(w.matchMedia('(prefers-reduced-motion: reduce)').matches, false));
  check('pozostałe zapytania oddają prawdziwą odpowiedź',
    () => assert.equal(w.matchMedia('(prefers-reduced-motion: reduce) and (min-width: 1px)').matches, false));
  dom.window.close();
}

console.log('\n=== C. ŚWIADOME WYŁĄCZENIE ===');
{
  const dom = build('https://example.org/?motion=off');
  const w = dom.window;
  w.eval(source);
  check('?motion=off zostawia reguły w spokoju',
    () => assert.match(mediaTexts(w)[0], /prefers-reduced-motion/));
  check('status zgłasza „off”', () => assert.equal(w.RejMotion.status(), 'off'));
  check('brak znacznika na <html>',
    () => assert.equal(w.document.documentElement.getAttribute('data-motion-force'), null));
  dom.window.close();
}

console.log('\n=== D. PRZYWRÓCENIE I PONOWNE WŁĄCZENIE ===');
{
  const dom = build();
  const w = dom.window;
  w.eval(source);
  w.RejMotion.off();
  check('off() przywraca media',
    () => assert.match(mediaTexts(w)[0], /prefers-reduced-motion/));
  check('off() zapisuje wybór w przeglądarce',
    () => assert.equal(w.localStorage.getItem('rejhub_motion'), 'off'));
  w.RejMotion.on();
  check('on() znowu wyłącza blokadę', () => assert.equal(mediaTexts(w)[0], 'not all'));
  dom.window.close();
}

console.log('\n=== E. STRONA MOŻE SAMA ZREZYGNOWAĆ ===');
{
  const dom = build();
  const w = dom.window;
  w.document.documentElement.setAttribute('data-motion-lock', '');
  w.eval(source);
  check('data-motion-lock blokuje odblokowanie',
    () => assert.match(mediaTexts(w)[0], /prefers-reduced-motion/));
  dom.window.close();
}

console.log('\n=== F. SKRYPT JEST NA KAŻDEJ STRONIE, PRZED INNYMI ===');
{
  /* Strony przeniesienia nie są witryną — to jednorazowe przekierowania. */
  const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'))
    .filter((file) => !fs.readFileSync(path.join(root, file), 'utf8').includes('data-przeniesienie'));
  const hub = fs.readdirSync(path.join(root, 'rejhub2')).filter((file) => file.endsWith('.html'))
    .map((file) => path.join('rejhub2', file));
  const all = pages.concat(hub);
  const missing = [];
  for (const file of all) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const at = html.indexOf('<script src="/js/motion-unlock.js?v=1"></script>');
    if (at === -1) { missing.push(file); continue; }
    /* Musi być zwykłym skryptem (bez defer) i stać przed każdym odroczonym. */
    const firstDefer = html.search(/<script[^>]*defer/);
    if (firstDefer !== -1 && at > firstDefer) missing.push(file + ' (za późno)');
  }
  check('wszystkie strony mają skrypt (' + all.length + ' plików)', () => assert.deepEqual(missing, []));
  check('stare /testy nie wróciło', () => assert.equal(fs.existsSync(path.join(root, 'testy.html')), false));
  check('studio jest w RejHubie', () => assert.ok(fs.existsSync(path.join(root, 'rejhub2/szklane-studio.html'))));
}

console.log('\n' + '='.repeat(56));
console.log('WYNIK: ' + pass + '/' + (pass + fail) + (fail ? ' ✘' : ' ✔'));
if (fail) process.exitCode = 1;

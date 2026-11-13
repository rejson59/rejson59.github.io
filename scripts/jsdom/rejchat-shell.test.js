/* RejChat: okno aplikacji ma skończoną wysokość na KAŻDEJ szerokości.

   Zgłoszenie z 12.11.2026: „czat nie dopasowuje się do ekranu, jest
   nieskończony”. Przyczyna była w CSS: `@media (min-width: 861px)` ustawiało
   `.comm-layout { height: auto; flex: 1 1 auto }`, a rodzic miał tylko
   `min-height` — siatka rosła razem z treścią, lista nie dostawała własnego
   przewijania i strona wydłużała się z każdą wiadomością.

   Ten test pilnuje trzech rzeczy:
   1. żaden arkusz czatu nie ustawia już `height: auto` na `.comm-layout`,
   2. nowa powłoka wymusza zmierzoną wysokość i wewnętrzne przewijanie,
   3. `chat-viewport.js` naprawdę liczy wysokość (symulacja w jsdom:
      komputer, telefon z wyspą, strona przewinięta). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const SHELL = read('css/rejchat-shell.css');
const HTML = read('rejhub2/rejchat.html');
const SCRIPT = read('js/chat-viewport.js');

/* ---------------------------------------- 1. żadnego `height: auto` w tafli --- */

const sheets = fs.readdirSync(path.join(root, 'css')).filter((f) => /^rejchat.*\.css$/.test(f));
const offenders = [];
for (const file of sheets) {
  const css = read('css/' + file).replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = css.match(/\.comm-layout\s*\{[^}]*\}/g) || [];
  for (const block of blocks) {
    if (/height:\s*auto\s*!important/.test(block)) offenders.push(file + ' → ' + block.replace(/\s+/g, ' ').slice(0, 80));
  }
}
assert.deepEqual(offenders, [], 'tafla nie może rosnąć z treścią: ' + offenders.join(' | '));

/* --------------------------------------------------- 2. kontrakt powłoki --- */

const layout = SHELL.slice(SHELL.indexOf('body.rj-community .comm-layout {'), SHELL.indexOf('}', SHELL.indexOf('body.rj-community .comm-layout {')) + 1);
assert.match(layout, /height: var\(--rj-chat-h\) !important;/);
assert.match(layout, /max-height: var\(--rj-chat-h\) !important;/);
assert.match(layout, /min-height: 0 !important;/);
assert.match(layout, /flex: 0 0 auto !important;/);
assert.match(layout, /grid-template-rows: minmax\(0, 1fr\) !important;/);
assert.match(layout, /overflow: hidden !important;/);
assert.match(SHELL, /body\.rj-community \.comm-main \{\n  min-height: 0 !important;/, 'main nie może wypychać stopki poza ekran');

const listRule = SHELL.slice(SHELL.indexOf('body.rj-community #chat-public-view > #chat-list,'), SHELL.indexOf('}', SHELL.indexOf('body.rj-community #chat-public-view > #chat-list,')) + 1);
assert.match(listRule, /flex: 1 1 0 !important;/, 'lista zajmuje resztę wysokości');
assert.match(listRule, /min-height: 0 !important;/, 'lista może się skurczyć');
assert.match(listRule, /overflow-y: auto !important;/, 'lista przewija się sama');

const sticky = SHELL.slice(SHELL.indexOf('body.rj-community .comm-chat-head,'), SHELL.indexOf('}', SHELL.indexOf('body.rj-community .comm-chat-head,')) + 1);
assert.match(sticky, /flex: 0 0 auto !important;/, 'nagłówek i pole pisania stoją w miejscu');

/* Kolejność: powłoka musi być po starych warstwach, inaczej znów przegra. */
const posMessenger = HTML.indexOf('rejchat-messenger.css');
const posViewport = HTML.indexOf('rejchat-viewport.css');
const posShell = HTML.indexOf('rejchat-shell.css');
assert.ok(posShell > posMessenger && posShell > posViewport, 'rejchat-shell.css musi ładować się po starych warstwach');
assert.ok(/chat-viewport\.js\?v=2/.test(HTML), 'skrypt wymiarów w nowej wersji');
assert.ok(/rejchat-messenger\.css\?v=16/.test(HTML), 'arkusz Messengera w nowej wersji');

/* ------------------------------------- 3. pomiar wysokości w prawdziwym JS --- */

function measureWith({ viewport, top, footer, island, scrolled }) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="comm-layout"><div id="chat-list"></div></div>
    <footer class="site-footer"></footer>
    <div id="rj-island"></div>
  </body></html>`, { url: 'https://rejhub.vercel.app/rejchat', runScripts: 'outside-only', pretendToBeVisual: true });

  const w = dom.window;
  Object.defineProperty(w, 'innerHeight', { value: viewport, configurable: true });
  Object.defineProperty(w, 'pageYOffset', { value: scrolled || 0, configurable: true });

  const layoutEl = w.document.querySelector('.comm-layout');
  layoutEl.getBoundingClientRect = () => ({ top: top - (scrolled || 0), bottom: top, height: 500, left: 0, right: 900, width: 900 });

  const footerEl = w.document.querySelector('.site-footer');
  footerEl.getBoundingClientRect = () => ({ top: 0, bottom: footer, height: footer, left: 0, right: 900, width: 900 });
  if (!footer) footerEl.style.display = 'none';

  const islandEl = w.document.querySelector('#rj-island');
  islandEl.getBoundingClientRect = () => ({ top: viewport - island, bottom: viewport, height: island, left: 0, right: 100, width: 100 });
  if (!island) islandEl.style.display = 'none';

  w.eval(SCRIPT);
  const value = w.RJChatViewport.fit();
  const css = w.document.documentElement.style.getPropertyValue('--rj-chat-h');
  const legacy = w.document.documentElement.style.getPropertyValue('--rj-chat-fit');
  w.close();
  return { value, css, legacy };
}

/* Komputer 1440×900: tafla zaczyna się 150 px od góry, stopka ma 90 px. */
{
  const r = measureWith({ viewport: 900, top: 150, footer: 90, island: 0 });
  assert.equal(r.value, 900 - 150 - 90 - 10, 'wysokość = ekran − góra tafli − stopka − odstęp');
  assert.equal(r.css, r.value + 'px', 'wynik trafia do CSS');
  assert.equal(r.legacy, r.value + 'px', 'stara zmienna też jest ustawiona');
}

/* Telefon 390×844: stopka ukryta, wyspa 80 px, bez przewinięcia. */
{
  const r = measureWith({ viewport: 844, top: 120, footer: 0, island: 80 });
  assert.equal(r.value, 844 - 120 - 80 - 10, 'wyspa jest odjęta od dołu');
}

/* Strona przewinięta o 400 px — pomiar nie może „uciekać”. */
{
  const a = measureWith({ viewport: 900, top: 150, footer: 90, island: 0, scrolled: 0 });
  const b = measureWith({ viewport: 900, top: 150, footer: 90, island: 0, scrolled: 400 });
  assert.equal(a.value, b.value, 'przewinięcie strony nie zmienia wysokości tafli');
}

/* Skrajności: bardzo niski ekran nie łamie układu, bardzo wysoki nie robi studni. */
{
  const low = measureWith({ viewport: 420, top: 300, footer: 0, island: 0 });
  assert.equal(low.value, 300, 'minimum 300 px');
  const high = measureWith({ viewport: 2400, top: 150, footer: 0, island: 0 });
  assert.equal(high.value, 1120, 'maksimum 1120 px');
}

console.log('PASS: RejChat ma zmierzoną wysokość na każdej szerokości, lista przewija się wewnątrz tafli');

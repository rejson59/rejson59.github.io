/* RejChat: dymki bez pustki i bez nachodzącego tekstu + lista online, która
   naprawdę się odświeża.

   Co było zepsute (zgłoszenie z 12.11.2026, zrzut /rejchat):
   - `.chat-meta` miało `display: contents`, więc nazwa i godzina były
     absolutnie nad dymkiem (`top: -17px`) i nachodziły na siebie przy krótkich
     wiadomościach („Rober…” + „…temu”),
   - ukryty przycisk ✉ (`.chat-private-start`) zostawał w przepływie dymka
     i brał `min-width: 32px` z warstwy rejchat.css — każdy dymek rósł o dwa
     wiersze pustki nad treścią,
   - `.chat-bubble` miał `margin-top: 16px` na nazwę, która i tak była absolutna,
     więc między wiadomościami zostawało ~70 px pustki,
   - panel tłumaczenia był drugą obramowaną kartą w dymku z wielkim podpisem,
   - panel „Zalogowani teraz online” odświeżał się tylko razem z zakładką
     „Wpisy”, więc na „Czacie” zostawał na stanie z chwili otwarcia (często
     pustym, zanim ktokolwiek zdążył zgłosić obecność).

   Ten test pilnuje układu (CSS), miejsca reakcji (JS) i zegara online (JS). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const CHAT_CSS = read('css/rejchat-messenger.css');
const TR_CSS = read('css/rejchat-translate.css');
const COMMUNITY = read('js/community.js');
const HTML = read('rejhub2/rejchat.html');

function block(css, selector) {
  const start = css.indexOf(selector + ' {');
  assert.ok(start !== -1, 'brak reguły ' + selector);
  return css.slice(start, css.indexOf('}', start) + 1);
}

/* ------------------------------------------------------------- dymki --- */

const bubble = block(CHAT_CSS, 'body.rj-community .chat-bubble');
assert.match(bubble, /margin: 0 !important;/, 'dymek nie rezerwuje już 16 px na nazwę');
assert.match(bubble, /display: flex !important;/, 'dymek układa treść w kolumnie');

const meta = block(CHAT_CSS, 'body.rj-community .chat-meta');
assert.match(meta, /display: flex !important;/, 'nazwa i godzina to zwykły wiersz');
assert.ok(!/display: contents/.test(meta), 'meta nie może być „przezroczysta” dla układu');

const author = block(CHAT_CSS, 'body.rj-community .chat-author,\nbody.rj-community .chat-meta > strong');
assert.match(author, /position: static !important;/, 'nazwa nie wisi absolutnie nad dymkiem');
assert.match(author, /text-overflow: ellipsis !important;/, 'długa nazwa jest ucinana wielokropkiem');

const time = block(CHAT_CSS, 'body.rj-community .chat-time');
assert.match(time, /position: static !important;/, 'godzina jest w tym samym wierszu co nazwa');
assert.match(time, /margin-left: auto !important;/, 'godzina trzyma się prawej krawędzi dymka');

const privateStart = block(CHAT_CSS, 'body.rj-community .chat-private-start');
assert.match(privateStart, /position: absolute !important;/, '✉ nie zajmuje miejsca w dymku');
assert.match(privateStart, /min-width: 20px !important;/, '✉ nie dziedziczy 32 px z rejchat.css');

const grouped = block(CHAT_CSS, 'body.rj-community .chat-msg.is-grouped .chat-meta');
assert.match(grouped, /display: contents !important;/, 'w grupie wiersz podpisu nie zajmuje miejsca');
assert.match(CHAT_CSS, /\.chat-msg\.is-grouped \.chat-author,[\s\S]{0,200}display: none !important;/, 'w grupie nazwa i godzina znikają');
assert.match(CHAT_CSS, /\.chat-msg\.is-grouped \.chat-bubble \{\n  margin-top: 0 !important;/, 'grupa nie dokłada odstępu');

const list = block(CHAT_CSS, 'body.rj-community .comm-chat-list');
assert.match(list, /padding: 14px 20px 16px !important;/, 'ostatnia wiadomość nie chowa się pod kompozytorem');

/* ------------------------------------------------------- tłumaczenia --- */

const panel = block(TR_CSS, 'body.rj-community .rj-tr-panel');
assert.match(panel, /border: 0;/, 'tłumaczenie nie jest drugą kartą w dymku');
assert.match(panel, /background: none;/, 'tłumaczenie nie ma własnego tła');
assert.match(panel, /order: 1;/, 'tłumaczenie stoi w miejscu treści wiadomości');

const note = block(TR_CSS, 'body.rj-community .rj-tr-note');
assert.match(note, /text-transform: none;/, 'podpis nie krzyczy wersalikami');

/* --------------------------------------------- reakcje w dymku, nie w nagłówku --- */

const messageUi = read('js/rejchat-message-ui.js');
assert.ok(!/meta\.insertBefore\(summary/.test(messageUi), 'podsumowanie reakcji nie trafia do nagłówka');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="chat-list">
    <div class="chat-msg" data-chat-id="m1">
      <div class="chat-bubble">
        <div class="chat-meta"><span class="chat-author">Tester</span><span class="chat-time">teraz</span>
          <details class="rc-message-menu"><summary>⋯</summary><div class="rc-menu-items"></div></details>
        </div>
        <p class="chat-text">Hmmm</p>
      </div>
    </div>
  </div>
</body></html>`, { url: 'https://rejhub.vercel.app/rejchat', runScripts: 'outside-only' });

const w = dom.window;
w.eval(messageUi);
const bubbleEl = w.document.querySelector('.chat-bubble');
w.RJChatMessageUI.reactions(bubbleEl, [{ emoji: '👍', count: 2, mine: true }], 'public', true);

const summary = bubbleEl.querySelector('.rc-reaction-summary');
assert.ok(summary, 'podsumowanie reakcji powstaje');
assert.equal(bubbleEl.querySelector('.chat-meta .rc-reaction-summary'), null, 'reakcje nie wchodzą do wiersza nazwy');
assert.equal(summary.children.length, 1, 'jedna reakcja = jeden policzony przycisk');
assert.equal(summary.textContent.trim(), '👍 2');
w.close();

/* ------------------------------------------------------ lista online --- */

assert.match(COMMUNITY, /window\.RJNet\.every\("rejchat-online", 30000, loadOnline\);/,
  'lista online ma własny zegar, niezależny od zakładki „Wpisy”');
const initBlock = COMMUNITY.slice(COMMUNITY.indexOf('primeOnlineFromCache();'));
assert.match(initBlock.slice(0, 900), /loadOnline\(\);/, 'lista online startuje od razu po wejściu');
assert.match(COMMUNITY, /chatGeneration\+\+; requestChat\(true\); loadOnline\(\);/, 'po zalogowaniu lista odświeża się natychmiast');

assert.ok(HTML.includes('rejchat-messenger.css?v=15'), 'arkusz dymków z nowym ?v=');
assert.ok(HTML.includes('rejchat-translate.css?v=3'), 'arkusz tłumaczeń z nowym ?v=');
assert.ok(HTML.includes('rejchat-message-ui.js?v=4'), 'skrypt reakcji z nowym ?v=');
assert.ok(HTML.includes('rejchat-translate.js?v=3'), 'skrypt tłumaczeń z nowym ?v=');

console.log('PASS: dymki bez pustki i nakładek, tłumaczenie jak zwykły tekst, lista online odświeżana w tle');

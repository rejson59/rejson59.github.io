/* Tłumaczenie wiadomości RejChat: wykrywanie języka, przycisk przy obcej
   wiadomości, panel z tłumaczeniem i podpis „tłumaczenie automatyczne”.
   Test nie dotyka sieci — MyMemory jest zamockowane. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('rejhub2/rejchat.html');
assert.ok(/\/js\/rejchat-translate\.js\?v=1/.test(html), 'skrypt tłumaczenia jest podpięty');
assert.ok(/\/css\/rejchat-translate\.css\?v=1/.test(html), 'arkusz tłumaczenia jest podpięty');
console.log('  ✔ skrypt i arkusz tłumaczenia w RejChat');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="chat-list">
    <div class="chat-msg" data-chat-id="m1"><div class="chat-bubble">
      <p class="chat-text">Hello there, how are you doing today?</p>
    </div></div>
    <div class="chat-msg" data-chat-id="m2"><div class="chat-bubble">
      <p class="chat-text">Cześć, jak się masz dzisiaj?</p>
    </div></div>
  </div>
  <textarea id="chat-input"></textarea>
  <p class="chat-length" id="chat-length"><span id="chat-length-text">0 / 2000 znaków</span></p>
</body></html>`, { url: 'https://rejhub.vercel.app/rejchat', runScripts: 'outside-only' });
const w = dom.window;

let calls = 0;
w.fetch = (url) => {
  calls += 1;
  assert.match(String(url), /api\.mymemory\.translated\.net/);
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ responseStatus: 200, responseData: { translatedText: 'Cześć, jak leci dzisiaj?' } })
  });
};

w.eval(read('js/rejchat-translate.js'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

const api = w.RJChatTranslate;
assert.ok(api, 'moduł wystawia API');
assert.equal(api.detect('Hello there, how are you doing today?').code, 'en', 'wykrywa angielski');
assert.equal(api.detect('Cześć, jak się masz dzisiaj?').code, 'pl', 'wykrywa polski');
assert.equal(api.detect('Привіт, як справи?').code, 'uk', 'wykrywa ukraiński');
console.log('  ✔ wykrywanie języka (en / pl / uk)');

const foreign = w.document.querySelector('[data-chat-id="m1"]');
const polish = w.document.querySelector('[data-chat-id="m2"]');
assert.ok(foreign.querySelector('.rj-tr-btn'), 'przycisk przy obcej wiadomości');
assert.equal(polish.querySelector('.rj-tr-btn'), null, 'brak przycisku przy polskiej wiadomości');
assert.ok(w.document.querySelector('#chat-length .rj-tr-draft'), 'tłumacz szkicu w linii licznika');
console.log('  ✔ przycisk tylko przy obcej wiadomości + tłumacz szkicu');

foreign.querySelector('.rj-tr-btn').click();
setTimeout(() => {
  try {
    const panel = foreign.querySelector('.rj-tr-panel');
    assert.ok(panel, 'panel tłumaczenia się pojawia');
    assert.equal(panel.querySelector('.rj-tr-text').textContent, 'Cześć, jak leci dzisiaj?');
    assert.match(panel.querySelector('.rj-tr-note').textContent, /tłumaczenie automatyczne/i);
    assert.ok(foreign.querySelector('.chat-text').classList.contains('rj-tr-original-hidden'), 'oryginał schowany');
    assert.equal(calls, 1, 'jedno zapytanie do tłumacza');
    panel.querySelector('.rj-tr-toggle').click();
    assert.ok(panel.classList.contains('is-original'), '„Pokaż oryginał” przełącza widok');
    assert.ok(!foreign.querySelector('.chat-text').classList.contains('rj-tr-original-hidden'));
    console.log('  ✔ tłumaczenie, podpis i powrót do oryginału');
    console.log('\nPASS: tłumaczenie wiadomości RejChat');
  } finally {
    w.close();
  }
}, 60);

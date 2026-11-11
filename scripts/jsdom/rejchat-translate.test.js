/* Tłumaczenie wiadomości RejChat: wykrywanie języka, AUTOMATYCZNE tłumaczenie
   obcej wiadomości, panel z podpisem „tłumaczenie automatyczne” i powrót do
   oryginału. Test nie dotyka sieci — MyMemory i filtr treści są zamockowane. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('rejhub2/rejchat.html');
assert.ok(/\/js\/rejchat-translate\.js\?v=2/.test(html), 'skrypt tłumaczenia jest podpięty');
assert.ok(/\/css\/rejchat-translate\.css\?v=2/.test(html), 'arkusz tłumaczenia jest podpięty');
console.log('  ✔ skrypt i arkusz tłumaczenia w RejChat');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="chat-list">
    <div class="chat-msg" data-chat-id="m1"><div class="chat-bubble">
      <p class="chat-text">Hello there, how are you doing today?</p>
    </div></div>
    <div class="chat-msg" data-chat-id="m2"><div class="chat-bubble">
      <p class="chat-text">Cześć, jak się masz dzisiaj?</p>
    </div></div>
    <div class="chat-msg is-mine" data-chat-id="m3"><div class="chat-bubble">
      <p class="chat-text">I wrote this message myself, thanks</p>
    </div></div>
  </div>
  <header class="comm-chat-head"><div class="rc-room-actions">
    <button type="button" class="rc-search-toggle">Szukaj</button>
  </div></header>
  <form id="chat-form"><textarea id="chat-input"></textarea>
    <div class="rc-compose-tools"><button type="submit" id="chat-send">Wyślij</button></div>
  </form>
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
w.RejTextFilter = { check: () => Promise.resolve({ ok: true, matches: [] }) };

w.eval(read('js/rejchat-translate.js'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

const api = w.RJChatTranslate;
assert.ok(api, 'moduł wystawia API');
assert.equal(api.detect('Hello there, how are you doing today?').code, 'en', 'wykrywa angielski');
assert.equal(api.detect('Cześć, jak się masz dzisiaj?').code, 'pl', 'wykrywa polski');
assert.equal(api.detect('Привіт, як справи?').code, 'uk', 'wykrywa ukraiński');
assert.equal(api.detect('こんにちは、元気ですか').code, 'ja', 'wykrywa japoński po piśmie');
assert.equal(api.foreign('Cześć, jak się masz?'), null, 'polski nie jest obcy');
console.log('  ✔ wykrywanie języka (en / pl / uk / ja)');

const foreign = w.document.querySelector('[data-chat-id="m1"]');
const polish = w.document.querySelector('[data-chat-id="m2"]');
const own = w.document.querySelector('[data-chat-id="m3"]');
const autoButton = w.document.querySelector('.rc-room-actions .rj-tr-auto');
assert.ok(autoButton, 'przełącznik automatu w nagłówku pokoju');
assert.equal(autoButton.getAttribute('aria-pressed'), 'true', 'automat włączony domyślnie');
assert.ok(w.document.querySelector('#chat-form .rc-compose-tools .rj-tr-draft'), 'tłumacz szkicu w pasku narzędzi');
console.log('  ✔ przełącznik automatu + tłumacz szkicu');

setTimeout(() => {
  try {
    const panel = foreign.querySelector('.rj-tr-panel');
    assert.ok(panel, 'tłumaczenie pojawia się BEZ klikania');
    assert.equal(panel.querySelector('.rj-tr-text').textContent, 'Cześć, jak leci dzisiaj?');
    assert.match(panel.querySelector('.rj-tr-note').textContent, /tłumaczenie automatyczne/i);
    assert.ok(foreign.querySelector('.chat-text').classList.contains('rj-tr-original-hidden'), 'oryginał schowany');
    assert.equal(calls, 1, 'jedno zapytanie do tłumacza');

    assert.equal(polish.querySelector('.rj-tr-panel'), null, 'polskiej wiadomości nie tłumaczymy');
    assert.equal(polish.querySelector('.rj-tr-btn'), null, 'brak przycisku przy polskiej wiadomości');
    assert.equal(own.querySelector('.rj-tr-panel'), null, 'własnej wiadomości nie tłumaczymy');
    assert.equal(own.querySelector('.rj-tr-btn'), null, 'brak przycisku przy własnej wiadomości');

    panel.querySelector('.rj-tr-toggle').click();
    assert.ok(panel.classList.contains('is-original'), '„Pokaż oryginał” przełącza widok');
    assert.ok(!foreign.querySelector('.chat-text').classList.contains('rj-tr-original-hidden'));
    assert.match(panel.querySelector('.rj-tr-toggle').textContent, /Pokaż tłumaczenie/);
    assert.ok(JSON.parse(w.localStorage.getItem('rejchat_translate_off_v1')).includes('m1'), 'wybór oryginału pamiętany');

    autoButton.click();
    assert.equal(autoButton.getAttribute('aria-pressed'), 'false', 'automat można wyłączyć');
    assert.equal(w.localStorage.getItem('rejchat_translate_auto_v1'), '0', 'wybór automatu pamiętany');
    console.log('  ✔ automatyczne tłumaczenie, podpis, powrót do oryginału, wyłącznik');
    console.log('\nPASS: tłumaczenie wiadomości RejChat');
  } finally {
    w.close();
  }
}, 120);

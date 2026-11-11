/* Przetłumaczona treść przechodzi przez TEN SAM filtr słów co tekst wpisywany.
   Sprawdzamy trzy sytuacje:
   - filtr wskazuje frazę, którą da się zamaskować → pokazujemy tłumaczenie z „•••”,
   - filtr blokuje tłumaczenie, którego nie da się oczyścić → nie pokazujemy go,
   - wpis z pamięci podręcznej jest sprawdzany ponownie (lista słów mogła się
     zmienić) i nie zostaje w pamięci, jeśli jest niedozwolony.
   Test nie dotyka sieci — tłumacz i filtr są zamockowane. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const SOURCE = read('js/rejchat-translate.js');
const REPLY = 'Cześć przyjaciele, jak się macie dzisiaj?';

function boot(options) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="chat-list">
      <div class="chat-msg" data-chat-id="m1"><div class="chat-bubble">
        <p class="chat-text">Hello my friends, how are you today?</p>
      </div></div>
    </div>
    <form id="chat-form"><textarea id="chat-input"></textarea>
      <div class="rc-compose-tools"><button type="submit" id="chat-send">Wyślij</button></div>
    </form>
    <p class="chat-length" id="chat-length"><span id="chat-length-text">0 / 2000 znaków</span></p>
  </body></html>`, { url: 'https://rejhub.vercel.app/rejchat', runScripts: 'outside-only' });
  const w = dom.window;
  const calls = { translate: 0, filter: [] };

  w.fetch = (url) => {
    calls.translate += 1;
    assert.match(String(url), /api\.mymemory\.translated\.net/);
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ responseStatus: 200, responseData: { translatedText: options.reply || REPLY } })
    });
  };
  w.RejTextFilter = {
    check: (text) => {
      calls.filter.push(text);
      return Promise.resolve(options.filter(text));
    }
  };
  if (options.cache) w.localStorage.setItem('rejchat_translate_cache_v2', JSON.stringify(options.cache));
  if (options.auto === false) w.localStorage.setItem('rejchat_translate_auto_v1', '0');
  w.eval(SOURCE);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, calls };
}

/* --- 1. filtr wskazuje frazę → maskujemy ją i pokazujemy resztę ---------- */

const masked = boot({
  reply: 'Cześć przyjaciele, cholera jasna',
  filter: (text) => (text.indexOf('cholera') !== -1
    ? { ok: false, matches: ['cholera'] }
    : { ok: true, matches: [] })
});

/* --- 2. filtr blokuje coś, czego nie da się zamaskować → brak treści ----- */

const blocked = boot({
  reply: 'Cześć przyjaciele, zakazane słowo',
  filter: () => ({ ok: false, matches: ['fraza nieobecna w tekście'] })
});

/* --- 3. pamięć podręczna jest sprawdzana ponownie ---------------------- */

const CACHED_KEY = 'en|Hello my friends, how are you today?';
const stale = boot({
  cache: { [CACHED_KEY]: { ok: true, text: 'Cześć przyjaciele, zakazane słowo', masked: false } },
  filter: () => ({ ok: false, matches: ['inne słowo'] })
});

/* --- 4. automat wyłączony → ręczny przycisk ---------------------------- */

const manual = boot({
  auto: false,
  filter: () => ({ ok: true, matches: [] })
});

setTimeout(() => {
  try {
    const first = masked.w.document.querySelector('[data-chat-id="m1"]');
    const panel = first.querySelector('.rj-tr-panel');
    assert.ok(panel, 'tłumaczenie z zamaskowaną frazą jest pokazane');
    assert.match(panel.querySelector('.rj-tr-text').textContent, /•••/, 'niedozwolona fraza zamaskowana');
    assert.ok(!/cholera/i.test(panel.querySelector('.rj-tr-text').textContent), 'słowo z filtru nie wycieka');
    assert.match(panel.querySelector('.rj-tr-note').textContent, /filtr zamaskował/i);
    assert.ok(!panel.querySelector('.rj-tr-text').textContent.includes('cholera'));
    const saved = JSON.parse(masked.w.localStorage.getItem('rejchat_translate_cache_v2') || '{}');
    const savedEntry = saved['en|Hello my friends, how are you today?'];
    assert.ok(savedEntry, 'tłumaczenie trafia do pamięci');
    assert.ok(!/cholera/i.test(savedEntry.text), 'do pamięci nie trafia zabroniona fraza');
    assert.match(savedEntry.text, /•••/);
    console.log('  ✔ fraza z filtru zamaskowana, reszta tłumaczenia widoczna');

    const second = blocked.w.document.querySelector('[data-chat-id="m1"]');
    assert.equal(second.querySelector('.rj-tr-panel'), null, 'zablokowanego tłumaczenia nie pokazujemy');
    assert.equal(second.querySelector('.rj-tr-btn'), null, 'brak przycisku po blokadzie');
    const note = second.querySelector('.rj-tr-blocked');
    assert.ok(note, 'jest notka o wstrzymanym tłumaczeniu');
    assert.match(note.textContent, /filtr treści/i);
    assert.ok(!blocked.w.document.body.textContent.includes('zakazane słowo'), 'treść tłumaczenia nie trafia do DOM');
    assert.ok(blocked.calls.filter.some((text) => /zakazane/.test(text)), 'filtr dostał przetłumaczony tekst');
    console.log('  ✔ zablokowane tłumaczenie nie pojawia się wcale');

    const third = stale.w.document.querySelector('[data-chat-id="m1"]');
    assert.equal(third.querySelector('.rj-tr-panel'), null, 'nieświeży wpis z pamięci nie jest pokazany');
    assert.ok(third.querySelector('.rj-tr-blocked'), 'notka o blokadzie przy wpisie z pamięci');
    assert.ok(!stale.w.document.body.textContent.includes('zakazane słowo'), 'treść z pamięci nie wycieka');
    const left = JSON.parse(stale.w.localStorage.getItem('rejchat_translate_cache_v2') || '{}');
    assert.equal(left[CACHED_KEY], undefined, 'niedozwolony wpis usunięty z pamięci podręcznej');
    assert.ok(stale.calls.filter.length >= 1, 'wpis z pamięci sprawdzony filtrem');
    console.log('  ✔ wpis z pamięci sprawdzany ponownie i czyszczony');

    const fourth = manual.w.document.querySelector('[data-chat-id="m1"]');
    assert.equal(fourth.querySelector('.rj-tr-panel'), null, 'przy wyłączonym automacie nic się nie tłumaczy samo');
    const button = fourth.querySelector('.rj-tr-btn');
    assert.ok(button, 'zostaje ręczny przycisk');
    button.click();
    setTimeout(() => {
      try {
        assert.ok(fourth.querySelector('.rj-tr-panel'), 'ręczne tłumaczenie działa po kliknięciu');
        console.log('  ✔ wyłączony automat → ręczne tłumaczenie');
        console.log('\nPASS: filter kontroluje przetłumaczoną treść');
      } finally {
        [masked, blocked, stale, manual].forEach((item) => item.w.close());
      }
    }, 120);
  } catch (error) {
    [masked, blocked, stale, manual].forEach((item) => item.w.close());
    throw error;
  }
}, 150);

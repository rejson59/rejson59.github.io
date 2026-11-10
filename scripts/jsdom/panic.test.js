/* Szybka autodestrukcja: przycisk awaryjny + zamykanie kart RejHubu. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/panic.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/panic.css'), 'utf8');

/* jsdom nie umie nawigować — „Not implemented: navigation” to oczekiwany szum. */
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  if (!/Not implemented: navigation/.test(String(error && error.message))) console.error(error);
});
virtualConsole.on('error', (error) => console.error(error));

function makeWindow(html = '<!doctype html><html><body></body></html>', url = 'https://rejhub.vercel.app/rejfile') {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  w.__channels = [];
  class FakeChannel {
    constructor(name) {
      this.name = name;
      this.handler = null;
      w.__channels.push(this);
    }
    addEventListener(type, fn) { if (type === 'message') this.handler = fn; }
    postMessage(data) { this.sent = data; }
    close() {}
  }
  w.BroadcastChannel = FakeChannel;
  return dom;
}

function run(dom) {
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom.window;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async function main() {
  /* 1. Przycisk istnieje, jest mały i opisany. */
  {
    const w = run(makeWindow());
    const button = w.document.querySelector('[data-rj-panic]');
    assert.ok(button, 'brak przycisku autodestrukcji');
    assert.equal(button.tagName, 'BUTTON');
    assert.ok(button.getAttribute('aria-label').includes('autodestrukcja'));
    assert.ok(button.title.includes('Ctrl+Shift+X'), 'podpowiedź ma podawać skrót');
    assert.equal(w.document.querySelectorAll('[data-rj-panic]').length, 1, 'przycisk nie może się dublować');
    assert.ok(css.includes('.rj-panic'), 'brak stylu przycisku');
    /* ramka awaryjna nie może zasłaniać pigułki „powrót do RejHub” (lewy dół) */
    assert.ok(/\.rj-panic\s*\{[^}]*right:/s.test(css), 'przycisk ma stać po prawej stronie');
    assert.ok(/\.rj-panic\s*\{[^}]*width:\s*30px/s.test(css), 'przycisk ma być mały');
    assert.ok(css.includes('prefers-reduced-motion'), 'ma respektować ograniczony ruch');
  }

  /* 2. Karta zgłasza się do wspólnego rejestru kart. */
  {
    const w = run(makeWindow());
    const tabs = JSON.parse(w.localStorage.getItem('rejhub_open_tabs_v1') || '[]');
    assert.equal(tabs.length, 1, 'bieżąca karta ma być w rejestrze');
    assert.equal(tabs[0].url, '/rejfile');
  }

  /* 3. Skrót klawiszowy wysyła komunikat i domyka bieżącą kartę. */
  {
    const w = run(makeWindow());
    let closed = false;
    w.close = () => { closed = true; };
    const event = new w.KeyboardEvent('keydown', { key: 'x', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    w.document.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, 'skrót ma przechwytywać zdarzenie');
    const channel = w.__channels[0];
    assert.equal(JSON.stringify(channel.sent), '{"type":"panic"}', 'inne karty muszą dostać sygnał');
    await wait(500);
    assert.equal(closed, true, 'bieżąca karta ma zostać zamknięta');
  }

  /* 4. Komunikat z innej karty zamyka tę kartę (tamta strona nie ma przycisku). */
  {
    const w = run(makeWindow());
    let closed = false;
    w.close = () => { closed = true; };
    w.__channels[0].handler({ data: { type: 'panic' } });
    await wait(220);
    assert.equal(closed, true, 'karta ma się zamknąć po sygnale z innej karty');
  }

  /* 5. Znacznik opt-out wyłącza sam przycisk, ale nie nasłuch. */
  {
    const w = run(makeWindow('<!doctype html><html data-rj-panic-off><body></body></html>'));
    assert.equal(w.document.querySelector('[data-rj-panic]'), null, 'opt-out ma chować przycisk');
    assert.equal(w.__channels.length, 1, 'nasłuch na inne karty ma zostać');
  }

  /* 6. Każda strona RejHuba ma podpięty przycisk i styl. */
  {
    const dir = path.join(root, 'rejhub2');
    const pages = fs.readdirSync(dir).filter((file) => file.endsWith('.html'));
    assert.ok(pages.length > 10, 'brak stron RejHuba');
    pages.forEach((file) => {
      const html = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.ok(html.includes('/js/panic.js?v=1'), 'brak skryptu autodestrukcji w ' + file);
      assert.ok(html.includes('/css/panic.css?v=1'), 'brak stylu autodestrukcji w ' + file);
    });
  }

  /* 7. Studio podmienia cały dokument — brama musi wnieść przycisk do treści. */
  {
    const gate = fs.readFileSync(path.join(root, 'js/private-studio-gate.js'), 'utf8');
    assert.ok(gate.includes('/js/panic.js?v=1'), 'brama studia ma wstrzykiwać autodestrukcję');
    assert.ok(gate.includes('/css/panic.css?v=1'), 'brama studia ma wstrzykiwać styl autodestrukcji');
    const shell = fs.readFileSync(path.join(root, 'rejhub2/szklane-studio.html'), 'utf8');
    assert.ok(shell.includes('/js/private-studio-gate.js?v=4'), 'powłoka studia ma świeżą wersję bramy');
  }

  console.log('panic: wszystkie sprawdzenia przeszły');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

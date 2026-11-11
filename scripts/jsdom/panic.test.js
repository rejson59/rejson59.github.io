/* Szybka autodestrukcja: przycisk awaryjny + zamykanie kart RejHubu. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/panic.js'), 'utf8');
const islandJs = fs.readFileSync(path.join(root, 'rejhub2/hub/island.js'), 'utf8');
const islandCss = fs.readFileSync(path.join(root, 'rejhub2/hub/island.css'), 'utf8');
const hubShell = fs.readFileSync(path.join(root, 'rejhub2/hub/hub-shell.js'), 'utf8');

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
    postMessage(data) { (this.sentAll || (this.sentAll = [])).push(data); this.sent = data; }
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
  /* 1. Autodestrukcja mieszka WYŁĄCZNIE w dynamicznej wyspie. */
  {
    const w = run(makeWindow());
    assert.equal(w.document.querySelector('[data-rj-panic]'), null,
      'zwykła strona nie może już dostać pływającego przycisku w rogu');
    assert.equal(w.document.querySelector('.rj-panic'), null, 'brak kółka awaryjnego');
    assert.equal(w.document.querySelector('.rjhub-pill'), null, 'brak pigułki w rogu');
    assert.equal(fs.existsSync(path.join(root, 'css/panic.css')), false,
      'styl pływającego przycisku nie jest już potrzebny');

    /* Wyspa: przycisk w docku i potwierdzenie w panelu. */
    assert.ok(/data-open="panic"/.test(islandJs), 'dock wyspy ma wejście do autodestrukcji');
    assert.ok(/data-panic/.test(islandJs), 'panel potwierdzenia ma przycisk „Zamknij”');
    assert.ok(/RejPanic\.run/.test(islandJs), 'potwierdzenie woła prawdziwy RejPanic');
    assert.ok(/#rj-island-root \.rj-panic-actions button/.test(islandCss), 'są style potwierdzenia w wyspie');

    /* hub-shell nie dokłada już pigułki. */
    assert.equal(/\.rjhub-pill/.test(hubShell), false, 'hub-shell nie może tworzyć pigułki');
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
    await wait(900);
    const types = (channel.sentAll || []).map((item) => item.type);
    assert.ok(types.includes('ping'), 'najpierw pytamy, które karty jeszcze żyją');
    assert.ok(types.includes('panic'), 'potem inne karty dostają sygnał');
    assert.ok(types.indexOf('ping') < types.indexOf('panic'), 'ping przed sygnałem — bez tworzenia pustych okien');
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

  /* 6. Każda strona RejHuba ma logikę autodestrukcji, ale nie jej styl. */
  {
    const dir = path.join(root, 'rejhub2');
    const pages = fs.readdirSync(dir).filter((file) => file.endsWith('.html'));
    assert.ok(pages.length > 10, 'brak stron RejHuba');
    pages.forEach((file) => {
      const html = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.ok(html.includes('/js/panic.js?v=3'), 'brak skryptu autodestrukcji w ' + file);
      assert.equal(/panic\.css/.test(html), false, 'stary styl przycisku w ' + file);
      assert.equal(/class="rjhub-pill/.test(html), false, 'pigułka w ' + file);
    });
  }

  /* 7. Studio podmienia cały dokument — brama musi wnieść przycisk do treści. */
  {
    const gate = fs.readFileSync(path.join(root, 'js/private-studio-gate.js'), 'utf8');
    assert.ok(gate.includes('/js/panic.js?v=3'), 'brama studia ma wstrzykiwać autodestrukcję');
    assert.equal(/panic\.css/.test(gate), false, 'brama nie wstrzykuje już stylu przycisku');
    const shell = fs.readFileSync(path.join(root, 'rejhub2/szklane-studio.html'), 'utf8');
    assert.ok(shell.includes('/js/private-studio-gate.js?v=4'), 'powłoka studia ma świeżą wersję bramy');
  }


  /* 8. Powłoka RejHuba nie tworzy już żadnej pigułki w rogu. */
  {
    const html = '<!doctype html><html><body><header class="rj-shared-header"></header></body></html>';
    const dom = makeWindow(html);
    const w = dom.window;
    w.eval(hubShell);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    assert.equal(w.document.querySelector('.rjhub-pill'), null, 'pigułka została usunięta');
    assert.equal(w.document.querySelector('[data-rj-panic]'), null, 'brak zapasowego przycisku');
  }

  /* 9. Autodestrukcja nie otwiera nowych pustych kart (źródło starego błędu). */
  {
    assert.equal(/window\.open\(\s*""\s*,\s*tab\.id\s*\)/.test(source), false,
      'nie wolno wołać window.open("", losowe-id) — to tworzy nowe about:blank');
    assert.equal(source.includes('location.replace("about:blank")'), false,
      'koniec z przenoszeniem karty na about:blank');

    const w = run(makeWindow());
    let opened = 0;
    const originalOpen = w.open;
    w.open = (...args) => { opened += 1; return originalOpen ? originalOpen.apply(w, args) : null; };
    /* rejestr pełen już zamkniętych kart — nie mogą spowodować window.open */
    w.localStorage.setItem('rejhub_open_tabs_v1', JSON.stringify([
      { id: 'stara1', name: 'rejhub-tab-stara1', at: Date.now(), url: '/rejfile' },
      { id: 'stara2', name: 'rejhub-tab-stara2', at: Date.now(), url: '/rejchat' }
    ]));
    w.RejPanic.run();
    await wait(700);
    assert.equal(opened, 0, 'martwe karty nie mogą tworzyć nowych okien');
  }

  /* 10. Gdy przeglądarka odmawia zamknięcia, karta jest czyszczona lokalnie
         — bez zmiany adresu na about:blank. */
  {
    const dom = makeWindow('<!doctype html><html><body><main><h1>Sekret</h1></main></body></html>');
    const w = dom.window;
    const startUrl = w.location.href;
    w.close = () => {}; /* przeglądarka blokuje zamknięcie karty otwartej przez użytkownika */
    run(dom);
    w.RejPanic.run();
    await wait(1200);
    assert.equal(w.location.href, startUrl, 'adres karty nie może się zmienić');
    assert.equal(w.document.querySelector('h1'), null, 'treść strony musi zniknąć');
    assert.ok(/Karta wyłączona/.test(w.document.documentElement.textContent), 'neutralna plansza');
  }

  console.log('panic: wszystkie sprawdzenia przeszły');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

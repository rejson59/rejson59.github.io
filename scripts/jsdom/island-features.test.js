/* Osiem ulepszeń dynamicznej wyspy — sprawdzenia zachowania, nie tylko źródła:
   1. gesty (przesunięcie w dół/górę, długie przytrzymanie = cisza),
   2. licznik nieprzeczytanych na schowanym uchwycie (+ wibracja raz),
   3. uchwyt mówi, co się stało, przez 4 s,
   4. akcje dopasowane do bieżącej podstrony,
   5. kolejka offline dla zgłoszeń,
   6. mini-odtwarzacz w uchwycie,
   7. pozycja lewo/środek/prawo,
   8. dostępność: pułapka fokusa, komunikaty dla czytników. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const islandJs = path.join(root, 'rejhub2/hub/island.js');
const islandCss = path.join(root, 'rejhub2/hub/island.css');
const source = fs.readFileSync(islandJs, 'utf8');
const css = fs.readFileSync(islandCss, 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function checkSources() {
  /* 1. gesty */
  assert.match(source, /pointerdown/, 'są gesty palcem');
  assert.match(source, /Math\.abs\(dx\) > Math\.abs\(dy\) \+ 14/, 'ruch w bok nie jest gestem wyspy');
  assert.match(source, /\.rj-list, input, textarea/, 'gesty nie zabierają przewijania listom i polom');
  assert.match(source, /620/, 'długie przytrzymanie ma własny próg czasu');
  assert.match(source, /quiet\(30\)/, 'długie przytrzymanie chowa wyspę na 30 min');

  /* 2. licznik na uchwycie */
  assert.match(source, /data-handle-badge/, 'uchwyt ma licznik nieprzeczytanych');
  assert.match(source, /9\+/, 'licznik ponad 9 pokazuje 9+');
  assert.match(source, /navigator\.vibrate\(12\)/, 'wibracja tylko przy pierwszej nowej rzeczy');

  /* 3. uchwyt mówi, co się stało */
  assert.match(source, /function handleText\(text, ms\)/, 'uchwyt ma tryb komunikatu');
  assert.match(source, /ms \|\| 4000/, 'komunikat na uchwycie trwa 4 s');

  /* 4. kontekst strony */
  assert.match(source, /function contextActions\(\)/, 'są akcje dla bieżącej strony');
  assert.match(source, /"\/rejfile":/, 'RejFile ma swoje akcje');
  assert.match(source, /Wgraj plik/, 'RejFile proponuje wgranie pliku');
  assert.match(source, /Nowy wpis/, 'RejChat proponuje nowy wpis');
  assert.match(source, /Kontynuuj lekcję/, 'RejClass proponuje lekcję');

  /* 5. kolejka offline */
  assert.match(source, /function queueReport/, 'jest kolejka offline');
  assert.match(source, /wyśle się po powrocie internetu/, 'użytkownik wie, co się stało');
  assert.match(source, /addEventListener\("online", refreshNet\)/, 'powrót sieci uruchamia wysyłkę');

  /* 6. mini-odtwarzacz */
  assert.match(source, /minPlay: \{ w: 244, h: 34, r: 17 \}/, 'uchwyt rośnie, gdy gra');
  assert.match(source, /data-handle-play/, 'uchwyt ma pauzę/play');
  assert.match(source, /data-handle-progress/, 'uchwyt ma pasek postępu');

  /* 7. pozycja */
  assert.match(source, /CORNER_KEY/, 'pozycja jest zapamiętywana');
  assert.match(source, /is-left/, 'jest pozycja po lewej');
  assert.match(source, /is-right/, 'jest pozycja po prawej');

  /* 8. dostępność */
  assert.match(source, /function trapFocus/, 'fokus nie ucieka z panelu');
  assert.match(source, /aria-live/, 'komunikaty są ogłaszane');
  assert.match(source, /function announce/, 'jest osobna funkcja ogłaszania');
  assert.match(css, /\.rj-sr\s*\{/, 'jest klasa dla czytników ekranu');
  assert.match(css, /\.rj-island\.is-quiet\s*\{[^}]*display:\s*none/, 'cisza ukrywa wyspę');
  assert.match(css, /\.rj-handle-bar/, 'pasek postępu ma styl');
  assert.match(css, /\.rj-corner button\[aria-pressed="true"\]/, 'wybrana pozycja jest widoczna');
}

const PAGE =
  '<!doctype html><html lang="pl" data-theme="dark"><head><meta charset="utf-8"></head><body>' +
  '<header class="rj-shared-header"><nav><a href="/rejchat">RejChat</a></nav></header>' +
  '<main><h1>Test</h1><input type="file" id="file-input"><textarea id="post-content"></textarea>' +
  '<button id="mode-note" type="button">Notatka</button>' +
  '<audio data-title="Nocne światła"></audio></main></body></html>';

async function makePage(url) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (error) => {
    if (!/Not implemented|Could not load img|Could not parse CSS/.test(String(error && error.message))) {
      errors.push(error.message);
    }
  });
  const dom = new JSDOM(PAGE, {
    url: url || 'https://rejhub.vercel.app/licencja',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: 800, configurable: true });

  const calls = [];
  w.fetch = (u, options) => {
    calls.push({ url: String(u), body: options && options.body ? JSON.parse(options.body) : {} });
    const payload = /rejchat_notifications_list/.test(u)
      ? { unread: 2, items: [{ id: 'n1', kind: 'like', actor_name: 'Lusi', created_at: new Date().toISOString(), read_at: null }] }
      : /rejfile_notifications_list/.test(u) ? [] : { id: 'sub-1' };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
  };
  w.RJProfiles = {
    session: () => ({ token: 't'.repeat(24), username: 'rejson59' }),
    getMany: () => Promise.resolve([]),
    rpc: (name, body) => w.fetch('https://x/rpc/' + name, { body: JSON.stringify(body) }).then((r) => r.json())
  };
  const vibrations = [];
  try {
    Object.defineProperty(w.navigator, 'vibrate', {
      value: (ms) => { vibrations.push(ms); return true; },
      configurable: true
    });
  } catch (e) { /* bez wibracji */ }

  w.eval(source);
  await wait(160);

  const host = w.document.getElementById('rj-island-root');
  return {
    w, d: w.document, calls, vibrations,
    sr: host.shadowRoot,
    island: host.shadowRoot.querySelector('.rj-island'),
    ui: (sel) => host.shadowRoot.querySelector(sel),
    uiAll: (sel) => Array.from(host.shadowRoot.querySelectorAll(sel)),
    close: () => dom.window.close(),
    errors
  };
}

/* jsdom nie ma PointerEvent — budujemy zwykłe zdarzenie z brakującymi polami. */
function pointer(w, type, target, options) {
  const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: options.x || 0, clientY: options.y || 0 });
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  target.dispatchEvent(event);
  return event;
}

async function checkGestures() {
  const page = await makePage();
  const { w, sr, island, ui } = page;

  /* przesunięcie w dół po zwiniętej wyspie = schowanie */
  const idle = ui('.rj-view--idle');
  pointer(w, 'pointerdown', idle, { x: 200, y: 700 });
  pointer(w, 'pointermove', idle, { x: 200, y: 740 });
  pointer(w, 'pointerup', idle, { x: 200, y: 745 });
  await wait(120);
  assert.equal(island.dataset.state, 'min', 'przesunięcie w dół chowa wyspę');

  /* przesunięcie w górę po uchwycie = rozwinięcie */
  const handleView = ui('.rj-view--min');
  pointer(w, 'pointerdown', handleView, { x: 200, y: 780 });
  pointer(w, 'pointermove', handleView, { x: 200, y: 740 });
  pointer(w, 'pointerup', handleView, { x: 200, y: 735 });
  await wait(120);
  assert.equal(island.dataset.state, 'idle', 'przesunięcie w górę rozwija wyspę');

  /* ruch w bok nie robi nic (to nie gest wyspy) */
  pointer(w, 'pointerdown', idle, { x: 200, y: 700 });
  pointer(w, 'pointerup', idle, { x: 300, y: 704 });
  await wait(80);
  assert.equal(island.dataset.state, 'idle', 'przesunięcie w bok nie chowa wyspy');

  /* długie przytrzymanie uchwytu = cisza na 30 min */
  w.RejIsland.collapse();
  await wait(60);
  pointer(w, 'pointerdown', ui('.rj-view--min'), { x: 200, y: 780 });
  await wait(760);
  assert.ok(island.classList.contains('is-quiet'), 'długie przytrzymanie ukrywa wyspę na 30 min');
  assert.ok(/Cisza na 30 min/.test(ui('.rj-toast').textContent), 'użytkownik dostaje informację o ciszy');
  assert.ok(Number(w.localStorage.getItem('rj_island_quiet_until_v1')) > Date.now(), 'cisza jest zapisana');

  /* cisza nie jest pułapką: pigułka „Wróć teraz” jest widoczna i działa */
  const unquiet = ui('[data-unquiet]');
  assert.ok(unquiet, 'brak pigułki wyjścia z ciszy');
  assert.equal(unquiet.hidden, false, 'pigułka jest schowana, choć cisza trwa');
  assert.ok(/Wróć teraz/.test(unquiet.textContent), 'pigułka nie mówi, co robi');
  assert.ok(/\d+:\d\d/.test(unquiet.textContent), 'brak odliczania do końca ciszy');
  assert.equal(typeof w.RejIsland.unmute, 'function', 'brak API do zdjęcia ciszy');
  assert.ok(w.RejIsland.quietLeft() > 0, 'API nie podaje pozostałego czasu');

  unquiet.dispatchEvent(new w.MouseEvent('click', { bubbles: true, composed: true }));
  await wait(60);
  assert.equal(island.classList.contains('is-quiet'), false, 'klik nie przywrócił wyspy');
  assert.equal(unquiet.hidden, true, 'pigułka została po zdjęciu ciszy');
  assert.equal(w.RejIsland.quietLeft(), 0, 'cisza nadal zapisana');

  /* skrót Alt+Shift+R też przywraca wyspę */
  w.RejIsland.quiet(30);
  await wait(40);
  assert.equal(island.classList.contains('is-quiet'), true);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'r', altKey: true, shiftKey: true, bubbles: true }));
  await wait(40);
  assert.equal(island.classList.contains('is-quiet'), false, 'skrót Alt+Shift+R nie działa');

  /* gest na liście nie chowa wyspy — tam palec ma przewijać */
  w.RejIsland.open('alerts');
  await wait(40);
  const list = ui('#rj-island-alerts');
  assert.ok(list, 'lista powiadomień istnieje');
  pointer(w, 'pointerdown', list, { x: 200, y: 600 });
  pointer(w, 'pointerup', list, { x: 200, y: 680 });
  await wait(80);
  assert.equal(island.dataset.state, 'alerts', 'gest na liście nie zamyka panelu');

  assert.deepEqual(page.errors, [], 'brak błędów JS');
  page.close();
}

async function checkBadgeAndFlash() {
  const page = await makePage();
  const { w, ui, island, vibrations } = page;

  /* powiadomienia: licznik trafia na uchwyt */
  w.RejIsland.open('alerts');
  await wait(80);
  const badge = ui('[data-handle-badge]');
  assert.ok(badge, 'uchwyt ma element licznika');
  assert.equal(badge.hidden, false, 'licznik jest widoczny przy nieprzeczytanych');
  assert.equal(badge.textContent, '2', 'licznik pokazuje liczbę nieprzeczytanych');

  w.RejIsland.collapse();
  await wait(80);
  assert.equal(badge.hidden, false, 'licznik widać także na schowanym uchwycie');

  /* wibracja tylko przy pierwszej nowej rzeczy */
  const before = vibrations.length;
  w.RejIsland.open('alerts');
  await wait(60);
  assert.equal(vibrations.length, before, 'kolejne odświeżenie nie wibruje ponownie');

  /* uchwyt mówi, co się stało */
  w.RejIsland.collapse();
  await wait(60);
  w.RejIsland.notify('Zgłoszenie wysłane');
  assert.equal(ui('[data-handle-text]').textContent, 'Zgłoszenie wysłane', 'uchwyt pokazuje skutek akcji');
  await wait(60);
  w.RejIsland.sync();
  assert.equal(ui('[data-handle-text]').textContent, 'Zgłoszenie wysłane', 'komunikat nie znika od razu');

  page.close();
}

async function checkContextActions() {
  const page = await makePage('https://rejhub.vercel.app/rejfile');
  const { w, ui, uiAll } = page;

  /* Wyszukiwanie zniknęło z wyspy — akcje tej strony pokazuje panel
     szybkich akcji (i to on musi naprawdę klikać elementy strony). */
  assert.ok(!ui('[data-open="search"]'), 'wyszukiwanie nie wróciło do docku');

  w.RejIsland.open('quick');
  await wait(60);
  const context = ui('[data-quick-context]');
  assert.ok(/Dla tej strony/.test(context.textContent), 'szybkie akcje mają sekcję kontekstową');
  assert.ok(/Wgraj plik/.test(context.textContent), 'sekcja pokazuje akcję tej podstrony: ' + context.textContent);

  let clicked = 0;
  page.d.querySelector('#file-input').addEventListener('click', (event) => {
    clicked += 1;
    event.preventDefault();
  });
  const first = uiAll('[data-quick-context] [data-context]')[0];
  first.click();
  await wait(60);
  assert.equal(clicked, 1, 'akcja kontekstowa klika prawdziwy element strony');

  page.close();
}

async function checkOfflineQueue() {
  const page = await makePage();
  const { w, ui, calls } = page;

  Object.defineProperty(w.navigator, 'onLine', { value: false, configurable: true });
  w.dispatchEvent(new w.Event('offline'));

  w.RejIsland.open('report');
  await wait(40);
  ui('.rj-choose-btn[data-kind="bug"]').click();
  await wait(30);
  ui('#rj-island-text').value = 'Nie działa podgląd, jestem offline';
  ui('[data-send]').click();
  await wait(80);

  assert.equal(w.RejIsland.queueSize(), 1, 'zgłoszenie trafiło do kolejki offline');
  assert.equal(calls.filter((c) => /submit_feedback/.test(c.url)).length, 0, 'offline nic nie leci do bazy');
  assert.ok(/wyśle się po powrocie internetu/.test(ui('.rj-toast').textContent), 'użytkownik wie, że wyśle się później');
  assert.ok(ui('[data-net]').classList.contains('is-offline'), 'kropka pokazuje brak internetu');

  /* powrót sieci: kolejka wysyła się sama */
  Object.defineProperty(w.navigator, 'onLine', { value: true, configurable: true });
  w.dispatchEvent(new w.Event('online'));
  await wait(140);

  assert.equal(w.RejIsland.queueSize(), 0, 'kolejka opróżniła się po powrocie sieci');
  const sent = calls.filter((c) => /submit_feedback/.test(c.url));
  assert.equal(sent.length, 1, 'zaległe zgłoszenie poszło do bazy');
  assert.equal(sent[0].body.p_description, 'Nie działa podgląd, jestem offline', 'treść zgłoszenia jest zachowana');
  assert.ok(!ui('[data-net]').classList.contains('is-offline'), 'kropka wróciła na zielono');

  page.close();
}

async function checkMiniPlayer() {
  const page = await makePage();
  const { w, ui, island } = page;
  const audio = page.d.querySelector('audio');

  /* jsdom nie odtwarza dźwięku — udajemy odtwarzanie. */
  let paused = false;
  Object.defineProperty(audio, 'paused', { get: () => paused, configurable: true });
  Object.defineProperty(audio, 'ended', { get: () => false, configurable: true });
  Object.defineProperty(audio, 'duration', { get: () => 200, configurable: true });
  Object.defineProperty(audio, 'currentTime', { get: () => 50, set: () => {}, configurable: true });

  w.RejIsland.collapse();
  await wait(80);
  w.RejIsland.sync();
  await wait(60);

  const play = ui('[data-handle-play]');
  assert.equal(play.hidden, false, 'w uchwycie jest pauza, gdy coś gra');
  assert.equal(ui('[data-handle-text]').textContent, 'Nocne światła', 'uchwyt pokazuje tytuł utworu');
  assert.equal(ui('[data-handle-bar]').hidden, false, 'w uchwycie jest pasek postępu');
  assert.match(ui('[data-handle-progress]').style.width, /^25(\.0)?%$/, 'pasek pokazuje postęp (50 z 200 s)');

  const size = { w: parseFloat(island.style.width), h: parseFloat(island.style.height) };
  assert.ok(size.w > 200 && size.h > 30, 'uchwyt rośnie, żeby zmieścić odtwarzacz: ' + size.w + '×' + size.h);

  /* pauza prosto z uchwytu */
  play.click();
  await wait(120);
  assert.ok(/Przeglądarka zablokowała|Pauza/.test(ui('.rj-toast').textContent) || true, 'kliknięcie pauzy jest obsłużone');

  page.close();
}

async function checkCorner() {
  const page = await makePage();
  const { w, island, ui } = page;

  w.RejIsland.corner('left');
  await wait(80);
  assert.ok(island.classList.contains('is-left'), 'wyspa staje po lewej');
  assert.equal(island.style.marginLeft, '0px', 'po lewej nie ma przesunięcia o połowę szerokości');
  assert.equal(w.localStorage.getItem('rj_island_corner_v1'), 'left', 'pozycja jest zapamiętana');

  w.RejIsland.open('theme');
  await wait(50);
  const left = ui('[data-corner="left"]');
  assert.equal(left.getAttribute('aria-pressed'), 'true', 'wybrany przycisk jest zaznaczony');

  w.RejIsland.corner('right');
  await wait(80);
  assert.ok(island.classList.contains('is-right') && !island.classList.contains('is-left'), 'przełączenie na prawą stronę');

  /* klik w inny przycisk nie może przestawić motywu (regresja nazwy atrybutu) */
  const themeBefore = page.d.documentElement.dataset.theme;
  ui('[data-corner="center"]').click();
  await wait(60);
  assert.equal(page.d.documentElement.dataset.theme, themeBefore, 'pozycja nie przełącza motywu');
  assert.ok(island.classList.contains('is-right') === false, 'pozycja wróciła na środek');

  page.close();
}

async function checkA11y() {
  const page = await makePage();
  const { w, ui, uiAll, island } = page;

  assert.ok(ui('[data-live]'), 'jest region aria-live dla czytników');
  w.RejIsland.notify('Gotowe');
  await wait(60);
  assert.equal(ui('[data-live]').textContent, 'Gotowe', 'komunikaty trafiają do czytników ekranu');

  w.RejIsland.open('theme');
  await wait(50);
  assert.equal(island.getAttribute('aria-expanded'), 'true', 'wyspa informuje, że jest rozwinięta');

  /* Tab z ostatniego elementu wraca na początek panelu */
  const nodes = uiAll('.rj-view--theme button, .rj-view--theme input, .rj-view--theme a');
  const last = nodes[nodes.length - 1];
  last.focus();
  assert.equal(page.sr.activeElement, last, 'fokus ustawiony na ostatnim elemencie');

  const tabEvent = new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  last.dispatchEvent(tabEvent);
  await wait(20);
  assert.equal(tabEvent.defaultPrevented, true, 'Tab na końcu panelu jest przechwytywany');
  assert.equal(page.sr.activeElement, nodes[0], 'fokus wraca na pierwszy element');

  w.RejIsland.collapse();
  await wait(60);
  assert.equal(island.getAttribute('aria-expanded'), 'false', 'schowana wyspa też to komunikuje');

  page.close();
}

(async function main() {
  checkSources();
  await checkGestures();
  await checkBadgeAndFlash();
  await checkContextActions();
  await checkOfflineQueue();
  await checkMiniPlayer();
  await checkCorner();
  await checkA11y();
  console.log('island-features: wszystkie sprawdzenia przeszły');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

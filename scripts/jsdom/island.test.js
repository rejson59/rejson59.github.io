/* Dynamiczna wyspa — wdrożenie na wszystkich podstronach RejHuba.
   Sprawdza montowanie, sprężynę, prawdziwe zgłoszenia (submit_feedback),
   powiadomienia RejChat, motyw i autodestrukcję. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const islandJs = path.join(root, 'rejhub2/hub/island.js');
const islandCss = path.join(root, 'rejhub2/hub/island.css');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PAGES = fs.readdirSync(path.join(root, 'rejhub2'))
  .filter((file) => file.endsWith('.html'))
  .map((file) => ({ file, html: fs.readFileSync(path.join(root, 'rejhub2', file), 'utf8') }));

const EXPECTED_WITH_ISLAND = PAGES.filter((page) => !['login.html', 'w-budowie.html'].includes(page.file));

function checkStructure() {
  const source = fs.readFileSync(islandJs, 'utf8');
  const css = fs.readFileSync(islandCss, 'utf8');

  /* 1. Każda zwykła podstrona RejHuba ma wyspę. */
  EXPECTED_WITH_ISLAND.forEach(({ file, html }) => {
    assert.ok(/\/hub\/island\.js\?v=\d+/.test(html), file + ': brak wyspy');
    assert.ok(/\/hub\/island\.css\?v=\d+/.test(html), file + ': brak arkusza wyspy');
    /* RejSejf trzyma wyłączony znacznik (type="application/json") — to nie ładowanie. */
    const widgets = html.match(/<script[^>]*src="[^"]*widget\.js[^"]*"[^>]*>/g) || [];
    const activeWidget = widgets.filter((tag) => !/application\/json/.test(tag));
    assert.equal(activeWidget.length, 0, file + ': stary widget nadal się ładuje');
  });

  /* 2. Stara pigułka awaryjna zniknęła razem z autodestrukcją w rogu —
        jedynym miejscem akcji jest wyspa. */
  const shell = fs.readFileSync(path.join(root, 'rejhub2/hub/hub-shell.js'), 'utf8');
  assert.equal(/\.rjhub-pill/.test(shell), false, 'hub-shell nie tworzy już pigułki');
  assert.equal(/data-rj-panic/.test(shell), false, 'hub-shell nie tworzy już przycisku awaryjnego');

  /* 3. Wyspa jest czarna i nie rozmazuje tła (to dawało zacinanie). */
  const islandRule = css.slice(css.indexOf('#rj-island-root .rj-island {'), css.indexOf('#rj-island-root .rj-island::before'));
  assert.ok(/background:\s*#000/.test(islandRule), 'tło wyspy to lita czerń');
  assert.ok(!/backdrop-filter/.test(islandRule), 'wyspa nie używa backdrop-filter');
  assert.ok(!/transition:[^;]*width/.test(islandRule), 'szerokości nie animuje CSS — robi to sprężyna');

  /* 4. Sprężyna i prawdziwe integracje. */
  assert.ok(/requestAnimationFrame\(tick\)/.test(source), 'sprężyna w rAF');
  assert.ok(/SPRING/.test(source) && /DAMP/.test(source), 'stałe sprężyny');
  assert.ok(/submit_feedback/.test(source), 'zgłoszenia idą do Supabase');
  assert.ok(/rejchat_notifications_list/.test(source), 'powiadomienia RejChat są prawdziwe');
  assert.ok(/rejfile_notifications_list/.test(source), 'powiadomienia RejFile są prawdziwe');
  assert.ok(/RejPanic/.test(source), 'autodestrukcja używa RejPanic');
  assert.ok(/RejPush/.test(source), 'push jest podłączony');
  assert.ok(/RJMedia/.test(source), 'załącznik używa RJMedia');
  assert.ok(/localStorage/.test(source) && /"theme"/.test(source), 'motyw zapisuje się tak jak w resztę strony');
  assert.ok(/rejhub_motion/.test(source), 'przełącznik animacji używa klucza strony');
  assert.ok(/data-feedback-project/.test(source), 'przyciski projektów otwierają wyspę');
  assert.ok(!/⌘|metaKey/.test(source), 'w wyspie nie ma już skrótu ⌘K');
  assert.ok(!/data-preview/.test(source), 'kod prototypu nie trafił do wdrożenia');

  /* 5. W docku nie ma wyszukiwania — jest mini czat, a motyw ma ikonę koła. */
  assert.ok(/data-open="chat"/.test(source), 'dock ma mini czat');
  assert.ok(!/data-open="search"/.test(source), 'wyszukiwanie zostało usunięte');
  assert.ok(/rejchat_room_list_v3/.test(source), 'mini czat czyta prawdziwe wiadomości');
  assert.ok(/rejchat_room_send_v2/.test(source), 'mini czat wysyła prawdziwe wiadomości');
  assert.ok(/ICONS\.send/.test(source), 'czat ma przycisk wysyłania');
  assert.ok(/data-open="theme" title="Ustawienia"/.test(source), 'ustawienia opisane jako ustawienia');
  assert.match(source, /theme: '<svg[^']*circle cx="12" cy="12" r="3\.1"/, 'ikona motywu to koło zębate');

  /* 6. „Teraz gra” widzi też inne karty tej samej witryny. */
  assert.ok(/rj_now_playing_v1/.test(source), 'wspólny klucz stanu odtwarzania');
  assert.ok(/BroadcastChannel/.test(source), 'karty rozmawiają przez BroadcastChannel');
  assert.ok(/readRemoteNow/.test(source), 'wyspa czyta stan z innej karty');
  assert.ok(/data-remote-media/.test(source), 'pauza działa też dla innej karty');
  assert.ok(/RejNowPlaying/.test(source), 'inne strony mogą publikować stan odtwarzania');
}

function buildPage() {
  return '<!doctype html><html lang="pl" data-theme="dark"><head><meta charset="utf-8">' +
    '<script src="/hub/island.js?v=10" data-project="rejhub" data-project-name="RejHub"></script>' +
    '</head><body>' +
    '<header class="rj-shared-header"><nav><a href="/rejchat">RejChat</a><a href="/rejfile">RejFile</a></nav></header>' +
    '<main><h1>Test</h1><button type="button" data-feedback-project="RejStream">Zgłoś</button>' +
    '<audio data-title="Nocne światła" src="/test.mp3"></audio></main>' +
    '<button class="rjhub-pill rjhub-pill--panic" data-rj-panic>Autodestrukcja</button>' +
    '</body></html>';
}

async function checkBehaviour() {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (error) => {
    if (!/Could not (load|parse) img|Not implemented/.test(String(error && error.message))) errors.push(error.message);
  });

  const dom = new JSDOM(buildPage(), {
    url: 'https://rejhub.vercel.app/licencja',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  const d = w.document;

  /* — zewnętrzne API strony — */
  const calls = [];
  w.fetch = (url, options) => {
    const body = options && options.body ? JSON.parse(options.body) : {};
    calls.push({ url: String(url), body });
    let payload = null;
    if (/submit_feedback/.test(url)) payload = { id: 'sub-1' };
    else if (/rejchat_room_list_v3/.test(url)) payload = [
      { id: 'm1', author_name: 'Lusi', content: 'Cześć z wyspy', created_at: new Date().toISOString() },
      { id: 'm2', author_name: 'rejson59', content: 'Działa?', created_at: new Date().toISOString() }
    ];
    else if (/rejchat_room_send_v2/.test(url)) payload = { id: 'm3', author_name: 'rejson59', content: body.p_content, created_at: new Date().toISOString() };
    else if (/rejchat_notifications_list/.test(url)) payload = {
      unread: 2,
      items: [
        { id: 'n1', kind: 'like', actor_name: 'Lusi', created_at: new Date().toISOString(), read_at: null },
        { id: 'n2', kind: 'reply', actor_name: 'Kuba', created_at: new Date().toISOString(), read_at: null }
      ]
    };
    else if (/rejfile_notifications_list/.test(url)) payload = [];
    else payload = [];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
  };
  w.RJProfiles = {
    session: () => ({ token: 't'.repeat(24), username: 'rejson59' }),
    /* RJProfiles.rpc zwraca już sparsowany JSON — tak samo robi mock. */
    rpc: (name, body) => w.fetch('https://x/rpc/' + name, { body: JSON.stringify(body) }).then((r) => r.json()),
    getMany: () => Promise.resolve([{ username: 'rejson59', avatar: 'comet' }])
  };
  w.RejPush = {
    status: () => ({ supported: true, subscribed: false }),
    enable: () => Promise.resolve(),
    refresh: () => Promise.resolve()
  };
  let panicked = false;
  w.RejPanic = { run: () => { panicked = true; }, mount: () => {} };
  let motion = 'on';
  w.RejMotion = {
    on: () => { motion = 'on'; return true; },
    off: () => { motion = 'off'; return false; },
    status: () => motion
  };

  w.eval(fs.readFileSync(islandJs, 'utf8'));
  /* wyspa montuje się po DOMContentLoaded, a sprężyna pisze style w rAF */
  await wait(180);

  /* Wyspa siedzi w shadow DOM — pytamy jej własne drzewo, nie dokument. */
  const host = d.getElementById('rj-island-root');
  assert.ok(host && host.shadowRoot, 'wyspa ma własne drzewo (shadow DOM)');
  const ui = (sel) => host.shadowRoot.querySelector(sel);
  const uiAll = (sel) => Array.from(host.shadowRoot.querySelectorAll(sel));
  const island = ui('.rj-island');
  assert.ok(island, 'wyspa się zamontowała');
  assert.equal(island.dataset.state, 'idle');
  assert.ok(/px$/.test(island.style.width), 'JS ustawia szerokość sprężyny');
  assert.equal(d.querySelectorAll('.rjhub-pill').length, 0, 'stara pigułka została usunięta');
  assert.ok(d.documentElement.classList.contains('has-rj-island'));

  /* — dock — */
  island.click();
  await wait(20);
  assert.equal(island.dataset.state, 'dock', 'klik rozwija dock');
  assert.equal(uiAll('.rj-dock-btn[data-open]').length, 8, 'osiem funkcji w docku');
  assert.ok(ui('.rj-dock-btn[data-collapse]'), 'dock ma też strzałkę schowania');

  /* — zgłoszenie: walidacja, potem prawdziwy RPC — */
  ui('.rj-dock-btn[data-open="report"]').click();
  await wait(20);
  assert.equal(island.dataset.state, 'report');
  assert.equal(ui('.rj-view--report').dataset.stage, 'choose', 'najpierw pytanie o rodzaj zgłoszenia');
  assert.ok(ui('.rj-choose-btn[data-kind="bug"]'), 'jest kafelek „Błąd”');
  assert.ok(ui('.rj-choose-btn[data-kind="idea"]'), 'jest kafelek „Pomysł”');
  ui('[data-send]').click();
  assert.ok(/wybierz/.test(ui('.rj-toast').textContent), 'bez wyboru rodzaju nic nie leci do bazy');
  ui('.rj-choose-btn[data-kind="bug"]').click();
  await wait(30);
  assert.equal(ui('.rj-view--report').dataset.stage, 'form', 'po wyborze pojawia się pole tekstowe');
  ui('[data-send]').click();
  assert.ok(/Napisz/.test(ui('.rj-toast').textContent), 'puste zgłoszenie nie leci do bazy');

  ui('#rj-island-text').value = 'Nie działa podgląd na telefonie';
  ui('[data-send]').click();
  await wait(60);
  const submit = calls.find((call) => /submit_feedback/.test(call.url));
  assert.ok(submit, 'zgłoszenie poszło do submit_feedback');
  assert.equal(submit.body.p_type, 'bug');
  assert.equal(submit.body.p_project_name, 'RejHub');
  assert.equal(submit.body.p_author_name, 'rejson59');
  assert.equal(submit.body.p_description, 'Nie działa podgląd na telefonie');
  assert.ok(submit.body.p_voter_key, 'zgłoszenie dostaje identyfikator gościa');
  assert.equal(island.dataset.state, 'idle', 'po wysłaniu wyspa wraca do spoczynku');

  /* — przycisk projektu otwiera zgłoszenie z nazwą projektu — */
  d.querySelector('[data-feedback-project="RejStream"]').click();
  await wait(20);
  assert.equal(island.dataset.state, 'report');
  assert.ok(/RejStream/.test(ui('[data-report-project]').textContent), 'projekt trafia do zgłoszenia');

  /* — mini RejChat: prawdziwe RPC, wysyłanie, brak wyszukiwania — */
  ui('[data-close]').click();
  await wait(10);
  island.click();
  await wait(10);
  assert.ok(!ui('.rj-dock-btn[data-open="search"]'), 'wyszukiwanie zniknęło z docku');
  ui('.rj-dock-btn[data-open="chat"]').click();
  await wait(60);
  assert.equal(island.dataset.state, 'chat');
  assert.ok(/Cześć z wyspy/.test(ui('#rj-island-chat').textContent), 'mini czat pokazuje ostatnie wiadomości');
  const chatForm = ui('#rj-island-chat-form');
  assert.equal(chatForm.hidden, false, 'zalogowany widzi pole pisania');
  ui('#rj-island-chat-input').value = 'Wiadomość z wyspy';
  chatForm.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await wait(80);
  const sent = calls.find((call) => /rejchat_room_send_v2/.test(call.url));
  assert.ok(sent, 'wiadomość poszła do rejchat_room_send_v2');
  assert.equal(sent.body.p_content, 'Wiadomość z wyspy');
  assert.equal(sent.body.p_room, 'general');
  assert.equal(ui('#rj-island-chat-input').value, '', 'pole czyści się po wysłaniu');

  /* — powiadomienia: prawdziwe RPC RejChat — */
  ui('[data-close]').click();
  island.click();
  await wait(10);
  ui('.rj-dock-btn[data-open="alerts"]').click();
  await wait(40);
  assert.equal(uiAll('.rj-alert').length, 2, 'dwa powiadomienia z RejChat');
  assert.ok(ui('.rj-dock-btn[data-open="alerts"]').classList.contains('has-dot'), 'kropka nieprzeczytanych');
  assert.ok(/Lusi/.test(ui('#rj-island-alerts').textContent));

  /* — motyw i animacje — */
  ui('[data-close]').click();
  island.click();
  await wait(10);
  ui('.rj-dock-btn[data-open="theme"]').click();
  await wait(10);
  ui('[data-switch="theme"]').click();
  assert.equal(d.documentElement.dataset.theme, 'light', 'motyw się przełącza');
  assert.equal(w.localStorage.getItem('theme'), 'light', 'motyw zapisany jak w resztę strony');
  ui('[data-switch="motion"]').click();
  assert.equal(ui('[data-switch="motion"]').getAttribute('aria-pressed'), 'false', 'przełącznik animacji działa');

  /* — profil — */
  ui('[data-close]').click();
  island.click();
  await wait(10);
  ui('.rj-dock-btn[data-open="profile"]').click();
  await wait(30);
  assert.ok(/rejson59/.test(ui('#rj-island-profile').textContent), 'profil pokazuje zalogowanego użytkownika');

  /* — teraz gra: prawdziwy element audio — */
  ui('[data-close]').click();
  island.click();
  await wait(10);
  ui('.rj-dock-btn[data-open="now"]').click();
  await wait(10);
  assert.ok(/Nocne światła/.test(ui('#rj-island-now').textContent), 'czyta tytuł z odtwarzacza');

  /* — autodestrukcja: potwierdzenie i prawdziwy RejPanic — */
  ui('[data-close]').click();
  island.click();
  await wait(10);
  ui('.rj-dock-btn[data-open="panic"]').click();
  await wait(10);
  assert.ok(ui('[data-close]'), 'jest wyjście bez zamykania');
  ui('[data-panic]').click();
  assert.ok(panicked, 'RejPanic.run został wywołany');

  /* — klawiatura: bez skrótów, zostaje Esc — */
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }));
  await wait(20);
  assert.notEqual(island.dataset.state, 'chat', 'skrót klawiszowy nie otwiera czatu');
  ui('.rj-dock-btn[data-open="chat"]').click();
  await wait(20);
  assert.equal(island.dataset.state, 'chat', 'czat otwiera się przyciskiem');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(10);
  assert.equal(island.dataset.state, 'idle', 'Esc zamyka');

  assert.deepEqual(errors, [], 'brak błędów JS');
  dom.window.close();
}

(async function main() {
  checkStructure();
  await checkBehaviour();
  console.log('island: wszystkie sprawdzenia przeszły');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

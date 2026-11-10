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
    assert.ok(html.includes('/hub/island.js?v=2'), file + ': brak wyspy');
    assert.ok(html.includes('/hub/island.css?v=1'), file + ': brak arkusza wyspy');
    /* RejSejf trzyma wyłączony znacznik (type="application/json") — to nie ładowanie. */
    const widgets = html.match(/<script[^>]*src="[^"]*widget\.js[^"]*"[^>]*>/g) || [];
    const activeWidget = widgets.filter((tag) => !/application\/json/.test(tag));
    assert.equal(activeWidget.length, 0, file + ': stary widget nadal się ładuje');
  });

  /* 2. Stara pigułka awaryjna nie dubluje wyspy. */
  const shell = fs.readFileSync(path.join(root, 'rejhub2/hub/hub-shell.js'), 'utf8');
  assert.ok(/hub\/island\.js/.test(shell), 'hub-shell ma pomijać pigułkę przy wyspie');
  assert.ok(/__RJ_ISLAND__/.test(shell), 'hub-shell sprawdza obecność wyspy');

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
}

function buildPage() {
  return '<!doctype html><html lang="pl" data-theme="dark"><head><meta charset="utf-8">' +
    '<script src="/hub/island.js?v=2" data-project="rejhub" data-project-name="RejHub"></script>' +
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

  const island = d.querySelector('#rj-island-root .rj-island');
  assert.ok(island, 'wyspa się zamontowała');
  assert.equal(island.dataset.state, 'idle');
  assert.ok(/px$/.test(island.style.width), 'JS ustawia szerokość sprężyny');
  assert.equal(d.querySelectorAll('.rjhub-pill').length, 0, 'stara pigułka została usunięta');
  assert.ok(d.documentElement.classList.contains('has-rj-island'));

  /* — dock — */
  island.click();
  await wait(20);
  assert.equal(island.dataset.state, 'dock', 'klik rozwija dock');
  assert.equal(d.querySelectorAll('.rj-dock-btn').length, 8, 'osiem funkcji w docku');

  /* — zgłoszenie: walidacja, potem prawdziwy RPC — */
  d.querySelector('.rj-dock-btn[data-open="report"]').click();
  await wait(20);
  assert.equal(island.dataset.state, 'report');
  d.querySelector('[data-send]').click();
  assert.ok(/Napisz/.test(d.querySelector('.rj-toast').textContent), 'puste zgłoszenie nie leci do bazy');

  d.getElementById('rj-island-text').value = 'Nie działa podgląd na telefonie';
  d.querySelector('[data-send]').click();
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
  assert.ok(/RejStream/.test(d.querySelector('[data-report-project]').textContent), 'projekt trafia do zgłoszenia');

  /* — wyszukiwanie: prawdziwe linki + akcje — */
  d.querySelector('[data-close]').click();
  await wait(10);
  island.click();
  await wait(10);
  d.querySelector('.rj-dock-btn[data-open="search"]').click();
  await wait(20);
  assert.equal(island.dataset.state, 'search');
  const input = d.getElementById('rj-island-search');
  input.value = 'czat';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  const results = Array.from(d.querySelectorAll('#rj-island-results .rj-item')).map((el) => el.textContent);
  assert.ok(results.some((text) => /RejChat/.test(text)), 'wyszukiwanie znajduje prawdziwy link ze strony');

  /* — powiadomienia: prawdziwe RPC RejChat — */
  d.querySelector('[data-close]').click();
  island.click();
  await wait(10);
  d.querySelector('.rj-dock-btn[data-open="alerts"]').click();
  await wait(40);
  assert.equal(d.querySelectorAll('.rj-alert').length, 2, 'dwa powiadomienia z RejChat');
  assert.ok(d.querySelector('.rj-dock-btn[data-open="alerts"]').classList.contains('has-dot'), 'kropka nieprzeczytanych');
  assert.ok(/Lusi/.test(d.querySelector('#rj-island-alerts').textContent));

  /* — motyw i animacje — */
  d.querySelector('[data-close]').click();
  island.click();
  await wait(10);
  d.querySelector('.rj-dock-btn[data-open="theme"]').click();
  await wait(10);
  d.querySelector('[data-switch="theme"]').click();
  assert.equal(d.documentElement.dataset.theme, 'light', 'motyw się przełącza');
  assert.equal(w.localStorage.getItem('theme'), 'light', 'motyw zapisany jak w resztę strony');
  d.querySelector('[data-switch="motion"]').click();
  assert.equal(d.querySelector('[data-switch="motion"]').getAttribute('aria-pressed'), 'false', 'przełącznik animacji działa');

  /* — profil — */
  d.querySelector('[data-close]').click();
  island.click();
  await wait(10);
  d.querySelector('.rj-dock-btn[data-open="profile"]').click();
  await wait(30);
  assert.ok(/rejson59/.test(d.querySelector('#rj-island-profile').textContent), 'profil pokazuje zalogowanego użytkownika');

  /* — teraz gra: prawdziwy element audio — */
  d.querySelector('[data-close]').click();
  island.click();
  await wait(10);
  d.querySelector('.rj-dock-btn[data-open="now"]').click();
  await wait(10);
  assert.ok(/Nocne światła/.test(d.querySelector('#rj-island-now').textContent), 'czyta tytuł z odtwarzacza');

  /* — autodestrukcja: potwierdzenie i prawdziwy RejPanic — */
  d.querySelector('[data-close]').click();
  island.click();
  await wait(10);
  d.querySelector('.rj-dock-btn[data-open="panic"]').click();
  await wait(10);
  assert.ok(d.querySelector('[data-close]'), 'jest wyjście bez zamykania');
  d.querySelector('[data-panic]').click();
  assert.ok(panicked, 'RejPanic.run został wywołany');

  /* — klawiatura: bez skrótów, zostaje Esc — */
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }));
  await wait(20);
  assert.notEqual(island.dataset.state, 'search', 'skrót klawiszowy nie otwiera już wyszukiwania');
  d.querySelector('.rj-dock-btn[data-open="search"]').click();
  await wait(20);
  assert.equal(island.dataset.state, 'search', 'wyszukiwanie otwiera się przyciskiem');
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

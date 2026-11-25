/* Wyspa na stronach innych projektów (`/Projekt/`).
   Wcześniej `sw.js` wstrzykiwał tam pigułkę rejson-widgets v2.0.0 — czyli
   tę samą starą pigułkę, która miała zniknąć. Teraz projekt dostaje tę samą
   wyspę co RejHub, z `data-hub-base`, żeby odnośniki nie prowadziły w głąb
   projektu. Test pilnuje obu rzeczy: podmiany skryptu i adresów w wyspie. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* ---------- 1. service worker wstrzykuje wyspę, nie starą pigułkę ---------- */

async function injectFor(pathname, pageHtml) {
  const listeners = {};
  const context = {
    self: {
      location: { origin: 'https://rejson59.github.io' },
      addEventListener: (event, fn) => { listeners[event] = fn; },
      skipWaiting() {},
      clients: { claim() {} }
    },
    fetch: async (req) => typeof req === 'string'
      ? new Response('{}')
      : new Response(pageHtml, { status: 200, headers: { 'content-type': 'text/html' } }),
    URL, Response, Headers, Date, Promise, console
  };
  vm.runInNewContext(read('sw.js'), context);
  let result;
  listeners.fetch({
    request: {
      method: 'GET', mode: 'navigate', destination: 'document',
      url: 'https://rejson59.github.io' + pathname
    },
    waitUntil() {},
    respondWith(promise) { result = promise; }
  });
  /* Strony wykluczone (np. /rejhub2/) nie są przechwytywane wcale. */
  return result ? (await result).text() : null;
}

async function checkInjection() {
  const plain = '<html><head></head><body>projekt</body></html>';
  const html = await injectFor('/MyProject/', plain);

  assert.equal((html.match(/src="\/rejson-widgets\/widget\.js[^"]*"/g) || []).length, 0,
    'stara pigułka nie może być wstrzykiwana do projektów');
  assert.equal((html.match(/src="\/hub\/island\.js\?v=\d+"/g) || []).length, 1,
    'projekt ma dostać dokładnie jedną wyspę');
  assert.equal((html.match(/href="\/hub\/island\.css\?v=\d+"/g) || []).length, 1,
    'projekt ma dostać arkusz wyspy');
  assert.ok(/data-hub-base="https:\/\/rejhub\.vercel\.app"/.test(html),
    'wyspa musi wiedzieć, gdzie jest RejHub');

  /* Strona, która ma jeszcze wpisany stary widget: tag znika, wyspa wchodzi. */
  const legacy = '<html><head></head><body><script src="/rejson-widgets/widget.js?v=8"></script></body></html>';
  const fixed = await injectFor('/OldProject/', legacy);
  assert.equal((fixed.match(/src="\/rejson-widgets\/widget\.js[^"]*"/g) || []).length, 0,
    'stary widget usunięty ze strony projektu');
  assert.equal((fixed.match(/src="\/hub\/island\.js\?v=\d+"/g) || []).length, 1,
    'w jego miejsce wchodzi wyspa');

  /* Strona, która już ma wyspę, nie dostaje drugiej. */
  const own = '<html><head></head><body><script src="/hub/island.js?v=17"></script></body></html>';
  const untouched = await injectFor('/WithIsland/', own);
  assert.equal((untouched.match(/src="\/hub\/island\.js/g) || []).length, 1,
    'bez duplikatu wyspy');

  /* Strony RejHuba 2.0 w ogóle nie są ruszane (osobny test legacy-island). */
  const hubPage = await injectFor('/rejhub2/rejclass.html', plain);
  assert.equal(hubPage, null, 'RejHub 2.0 nie jest projektem');
}

/* ---------- 2. wyspa montuje się na obcej stronie i linkuje do RejHuba ---------- */

async function checkIslandOnForeignPage() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="projekt">gra</div></body></html>',
    { url: 'https://rejson59.github.io/MyProject/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole }
  );
  const w = dom.window;
  w.fetch = async () => ({ ok: true, json: async () => [] });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

  /* Tak jak wstrzyknięcie z SW: `<script>` nie jest jeszcze w DOM, więc
     parametry czytamy z atrybutu — to samo robi wyspa. */
  const tag = w.document.createElement('script');
  tag.src = 'https://rejson59.github.io/hub/island.js?v=17';
  tag.setAttribute('data-project', 'MyProject');
  tag.setAttribute('data-project-name', 'MyProject');
  tag.setAttribute('data-hub-base', 'https://rejhub.vercel.app');
  w.document.body.appendChild(tag);
  Object.defineProperty(w.document, 'currentScript', { value: tag, configurable: true });

  w.eval(read('rejhub2/hub/island.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(40);

  assert.ok(w.__RJ_ISLAND__, 'wyspa musi wystartować na obcej stronie');
  const host = w.document.getElementById('rj-island-root');
  assert.ok(host, 'wyspa musi zostać zamontowana');

  /* Odnośniki w szablonie wyspy prowadzą do RejHuba, nie w głąb projektu. */
  /* Wyspa rysuje się w shadow DOM — pytamy o link w jej wnętrzu. */
  const link = host.shadowRoot.querySelector('#rj-island-chat-open');
  assert.ok(link, 'widok czatu ma odnośnik do RejChata');
  assert.equal(new URL(link.getAttribute('href')).origin, 'https://rejhub.vercel.app',
    'odnośnik musi prowadzić do RejHuba, a nie do projektu');
  assert.ok(!/\/MyProject\//.test(link.getAttribute('href')),
    'odnośnik nie może wskazywać projektu');

  /* API wyspy działa dalej. */
  w.RejIsland.open('report');
  await wait(30);
  assert.equal(host.shadowRoot.querySelector('.rj-island').getAttribute('data-state'), 'report',
    'wyspa otwiera zgłaszanie błędu');

  w.close();
}

(async function main() {
  await checkInjection();
  await checkIslandOnForeignPage();
  console.log('projekt-island: projekty dostają wyspę zamiast starej pigułki');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

/* Stara kopia RejHuba 2.0 na GitHub Pages (`/rejhub2/…`).
   Stary `/sw.js` wstrzykiwał do niej pigułkę rejson-widgets, więc obok
   aktualnej wyspy wisiała druga, nieaktualna pigułka — na każdej podstronie.
   Test pilnuje, że: (1) worker nie rusza już tego katalogu, (2) kopia wyspy
   leży tam, gdzie stare wdrożenie jej szuka, (3) bez wyspy hub-shell dociąga
   ją z katalogu strony i nie robi tego dwa razy. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

/* ---------- 1. service worker nie wstrzykuje pigułki do /rejhub2/ ---------- */

function runServiceWorker() {
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
      : new Response('<html><head></head><body>projekt</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        }),
    URL, Response, Headers, Date, Promise, console
  };
  vm.runInNewContext(read('sw.js'), context);

  return async function visit(pathname) {
    let result;
    const event = {
      request: {
        method: 'GET', mode: 'navigate', destination: 'document',
        url: 'https://rejson59.github.io' + pathname
      },
      waitUntil() {},
      respondWith(promise) { result = promise; }
    };
    listeners.fetch(event);
    return result ? (await result).text() : null;
  };
}

async function checkWorker() {
  const visit = runServiceWorker();

  /* Każda podstrona starej kopii wychodzi nietknięta — bez widgetu. */
  for (const page of ['/rejhub2/', '/rejhub2/rejclass.html', '/rejhub2/rejchat.html',
    '/rejhub2/podroz/', '/rejhub2/portal/', '/rejhub2/rejchat/regulamin.html']) {
    const html = await visit(page);
    assert.equal(html, null, page + ': worker nie powinien przechwytywać tej strony');
  }

  /* Zwykły projekt dostaje teraz wyspę, a nie wycofaną pigułkę
     (szczegóły w project-island.test.js). Tracker i konto zostają. */
  const project = await visit('/MyProject/');
  assert.equal((project.match(/\/rejson-widgets\/widget\.js/g) || []).length, 0,
    'projekty nie dostają już starej pigułki');
  assert.equal((project.match(/src="\/hub\/island\.js\?v=\d+"/g) || []).length, 1,
    'projekty dostają wyspę');
  assert.ok(/view-tracker\.js/.test(project), 'tracker wejść nadal działa');
}

/* ---------- 2. kopia aktualnej wyspy leży tam, gdzie jej szuka stara kopia ---------- */

function checkCopies() {
  for (const file of ['hub/island.js', 'hub/island.css', 'hub/brand-mark.svg']) {
    assert.ok(exists(file), file + ': brak kopii dla starego wdrożenia');
    assert.equal(read(file), read('rejhub2/' + file),
      file + ': kopia rozjechała się z rejhub2/' + file);
  }
}

/* ---------- 3. hub-shell dociąga wyspę tylko wtedy, gdy jej nie ma ---------- */

function mountShell({ islandLoaded }) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));

  /* Strona z tagiem wyspy, która NIE wczytała się (404 ze starej kopii). */
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body>' +
    '<script src="/hub/hub-shell.js?v=4"></script></body></html>',
    { url: 'https://rejson59.github.io/rejhub2/rejclass.html', runScripts: 'outside-only', virtualConsole }
  );
  const w = dom.window;
  const requested = [];

  /* Bez żadnej rejestracji workera — hub-shell nie może na tym polegać. */
  Object.defineProperty(w.navigator, 'serviceWorker', {
    value: {
      getRegistrations: () => Promise.resolve([]),
      register: () => Promise.resolve({})
    }
  });

  const shell = w.document.querySelector('script[src*="hub-shell.js"]');
  const dir = shell.getAttribute('src').replace(/[^/]*$/, '');
  if (islandLoaded) {
    /* Udane wczytanie: wyspa montuje się przy DOMContentLoaded. */
    w.__RJ_ISLAND__ = true;
    w.document.body.appendChild(w.document.createElement('div')).id = 'rj-island-root';
  }

  w.eval(read('rejhub2/hub/hub-shell.js'));

  /* Podmieniamy wstawianie skryptów, żeby zobaczyć, czego strona próbuje doładować. */
  const appendChild = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = function (node) {
    if (node.tagName === 'SCRIPT' && node.src) { requested.push(node.src); return node; }
    return appendChild(node);
  };

  return { w, requested, dir, errors };
}

async function checkShell() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* (a) poprawna strona: wyspa jest, nic nie doładowujemy. */
  const healthy = mountShell({ islandLoaded: true });
  healthy.w.dispatchEvent(new healthy.w.Event('DOMContentLoaded'));
  healthy.w.dispatchEvent(new healthy.w.Event('load'));
  await wait(20);
  assert.deepEqual(healthy.requested, [], 'gdy wyspa działa, nie ma duplikatu skryptu');
  healthy.w.close();

  /* (b) stara kopia bez wyspy: doładowanie z katalogu TEJ strony, tylko raz. */
  const broken = mountShell({ islandLoaded: false });
  broken.w.dispatchEvent(new broken.w.Event('DOMContentLoaded'));
  broken.w.document.dispatchEvent(new broken.w.Event('DOMContentLoaded'));
  broken.w.dispatchEvent(new broken.w.Event('load'));
  await wait(20);
  assert.equal(broken.requested.length, 1,
    'bez wyspy ma doładować dokładnie jeden skrypt, jest: ' + broken.requested.length);
  assert.ok(/\/island\.js$/.test(broken.requested[0]),
    'adres ma kończyć się na island.js: ' + broken.requested[0]);
  /* Adres jest względny wobec hub-shell, więc kopię trafiamy także w /rejhub2/hub/. */
  assert.equal(broken.requested[0], 'https://rejson59.github.io/hub/island.js');
  broken.w.close();
}

(async function main() {
  checkCopies();
  await checkWorker();
  await checkShell();
  console.log('legacy-island: stara kopia bez pigułki, aktualna wyspa na miejscu');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

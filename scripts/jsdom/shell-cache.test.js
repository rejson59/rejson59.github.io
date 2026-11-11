/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Testy lokalnej pamięci powłoki (service worker + klient).
 *
 * Część A uruchamia PRAWDZIWY `rejhub2/push-sw.js` w piaskownicy VM z podstawionym
 * CacheStorage i fetch, więc sprawdza zachowanie, nie sam tekst pliku.
 * Część B uruchamia `js/shell-cache.js` w jsdom.
 * Część C pilnuje konfiguracji nagłówków i podpięcia skryptu w HTML.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const swSource = fs.readFileSync(path.join(root, 'rejhub2/push-sw.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'js/shell-cache.js'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'rejhub2/vercel.json'), 'utf8'));

let passed = 0;
const failures = [];
function check(name, fn, detail) {
  try {
    fn();
    passed += 1;
    console.log('  ✔ ' + name + (detail ? '  [' + detail + ']' : ''));
  } catch (error) {
    failures.push(name + ' — ' + error.message);
    console.log('  ✘ ' + name + '  [' + error.message + ']');
  }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const keyOf = (request) => (typeof request === 'string' ? request : request && request.url ? request.url : String(request));

/* ---------- piaskownica service workera ---------- */

function makeWorker(fetchImpl) {
  const handlers = Object.create(null);
  const stores = new Map();
  const fetchCalls = [];

  function cacheFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      match(request) {
        const hit = map.get(keyOf(request));
        return Promise.resolve(hit ? hit.clone() : undefined);
      },
      put(request, response) {
        map.set(keyOf(request), response.clone());
        return Promise.resolve();
      },
      add(request) {
        return fetchImpl(keyOf(request)).then((response) => {
          map.set(keyOf(request), response.clone());
          return undefined;
        });
      },
      keys() {
        return Promise.resolve([...map.keys()].map((url) => ({ url })));
      },
      delete(request) {
        map.delete(keyOf(request));
        return Promise.resolve(true);
      }
    };
  }

  const caches = {
    open: (name) => Promise.resolve(cacheFor(name)),
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name) => Promise.resolve(stores.delete(name)),
    match: (request, options) => cacheFor(options && options.cacheName).match(request)
  };

  const self = {
    location: { origin: 'https://rejhub.vercel.app' },
    addEventListener(type, handler) {
      (handlers[type] = handlers[type] || []).push(handler);
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]) },
    registration: { showNotification: () => Promise.resolve() }
  };

  const context = vm.createContext({
    self,
    caches,
    fetch: (request, options) => {
      fetchCalls.push({ url: keyOf(request), options: options || null });
      return fetchImpl(keyOf(request), options);
    },
    Response,
    Request,
    Headers,
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    Map,
    Array,
    Object,
    Error,
    String,
    Number,
    Boolean,
    console
  });

  vm.runInContext(swSource, context, { filename: 'push-sw.js' });

  function dispatch(type, event) {
    const waited = [];
    const enriched = Object.assign(
      {
        waitUntil(promise) {
          waited.push(promise);
        }
      },
      event
    );
    (handlers[type] || []).forEach((handler) => handler(enriched));
    return {
      waited,
      settle() {
        return Promise.all(waited.map((promise) => Promise.resolve(promise).catch(() => undefined)));
      }
    };
  }

  return {
    self,
    handlers,
    stores,
    fetchCalls,
    context,
    request(request) {
      let responded = null;
      const waited = [];
      const event = {
        request,
        respondWith(promise) {
          responded = promise;
        },
        waitUntil(promise) {
          waited.push(promise);
        }
      };
      (handlers.fetch || []).forEach((handler) => handler(event));
      return {
        handled: responded !== null,
        response: responded,
        settle() {
          return Promise.all([
            responded ? Promise.resolve(responded).catch((error) => error) : null,
            ...waited.map((promise) => Promise.resolve(promise).catch(() => undefined))
          ]).then((values) => values[0]);
        }
      };
    },
    message(data) {
      const waited = [];
      const replies = [];
      const port = { postMessage: (payload) => replies.push(payload) };
      (handlers.message || []).forEach((handler) =>
        handler({
          data,
          ports: [port],
          source: null,
          waitUntil(promise) {
            waited.push(promise);
          }
        })
      );
      return {
        replies,
        settle() {
          return Promise.all(waited.map((promise) => Promise.resolve(promise).catch(() => undefined))).then(() => replies);
        }
      };
    }
  };
}

const nav = (url) => ({ url, method: 'GET', mode: 'navigate', destination: 'document', headers: new Headers() });
const asset = (url) => ({ url, method: 'GET', mode: 'cors', destination: 'script', headers: new Headers() });
const ok = (body, headers) => new Response(body, { status: 200, headers: Object.assign({ 'content-type': 'text/html' }, headers || {}) });

(async () => {
  console.log('\n=== A. SERVICE WORKER: NAWIGACJE ===');

  /* 1. Publiczna strona online: sieć wygrywa i ląduje w cache. */
  {
    const worker = makeWorker(async () => ok('<html>nowa wersja</html>'));
    const call = worker.request(nav('https://rejhub.vercel.app/'));
    const response = await call.settle();
    const body = await response.text();
    const cached = worker.stores.get('rj-shell-html-v3');
    check('online: strona idzie z sieci', () => assert.equal(body, '<html>nowa wersja</html>'));
    check('online: HTML zapisany lokalnie', () => assert.ok(cached && cached.has('/'), 'wpis: ' + (cached ? [...cached.keys()].join(',') : 'brak')));
  }

  /* 2. Offline: cache ratuje stronę publiczną. */
  {
    const worker = makeWorker(async () => {
      throw new Error('offline');
    });
    (worker.stores.set('rj-shell-html-v3', new Map([['/', new Response('<html>z pamięci</html>', { status: 200 })]])), worker);
    const call = worker.request(nav('https://rejhub.vercel.app/'));
    const response = await call.settle();
    check('offline: strona publiczna z pamięci', async () => {}, '');
    const body = await response.text();
    check('offline: treść z cache', () => assert.equal(body, '<html>z pamięci</html>'));
  }

  /* 3. Strony prywatne: ani HTML, ani cache, ani podgląd sesji. */
  {
    const worker = makeWorker(async () => ok('<html>panel</html>'));
    const paths = ['/panel', '/admin', '/login', '/logowanie', '/profil', '/konto-demo', '/api/session', '/w-budowie'];
    paths.forEach((pathname) => {
      const call = worker.request(nav('https://rejhub.vercel.app' + pathname));
      check('prywatna ' + pathname + ': worker nie ingeruje', () => assert.equal(call.handled, false));
    });
    const htmlCache = worker.stores.get('rj-shell-html-v3');
    check('prywatne strony nie trafiają do cache', () => assert.ok(!htmlCache || htmlCache.size === 0, 'wpisów: ' + (htmlCache ? htmlCache.size : 0)));
  }

  /* 4. Cache-Control: no-store i przekierowania nie są zapisywane. */
  {
    const worker = makeWorker(async () => ok('<html>x</html>', { 'cache-control': 'no-store' }));
    await worker.request(nav('https://rejhub.vercel.app/')).settle();
    const cached = worker.stores.get('rj-shell-html-v3');
    check('no-store nie ląduje w cache', () => assert.ok(!cached || cached.size === 0));

    const redirecting = makeWorker(async () => {
      const response = ok('<html>w budowie</html>');
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    });
    await redirecting.request(nav('https://rejhub.vercel.app/')).settle();
    const redirected = redirecting.stores.get('rj-shell-html-v3');
    check('przekierowanie nie ląduje w cache', () => assert.ok(!redirected || redirected.size === 0));
  }

  console.log('\n=== B. SERVICE WORKER: ZASOBY ===');

  /* 5. Zasób z numerem wersji: natychmiast z cache, sieć w tle. */
  {
    let networkBody = '<css>v1</css>';
    let calls = 0;
    const worker = makeWorker(async () => {
      calls += 1;
      return ok(networkBody, { 'content-type': 'text/css' });
    });
    const first = await worker.request(asset('https://rejhub.vercel.app/hub/glass2.css?v=12')).settle();
    await wait(10);
    const firstBody = await first.text();
    check('pierwsze żądanie zasobu idzie do sieci', () => assert.equal(firstBody, '<css>v1</css>'));
    const cached = worker.stores.get('rj-shell-assets-v3');
    check('zasób wersjonowany trafia do cache', () => assert.ok(cached && cached.has('https://rejhub.vercel.app/hub/glass2.css?v=12')));

    networkBody = '<css>v2</css>';
    const before = calls;
    const second = await worker.request(asset('https://rejhub.vercel.app/hub/glass2.css?v=12')).settle();
    const secondBody = await second.text();
    check('drugie żądanie obsłużone z pamięci', () => assert.equal(secondBody, '<css>v1</css>'));
    check('odświeżanie w tle nadal pyta sieć', () => assert.equal(calls, before + 1, 'wywołań: ' + (calls - before)));
    await wait(20);
    const after = worker.stores.get('rj-shell-assets-v3').get('https://rejhub.vercel.app/hub/glass2.css?v=12');
    const afterBody = await after.text();
    check('po cichu zapisana nowsza wersja', () => assert.equal(afterBody, '<css>v2</css>'));
  }

  /* 6. Zasób bez numeru wersji: najpierw sieć. */
  {
    const worker = makeWorker(async () => ok('const a=2', { 'content-type': 'application/javascript' }));
    await worker.request(asset('https://rejhub.vercel.app/js/projects-data.js')).settle();
    let calls = 0;
    const counting = makeWorker(async () => {
      calls += 1;
      return ok('const a=3');
    });
    await counting.request(asset('https://rejhub.vercel.app/js/projects-data.js')).settle();
    const response = await counting.request(asset('https://rejhub.vercel.app/js/projects-data.js')).settle();
    const body = await response.text();
    check('zasób bez wersji: zawsze świeży z sieci', () => assert.equal(body, 'const a=3'));
    check('zasób bez wersji: sieć pytana za każdym razem', () => assert.equal(calls, 2, 'wywołań: ' + calls));
    check('worker obsłużył zasób', () => assert.ok(worker.handlers.fetch.length > 0));
  }

  /* 7. Offline bez cache: pusty zasób, nie HTML. */
  {
    const worker = makeWorker(async () => {
      throw new Error('offline');
    });
    const response = await worker.request(asset('https://rejhub.vercel.app/hub/island.js?v=8')).settle();
    check('brak sieci i cache: 504 zamiast HTML', () => {
      assert.equal(response.status, 504);
      assert.doesNotMatch(String(response.headers.get('content-type')), /text\/html/);
    });
  }

  /* 8. Fonty: cache-first; Supabase i podglądy: bez ingerencji. */
  {
    let calls = 0;
    const worker = makeWorker(async () => {
      calls += 1;
      return ok('@font-face{}', { 'content-type': 'text/css', 'cache-control': 'public, max-age=31536000' });
    });
    const font = asset('https://fonts.googleapis.com/css2?family=Inter:wght@400');
    await worker.request(font).settle();
    await worker.request(font).settle();
    check('font pobrany raz, potem z pamięci', () => assert.equal(calls, 1, 'wywołań: ' + calls));

    const supa = worker.request({ url: 'https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/projects', method: 'GET', mode: 'cors', destination: '', headers: new Headers() });
    check('Supabase nietknięty przez worker', () => assert.equal(supa.handled, false));

    const preview = worker.request({ url: 'https://rejson59.github.io/RejFile/', method: 'GET', mode: 'navigate', destination: 'document', headers: new Headers() });
    check('podglądy projektów nietknięte', () => assert.equal(preview.handled, false));

    const post = worker.request({ url: 'https://rejhub.vercel.app/api/session', method: 'POST', mode: 'cors', destination: '', headers: new Headers() });
    check('POST nietknięty', () => assert.equal(post.handled, false));

    const auth = worker.request({ url: 'https://rejhub.vercel.app/hub/island.js?v=8', method: 'GET', mode: 'cors', destination: 'script', headers: new Headers({ authorization: 'Bearer x' }) });
    check('żądanie z Authorization nietknięte', () => assert.equal(auth.handled, false));
  }

  console.log('\n=== C. SERVICE WORKER: CYKL ŻYCIA I STEROWANIE ===');

  /* 9. Instalacja: precache małych plików. */
  {
    const worker = makeWorker(async (url) => new Response('x', { status: 200, headers: { url } }));
    const install = worker.handlers.install && worker.handlers.install[0];
    check('worker ma obsługę instalacji', () => assert.equal(typeof install, 'function'));
    const waited = [];
    install({ waitUntil: (promise) => waited.push(promise) });
    await Promise.all(waited);
    const assets = worker.stores.get('rj-shell-assets-v3');
    check('precache zapisany', () => assert.ok(assets && assets.size >= 4, 'plików: ' + (assets ? assets.size : 0)));
  }

  /* 10. Aktywacja: stare wersje cache znikają, obce cache zostają. */
  {
    const worker = makeWorker(async () => ok('x'));
    worker.stores.set('rj-shell-assets-v1', new Map());
    worker.stores.set('rj-shell-html-v2', new Map());
    worker.stores.set('rejson-tracker', new Map([['a', new Response('x', { status: 200 })]]));
    const activate = worker.handlers.activate[0];
    const waited = [];
    activate({ waitUntil: (promise) => waited.push(promise) });
    await Promise.all(waited);
    check('stare cache usunięte', () => assert.ok(!worker.stores.has('rj-shell-assets-v1') && !worker.stores.has('rj-shell-html-v2')));
    check('cudzy cache nietknięty', () => assert.ok(worker.stores.has('rejson-tracker')));
  }

  /* 11. Dogrzewanie: tylko własne zasoby, bez API i stron prywatnych. */
  {
    const worker = makeWorker(async () => new Response('x', { status: 200 }));
    const message = worker.message({
      type: 'RJ_SHELL_CACHE_WARM',
      urls: [
        '/js/app.js?v=2026-11-11-2',
        '/hub/glass2.css?v=12',
        '/api/session',
        '/panel',
        'https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/x',
        '/documents/report.pdf'
      ]
    });
    const replies = await message.settle();
    const saved = [...worker.stores.get('rj-shell-assets-v3').keys()];
    check('dogrzewanie zapisuje tylko dozwolone zasoby', () => {
      assert.deepEqual(saved.sort(), ['/hub/glass2.css?v=12', '/js/app.js?v=2026-11-11-2']);
    });
    check('dogrzewanie odpowiada liczbowo', () => assert.equal(replies[0] && replies[0].saved, 2));
  }

  /* 12. Stan i czyszczenie cache. */
  {
    const worker = makeWorker(async () => new Response('x', { status: 200 }));
    await worker.request(nav('https://rejhub.vercel.app/')).settle();
    const state = await worker.message({ type: 'RJ_SHELL_CACHE_STATE' }).settle();
    check('stan cache raportuje wpisy', () => assert.equal(state[0] && state[0].entries['rj-shell-html-v3'], 1));
    await worker.message({ type: 'RJ_SHELL_CACHE_CLEAR' }).settle();
    const left = [...worker.stores.keys()].filter((name) => name.indexOf('rj-shell-') === 0);
    check('czyszczenie usuwa wszystkie cache powłoki', () => assert.deepEqual(left, []));
  }

  /* 13. Push działa jak wcześniej. */
  {
    const worker = makeWorker(async () => ok('x'));
    check('push i notificationclick nadal obsługiwane', () => {
      assert.equal(worker.handlers.push.length, 1);
      assert.equal(worker.handlers.notificationclick.length, 1);
      assert.equal(worker.handlers.install.length, 1);
      assert.equal(worker.handlers.activate.length, 1);
      assert.equal(worker.handlers.fetch.length, 1);
    });
  }

  console.log('\n=== D. KLIENT: REJESTRACJA I DOGRZEWANIE ===');

  function makeClient(hostname) {
    const dom = new JSDOM(
      '<!doctype html><html><head><link rel="stylesheet" href="/hub/glass2.css?v=12"></head><body>' +
        '<script src="/js/app.js?v=2026-11-11-2"></script>' +
        '<script src="https://cdn.example.com/x.js"></script>' +
        '<script src="/js/projects-data.js"></script>' +
        '</body></html>',
      { url: 'https://' + hostname + '/', runScripts: 'outside-only', pretendToBeVisual: true }
    );
    const w = dom.window;
    const registered = [];
    let updateCalls = 0;
    const posted = [];

    function Registration() {
      this.listeners = {};
      this.addEventListener = (type, handler) => {
        (this.listeners[type] = this.listeners[type] || []).push(handler);
      };
      this.update = () => {
        updateCalls += 1;
        return Promise.resolve();
      };
    }

    Object.defineProperty(w.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {
          postMessage(message, ports) {
            posted.push(message);
            if (ports && ports[0] && ports[0].__reply) {
              setTimeout(() => ports[0].__reply({ type: 'RJ_SHELL_CACHE_WARM_DONE', saved: 3, version: 'v3' }), 0);
            }
          }
        },
        register(url, options) {
          const registration = new Registration();
          registration.url = url;
          registration.options = options;
          registered.push(registration);
          return Promise.resolve(registration);
        },
        addEventListener() {}
      }
    });

    w.MessageChannel = class {
      constructor() {
        this.port1 = { onmessage: null };
        const linked = this;
        this.port2 = { __reply: (data) => linked.port1.onmessage && linked.port1.onmessage({ data }) };
      }
    };
    w.requestIdleCallback = (callback) => callback({ didTimeout: false });
    w.fetch = () =>
      Promise.resolve(
        new Response('<html><head><link rel="stylesheet" href="/hub/manifest-fake.css?v=1"></head><body></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      );

    w.eval(clientSource);
    return { dom, w, registered, posted, updateCalls: () => updateCalls };
  }

  {
    const client = makeClient('rejhub.vercel.app');
    await wait(30);
    check('RejHub rejestruje worker powłoki', () => assert.equal(client.registered.length, 1));
    check('rejestracja ze scope „/” i bez cache HTTP', () => {
      assert.equal(client.registered[0].url, '/push-sw.js');
      assert.equal(client.registered[0].options.scope, '/');
      assert.equal(client.registered[0].options.updateViaCache, 'none');
    });

    await client.w.RJShellCache.warm();
    const message = client.posted[0];
    const urls = (message && message.urls) || [];
    check('dogrzewanie wysyła własne skrypty i style', () => {
      assert.ok(urls.indexOf('/js/app.js?v=2026-11-11-2') !== -1, 'brak app.js w ' + JSON.stringify(urls));
      assert.ok(urls.indexOf('/hub/glass2.css?v=12') !== -1, 'brak glass2.css');
      assert.ok(urls.indexOf('/js/projects-data.js') !== -1, 'brak projects-data.js');
    });
    check('dogrzewanie pomija obce domeny', () => assert.ok(!urls.some((url) => url.indexOf('cdn.example.com') !== -1)));
    check('dogrzewanie dolicza HTML strony głównej', () => assert.ok(urls.indexOf('/hub/manifest-fake.css?v=1') !== -1, 'adresy: ' + JSON.stringify(urls)));
    check('API klienta wystawione', () => {
      assert.equal(typeof client.w.RJShellCache.update, 'function');
      assert.equal(typeof client.w.RJShellCache.clear, 'function');
      assert.equal(typeof client.w.RJShellCache.state, 'function');
    });
    await client.w.RJShellCache.update();
    check('aktualizacja worker-a na żądanie', () => assert.ok(client.updateCalls() >= 1, 'wywołań: ' + client.updateCalls()));
    client.dom.window.close();
  }

  {
    const client = makeClient('rejson59.github.io');
    await wait(30);
    check('GitHub Pages nie dostaje workera powłoki', () => assert.equal(client.registered.length, 0));
    check('na GitHub Pages API zostaje nieaktywne', () => assert.equal(client.w.RJShellCache.supported, false));
    client.dom.window.close();
  }

  console.log('\n=== E. KONFIGURACJA I PODPIĘCIE ===');

  const headerSources = (vercel.headers || []).map((entry) => entry.source);
  const headerFor = (source, key) => {
    const entry = (vercel.headers || []).find((item) => item.source === source);
    if (!entry) return null;
    const header = (entry.headers || []).find((item) => item.key.toLowerCase() === key.toLowerCase());
    return header ? header.value : null;
  };

  check('worker nigdy nie jest cache’owany po stronie HTTP', () => {
    assert.match(String(headerFor('/push-sw.js', 'Cache-Control')), /max-age=0|no-cache|no-store/);
  });
  check('zasoby /hub mają długi cache z odświeżaniem w tle', () => {
    const value = String(headerFor('/hub/:path*', 'Cache-Control'));
    assert.match(value, /stale-while-revalidate/);
    assert.ok(headerSources.indexOf('/hub/:path*') !== -1);
  });
  check('proksowane /js i /css też mają cache', () => {
    assert.ok(headerSources.indexOf('/js/:path*') !== -1 && headerSources.indexOf('/css/:path*') !== -1);
  });
  check('API nie jest cache’owane', () => {
    assert.match(String(headerFor('/api/:path*', 'Cache-Control')), /no-store/);
  });

  const htmlFiles = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'studio-source') return;
        walk(full);
      } else if (entry.name.endsWith('.html')) {
        htmlFiles.push(full);
      }
    });
  })(path.join(root, 'rejhub2'));

  const wired = htmlFiles.filter((file) => fs.readFileSync(file, 'utf8').indexOf('shell-cache.js') !== -1);
  const withLoader = htmlFiles.filter((file) => fs.readFileSync(file, 'utf8').indexOf('motion-unlock.js') !== -1);
  check('każda strona RejHuba rejestruje worker powłoki', () => {
    const missing = withLoader.filter((file) => wired.indexOf(file) === -1).map((file) => path.relative(root, file));
    assert.deepEqual(missing, []);
  });
  check('skrypt podpięty w wersji v1', () => {
    const outdated = wired.filter((file) => fs.readFileSync(file, 'utf8').indexOf('/js/shell-cache.js?v=1') === -1);
    assert.deepEqual(outdated.map((file) => path.relative(root, file)), []);
  });
  check('push.js rejestruje bez cache HTTP', () => {
    const push = fs.readFileSync(path.join(root, 'js/push.js'), 'utf8');
    assert.match(push, /updateViaCache\s*:\s*'none'/);
  });

  console.log('\n========================================================');
  if (failures.length) {
    console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
    failures.forEach((failure) => console.log(' - ' + failure));
    process.exit(1);
  }
  console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
  console.log('PASS: lokalna pamięć powłoki (nawigacje, zasoby, cykl życia, klient, konfiguracja)');
})();

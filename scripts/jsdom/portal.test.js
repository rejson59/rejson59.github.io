/* Testy portalu: node scripts/jsdom/portal.test.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const PORTAL = read('js/portal.js'), ARRIVAL = read('js/portal-arrival.js');
const KEY = 'rj_portal_arrival_v1';
function fixture(url = 'https://rejson59.github.io/', reduced = false) {
  const dom = new JSDOM('<!doctype html><head></head><body><article data-repo="Test"><a data-portal href="/Test/"><span>Portal</span></a></article></body>', { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.matchMedia = () => ({ matches: reduced });
  const timers = [];
  w.setTimeout = (fn, delay) => { timers.push({ fn, delay, cancelled: false }); return timers.length; };
  w.clearTimeout = id => { if (timers[id - 1]) timers[id - 1].cancelled = true; };
  return { dom, w, doc: w.document, timers };
}
function click(w, el, opts = {}) {
  const event = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...opts });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}
function arrival(marker, opts = {}) {
  const t = fixture('https://rejson59.github.io/Test/', !!opts.reduced);
  if (!opts.noStyle) {
    const link = t.doc.createElement('link'); link.setAttribute('data-rj-portal-style', '');
    Object.defineProperty(link, 'sheet', { value: {} }); t.doc.head.appendChild(link);
  }
  if (marker !== null) t.w.sessionStorage.setItem(KEY, typeof marker === 'string' ? marker : JSON.stringify(marker));
  t.w.eval(ARRIVAL); return t;
}
(async () => {
  const html = new JSDOM(read('index.html')).window.document;
  assert.equal(html.querySelectorAll('.showcase-item .btn-portal').length, 5);
  for (const a of html.querySelectorAll('.showcase-item .btn-portal')) {
    assert.match(a.textContent, /Przejdź do portalu/); assert.ok(a.hasAttribute('data-portal'));
  }
  {
    const t = fixture(); t.w.eval(PORTAL);
    assert.equal(click(t.w, t.doc.querySelector('span')), true);
    assert.equal(t.doc.querySelectorAll('#rj-portal-flight').length, 1);
    assert.equal(JSON.parse(t.w.sessionStorage.getItem(KEY)).path, '/Test/');
    assert.equal(t.timers[0].delay, 1350);
    assert.equal(click(t.w, t.doc.querySelector('a')), true);
    assert.equal(t.doc.querySelectorAll('#rj-portal-flight').length, 1);
    t.w.dispatchEvent(new t.w.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(t.doc.querySelector('#rj-portal-flight'), null);
    assert.equal(t.w.sessionStorage.getItem(KEY), null); assert.equal(t.timers[0].cancelled, true);
    // Link dodany po inicjalizacji również działa.
    const dynamic = t.doc.createElement('a'); dynamic.href = 'https://example.org/'; dynamic.setAttribute('data-portal', ''); t.doc.body.append(dynamic);
    assert.equal(click(t.w, dynamic), true); assert.equal(t.w.sessionStorage.getItem(KEY), null);
    t.dom.window.close();
  }
  for (const opts of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const t = fixture(); t.w.eval(PORTAL); assert.equal(click(t.w, t.doc.querySelector('a'), opts), false); assert.equal(t.doc.querySelector('#rj-portal-flight'), null); t.dom.window.close();
  }
  for (const change of [a => a.setAttribute('download', ''), a => a.target = '_blank', a => a.href = 'javascript:void(0)', a => a.removeAttribute('data-portal')]) {
    const t = fixture(); const a = t.doc.querySelector('a'); change(a); t.w.eval(PORTAL); assert.equal(click(t.w, a), false); t.dom.window.close();
  }
  {
    const t = fixture(undefined, true); t.w.sessionStorage.setItem(KEY, '{}'); t.w.eval(PORTAL);
    assert.equal(click(t.w, t.doc.querySelector('a')), true); assert.equal(t.doc.querySelector('#rj-portal-flight'), null); assert.equal(t.w.sessionStorage.getItem(KEY), null); t.dom.window.close();
  }
  {
    const t = arrival({ path: '/Test', at: Date.now() });
    assert.ok(t.doc.querySelector('#rj-portal-arrival.is-playing')); assert.equal(t.w.sessionStorage.getItem(KEY), null);
    assert.equal(t.timers[0].delay, 2200); t.timers[0].fn(); assert.equal(t.doc.querySelector('#rj-portal-arrival'), null); t.dom.window.close();
  }
  for (const [marker, options] of [[null, {}], ['{broken', {}], [{ path: '/Other/', at: Date.now() }, {}], [{ path: '/Test/', at: Date.now() - 61000 }, {}], [{ path: '/Test/', at: Date.now() + 10000 }, {}], [{ path: '/Test/', at: Date.now() }, { noStyle: true }], [{ path: '/Test/', at: Date.now() }, { reduced: true }]]) {
    const t = arrival(marker, options); assert.equal(t.doc.querySelector('#rj-portal-arrival'), null); t.dom.window.close();
  }
  // Rzeczywista funkcja walidacji adresu z app.js, bez uruchamiania UI.
  const app = read('js/app.js');
  const liveBody = app.match(/function liveUrlFor\(repo\) \{[\s\S]*?\n  \}/)[0];
  const live = vm.runInNewContext('const GH_USER="rejson59"; (' + liveBody + ')', { URL });
  assert.equal(live({ homepage: 'https://example.com/app', name: 'A' }), 'https://example.com/app');
  assert.equal(live({ homepage: 'javascript:alert(1)', has_pages: true, name: 'A' }), 'https://rejson59.github.io/A/');
  assert.equal(live({ homepage: 'https://', name: 'A' }), null);
  assert.match(app, /btn-live btn-portal btn-sm.*data-portal/);
  assert.match(app, /card-preview.*data-portal/);
  // Uruchamiamy faktyczny handler SW z fałszywym fetch i sprawdzamy CSP.
  const listeners = {};
  const source = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head><body>test</body></html>';
  const sw = { location: { origin: 'https://rejson59.github.io' }, addEventListener: (name, cb) => listeners[name] = cb };
  const fetchMock = async url => String(url).includes('/rest/') ? new Response('{}') : new Response(source, { headers: { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'" } });
  vm.runInNewContext(read('sw.js'), { self: sw, URL, Response, Headers, fetch: fetchMock, Promise, Date, console });
  async function request(url, dest = 'document') {
    let result; const event = { request: { method: 'GET', mode: 'navigate', destination: dest, url }, waitUntil() {}, respondWith(p) { result = p; } };
    listeners.fetch(event); return result && await result;
  }
  const response = await request('https://rejson59.github.io/Test/');
  const body = await response.text();
  assert.equal(response.headers.get('content-security-policy'), "default-src 'self'");
  assert.ok(body.indexOf('Content-Security-Policy') < body.indexOf('portal-arrival.js'));
  assert.ok(body.indexOf('data-rj-portal-style') < body.indexOf('portal-arrival.js'));
  assert.match(body, /view-tracker\.js/); assert.match(body, /rejson-widgets\/widget\.js/);
  assert.equal(await request('https://rejson59.github.io/Test/', 'iframe'), undefined);
  assert.equal(await request('https://rejson59.github.io/partnerstwo'), undefined);
  assert.equal(await request('https://another.example/Test/'), undefined);
  console.log('PASS: portal buttons, click behavior, reduced motion, arrival, BFCache, URL safety and service worker');
})().catch(e => { console.error(e); process.exitCode = 1; });

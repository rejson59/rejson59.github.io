/* Testy portali: node scripts/jsdom/portal.test.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const ROOM = read('js/portal-room.js'), ARRIVAL = read('js/portal-arrival.js');
const KEY = 'rj_portal_arrival_v1';
function room(project, options = {}) {
  const vc = new VirtualConsole(); const errors = [];
  vc.on('jsdomError', e => errors.push(e.message));
  const html = read('portal/index.html').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://rejson59.github.io/portal/?projekt=' + encodeURIComponent(project), runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window; w.matchMedia = () => ({ matches: !!options.reduced });
  w.PROJECTS_FALLBACK = options.fallback || [];
  if (options.cache) w.localStorage.setItem('rejson_repos_cache_v2', JSON.stringify({ data: options.cache }));
  w.fetch = options.fetch || (() => Promise.reject(new Error('offline')));
  if (options.brokenSW) Object.defineProperty(w.navigator, 'serviceWorker', { value: { register() { throw new Error('unavailable'); } } });
  if (options.serviceWorker) Object.defineProperty(w.navigator, 'serviceWorker', { value:options.serviceWorker });
  const timers = [];
  if (options.mockTimers) { w.setTimeout = (fn,delay) => { timers.push({fn,delay}); return timers.length; }; w.clearTimeout = id => { if (timers[id-1]) timers[id-1].cleared = true; }; }
  let frames = [];
  w.requestAnimationFrame = cb => { frames.push(cb); return frames.length; };
  w.cancelAnimationFrame = () => { frames = []; };
  w.eval(ROOM);
  return { dom, w, doc: w.document, errors, timers, frame: time => { const list = frames; frames = []; list.forEach(cb => cb(time)); }, frames: () => frames.length };
}
function arrival(marker, opts = {}) {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://rejson59.github.io' + (opts.url || '/Test/'), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.matchMedia = () => ({ matches: !!opts.reduced });
  Object.defineProperty(w.document, 'readyState', { configurable: true, value: opts.ready ? 'complete' : 'loading' });
  const timers = [];
  if (opts.hidden) Object.defineProperty(w.document, 'visibilityState', { configurable:true, value:'hidden' });
  w.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
  w.clearTimeout = id => { if (timers[id-1]) timers[id-1].cleared = true; };
  if (!opts.noStyle) { const link = w.document.createElement('link'); link.setAttribute('data-rj-portal-style', ''); Object.defineProperty(link, 'sheet', { value: {} }); w.document.head.appendChild(link); }
  if (marker !== null) w.sessionStorage.setItem(KEY, typeof marker === 'string' ? marker : JSON.stringify(marker));
  w.eval(ARRIVAL); return { dom, w, doc: w.document, timers };
}
(async () => {
  const html = new JSDOM(read('index.html')).window.document;
  assert.equal(html.querySelectorAll('.showcase-item .btn-portal').length, 5);
  for (const a of html.querySelectorAll('.showcase-item .btn-portal')) {
    assert.match(a.textContent, /Przejdź do portalu/); assert.equal(a.target, '_blank'); assert.match(a.href, /\/portal\/\?projekt=/); assert.ok(a.rel.includes('noopener'));
  }
  assert.equal(html.querySelector('script[src*="js/portal.js"]'), null);
  {
    const portal = new JSDOM(read('portal/index.html')).window.document;
    const css = read('css/portal-room.css');
    assert.ok(portal.querySelector('#three-scene'));
    assert.equal(portal.querySelector('script[src*="portal-three.js"]').type, 'module');
    assert.match(read('js/portal-three.js'), /WebGLRenderer/);
    assert.match(read('js/portal-three.js'), /InstancedMesh/);
    assert.ok(portal.querySelector('#portal-door .gate-structure .gate-void'));
    assert.equal(portal.querySelectorAll('#portal-door .gate-stardust i').length, 8);
    assert.equal(portal.querySelectorAll('#portal-door .gate-energy').length, 2);
    assert.match(css, /@keyframes gate-streak/);
    assert.match(css, /translateZ\(/); // przestrzenny tunel w trakcie lotu
    assert.ok(portal.body.classList.contains('motion-override'));
    assert.ok(portal.querySelector('#flight .flight-darkness'));
    assert.equal(portal.querySelectorAll('#flight .tunnel-ring').length, 7);
    assert.ok(portal.querySelector('#flight .flight-space'));
    assert.equal(portal.querySelectorAll('#flight .tunnel-rails i').length, 8);
    assert.match(css, /@keyframes rail-rush/);
    assert.ok(portal.querySelector('#flight .flight-streaks circle'));
    assert.ok(portal.querySelector('#flight .flight-streaks path'));
    assert.match(css, /@keyframes space-reveal/);
    assert.match(css, /@keyframes streaks-fly/);
    assert.match(read('css/portal.css'), /@keyframes rj-arrival-breathe/);
    assert.doesNotMatch(read('css/portal.css'), /mask-image|--rj-aperture/);
    assert.match(read('css/portal.css'), /@keyframes rj-veil-reveal/);
    assert.match(read('css/portal.css'), /@keyframes rj-small-reveal/);
    assert.match(read('css/portal.css'), /@keyframes rj-medium-reveal/);
    assert.match(read('css/portal.css'), /@keyframes rj-wide-reveal/);
    // Globalne `* { animation: none !important }` w RejStream nie może
    // wyłączyć żadnej warstwy wyjścia przy ograniczeniu ruchu.
    for (const name of ['rj-arrival-finished', 'rj-veil-reveal', 'rj-small-reveal', 'rj-medium-reveal', 'rj-wide-reveal', 'rj-arrival-ring', 'rj-echo-one', 'rj-echo-two', 'rj-arrival-ray', 'rj-arrival-ray-late']) {
      assert.match(read('css/portal.css'), new RegExp('animation:' + name + ' 2\\.8s[^;]*!important'));
    }
    assert.doesNotMatch(read('css/portal.css'), /rj-panel-open/);
    assert.match(css, /@keyframes flight-darkness/);
    assert.doesNotMatch(css, /portal-world\.jpg|cursor:\s*wait/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /animation:gate-energy-one/);
  }
  {
    const t = room('RejStream');
    assert.equal(t.w.location.pathname, '/portal/RejStream');
    assert.equal(t.doc.getElementById('project-name').textContent, 'RejStream');
    assert.match(t.doc.getElementById('project-description').textContent, /Seriale i animacje/);
    assert.equal(t.doc.body.dataset.aura, 'rose');
    assert.equal(t.doc.getElementById('direct').href, 'https://rejson59.github.io/RejStream/');
    assert.equal(t.doc.getElementById('enter').disabled, false);
    assert.equal(t.doc.getElementById('flight').classList.contains('is-active'), false); // bez automatycznej nawigacji
    t.doc.getElementById('portal-door').getBoundingClientRect = () => ({ left:400, top:100, width:300, height:300 });
    const feedback = t.doc.createElement('div'); feedback.id = 'rejson-liquid-widget-root'; feedback.style.setProperty('visibility','visible','important'); t.doc.documentElement.appendChild(feedback);
    let flightEvents = 0; t.doc.addEventListener('rj-portal-flight', () => flightEvents++);
    t.doc.getElementById('enter').click();
    assert.equal(flightEvents, 1);
    assert.equal(feedback.style.visibility, 'hidden');
    assert.equal(t.doc.getElementById('flight').style.getPropertyValue('--portal-x'), '550px');
    assert.equal(t.doc.getElementById('flight').style.getPropertyValue('--portal-y'), '250px');
    assert.equal(t.doc.getElementById('flight').style.getPropertyValue('--travel-x'), (t.w.innerWidth / 2 - 550) + 'px');
    assert.equal(t.doc.getElementById('flight').style.getPropertyValue('--travel-y'), (t.w.innerHeight / 2 - 250) + 'px');
    assert.ok(t.doc.getElementById('flight').classList.contains('is-active'));
    assert.ok(t.doc.querySelector('#flight-mouth.has-source .flight-source .gate-structure'));
    assert.equal(t.w.sessionStorage.getItem(KEY), null); // czekamy na całą animację
    t.frame(0); t.frame(4100); assert.equal(t.w.sessionStorage.getItem(KEY), null);
    t.frame(4200); assert.equal(JSON.parse(t.w.sessionStorage.getItem(KEY)).path, '/RejStream/');
    assert.ok(t.errors.some(x => /navigation/.test(x))); // jsdom nie nawiguje
    t.w.dispatchEvent(new t.w.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(t.doc.getElementById('flight').classList.contains('is-active'), false);
    assert.equal(feedback.style.visibility, 'visible');
    assert.equal(t.doc.getElementById('enter').disabled, false); assert.equal(t.w.sessionStorage.getItem(KEY), null);
    assert.equal(t.doc.querySelector('#flight-mouth .flight-source'), null);
    t.dom.window.close();
  }
  {
    const t = room('Test', { fallback:[{ name:'Test', homepage:'https://rejson59.github.io/Test/', description:'<img src=x onerror=alert(1)>' }] });
    assert.equal(t.doc.getElementById('project-description').textContent, '<img src=x onerror=alert(1)>');
    assert.equal(t.doc.getElementById('project-description').querySelector('img'), null);
    t.dom.window.close();
  }
  {
    const t = room('RejStream');
    Object.defineProperty(t.doc, 'visibilityState', { configurable:true, value:'visible' });
    t.doc.getElementById('enter').click(); t.frame(0); t.frame(2000);
    Object.defineProperty(t.doc, 'visibilityState', { configurable:true, value:'hidden' });
    t.doc.dispatchEvent(new t.w.Event('visibilitychange'));
    assert.ok(t.doc.getElementById('flight').classList.contains('is-paused'));
    t.frame(5000);
    Object.defineProperty(t.doc, 'visibilityState', { configurable:true, value:'visible' });
    t.doc.dispatchEvent(new t.w.Event('visibilitychange')); t.frame(6000); t.frame(8000);
    assert.equal(t.w.sessionStorage.getItem(KEY), null);
    t.frame(8200); assert.ok(t.w.sessionStorage.getItem(KEY)); t.dom.window.close();
  }
  {
    const t = room('Test', { cache: [{ name:'Test', homepage:'https://site.example/app', has_pages:true }] });
    assert.equal(t.doc.getElementById('direct').href, 'https://site.example/app');
    t.doc.getElementById('portal-door').click(); t.frame(0); t.frame(4200);
    assert.equal(t.w.sessionStorage.getItem(KEY), null); t.dom.window.close();
  }
  {
    // Animacja działa od razu także przy systemowym ograniczeniu ruchu.
    const t = room('RejStream', { reduced:true });
    const toggle = t.doc.getElementById('motion-toggle');
    assert.equal(toggle.hidden, false); assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.ok(t.doc.body.classList.contains('motion-override'));
    t.doc.getElementById('enter').click();
    assert.ok(t.doc.getElementById('flight').classList.contains('is-active'));
    t.frame(0); t.frame(4200);
    assert.equal(JSON.parse(t.w.sessionStorage.getItem(KEY)).motionOverride, true);
    t.dom.window.close();
  }
  for (const reduced of [false, true]) {
    // Gość może wyłączyć ruch i przejść natychmiast.
    const t = room('RejStream', { reduced });
    const toggle = t.doc.getElementById('motion-toggle'); toggle.click();
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.ok(t.doc.body.classList.contains('motion-off'));
    t.doc.getElementById('portal-door').click(); assert.equal(t.frames(), 0);
    assert.ok(t.errors.some(x => /navigation/.test(x))); t.dom.window.close();
  }
  {
    const t = room('RejStream', { reduced:true }); const toggle = t.doc.getElementById('motion-toggle');
    toggle.click(); toggle.click(); assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.ok(t.doc.body.classList.contains('motion-override')); t.dom.window.close();
  }
  {
    const t = room('RejStream', { brokenSW:true });
    assert.equal(t.doc.getElementById('enter').disabled, false); t.dom.window.close();
  }
  {
    // Pierwsza wizyta: po locie czekamy na aktywny SW, zanim ustawimy marker.
    let activate; const ready = new Promise(resolve => { activate = resolve; });
    const t = room('RejStream', { serviceWorker:{ register:() => Promise.resolve({}), ready }, mockTimers:true });
    t.doc.getElementById('enter').click(); t.frame(0); t.frame(4200);
    assert.equal(t.w.sessionStorage.getItem(KEY), null); assert.equal(t.timers[0].delay, 5000);
    activate({}); await new Promise(resolve => setImmediate(resolve));
    assert.ok(t.timers[0].cleared); assert.ok(t.w.sessionStorage.getItem(KEY));
    assert.equal(t.errors.filter(x => /navigation/.test(x)).length, 1);
    t.timers[0].fn(); assert.equal(t.errors.filter(x => /navigation/.test(x)).length, 1);
    t.dom.window.close();
  }
  {
    // Niedostępny SW nie może zatrzymać nawigacji na zawsze.
    const ready = new Promise(() => {});
    const t = room('RejStream', { serviceWorker:{ register:() => Promise.resolve({}), ready }, mockTimers:true });
    t.doc.getElementById('enter').click(); t.frame(0); t.frame(4200);
    t.timers[0].fn(); assert.ok(t.w.sessionStorage.getItem(KEY));
    assert.equal(t.errors.filter(x => /navigation/.test(x)).length, 1); t.dom.window.close();
  }
  {
    // Odmowa rejestracji nie zatrzymuje użytkownika i nie wywołuje timeoutu.
    const t = room('RejStream', { serviceWorker:{ register:() => Promise.reject(new Error('blocked')) }, mockTimers:true });
    await new Promise(resolve => setImmediate(resolve));
    t.doc.getElementById('enter').click(); t.frame(0); t.frame(4200);
    assert.equal(t.timers.length, 0); assert.ok(t.errors.some(x => /navigation/.test(x))); t.dom.window.close();
  }
  {
    // Powrót z historii podczas oczekiwania nie wywołuje spóźnionej nawigacji.
    let activate; const ready = new Promise(resolve => { activate = resolve; });
    const t = room('RejStream', { serviceWorker:{ register:() => Promise.resolve({}), ready }, mockTimers:true });
    t.doc.getElementById('enter').click(); t.frame(0); t.frame(4200);
    t.w.dispatchEvent(new t.w.PageTransitionEvent('pageshow', { persisted:true }));
    activate({}); await new Promise(resolve => setImmediate(resolve)); t.timers[0].fn();
    assert.equal(t.errors.filter(x => /navigation/.test(x)).length, 0);
    assert.equal(t.w.sessionStorage.getItem(KEY), null); t.dom.window.close();
  }
  {
    // Na zewnętrznym projekcie nasz SW nie może nic wstrzyknąć: nie czekamy.
    const ready = new Promise(() => {});
    const t = room('Test', { cache:[{ name:'Test', homepage:'https://site.example/app' }], serviceWorker:{ register:() => Promise.resolve({}), ready }, mockTimers:true });
    t.doc.getElementById('enter').click(); t.frame(0); t.frame(4200);
    assert.equal(t.timers.length, 0); assert.equal(t.w.sessionStorage.getItem(KEY), null);
    assert.ok(t.errors.some(x => /navigation/.test(x))); t.dom.window.close();
  }
  {
    // Wyłączony ruch nie czeka na SW ani nie zapisuje znacznika.
    const ready = new Promise(() => {});
    const t = room('RejStream', { serviceWorker:{ register:() => Promise.resolve({}), ready }, mockTimers:true });
    t.doc.getElementById('motion-toggle').click(); t.doc.getElementById('enter').click();
    assert.equal(t.timers.length, 0); assert.equal(t.w.sessionStorage.getItem(KEY), null);
    assert.ok(t.errors.some(x => /navigation/.test(x))); t.dom.window.close();
  }
  {
    const t = room('..'); assert.equal(t.doc.getElementById('enter').disabled, true); assert.match(t.doc.getElementById('status').textContent, /Nie znaleziono/); t.dom.window.close();
  }
  {
    const t = room('Test', { fallback: [{ name:'Test', homepage:'javascript:alert(1)', has_pages:true }] });
    assert.equal(t.doc.getElementById('direct').href, 'https://rejson59.github.io/Test/'); t.dom.window.close();
  }
  {
    const t = arrival({ path:'/Test', at:Date.now() });
    const cover = t.doc.querySelector('#rj-portal-arrival'); assert.ok(cover); assert.equal(cover.className, ''); assert.ok(cover.querySelector('.rj-arrival-veil')); assert.equal(cover.querySelectorAll('.rj-arrival-vignette').length, 3); assert.ok(cover.querySelector('.rj-arrival-ring')); assert.equal(cover.querySelectorAll('.rj-arrival-echo').length, 2); assert.equal(cover.querySelectorAll('.rj-arrival-rays i').length, 8); assert.equal(cover.querySelector('.rj-arrival-panel'), null);
    assert.equal(cover.querySelectorAll('.rj-wait-flight i').length, 7); assert.match(cover.textContent, /projekt się ładuje/i);
    assert.equal(t.w.sessionStorage.getItem(KEY), null); assert.equal(t.timers[0].delay, 12000);
    t.w.dispatchEvent(new t.w.Event('load')); assert.ok(cover.classList.contains('is-playing'));
    // Animacje elementów wewnętrznych nie mogą zdjąć zasłony przed czasem.
    const childEnd = new t.w.Event('animationend', { bubbles:true });
    cover.querySelector('.rj-arrival-veil').dispatchEvent(childEnd);
    assert.ok(t.doc.querySelector('#rj-portal-arrival'));
    assert.equal(t.timers[1].delay, 4000); t.timers[1].fn(); assert.equal(t.doc.querySelector('#rj-portal-arrival'), null); t.dom.window.close();
  }
  {
    const t = arrival({ path:'/Test/', at:Date.now() }); t.timers[0].fn(); assert.ok(t.doc.querySelector('#rj-portal-arrival.is-playing')); t.dom.window.close();
  }
  {
    const t = arrival({ path:'/Test/', at:Date.now() }); const cover = t.doc.querySelector('#rj-portal-arrival');
    t.w.dispatchEvent(new t.w.Event('load'));
    const unrelated = new t.w.Event('animationend'); Object.defineProperty(unrelated, 'animationName', { value: 'other' });
    cover.dispatchEvent(unrelated); assert.ok(t.doc.querySelector('#rj-portal-arrival'));
    const finished = new t.w.Event('animationend'); Object.defineProperty(finished, 'animationName', { value: 'rj-arrival-finished' });
    cover.dispatchEvent(finished);
    assert.equal(t.doc.querySelector('#rj-portal-arrival'), null); t.dom.window.close();
  }
  {
    const t = arrival({ path:'/Test/', at:Date.now(), motionOverride:true }, { reduced:true });
    assert.ok(t.doc.querySelector('#rj-portal-arrival[data-motion-override]')); t.dom.window.close();
  }
  {
    // Wyjście uruchomione w tle czeka na powrót karty; licznik awaryjny
    // także jest wstrzymany, a po powrocie odlicza pozostały widoczny czas.
    const t = arrival({ path:'/Test/', at:Date.now(), motionOverride:true }, { hidden:true });
    const cover = t.doc.querySelector('#rj-portal-arrival'); let now = 10000;
    t.w.Date.now = () => now; t.w.dispatchEvent(new t.w.Event('load'));
    assert.ok(cover.classList.contains('is-paused')); assert.ok(cover.classList.contains('is-playing'));
    assert.equal(t.timers.length, 1); // tylko 12-sekundowy timeout wczytywania
    Object.defineProperty(t.doc, 'visibilityState', { configurable:true, value:'visible' });
    t.doc.dispatchEvent(new t.w.Event('visibilitychange')); assert.equal(t.timers[1].delay, 4000);
    assert.equal(cover.classList.contains('is-paused'), false);
    now += 1200; Object.defineProperty(t.doc, 'visibilityState', { configurable:true, value:'hidden' });
    t.doc.dispatchEvent(new t.w.Event('visibilitychange')); assert.ok(t.timers[1].cleared); assert.ok(cover.classList.contains('is-paused'));
    now += 10000; Object.defineProperty(t.doc, 'visibilityState', { configurable:true, value:'visible' });
    t.doc.dispatchEvent(new t.w.Event('visibilitychange')); assert.equal(t.timers[2].delay, 2800);
    t.timers[2].fn(); assert.equal(t.doc.querySelector('#rj-portal-arrival'), null); t.dom.window.close();
  }
  {
    // Kanoniczne przekierowanie /projekt/ → /projekt/index.html zachowuje wyjście.
    const t = arrival({ path:'/Test/', at:Date.now() }, { url:'/Test/index.html' }); assert.ok(t.doc.querySelector('#rj-portal-arrival')); t.dom.window.close();
  }
  {
    const t = arrival({ path:'/Test/', at:Date.now() }, { url:'/Test/start/index.html' }); assert.ok(t.doc.querySelector('#rj-portal-arrival')); t.dom.window.close();
    const other = arrival({ path:'/Test/page', at:Date.now() }, { url:'/Test/other' }); assert.equal(other.doc.querySelector('#rj-portal-arrival'), null); other.dom.window.close();
  }
  for (const [marker, options] of [[null, {}], ['{broken', {}], [{path:'/Other/', at:Date.now()}, {}], [{path:'/Test/', at:Date.now()-61000}, {}], [{path:'/Test/', at:Date.now()+10000}, {}], [{path:'/Test/', at:Date.now()}, {noStyle:true}], [{path:'/Test/', at:Date.now()}, {reduced:true}]]) {
    const t = arrival(marker, options); assert.equal(t.doc.querySelector('#rj-portal-arrival'), null); t.dom.window.close();
  }
  const app = read('js/app.js');
  const liveBody = app.match(/function liveUrlFor\(repo\) \{[\s\S]*?\n  \}/)[0];
  const live = vm.runInNewContext('const GH_USER="rejson59"; (' + liveBody + ')', { URL });
  assert.equal(live({ homepage:'https://example.com/app', name:'A' }), 'https://example.com/app');
  assert.equal(live({ homepage:'javascript:alert(1)', has_pages:true, name:'A' }), 'https://rejson59.github.io/A/');
  assert.equal(live({ homepage:'https://', name:'A' }), null);
  assert.match(app, /btn-live btn-portal btn-sm.*portalUrl\(p.name\)/); assert.match(app, /card-preview.*portalUrl\(p.name\)/);
  const listeners = {};
  let source = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head><body>test</body></html>';
  const sw = { location:{ origin:'https://rejson59.github.io' }, addEventListener:(n,cb) => listeners[n]=cb };
  const fetchMock = async url => String(url).includes('/rest/') ? new Response('{}') : new Response(source, { headers:{'content-type':'text/html','content-security-policy':"default-src 'self'"} });
  vm.runInNewContext(read('sw.js'), { self:sw, URL, Response, Headers, fetch:fetchMock, Promise, Date, console });
  async function request(url, dest = 'document') { let result; const e = { request:{method:'GET',mode:'navigate',destination:dest,url}, waitUntil(){}, respondWith(p){result=p;} }; listeners.fetch(e); return result && await result; }
  const response = await request('https://rejson59.github.io/Test/'); const body = await response.text();
  assert.equal(response.headers.get('content-security-policy'), "default-src 'self'");
  assert.ok(body.indexOf('Content-Security-Policy') < body.indexOf('portal-arrival.js')); assert.match(body,/view-tracker\.js/); assert.match(body,/rejson-widgets\/widget\.js/); assert.match(body,/rejson-account\.js/);
  source = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'"><script src="/slow.js"></script></head><body></body></html>`;
  const early = await (await request('https://rejson59.github.io/Test/')).text();
  assert.ok(early.indexOf('Content-Security-Policy') < early.indexOf('portal-arrival.js'));
  assert.ok(early.indexOf('portal-arrival.js') < early.indexOf('/slow.js'));
  source = '<html><head><script src="/slow.js"></script></head><body></body></html>';
  const noMeta = await (await request('https://rejson59.github.io/Test/')).text();
  assert.ok(noMeta.indexOf('portal-arrival.js') < noMeta.indexOf('/slow.js'));
  source = '<html><head></head><body><!-- przykładowy rejson-widgets/widget.js --></body></html>';
  const commented = await (await request('https://rejson59.github.io/Example/')).text();
  assert.match(commented, /<script src="\/rejson-widgets\/widget\.js\?v=9"/);
  source = '<html><head></head><body><script defer data-project="Test" src="https://rejson59.github.io/rejson-widgets/widget.js?v=4"></script></body></html>';
  const existing = await (await request('https://rejson59.github.io/Example/')).text();
  assert.match(existing, /widget\.js\?v=9/); assert.equal((existing.match(/<script[^>]+rejson-widgets\/widget\.js/g) || []).length, 1);
  assert.match(existing, /data-project="Test"/);
  source = source.replace('?v=4','?v=99');
  const future = await (await request('https://rejson59.github.io/Example/')).text();
  assert.match(future, /widget\.js\?v=99/);
  for (const url of ['https://rejson59.github.io/portal/', 'https://rejson59.github.io/portal/RejStream', 'https://rejson59.github.io/partnerstwo', 'https://rejson59.github.io/rejfile', 'https://rejson59.github.io/rejfile.html', 'https://another.example/Test/']) assert.equal(await request(url), undefined);
  assert.equal(await request('https://rejson59.github.io/Test/', 'iframe'), undefined);
  assert.match(read('404.html'), /location\.replace\("\/portal\/\?projekt=/);
  console.log('PASS: linki w nowej karcie, portal, animacja, powrót, redukcja ruchu, adresy, ładowanie celu i SW');
})().catch(e => { console.error(e); process.exitCode = 1; });

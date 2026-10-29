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
  w.fetch = () => Promise.reject(new Error('offline'));
  let frames = [];
  w.requestAnimationFrame = cb => { frames.push(cb); return frames.length; };
  w.cancelAnimationFrame = () => { frames = []; };
  w.eval(ROOM);
  return { dom, w, doc: w.document, errors, frame: time => { const list = frames; frames = []; list.forEach(cb => cb(time)); }, frames: () => frames.length };
}
function arrival(marker, opts = {}) {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://rejson59.github.io/Test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.matchMedia = () => ({ matches: !!opts.reduced });
  Object.defineProperty(w.document, 'readyState', { configurable: true, value: opts.ready ? 'complete' : 'loading' });
  const timers = [];
  w.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
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
    assert.ok(portal.querySelector('canvas#portal-scene[aria-hidden="true"]'));
    assert.ok(portal.querySelector('#portal-door'));
    assert.ok(portal.querySelector('#flight .flight-flash'));
    assert.doesNotMatch(css, /portal-world\.jpg/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(read('js/portal-scene.js'), /requestAnimationFrame/);
    assert.ok(portal.querySelector('script[src*="portal-webgl.js"]'));
  }
  {
    // Udajemy GPU: renderer otrzymuje czas i postęp, a utrata kontekstu włącza fallback.
    const t = room('RejStream');
    const calls = [];
    const gl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
      ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLES: 8,
      createShader: () => ({}), shaderSource() {}, compileShader() {},
      getShaderParameter: () => true, deleteShader() {}, createProgram: () => ({}),
      attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
      deleteProgram() {}, useProgram() {}, createBuffer: () => ({}), bindBuffer() {},
      bufferData() {}, getAttribLocation: () => 0, enableVertexAttribArray() {},
      vertexAttribPointer() {}, getUniformLocation: (_, name) => name,
      viewport() {}, uniform2f() {}, uniform1f: (name, value) => calls.push([name, value]),
      drawArrays() { calls.push(['draw']); }
    };
    t.w.HTMLCanvasElement.prototype.getContext = type => type === 'webgl' ? gl : null;
    t.doc.getElementById('portal-door').getBoundingClientRect = () => ({ left:400, top:100, width:300, height:300 });
    t.w.eval(read('js/portal-webgl.js'));
    assert.ok(t.w.RJPortalScene); assert.equal(t.doc.querySelectorAll('canvas').length, 2);
    t.frame(100); assert.ok(calls.some(c => c[0] === 'draw'));
    t.w.RJPortalScene.start(4200); t.frame(200); t.frame(2300);
    assert.ok(calls.some(c => c[0] === 'journey' && c[1] > .4));
    const canvas = t.doc.querySelectorAll('canvas')[1];
    const lost = new t.w.Event('webglcontextlost', { cancelable:true });
    canvas.dispatchEvent(lost);
    assert.equal(lost.defaultPrevented, true); assert.equal(t.w.RJPortalScene, undefined);
    assert.ok(t.doc.querySelector('script[src*="portal-scene.js?v=2"]'));
    t.dom.window.close();
  }
  {
    // Brak WebGL albo błąd kompilacji nie blokuje wersji 2D.
    const t = room('RejStream');
    t.w.HTMLCanvasElement.prototype.getContext = () => null;
    t.w.eval(read('js/portal-webgl.js'));
    assert.equal(t.w.RJPortalScene, undefined); assert.equal(t.doc.querySelectorAll('canvas').length, 1);
    t.dom.window.close();
  }
  {
    const t = room('RejStream');
    const calls = [];
    const ctx = new Proxy({}, { get(obj, key) {
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key in obj) return obj[key];
      return () => calls.push(key);
    }, set(obj, key, value) { obj[key] = value; return true; } });
    t.w.HTMLCanvasElement.prototype.getContext = () => ctx;
    t.doc.getElementById('portal-door').getBoundingClientRect = () => ({ left:400, top:100, width:300, height:300 });
    t.w.eval(read('js/portal-scene.js'));
    assert.ok(t.w.RJPortalScene);
    assert.ok(t.doc.body.classList.contains('scene-ready'));
    t.frame(0); assert.ok(calls.includes('lineTo')); // żywy wir
    calls.length = 0;
    t.w.RJPortalScene.start(4200); t.frame(10); t.frame(2300);
    assert.ok(calls.includes('ellipse')); // perspektywiczne pierścienie tunelu
    t.w.RJPortalScene.reset(); t.dom.window.close();
  }
  {
    const t = room('RejStream', { reduced:true });
    let draws = 0;
    const ctx = new Proxy({}, { get(obj, key) {
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key in obj) return obj[key];
      return () => { draws++; };
    }, set(obj, key, value) { obj[key] = value; return true; } });
    t.w.HTMLCanvasElement.prototype.getContext = () => ctx;
    t.doc.getElementById('portal-door').getBoundingClientRect = () => ({ left:400, top:100, width:300, height:300 });
    t.w.eval(read('js/portal-scene.js'));
    assert.ok(draws > 0); assert.equal(t.frames(), 0); // statyczna alternatywa dla reduced motion
    t.dom.window.close();
  }
  {
    const t = room('RejStream');
    assert.equal(t.w.location.pathname, '/portal/RejStream');
    assert.equal(t.doc.getElementById('project-name').textContent, 'RejStream');
    assert.equal(t.doc.getElementById('direct').href, 'https://rejson59.github.io/RejStream/');
    assert.equal(t.doc.getElementById('enter').disabled, false);
    assert.equal(t.doc.getElementById('flight').classList.contains('is-active'), false); // bez automatycznej nawigacji
    t.doc.getElementById('enter').click();
    assert.ok(t.doc.getElementById('flight').classList.contains('is-active'));
    assert.equal(t.w.sessionStorage.getItem(KEY), null); // czekamy na całą animację
    t.frame(0); t.frame(4100); assert.equal(t.w.sessionStorage.getItem(KEY), null);
    t.frame(4200); assert.equal(JSON.parse(t.w.sessionStorage.getItem(KEY)).path, '/RejStream/');
    assert.ok(t.errors.some(x => /navigation/.test(x))); // jsdom nie nawiguje
    t.w.dispatchEvent(new t.w.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(t.doc.getElementById('flight').classList.contains('is-active'), false);
    assert.equal(t.doc.getElementById('enter').disabled, false); assert.equal(t.w.sessionStorage.getItem(KEY), null);
    t.dom.window.close();
  }
  {
    const t = room('Test', { cache: [{ name:'Test', homepage:'https://site.example/app', has_pages:true }] });
    assert.equal(t.doc.getElementById('direct').href, 'https://site.example/app');
    t.doc.getElementById('portal-door').click(); t.frame(0); t.frame(4200);
    assert.equal(t.w.sessionStorage.getItem(KEY), null); t.dom.window.close();
  }
  {
    const t = room('RejStream', { reduced:true }); t.doc.getElementById('enter').click();
    assert.equal(t.frames(), 0); assert.equal(t.doc.getElementById('flight').classList.contains('is-active'), false);
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
    const cover = t.doc.querySelector('#rj-portal-arrival'); assert.ok(cover); assert.equal(cover.className, '');
    assert.equal(t.w.sessionStorage.getItem(KEY), null); assert.equal(t.timers[0].delay, 12000);
    t.w.dispatchEvent(new t.w.Event('load')); assert.ok(cover.classList.contains('is-playing'));
    assert.equal(t.timers[1].delay, 2200); t.timers[1].fn(); assert.equal(t.doc.querySelector('#rj-portal-arrival'), null); t.dom.window.close();
  }
  {
    const t = arrival({ path:'/Test/', at:Date.now() }); t.timers[0].fn(); assert.ok(t.doc.querySelector('#rj-portal-arrival.is-playing')); t.dom.window.close();
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
  const source = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head><body>test</body></html>';
  const sw = { location:{ origin:'https://rejson59.github.io' }, addEventListener:(n,cb) => listeners[n]=cb };
  const fetchMock = async url => String(url).includes('/rest/') ? new Response('{}') : new Response(source, { headers:{'content-type':'text/html','content-security-policy':"default-src 'self'"} });
  vm.runInNewContext(read('sw.js'), { self:sw, URL, Response, Headers, fetch:fetchMock, Promise, Date, console });
  async function request(url, dest = 'document') { let result; const e = { request:{method:'GET',mode:'navigate',destination:dest,url}, waitUntil(){}, respondWith(p){result=p;} }; listeners.fetch(e); return result && await result; }
  const response = await request('https://rejson59.github.io/Test/'); const body = await response.text();
  assert.equal(response.headers.get('content-security-policy'), "default-src 'self'");
  assert.ok(body.indexOf('Content-Security-Policy') < body.indexOf('portal-arrival.js')); assert.match(body,/view-tracker\.js/); assert.match(body,/rejson-widgets\/widget\.js/);
  for (const url of ['https://rejson59.github.io/portal/', 'https://rejson59.github.io/portal/RejStream', 'https://rejson59.github.io/partnerstwo', 'https://another.example/Test/']) assert.equal(await request(url), undefined);
  assert.equal(await request('https://rejson59.github.io/Test/', 'iframe'), undefined);
  assert.match(read('404.html'), /location\.replace\("\/portal\/\?projekt=/);
  console.log('PASS: linki w nowej karcie, portal, animacja, powrót, redukcja ruchu, adresy, ładowanie celu i SW');
})().catch(e => { console.error(e); process.exitCode = 1; });

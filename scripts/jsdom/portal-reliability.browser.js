/* Chromium: npm install; CHROME_BIN=/path/to/chromium node portal-reliability.browser.js */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN to a Chromium executable');
let releaseWorker;
const workerGate = new Promise(resolve => { releaseWorker = resolve; });
const project = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><link rel="stylesheet" href="/project.css"></head><body><main>Projekt</main></body></html>';
const hiddenProject = project.replace('</head>', '<link rel="stylesheet" href="/css/portal.css" data-rj-portal-style><script src="/js/portal-arrival.js"></script></head>');
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/sw.js') await workerGate; // pierwsza instalacja jest wolniejsza niż lot
  if (pathname === '/Test/' || pathname === '/Hidden/') {
    res.writeHead(200, { 'content-type':'text/html' }); res.end(pathname === '/Test/' ? project : hiddenProject); return;
  }
  if (pathname === '/project.css') {
    res.writeHead(200, { 'content-type':'text/css' }); res.end('@media (prefers-reduced-motion:reduce) { * { animation:none !important } }'); return;
  }
  if (pathname === '/js/view-tracker.js' || pathname === '/rejson-widgets/widget.js') {
    res.writeHead(200, { 'content-type':'text/javascript' }); res.end(''); return;
  }
  const safe = pathname === '/portal/' ? '/portal/index.html' : pathname;
  const file = path.resolve(root, '.' + safe);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
  res.writeHead(200, { 'content-type':type, 'cache-control':'no-store' }); res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath:process.env.CHROME_BIN, headless:true, args:['--no-sandbox','--disable-webgl'] });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const c = await browser.newContext({ reducedMotion:'reduce' });
    await c.addInitScript(() => localStorage.setItem('rejson_repos_cache_v2', JSON.stringify({data:[{name:'Test',homepage:location.origin+'/Test/'}]})));
    const p = await c.newPage(); await p.goto(origin + '/portal/?projekt=Test');
    await p.locator('#enter').click();
    await p.waitForTimeout(5500);
    assert.equal(new URL(p.url()).pathname, '/portal/Test');
    assert.equal(await p.evaluate(() => sessionStorage.getItem('rj_portal_arrival_v1')), null);
    assert.equal(await p.locator('#flight').getAttribute('class'), 'flight is-active');
    releaseWorker();
    await p.waitForURL('**/Test/', { timeout:20000 });
    await p.waitForSelector('#rj-portal-arrival.is-playing', { timeout:10000 });
    assert.equal(await p.locator('.rj-arrival-ring').evaluate(el => getComputedStyle(el).animationName), 'rj-arrival-ring');
    await p.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:20000});
    await p.reload(); assert.equal(await p.locator('#rj-portal-arrival').count(), 0);
    await c.close();

    const bg = await browser.newContext({ reducedMotion:'reduce' });
    await bg.addInitScript(() => {
      window.testVisibility = 'hidden';
      Object.defineProperty(document, 'visibilityState', { configurable:true, get:() => window.testVisibility });
      sessionStorage.setItem('rj_portal_arrival_v1', JSON.stringify({path:'/Hidden/',at:Date.now(),motionOverride:true}));
    });
    const q = await bg.newPage(); await q.goto(origin + '/Hidden/');
    const cover = q.locator('#rj-portal-arrival');
    await q.waitForSelector('#rj-portal-arrival.is-playing.is-paused');
    await q.waitForTimeout(5000);
    assert.equal(await cover.count(), 1);
    assert.equal(await cover.evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
    assert.ok(await cover.evaluate(el => el.getAnimations().every(a => a.currentTime < 100)));
    await q.evaluate(() => { window.testVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await q.waitForTimeout(600);
    assert.equal(await cover.evaluate(el => getComputedStyle(el).animationPlayState), 'running');
    assert.ok(await cover.evaluate(el => el.getAnimations().some(a => a.currentTime > 250)));
    await q.evaluate(() => { window.testVisibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
    const pausedAt = await cover.evaluate(el => el.getAnimations()[0].currentTime);
    await q.waitForTimeout(4500);
    assert.equal(await cover.count(), 1);
    assert.ok(Math.abs((await cover.evaluate(el => el.getAnimations()[0].currentTime)) - pausedAt) < 100);
    await q.evaluate(() => { window.testVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await cover.waitFor({state:'detached',timeout:20000});
    await bg.close();
    console.log('PASS: powolna pierwsza instalacja SW i wyjście w tle z pauzą');
  } finally { releaseWorker(); await browser.close(); server.close(); }
})().catch(e => { console.error(e); releaseWorker(); server.close(); process.exitCode = 1; });

/* Chromium regression test: npm install; CHROME_BIN=/path/to/chromium node portal-cascade.browser.js */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../..');
const chrome = process.env.CHROME_BIN;
if (!chrome) throw new Error('Set CHROME_BIN to a Chromium executable');
const html = `<!doctype html><html><head><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'">
  <link rel="stylesheet" href="/project.css">
  <link rel="stylesheet" href="/css/portal.css" data-rj-portal-style>
  <script src="/js/portal-arrival.js"></script>
</head><body><main>Projekt</main><img src="/slow.png" alt=""></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/Test/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
  if (req.url === '/project.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end('@media (prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important } }'); return; }
  if (req.url === '/slow.png') { setTimeout(() => { res.writeHead(404); res.end(); }, 1200); return; }
  if (req.url === '/css/portal.css' || req.url === '/js/portal-arrival.js') {
    res.writeHead(200, { 'Content-Type': req.url.endsWith('.css') ? 'text/css' : 'text/javascript' });
    res.end(fs.readFileSync(path.join(root, req.url))); return;
  }
  res.writeHead(404); res.end();
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-webgl'] });
  try {
    const context = await browser.newContext({ reducedMotion:'reduce' });
    await context.addInitScript(() => sessionStorage.setItem('rj_portal_arrival_v1', JSON.stringify({ path:'/Test/', at:Date.now(), motionOverride:true })));
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/Test/`, { waitUntil:'domcontentloaded' });
    const cover = page.locator('#rj-portal-arrival');
    assert.equal(await cover.count(), 1);
    assert.equal(await cover.evaluate(el => el.classList.contains('is-playing')), false); // czeka na obraz
    await page.waitForFunction(() => document.querySelector('#rj-portal-arrival.is-playing'));
    const result = await cover.evaluate(el => {
      const selectors = [null,'.rj-arrival-veil','.rj-arrival-small','.rj-arrival-medium','.rj-arrival-wide','.rj-arrival-ring'];
      const styles = selectors.map(s => { const cs = getComputedStyle(s ? el.querySelector(s) : el); return [cs.animationName, cs.animationDuration]; });
      const animations = el.getAnimations({ subtree:true });
      animations.forEach(a => a.pause());
      const values = [500,1400,2200].map(t => {
        animations.forEach(a => { a.currentTime = t; });
        return selectors.slice(1).map(s => Number(getComputedStyle(el.querySelector(s)).opacity));
      });
      animations.forEach(a => a.play());
      return { styles, values };
    });
    assert.deepEqual(result.styles.map(s => s[0]), ['rj-arrival-finished','rj-veil-reveal','rj-small-reveal','rj-medium-reveal','rj-wide-reveal','rj-arrival-ring']);
    assert.ok(result.styles.every(s => s[1] === '2.8s'));
    assert.ok(result.values[0][1] > .9 && result.values[1][1] < result.values[0][1] && result.values[2][1] < .1);
    assert.ok(result.values[1][2] < result.values[0][2] && result.values[2][3] < result.values[1][3]);
    assert.ok(result.values[1][4] > .4);
    await cover.waitFor({ state:'detached', timeout:15000 });
    console.log('PASS: CSP, opóźnione ładowanie i wyjście z portalu mimo globalnego animation:none');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });

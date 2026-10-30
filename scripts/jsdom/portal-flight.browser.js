/* Chromium: CHROME_BIN=/path/to/chromium node portal-flight.browser.js */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN to a Chromium executable');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/portal/' ? '/portal/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type':file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream', 'cache-control':'no-store' });
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath:process.env.CHROME_BIN, headless:true, args:['--no-sandbox','--disable-webgl'] });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const context = await browser.newContext({ reducedMotion:'reduce', viewport:{width:1440,height:900} });
    const page = await context.newPage();
    await page.goto(origin + '/portal/?projekt=RejStream');
    await page.locator('#enter').click();
    const result = await page.evaluate(() => {
      const flight = document.querySelector('#flight');
      const source = document.querySelector('#flight-mouth .flight-source');
      const rail = document.querySelector('.tunnel-rails i');
      const ring = document.querySelector('.tunnel-ring');
      const styles = el => ({ opacity:+getComputedStyle(el).opacity, transform:getComputedStyle(el).transform });
      const animations = flight.getAnimations({subtree:true});
      animations.forEach(a => a.pause());
      function at(ms) {
        animations.forEach(a => { a.currentTime = ms; });
        return { mouth:styles(document.querySelector('.flight-mouth')), tunnel:styles(document.querySelector('.flight-tunnel')),
          darkness:styles(document.querySelector('.flight-darkness')), rail:styles(rail), ring:styles(ring), sourceVisibility:getComputedStyle(source).visibility };
      }
      return { first:at(300), middle:at(1700), later:at(2300), end:at(4200),
        orbitAnimation:getComputedStyle(source.querySelector('.orbit-one')).animationName,
        originalPaused:getComputedStyle(document.querySelector('#portal-door .orbit-one')).animationPlayState,
        sourceOrbitPlayState:getComputedStyle(source.querySelector('.orbit-one')).animationPlayState };
    });
    assert.equal(result.orbitAnimation, 'orbit-one'); // rzeczywista animowana brama
    assert.equal(result.originalPaused, 'paused');
    assert.notEqual(result.first.mouth.transform, result.middle.mouth.transform);
    assert.ok(result.middle.tunnel.opacity > result.first.tunnel.opacity);
    assert.notEqual(result.middle.rail.transform, result.later.rail.transform);
    assert.notEqual(result.middle.ring.transform, result.later.ring.transform);
    assert.equal(result.first.sourceVisibility, 'visible');
    assert.equal(result.end.sourceVisibility, 'hidden');
    assert.ok(result.end.darkness.opacity > .99); // bez białego błysku
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable:true, value:'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('.tunnel-rails i').first().evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true})));
    assert.equal(await page.locator('#flight .flight-source').count(), 0);
    assert.equal(await page.locator('#flight.is-active').count(), 0);
    await context.close();
    const off = await browser.newContext({reducedMotion:'reduce'});
    await off.addInitScript(() => localStorage.setItem('rejson_repos_cache_v2', JSON.stringify({data:[{name:'Test',homepage:location.origin+'/Test/'}]})));
    const p = await off.newPage(); await p.goto(origin + '/portal/?projekt=Test');
    await p.locator('#motion-toggle').click();
    await p.locator('#enter').click();
    await p.waitForURL('**/Test/', { timeout:10000 });
    assert.equal(await p.evaluate(() => sessionStorage.getItem('rj_portal_arrival_v1')), null);
    await off.close();
    console.log('PASS: żywa brama, ruch prowadnic i obręczy, czerń, pauza, powrót, reduced motion i wyłączenie');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });

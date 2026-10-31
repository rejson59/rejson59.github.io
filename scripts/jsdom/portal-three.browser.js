/* Real WebGL via SwiftShader; fallback and mobile geometry have separate tests. */
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core'), root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw Error('Set CHROME_BIN');
const server = http.createServer((req, res) => {
  let p = new URL(req.url, 'http://localhost').pathname; if (p === '/portal/') p = '/portal/index.html';
  const file = path.resolve(root, '.' + p);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  const type = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, {'content-type':type, 'cache-control':'no-store'}); fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath:process.env.CHROME_BIN, headless:true,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport:{width:800,height:600}, reducedMotion:'reduce' });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/portal/?projekt=RejStream`, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.RJPortal3D?.state().available, null, {timeout:30000});
    let state = await page.evaluate(() => window.RJPortal3D.state());
    assert.equal(state.fragments, 72); assert.equal(state.moving, true); // także reduced motion — decyzja użytkownika
    assert.equal(await page.locator('#three-scene canvas').count(), 1);
    assert.equal(await page.locator('#three-scene canvas').evaluate(c => !!c.getContext('webgl2')), true);
    await page.evaluate(() => { document.querySelector('#flight').classList.add('is-active'); const mouth = document.querySelector('#flight-mouth'); mouth.classList.add('has-source'); const source = document.querySelector('#portal-door .portal-layers').cloneNode(true); source.classList.add('flight-source'); mouth.appendChild(source); });
    assert.equal(await page.locator('#flight-mouth').evaluate(el => getComputedStyle(el).visibility), 'hidden');
    assert.equal(await page.locator('#flight-mouth .flight-source').evaluate(el => getComputedStyle(el).visibility), 'hidden');
    await page.evaluate(() => { document.querySelector('#flight').classList.remove('is-active'); document.querySelector('#flight-mouth').classList.remove('has-source'); document.querySelector('#flight-mouth .flight-source').remove(); });
    await page.setViewportSize({width:900,height:650});
    await page.waitForFunction(() => document.querySelector('#three-scene canvas').width === 900, null, {timeout:15000});
    await page.mouse.move(760, 100);
    await page.waitForFunction(() => Math.abs(window.RJPortal3D.state().cameraX) > .05, null, {timeout:15000});
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', {configurable:true,value:'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal((await page.evaluate(() => window.RJPortal3D.state())).moving, false);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', {configurable:true,value:'visible'}); document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('#motion-toggle').click();
    state = await page.evaluate(() => window.RJPortal3D.state());
    assert.equal(state.moving, false); assert.equal(state.cameraZ, 13);
    await page.locator('#motion-toggle').click();
    await page.evaluate(() => document.dispatchEvent(new Event('rj-portal-flight')));
    await page.waitForFunction(() => window.RJPortal3D.state().cameraZ < 12, null, {timeout:15000});
    state = await page.evaluate(() => window.RJPortal3D.state()); assert.equal(state.flying, true);
    await page.evaluate(() => document.dispatchEvent(new Event('rj-portal-reset')));
    state = await page.evaluate(() => window.RJPortal3D.state()); assert.equal(state.flying, false); assert.equal(state.cameraZ, 13);
    const canLose = await page.locator('#three-scene canvas').evaluate(canvas => {
      const ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context'); if (!ext) return false; window.testLoseContext = ext; ext.loseContext(); return true;
    });
    if (canLose) {
      await page.waitForFunction(() => !document.body.classList.contains('three-ready'), null, {timeout:15000});
      assert.equal(await page.locator('#portal-door').isEnabled(), true);
      assert.match(await page.locator('#scene-status').textContent(), /niedostępna/);
      assert.equal(await page.locator('#three-scene canvas').evaluate(c => getComputedStyle(c).visibility), 'hidden');
      await page.evaluate(() => window.testLoseContext.restoreContext());
      await page.waitForFunction(() => document.body.classList.contains('three-ready'), null, {timeout:15000});
      assert.equal(await page.locator('#three-scene canvas').evaluate(c => getComputedStyle(c).visibility), 'visible');
      assert.equal((await page.evaluate(() => window.RJPortal3D.state())).available, true);
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: WebGL2/Three.js, 3D, kamera, lot, pauza, opt-out i utrata kontekstu');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

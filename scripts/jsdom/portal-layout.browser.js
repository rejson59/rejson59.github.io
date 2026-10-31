/* Testy geometrii i interakcji: bez zrzutów ekranu mobile. */
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const {chromium} = require('playwright-core'), root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw Error('Set CHROME_BIN');
const server = http.createServer((req, res) => {
  let p = new URL(req.url, 'http://localhost').pathname; if (p === '/portal/') p = '/portal/index.html';
  const f = path.resolve(root, '.' + p);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return res.writeHead(404).end();
  const t = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[path.extname(f)] || 'application/octet-stream';
  res.writeHead(200, {'content-type':t}); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN, headless:true, args:['--no-sandbox','--disable-webgl']});
  try {
    const p = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}), origin = `http://127.0.0.1:${server.address().port}`;
    for (const [width,height] of [[320,568],[320,820],[375,667],[700,820],[760,820],[900,820],[1024,820],[1440,820]]) {
      await p.setViewportSize({width,height}); await p.goto(origin+'/portal/?projekt=RejStream',{waitUntil:'domcontentloaded'});
      const r = await p.evaluate(() => {
        const rect = sel => document.querySelector(sel).getBoundingClientRect().toJSON();
        return {width:innerWidth, scroll:document.documentElement.scrollWidth, title:rect('.intro'), door:rect('.world-frame'), actions:rect('.actions'), enter:rect('#enter')};
      });
      const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      assert(r.scroll <= r.width, `${width}x${height}: poziome przewijanie ${r.scroll}`);
      assert(!overlaps(r.title,r.door), `${width}x${height}: tytuł zasłania szczelinę`);
      assert(!overlaps(r.enter,r.door), `${width}x${height}: przycisk zasłania szczelinę`);
      assert.equal(await p.locator('#enter').isEnabled(), true);
      await p.locator('#enter').scrollIntoViewIfNeeded();
      assert(await p.locator('#enter').isVisible());
    }
    // Długie nazwy i opisy nie mogą zasłonić wejścia ani sterowania.
    const longName = 'A'.repeat(100);
    await p.addInitScript(name => localStorage.setItem('rejson_repos_cache_v2', JSON.stringify({data:[{name, homepage:location.origin+'/Test/', description:'Opis '.repeat(30)}]})), longName);
    for (const [width,height] of [[320,568],[375,667],[1440,900]]) {
      await p.setViewportSize({width,height}); await p.goto(origin+'/portal/?projekt='+longName);
      const layout = await p.evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect().toJSON();
        return {title:r('.intro'),door:r('.world-frame'),actions:r('.actions'),scroll:document.documentElement.scrollWidth,width:innerWidth};
      });
      const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      assert(!overlaps(layout.title,layout.door), `${width}: długa nazwa zasłania wejście`);
      assert(!overlaps(layout.door,layout.actions), `${width}: wejście zasłania sterowanie`);
      assert(layout.scroll <= layout.width, `${width}: poziome przewijanie`);
    }
    await p.setViewportSize({width:1440,height:900});
    await p.goto(origin+'/portal/?projekt=RejStream');
    // Brak WebGL nie blokuje ani wejścia, ani wyłączenia animacji.
    await p.waitForFunction(() => document.body.classList.contains('three-fallback'));
    assert.equal(await p.locator('#portal-door').isEnabled(), true);
    assert.match(await p.locator('#scene-status').textContent(), /niedostępna/);
    await p.locator('#motion-toggle').click();
    assert.equal(await p.locator('#motion-toggle').getAttribute('aria-pressed'), 'false');
    assert.equal(await p.locator('.gate-energy').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    console.log('PASS: geometria, fallback bez WebGL i wyłączenie ruchu');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode=1; });

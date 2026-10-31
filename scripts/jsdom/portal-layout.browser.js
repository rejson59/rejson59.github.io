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
    await p.setViewportSize({width:1440,height:900});
    await p.goto(origin+'/portal/?projekt=RejStream');
    assert.equal(await p.locator('.starfield i').first().evaluate(el => getComputedStyle(el).animationName), 'star-spark');
    await p.mouse.move(100,100); await p.waitForTimeout(650);
    assert.notEqual(await p.locator('#cosmos-art').evaluate(el => el.style.transform), 'translate3d(0px, 0px, 0px)');
    await p.locator('#motion-toggle').click();
    assert.equal(await p.locator('.starfield i').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await p.locator('#motion-toggle').getAttribute('aria-pressed'), 'false');
    assert.equal(await p.locator('#cosmos-art').evaluate(el => el.style.transform), 'translate3d(0px, 0px, 0px)');
    await p.mouse.move(1200,100); await p.waitForTimeout(100);
    assert.equal(await p.locator('#cosmos-art').evaluate(el => el.style.transform), 'translate3d(0px, 0px, 0px)');
    console.log('PASS: geometria, interakcje, paralaksa i wyłączenie ruchu');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode=1; });

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
      assert(layout.title.bottom <= layout.door.top, `${width}: długa nazwa zasłania wejście`);
      assert(layout.door.bottom <= layout.actions.top, `${width}: wejście zasłania sterowanie`);
      assert(layout.scroll <= layout.width, `${width}: poziome przewijanie`);
    }
    await p.setViewportSize({width:1440,height:900});
    await p.goto(origin+'/portal/?projekt=RejStream');
    assert.equal(await p.locator('.step').first().evaluate(el => getComputedStyle(el).animationName), 'step-float');
    const perspective = await p.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      return {far:r('.step:first-child').width, near:r('.step:last-child').width, style:getComputedStyle(document.querySelector('.step')).transform};
    });
    assert(perspective.near > perspective.far * 2, 'rzeczywista perspektywa zmniejsza dalekie stopnie');
    assert.match(perspective.style, /matrix3d/);
    const motion = await p.locator('.step').last().evaluate(el => {
      const animation = el.getAnimations()[0]; animation.pause(); animation.currentTime = 0;
      const first = getComputedStyle(el).transform;
      animation.currentTime = 6000; const last = getComputedStyle(el).transform;
      animation.play(); return [first,last];
    });
    assert.notEqual(motion[0], motion[1], 'stopnie rzeczywiście się poruszają');
    await p.mouse.move(100,100); await p.waitForTimeout(650);
    assert.notEqual(await p.locator('#scene-camera').evaluate(el => el.style.transform), 'translate3d(0px, 0px, 0px)');
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', {configurable:true,value:'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await p.locator('.step').first().evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', {configurable:true,value:'visible'}); document.dispatchEvent(new Event('visibilitychange')); });
    await p.locator('#motion-toggle').click();
    assert.equal(await p.locator('#motion-toggle').getAttribute('aria-pressed'), 'false');
    assert.equal(await p.locator('.step').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await p.locator('#scene-camera').evaluate(el => el.style.transform), 'translate3d(0px, 0px, 0px)');
    await p.mouse.move(1200,100); await p.waitForTimeout(100);
    assert.equal(await p.locator('#scene-camera').evaluate(el => el.style.transform), 'translate3d(0px, 0px, 0px)');
    console.log('PASS: geometria, interakcje, paralaksa i wyłączenie ruchu');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode=1; });

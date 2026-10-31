/* Konto po lewej: geometria desktopu, pełna karta i dostępność, bez mobilnych zrzutów. */
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw Error('Set CHROME_BIN');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p === '/') p = '/index.html';
  else if (!path.extname(p) && fs.existsSync(path.join(root, p + '.html'))) p += '.html';
  const file = path.resolve(root, '.' + p);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const type = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, {'content-type':type, 'cache-control':'no-store'}); fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  try {
    for (const loggedIn of [false,true]) {
      const ctx = await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
      await ctx.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(origin + '/')) return route.continue();
        if (url.includes('/rest/v1/rpc/')) return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:'[]'});
        return route.abort();
      });
      if (loggedIn) await ctx.addInitScript(() => localStorage.setItem('rejson_community_session_v1', JSON.stringify({token:'t'.repeat(40),username:'RejsonFan'})));
      const p = await ctx.newPage();
      await p.goto(origin+'/', {waitUntil:'domcontentloaded'});
      await p.evaluate(() => document.querySelector('#rj-page-loader')?.remove());
      const mini=p.locator('#rj-account-mini'), details=p.locator('#rj-account-details'), open=p.locator('#rj-account-mini-open');
      await mini.waitFor({state:'visible'});
      assert.equal(await details.isVisible(),false);
      assert.equal(await mini.locator('.rj-premium__glow').evaluate(el=>getComputedStyle(el).animationName),'rj-premium-sweep');
      assert.equal(await mini.locator('.rj-premium__sheen').evaluate(el=>getComputedStyle(el).animationName),'rj-premium-sheen');
      assert.match(await p.locator('#rj-account-mini-title').innerText(),loggedIn?/RejsonFan/:/Twoje miejsce/);
      assert.match(await p.locator('#rj-account-mini-link').innerText(),loggedIn?/Przejdź do konta/:/Załóż konto/);
      for (const width of [1200,1280,1440,1920]) {
        await p.setViewportSize({width,height:900});
        const box=await p.evaluate(()=>{const l=document.querySelector('#rj-account-mini').getBoundingClientRect(),m=document.querySelector('body > main').getBoundingClientRect(),r=document.querySelector('.rj-side-ads').getBoundingClientRect();return {l:{left:l.left,right:l.right,width:l.width},m:{left:m.left,right:m.right},r:{left:r.left,width:r.width},vw:innerWidth,sw:document.documentElement.scrollWidth};});
        assert(box.l.right<=box.m.left && box.m.right<=box.r.left,`${width}: brak kolizji: ${JSON.stringify(box)}`);
        assert(Math.abs((box.m.left+box.m.right)/2-width/2)<2,`${width}: środek`);
        assert.equal(Math.round(box.l.width),Math.round(box.r.width));
        assert(box.sw<=box.vw,`${width}: brak poziomego przewijania`);
      }
      await p.setViewportSize({width:1440,height:900});
      if (!loggedIn && process.env.SCREENSHOT_DESKTOP) await p.screenshot({path:process.env.SCREENSHOT_DESKTOP});
      await open.click(); assert.equal(await open.getAttribute('aria-expanded'),'true'); assert.equal(await details.isVisible(),true);
      assert.equal(await p.evaluate(()=>document.activeElement.id),'rj-account-details-close');
      assert.equal(await p.locator('#rj-club .rj-premium').isVisible(),true);
      if (loggedIn) {
        assert.match(await p.locator('#rj-club').innerText(),/Wszystko odblokowane/);
        const follow = p.locator('#rj-club [data-follow]').first();
        await follow.click(); assert.equal(await follow.getAttribute('aria-pressed'),'true');
      } else {
        assert.match(await p.locator('#rj-club').innerText(),/Premium jest u mnie za darmo/);
        assert.equal(await p.locator('#rj-club .rj-cta').getAttribute('href'),'logowanie');
      }
      await p.keyboard.press('Escape'); assert.equal(await details.isVisible(),false); assert.equal(await open.getAttribute('aria-expanded'),'false');
      assert.equal(await p.evaluate(()=>document.activeElement.id),'rj-account-mini-open');
      await open.click(); await p.locator('#rj-account-details-close').click(); assert.equal(await details.isVisible(),false);
      await p.setViewportSize({width:375,height:800});
      assert.equal(await mini.isVisible(),false); assert.equal(await details.isVisible(),true);
      assert.equal(await p.locator('#rj-club .rj-premium').isVisible(),true);
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await ctx.close();
    }
    const nojs=await browser.newContext({viewport:{width:1440,height:900},javaScriptEnabled:false});
    const p=await nojs.newPage(); await p.goto(origin+'/',{waitUntil:'domcontentloaded'});
    assert.equal(await p.locator('#rj-account-mini').isVisible(),false);
    assert.equal(await p.locator('#rj-club .rj-premium').isVisible(),true);
    await nojs.close();
    console.log('PASS: baner konta po lewej, pełne szczegóły, obie sesje, responsywność i brak JS');
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

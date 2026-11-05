/* Reklamy znikają tylko w panelu admina; pomiary zamiast zrzutów. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw Error('Set CHROME_BIN');
const server = http.createServer((req,res) => {
  let u = new URL(req.url, 'http://localhost').pathname;
  if (u === '/') u = '/index.html';
  else if (!path.extname(u) && fs.existsSync(path.join(root, u + '.html'))) u += '.html';
  const f = path.resolve(root, '.' + u);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return res.writeHead(404).end();
  res.writeHead(200, {'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(f)] || 'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  try {
    for (const javascriptEnabled of [true,false]) {
      const context = await browser.newContext({viewport:{width:320,height:850},javascriptEnabled,serviceWorkers:'block'});
      await context.route('**/*', route => route.request().url().startsWith(origin+'/') ? route.continue() : route.abort());
      const page = await context.newPage(), adRequests = [];
      page.on('request', req => { if (/\/(?:mobile|side)-ads\.(?:js|css)/.test(req.url())) adRequests.push(req.url()); });
      for (const route of ['/admin','/admin.html']) for (const width of [320,375,1200,1440]) {
        await page.setViewportSize({width,height:850});
        await page.goto(origin+route,{waitUntil:'domcontentloaded'});
        if (javascriptEnabled) await page.evaluate(() => document.querySelector('#rj-page-loader')?.remove());
        assert.equal(await page.locator('#rj-mobile-ads, .rj-side-ads, .rj-mobile-ads-spacer').count(),0,route+': brak reklam i pustej rezerwy');
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('rj-mobile-ads-active') || document.body.classList.contains('rj-side-ads-enabled')),false);
        assert(await page.locator('#panel-pass').isVisible(),route+': formularz admina dostępny');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),route+': bez przepełnienia');
      }
      assert.deepEqual(adRequests,[], 'panel nie ładuje zasobów reklam');
      await page.setViewportSize({width:375,height:850});
      await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
      if (javascriptEnabled) await page.evaluate(() => document.querySelector('#rj-page-loader')?.remove());
      await page.locator('#rj-mobile-ads').waitFor({state:'visible'});
      if (javascriptEnabled) {
        await page.setViewportSize({width:1440,height:850});
        await page.locator('.rj-side-ads').waitFor({state:'visible'});
      }
      await context.close();
    }
    console.log('PASS: admin bez reklam i rezerwy na telefonie i desktopie, także bez JS; reklamy na stronie głównej pozostają');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode=1; });

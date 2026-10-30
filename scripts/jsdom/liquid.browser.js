/* Bez zrzutów ekranu: CHROME_BIN=/ścieżka/chromium node liquid.browser.js */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN to a Chromium executable');
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const ext = path.extname(file);
  const type = ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif'})[ext] || 'application/octet-stream';
  res.writeHead(200, {'content-type': type}); res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const context = await browser.newContext();
    await context.route('**/*', r => r.request().url().startsWith(origin + '/') ? r.continue() : r.abort());
    const page = await context.newPage();
    const urls = ['/index.html','/rejchat.html','/widzety.html','/logowanie.html','/tablica-pomyslow.html','/admin.html','/rejfile.html','/partnerstwo.html','/portal/index.html?projekt=RejStream','/rejson-widgets/index.html','/404.html'];
    for (const width of [320,375,760,800,1024,1200,1201,1440]) {
      await page.setViewportSize({width,height:900});
      for (const url of urls) {
        await page.goto(origin + url,{waitUntil:'domcontentloaded'});
        await page.evaluate(() => document.querySelector('#rj-page-loader')?.remove());
        const result = await page.evaluate(() => {
          const clipped = [...document.querySelectorAll('header a, header button')].filter(el => {
            if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return false;
            const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1;
          }).map(el => el.textContent.trim().slice(0,35));
          return {scroll:document.documentElement.scrollWidth,clipped};
        });
        assert.ok(result.scroll <= width, `${url} ${width}: poziome przewijanie ${result.scroll}`);
        assert.deepEqual(result.clipped,[],`${url} ${width}: ucięte elementy nagłówka`);
        if (width === 375 && ['/rejchat.html','/widzety.html'].includes(url)) {
          await page.click('#liquid-menu-toggle');
          assert.equal(await page.getAttribute('#liquid-menu-toggle','aria-expanded'),'true');
          await page.keyboard.press('Escape');
          assert.equal(await page.getAttribute('#liquid-menu-toggle','aria-expanded'),'false');
        }
        if (width === 800 && url === '/index.html') {
          await page.click('#menu-toggle');
          assert.equal(await page.getAttribute('#menu-toggle','aria-expanded'),'true');
        }
      }
    }
    await page.goto(origin + '/rejchat.html',{waitUntil:'domcontentloaded'});
    await page.evaluate(() => document.querySelector('#rj-page-loader')?.remove());
    assert.equal(await page.locator('#chat-form').evaluate(e => getComputedStyle(e).display),'none');
    await page.goto(origin + '/rejson-widgets/index.html',{waitUntil:'domcontentloaded'});
    await page.click('[data-opt-group="backdrop"][data-opt-val="vivid"]');
    assert.equal(await page.locator('body').getAttribute('data-backdrop'),'vivid');
    assert.match(await page.locator('.studio-backdrop').evaluate(e=>getComputedStyle(e).backgroundImage), /radial-gradient/);
    console.log('PASS: szerokości stron, menu i stany ukryte oraz konfigurator widżetu');
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

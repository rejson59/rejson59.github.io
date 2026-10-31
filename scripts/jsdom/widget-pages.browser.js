/* Desktop browser smoke test of the actual pages, no screenshots or external requests. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN');
const server = http.createServer((req,res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (!path.extname(rel)) rel += '.html';
  const file = path.resolve(root, '.' + rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404); return res.end('missing');}
  const ext = path.extname(file);
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
  res.writeHead(200, {'content-type':types[ext] || 'application/octet-stream','cache-control':'no-store'}); res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/','/404.html','/admin.html','/logowanie.html','/partnerstwo.html','/profil.html','/rejchat.html','/rejfile.html','/tablica-pomyslow.html','/widzety.html','/portal/index.html?projekt=RejStream','/rejson-widgets/index.html']) {
      const context = await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
      try {
        await context.route('**/*', r => r.request().url().startsWith(origin+'/') ? r.continue() : r.abort());
        const page = await context.newPage();
        await page.goto(origin+route,{waitUntil:'domcontentloaded'});
        const host = page.locator('#rejson-liquid-widget-root');
        await host.waitFor({state:'attached',timeout:10000});
        assert.equal(await host.count(),1,route+' single widget');
        const button = host.locator('.rj-closed');
        await button.waitFor({state:'visible',timeout:10000});
        await button.click({timeout:12000});
        assert.equal(await page.evaluate(() => window.RejsonWidget.getState().open),true,route+' opens');
        assert.equal(await page.evaluate(() => !!window.RJMedia),true,route+' media loaded');
        console.log('PASS',route);
      } finally { await context.close(); }
    }
  } finally {await browser.close(); server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

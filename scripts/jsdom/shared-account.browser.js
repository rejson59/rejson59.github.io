/* CHROME_BIN=/ścieżka/chromium node shared-account.browser.js — lokalny mock Supabase */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN');
const token = 'a'.repeat(48);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/start') { res.writeHead(200, {'content-type':'text/html'}); return res.end('<html><head></head><body>Start</body></html>'); }
  if (pathname === '/A/' || pathname === '/B/') { res.writeHead(200, {'content-type':'text/html'}); return res.end('<!doctype html><html><head><title>Projekt</title></head><body>Projekt</body></html>'); }
  if (pathname === '/js/view-tracker.js') { res.writeHead(200, {'content-type':'text/javascript'}); return res.end(''); }
  const requested = pathname === '/logowanie' ? '/logowanie.html' : pathname;
  const file = path.resolve(root, '.' + requested);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'image/svg+xml';
  res.writeHead(200, {'content-type':type, 'cache-control':'no-store'}); res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  try {
    const c = await browser.newContext({viewport:{width:1000,height:700}});
    await c.route('https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/**', async route => {
      const fn = new URL(route.request().url()).pathname.split('/').pop();
      let data = {};
      if (fn === 'community_whoami') data = {username:JSON.parse(route.request().postData() || '{}').p_token === token ? 'Alice' : null};
      if (fn === 'community_login' || fn === 'community_register') data = {token,username:'Alice'};
      await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
    });
    await c.route('**/*', route => {
      const u=route.request().url();
      if (u.startsWith(origin) || u.startsWith('https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/')) return route.fallback();
      return route.abort();
    });
    const p = await c.newPage();
    await p.goto(origin+'/start');
    await p.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;});
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await p.goto(origin+'/A/?tryb=gra#start');
    await p.waitForFunction(()=>!!window.RejsonAccount && !!window.RejsonWidget);
    const host=p.locator('#rejson-liquid-widget-root');
    await p.evaluate(()=>window.RejsonWidget.open());
    await host.locator('.rj-account').waitFor({state:'visible'});
    for (const width of [320,375,768,1440]) {
      await p.setViewportSize({width,height:700});
      await p.waitForTimeout(80);
      const geometry = await host.locator('.rj-account').evaluate(el => {
        const account = el.getBoundingClientRect(), top = el.closest('.rj-top').getBoundingClientRect(), segment = el.closest('.rj-top').querySelector('.rj-seg').getBoundingClientRect();
        return {left:account.left,right:account.right,topLeft:top.left,topRight:top.right,segmentRight:segment.right};
      });
      assert.ok(geometry.left >= geometry.segmentRight && geometry.right <= geometry.topRight+1 && geometry.left >= geometry.topLeft-1, 'przycisk konta mieści się w panelu przy szerokości '+width);
    }
    await p.setViewportSize({width:1000,height:700});
    await host.locator('.rj-account').click();
    await p.waitForURL('**/logowanie?powrot=1');
    assert.ok(!p.url().includes('tryb=gra'));
    await p.locator('#account-name').fill('Alice'); await p.locator('#account-pin').fill('1234');
    await p.locator('#account-submit').click();
    await p.waitForURL('**/A/?tryb=gra#start');
    await p.waitForFunction(()=>!!window.RejsonAccount);
    assert.deepEqual(await p.evaluate(()=>window.RejsonAccount.getSession()), {username:'Alice', token});
    assert.equal(await p.evaluate(()=>sessionStorage.getItem('rejson_account_return_v1')), null);
    await p.goto(origin+'/B/');
    await p.waitForFunction(()=>!!window.RejsonAccount);
    assert.deepEqual(await p.evaluate(()=>window.RejsonAccount.getSession()), {username:'Alice', token});
    assert.equal(await p.evaluate(async()=>{localStorage.setItem('rejson_community_session_v1',JSON.stringify({token:'x'.repeat(48),username:'Falszywy'})); return window.RejsonAccount.getSession();}), null);
    // Zdarzenia nie muszą ujawniać tokenu i można je odsubskrybować.
    assert.equal(await p.evaluate(()=>{let n=0; const off=window.RejsonAccount.subscribe(()=>n++); window.dispatchEvent(new Event('rj:session-change')); off(); window.dispatchEvent(new Event('rj:session-change')); return n;}),1);
    // Niezaufany powrót nie może kierować poza origin i nie pokazuje linku.
    await p.evaluate(()=>sessionStorage.setItem('rejson_account_return_v1',JSON.stringify({path:'//evil.example/',at:Date.now()})));
    await p.goto(origin+'/logowanie?powrot=1');
    assert.equal(await p.locator('#account-return').getAttribute('hidden'),'');
    await c.close();
    console.log('PASS: SW, wejście z widżetu, powrót, wspólna potwierdzona sesja, zła sesja i obcy adres (mock)');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

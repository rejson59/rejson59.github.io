/* Realny service worker: CHROME_BIN=/ścieżka/chromium node widget-sw.browser.js */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname,'../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN');
const requests=[];
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost'); requests.push(req.url);
  if (u.pathname === '/bootstrap') {res.writeHead(200,{'content-type':'text/html'});return res.end('<!doctype html><html><body>start</body></html>');}
  if (u.pathname === '/Project/' || u.pathname === '/OldVersion/') {
    const widget=u.pathname === '/Project/' ? '<!-- przykład rejson-widgets/widget.js -->' : '<script src="/rejson-widgets/widget.js?v=4" data-project="OldVersion"></script>';
    res.writeHead(200,{'content-type':'text/html','content-security-policy':"default-src 'self'; connect-src 'self'"});
    return res.end(`<!doctype html><html><head><title>Projekt</title></head><body><main>Projekt</main>${widget}</body></html>`);
  }
  if (u.pathname === '/js/view-tracker.js') {res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}
  const file=path.resolve(root,'.'+u.pathname);
  if (!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()) {res.writeHead(404);return res.end();}
  const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain';
  res.writeHead(200,{'content-type':type,'cache-control':'no-store'}); res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  try {
    const page=await browser.newPage();const origin=`http://127.0.0.1:${server.address().port}`;
    await page.goto(origin+'/bootstrap');
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.goto(origin+'/Project/');
    await page.locator('#rejson-liquid-widget-root').waitFor({state:'attached',timeout:10000});
    assert.equal(await page.evaluate(()=>window.RejsonWidget.getState().config.project),'Project');
    assert.ok(requests.some(r=>r.startsWith('/rejson-widgets/widget.js?v=9')),'komentarz nie blokuje dodania');
    requests.length=0;
    await page.goto(origin+'/OldVersion/');
    await page.locator('#rejson-liquid-widget-root').waitFor({state:'attached',timeout:10000});
    assert.equal(await page.evaluate(()=>window.RejsonWidget.getState().config.project),'OldVersion');
    assert.ok(requests.some(r=>r.startsWith('/rejson-widgets/widget.js?v=9')),'stary jawny adres dostaje aktualną wersję');
    assert.ok(!requests.some(r=>r.startsWith('/rejson-widgets/widget.js?v=4')));
    assert.equal(await page.locator('#rejson-liquid-widget-root').count(),1);
    console.log('PASS: prawdziwy SW dodaje pigułkę mimo komentarza i aktualizuje stary adres bez duplikatów');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

/* Testy odporności pigułki: CHROME_BIN=/ścieżka/chromium node widget-resilience.browser.js */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname,'../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN');
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (pathname === '/') {
    res.writeHead(200,{'content-type':'text/html'});
    return res.end('<!doctype html><html><head><title>Projekt</title><style>body{transform:translateX(-10000px)} #rejson-liquid-widget-root{display:none!important;visibility:hidden!important}</style></head><body><div id="app">Projekt</div><script src="/rejson-widgets/widget.js"></script><script src="/rejson-widgets/widget.js"></script></body></html>');
  }
  const file=path.resolve(root,'.'+pathname);
  if (!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':'text/plain'}); res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  try {
    const c=await browser.newContext({viewport:{width:1000,height:700}}); const origin=`http://127.0.0.1:${server.address().port}`;
    await c.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
    const p=await c.newPage();await p.goto(origin+'/');
    const host=p.locator('#rejson-liquid-widget-root'); await host.waitFor({state:'attached'});
    assert.equal(await host.count(),1,'dwa skrypty nie montują drugiej pigułki');
    const box=await host.locator('.rj-vessel').boundingBox();
    assert.ok(box && box.x>=0 && box.x+box.width<=1000 && box.y>=0 && box.y+box.height<=700,'pigułka widoczna pomimo transform body i CSS projektu');
    await p.evaluate(()=>document.body.replaceWith(document.createElement('body')));
    assert.equal(await host.count(),1,'wymiana body nie usuwa pigułki');
    await p.evaluate(()=>document.getElementById('rejson-liquid-widget-root').remove());
    await p.waitForFunction(()=>!!document.getElementById('rejson-liquid-widget-root'));
    assert.equal(await host.count(),1,'usunięta pigułka zostaje przywrócona');
    await host.locator('.rj-closed').dispatchEvent('pointerdown',{pointerId:1,button:0,clientX:800,clientY:650});
    await p.evaluate(()=>window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:-1500,clientY:-1500})));
    assert.equal(await p.evaluate(()=>window.RejsonWidget.getState().dragging),true);
    await p.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
    assert.equal(await p.evaluate(()=>window.RejsonWidget.getState().dragging),false);
    const restored=await host.locator('.rj-vessel').boundingBox();
    assert.ok(restored.x>=0 && restored.y>=0 && restored.x+restored.width<=1000 && restored.y+restored.height<=700,'anulowane przeciąganie wraca na ekran');
    await host.locator('.rj-closed').click();
    assert.equal(await p.evaluate(()=>window.RejsonWidget.getState().open),true,'formularz działa po przywróceniu');
    await p.evaluate(()=>window.RejsonWidget.close());
    await p.waitForTimeout(500);
    // Obsługiwany jest pełny ekran zwykłego kontenera; canvas/video nie mogą rysować potomków DOM.
    const fullscreen = await p.evaluate(async()=>{
      let el=document.createElement('div'); el.id='game'; document.body.appendChild(el);
      try { await el.requestFullscreen(); return !!document.fullscreenElement; } catch (_) { return false; }
    });
    if (fullscreen) {
      await p.waitForFunction(()=>document.getElementById('rejson-liquid-widget-root').parentNode===document.fullscreenElement);
      assert.ok(await host.locator('.rj-vessel').isVisible());
      const fullBox = await host.locator('.rj-vessel').boundingBox();
      assert.ok(fullBox && fullBox.x >= 0 && fullBox.y >= 0 && fullBox.x + fullBox.width <= 1000 && fullBox.y + fullBox.height <= 700, 'pigułka widoczna w pełnym ekranie kontenera');
      await p.evaluate(()=>document.exitFullscreen());
      await p.waitForFunction(()=>document.getElementById('rejson-liquid-widget-root').parentNode===document.documentElement);
    }
    // Blokada kursora nie może ukryć jej na stałe po powrocie do normalnego trybu.
    await p.evaluate(()=>{Object.defineProperty(document,'pointerLockElement',{configurable:true,value:document.body});document.dispatchEvent(new Event('pointerlockchange'));});
    assert.equal(await host.locator('.rj-vessel').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
    await p.evaluate(()=>{Object.defineProperty(document,'pointerLockElement',{configurable:true,value:null});document.dispatchEvent(new Event('pointerlockchange'));});
    assert.equal(await host.locator('.rj-vessel').evaluate(el=>getComputedStyle(el).pointerEvents),'auto');
    assert.equal(await host.locator('.rj-collapse').evaluate(el=>el.classList.contains('is-hidden')),false);
    await p.evaluate(()=>window.RejsonWidget.dock(true));
    assert.equal(await p.evaluate(()=>window.RejsonWidget.getState().mode),'edge','celowo zwinięty tryb jest zachowany');
    await p.evaluate(()=>window.RejsonWidget.destroy());
    await p.waitForTimeout(100);
    assert.equal(await host.count(),0,'jawne destroy nie uruchamia automatycznego przywrócenia');
    const lockedPage=await browser.newPage();
    await lockedPage.addInitScript(()=>Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.documentElement}));
    await lockedPage.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await lockedPage.goto(`http://127.0.0.1:${server.address().port}`);
    await lockedPage.addScriptTag({url:`http://127.0.0.1:${server.address().port}/rejson-widgets/widget.js`});
    assert.equal(await lockedPage.locator('#rejson-liquid-widget-root .rj-vessel').evaluate(el=>getComputedStyle(el).pointerEvents),'none','start podczas pointer lock');
    await lockedPage.close();
    console.log(`PASS: montaż, CSS projektu, SPA, przeciąganie, pointer lock, edge, destroy; fullscreen ${fullscreen?'PASS':'niedostępny w przeglądarce testowej'}`);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

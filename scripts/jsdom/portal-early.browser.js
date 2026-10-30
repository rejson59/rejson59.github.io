/* CHROME_BIN=/ścieżka/chromium node portal-early.browser.js */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');
const root=path.resolve(__dirname,'../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN');
let release;
const gate = new Promise(resolve => {release=resolve;});
const server = http.createServer(async (req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if (pathname==='/start') {res.writeHead(200,{'content-type':'text/html'});return res.end('<html><head></head><body>start</body></html>');}
  if (pathname==='/Project/') {res.writeHead(302,{Location:'/Project/welcome/'});return res.end();}
  if (pathname==='/Project/welcome/') {res.writeHead(200,{'content-type':'text/html'});return res.end(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'"><script src="/slow-head.js"></script></head><body>Projekt docelowy</body></html>`);}
  if (pathname==='/slow-head.js') {await gate;res.writeHead(200,{'content-type':'text/javascript'});return res.end('window.slowScriptFinished=true');}
  if (pathname==='/js/view-tracker.js'||pathname==='/rejson-widgets/widget.js'||pathname==='/js/rejson-account.js') {res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}
  const file=path.resolve(root,'.'+pathname);
  if (!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':'text/javascript','cache-control':'no-store'});return res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  try {
    const p=await browser.newPage({reducedMotion:'reduce'});
    await p.goto(origin+'/start');
    await p.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;});
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await p.evaluate(()=>sessionStorage.setItem('rj_portal_arrival_v1',JSON.stringify({path:'/Project/',at:Date.now(),motionOverride:true})));
    await p.goto(origin+'/Project/',{waitUntil:'commit'});
    await p.waitForSelector('#rj-portal-arrival',{state:'attached',timeout:10000});
    assert.equal(new URL(p.url()).pathname,'/Project/welcome/');
    assert.equal(await p.evaluate(()=>window.slowScriptFinished === true),false);
    assert.equal(await p.locator('#rj-portal-arrival').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(1, 3, 7)');
    assert.equal(await p.locator('#rj-portal-arrival.is-playing').count(),0);
    release();
    await p.waitForSelector('#rj-portal-arrival.is-playing',{timeout:10000});
    assert.equal(await p.evaluate(()=>window.slowScriptFinished),true);
    await p.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:20000});
    await p.reload();
    assert.equal(await p.locator('#rj-portal-arrival').count(),0);
    console.log('PASS: wyjście przed blokującym skryptem, przekierowanie w projekcie, CSP i jednorazowy znacznik');
  } finally {release();await browser.close();server.close();}
})().catch(e=>{console.error(e);release();server.close();process.exitCode=1;});

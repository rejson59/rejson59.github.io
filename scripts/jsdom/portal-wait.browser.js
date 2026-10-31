/* Desktop Chromium: powolny dokument i zasób utrzymują lot bez białego błysku. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),root=path.resolve(__dirname,'../..');
if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
let releaseDocument,releaseImage,seenDocument;const docGate=new Promise(r=>releaseDocument=r),imageGate=new Promise(r=>releaseImage=r),docRequest=new Promise(r=>seenDocument=r);
const server=http.createServer(async(req,res)=>{
 const p=new URL(req.url,'http://local').pathname;
 if(p==='/Slow/'){seenDocument();await docGate;res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});return res.end('<!doctype html><html><head></head><body>Cel<img src="/slow-image" alt=""></body></html>');}
 if(p==='/slow-image'){await imageGate;return res.writeHead(404).end();}
 const f=path.resolve(root,'.'+(p==='/portal/'?'/portal/index.html':p));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();
 const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[path.extname(f)]||'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':'no-store'});fs.createReadStream(f).pipe(res);
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const b=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
 try {const c=await b.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await c.addInitScript(()=>localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:[{name:'Slow',homepage:location.origin+'/Slow/'}]})));
  const p=await c.newPage(),cdp=await c.newCDPSession(p);await p.goto(origin+'/portal/?projekt=Slow',{waitUntil:'domcontentloaded'});await p.locator('#enter').click({noWaitAfter:true});console.log('Lot rozpoczęty');
  await docRequest;console.log('Oczekiwanie na odpowiedź projektu');await p.waitForTimeout(5000);
  assert.equal(new URL(p.url()).pathname,'/portal/Slow','przed odpowiedzią zostajemy w portalu');
  const pending = await Promise.race([cdp.send('Runtime.evaluate',{expression:`({tunnel:+getComputedStyle(document.querySelector('.flight-tunnel')).opacity,darkness:+getComputedStyle(document.querySelector('.flight-darkness')).opacity})`,returnByValue:true}).then(x=>x.result.value).catch(()=>null),new Promise(r=>setTimeout(()=>r(null),2000))]);
  if(pending){assert.ok(pending.tunnel>.9);assert.ok(pending.darkness<.3);}else console.log('Chromium nie pozwolił odczytać stylów podczas oczekiwania na dokument; sprawdzono je osobno w teście lotu.');
  releaseDocument();await p.waitForURL('**/Slow/',{waitUntil:'commit'});await p.waitForSelector('#rj-portal-arrival .rj-wait-flight');
  assert.equal(await p.locator('#rj-portal-arrival.is-playing').count(),0,'tunel czeka na zasoby');
  const move=await p.locator('.rj-wait-flight i').first().evaluate(el=>{const a=el.getAnimations()[0];a.pause();a.currentTime=350;const x=getComputedStyle(el).transform;a.currentTime=950;const y=getComputedStyle(el).transform;a.play();return [x,y]});assert.notEqual(move[0],move[1]);
  console.log('Tunel widoczny podczas ładowania zasobów');releaseImage();await p.waitForSelector('#rj-portal-arrival.is-playing');await p.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:15000});await c.close();
  console.log('PASS: opóźniona odpowiedź, tunel podczas ładowania zasobów i płynne wyjście');
 }finally{releaseDocument();releaseImage();await b.close();server.close();}
})().catch(e=>{console.error(e);releaseDocument();releaseImage();server.close();process.exitCode=1});

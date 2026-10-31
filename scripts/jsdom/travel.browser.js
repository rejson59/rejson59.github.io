/* Chromium: rzeczywista nowa karta, automatyczny lot, starsze linki i oczekiwanie na projekt. */
const assert=require('node:assert/strict'), http=require('node:http'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require('playwright-core'), root=path.resolve(__dirname,'../..');
if(!process.env.CHROME_BIN) throw Error('Set CHROME_BIN');
let releaseDoc, releaseImage, releaseNested, sawNavigation;
const docGate=new Promise(r=>releaseDoc=r), imageGate=new Promise(r=>releaseImage=r), navigationRequest=new Promise(r=>sawNavigation=r), nestedGate=new Promise(r=>releaseNested=r);
const server=http.createServer(async(req,res)=>{
  const p=new URL(req.url,'http://local').pathname;
  if(p==='/Slow/') { if(req.headers['sec-fetch-mode']==='navigate') sawNavigation(); await docGate; res.writeHead(200,{'content-type':'text/html','cache-control':'no-store','content-security-policy':"default-src 'self'"}); return res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/project.css"></head><body><main id="destination">Cel</main><img src="/slow-image"></body></html>'); }
  if(p==='/slow-image'){await imageGate; res.writeHead(404);return res.end();}
  if(p==='/nested-image'){await nestedGate; res.writeHead(404);return res.end();}
  if(p==='/Nested/') { const sample=fs.readFileSync(path.join(root,'koordynator/paczki/rakieta-20261031/mconline/index.html'),'utf8'); const bootstrap=sample.match(/<script>([\s\S]*?)<\/script>/)[1].replace('https://rejson59.github.io', 'http://127.0.0.1:'+server.address().port); res.writeHead(200,{'content-type':'text/html'}); return res.end('<!doctype html><html><head><script>'+bootstrap+'</script></head><body><main id="destination">Projekt</main><img src="/nested-image"></body></html>'); }
  if(p==='/Test/') {res.writeHead(200,{'content-type':'text/html'});return res.end('<!doctype html><html><head></head><body><main id="destination">Cel</main></body></html>');}
  // Niezmieniony projekt z własnym workerem o węższym zakresie, bez naszego bootstrapa.
  if(p==='/Isolated/worker.js') {res.writeHead(200,{'content-type':'text/javascript'});return res.end("self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(fetch(e.request)));");}
  if(p==='/Isolated/setup') {res.writeHead(200,{'content-type':'text/html'});return res.end('<!doctype html><html><body>setup</body></html>');}
  if(p==='/Isolated/') {res.writeHead(200,{'content-type':'text/html'});return res.end('<!doctype html><html><head></head><body><main id="destination">Oryginalny projekt</main></body></html>');}
  if(p==='/project.css'){res.writeHead(200,{'content-type':'text/css'});return res.end('@media (prefers-reduced-motion:reduce) { * { animation:none !important } }');}
  if(p==='/js/view-tracker.js'||p==='/js/rejson-account.js'||p==='/js/media-capture.js'||p==='/rejson-widgets/widget.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}
  let rel=p==='/'?'/index.html':p==='/podroz/'?'/podroz/index.html':p==='/portal/'?'/portal/index.html':p.startsWith('/portal/')?'/404.html':p;
  const f=path.resolve(root,'.'+rel);
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
  const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[path.extname(f)]||'application/octet-stream';
  res.writeHead(200,{'content-type':type,'cache-control':'no-store'});fs.createReadStream(f).pipe(res);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  try {
    const c=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
    const repo={name:'Test',homepage:origin+'/Test/',has_pages:true,html_url:'https://github.com/rejson59/Test',description:'Testowy projekt',created_at:'2026-01-01',updated_at:'2026-01-01'};
    await c.route('**/*',r=>{const u=r.request().url(); if(u.startsWith(origin+'/')) return r.continue(); if(u.startsWith('https://api.github.com/users/')) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([repo])}); if(u.startsWith('https://rejson59.github.io/RejStream/')) return r.fulfill({status:200,contentType:'text/html',body:'<html><body><main id="destination">RejStream</main></body></html>'}); return r.abort();});
    const home=await c.newPage(); await home.goto(origin+'/',{waitUntil:'domcontentloaded'});
    await home.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
    const featured=home.locator('.showcase-item .btn-journey').first(); await featured.waitFor({state:'visible'});
    const [tab]=await Promise.all([home.waitForEvent('popup'),featured.click()]);
    const flightStart = Date.now();
    await tab.waitForURL('**/podroz/?projekt=RejStream&v=2');
    assert.equal(await tab.locator('#project-name').textContent(),'RejStream');
    assert.equal(await home.locator('.showcase-item').count(),5);
    const x1=await tab.locator('.rocket-motion').evaluate(e=>getComputedStyle(e).transform);
    await tab.waitForTimeout(600); const x2=await tab.locator('.rocket-motion').evaluate(e=>getComputedStyle(e).transform);
    assert.notEqual(x1,x2,'rakieta naprawdę się porusza');
    await tab.waitForTimeout(2000); assert.equal(new URL(tab.url()).pathname,'/podroz/','projekt nie otwiera się po sekundzie');
    await tab.waitForURL('https://rejson59.github.io/RejStream/',{timeout:16000});
    assert.ok(Date.now()-flightStart >= 7000,'pełny lot trwa ponad siedem sekund');
    assert.equal(await tab.locator('#destination').textContent(),'RejStream'); assert.equal(new URL(home.url()).pathname,'/');
    console.log('PASS: prawdziwa nowa karta, ruch rakiety i automatyczne przejście bez drugiego kliknięcia');

    await home.locator('#grid .btn-journey').first().waitFor({state:'attached'});
    const dynamic=home.locator('#grid .btn-journey').first(); assert.equal(await dynamic.getAttribute('href'),'/podroz/?projekt=Test&v=2');
    const [dynamicTab]=await Promise.all([home.waitForEvent('popup'),dynamic.click()]); await dynamicTab.waitForURL('**/podroz/?projekt=Test&v=2');
    await dynamicTab.waitForURL('**/Test/',{timeout:16000}); assert.equal(await dynamicTab.locator('#destination').textContent(),'Cel');
    console.log('PASS: dynamiczna karta otwiera właściwy projekt w nowej karcie');
    await c.close();

    // Przy systemowym ograniczeniu ruchu podróż nie znika już natychmiast.
    const reduced=await browser.newContext({reducedMotion:'reduce',serviceWorkers:'block'});
    await reduced.addInitScript(()=>{try{localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:[{name:'Test',homepage:location.origin+'/Test/'}]}));}catch(e){}});
    const rp=await reduced.newPage(); const reducedStart=Date.now();
    await rp.goto(origin+'/podroz/?projekt=Test');
    assert.equal(await rp.locator('.rocket-motion').evaluate(e=>getComputedStyle(e).animationName),'rocket-journey');
    // Dłuższa animacja CSS nie może zostać ucięta przez sam licznik JS.
    await rp.locator('.rocket-motion').evaluate(e=>e.getAnimations()[0].effect.updateTiming({duration:10000}));
    const before=await rp.locator('.rocket-motion').evaluate(e=>getComputedStyle(e).transform);
    await rp.waitForTimeout(2000); assert.equal(new URL(rp.url()).pathname,'/podroz/');
    assert.notEqual(await rp.locator('.rocket-motion').evaluate(e=>getComputedStyle(e).transform),before,'rakieta leci również przy preferencji systemowej');
    await rp.waitForTimeout(6000); assert.equal(new URL(rp.url()).pathname,'/podroz/','nie przerywamy wolniejszego lotu');
    await rp.waitForURL('**/Test/',{timeout:16000}); assert.ok(Date.now()-reducedStart>=9500);
    const old=await reduced.newPage(); await old.goto(origin+'/portal/?projekt=Test');
    await old.waitForURL('**/podroz/?projekt=Test&v=2'); await old.locator('#skip').click(); await old.waitForURL('**/Test/',{timeout:16000});
    const oldPath=await reduced.newPage(); await oldPath.goto(origin+'/portal/Test');
    await oldPath.waitForURL('**/podroz/?projekt=Test&v=2'); await oldPath.locator('#skip').click(); await oldPath.waitForURL('**/Test/',{timeout:16000});
    assert.equal(await oldPath.locator('#rj-portal-arrival').count(),0);
    const noTarget=await reduced.newPage(); await noTarget.goto(origin+'/podroz/?projekt='+encodeURIComponent('https://evil.example')+'&url=https://evil.example');
    assert.match(await noTarget.locator('#travel-status').textContent(),/Nie znaleziono/); assert.equal(await noTarget.locator('#skip').isDisabled(),true);
    console.log('PASS: pełny lot przy ograniczonym ruchu, stare linki i niedozwolony cel'); await reduced.close();

    const limited=await browser.newContext({serviceWorkers:'block'});
    await limited.addInitScript(()=>{try{localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:[{name:'Test',homepage:location.origin+'/Test/'}]}));}catch(e){}});
    const lp=await limited.newPage(); const limitedStart=Date.now(); await lp.goto(origin+'/podroz/?projekt=Test');
    await lp.locator('#reduce-motion').click(); assert.equal(await lp.locator('#reduce-motion').getAttribute('aria-pressed'),'true');
    assert.equal(await lp.locator('.rocket-motion').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
    await lp.waitForURL('**/Test/',{timeout:16000}); assert.ok(Date.now()-limitedStart>=7000,'ograniczenie ruchu nie pomija czasu podróży');
    const lp2=await limited.newPage(); await lp2.goto(origin+'/podroz/?projekt=Test');
    assert.equal(await lp2.locator('#reduce-motion').getAttribute('aria-pressed'),'true','wybór jest zapamiętany');
    await lp2.locator('#reduce-motion').click(); assert.equal(await lp2.locator('#reduce-motion').getAttribute('aria-pressed'),'false');
    await lp2.locator('#skip').click(); await lp2.waitForURL('**/Test/',{timeout:16000}); await limited.close();
    console.log('PASS: ograniczenie ruchu, zapis wyboru i ręczne pominięcie');

    const noCss=await browser.newContext({serviceWorkers:'block'});
    await noCss.addInitScript(()=>{try{localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:[{name:'Test',homepage:location.origin+'/Test/'}]}));}catch(e){}});
    await noCss.route('**/css/travel.css*',r=>r.abort());
    const fallback=await noCss.newPage(); await fallback.goto(origin+'/podroz/?projekt=Test');
    await fallback.waitForURL('**/Test/',{timeout:16000}); await noCss.close();
    console.log('PASS: brak arkusza nie blokuje projektu na zawsze');

    const paused=await browser.newContext({serviceWorkers:'block'});
    await paused.addInitScript(()=>{try{localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:[{name:'Test',homepage:location.origin+'/Test/'}]}));}catch(e){} window.testVisibility='visible'; Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testVisibility});});
    const background=await paused.newPage(); await background.goto(origin+'/podroz/?projekt=Test');
    await background.evaluate(()=>{window.testVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await background.locator('.rocket-motion').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
    await background.waitForTimeout(5000); assert.equal(new URL(background.url()).pathname,'/podroz/');
    await background.evaluate(()=>{window.testVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));});
    await background.waitForURL('**/Test/',{timeout:16000}); await paused.close();
    console.log('PASS: lot w nieaktywnej karcie pauzuje i wznawia się po powrocie');

    const nested=await browser.newContext({serviceWorkers:'block'});
    await nested.addInitScript(()=>{try{localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:[{name:'Nested',homepage:location.origin+'/Nested/'}]}));}catch(e){}});
    const np=await nested.newPage(); await np.goto(origin+'/podroz/?projekt=Nested');
    await np.waitForURL('**/Nested/',{waitUntil:'commit',timeout:16000});
    await np.waitForSelector('#rj-portal-arrival .rj-arrival-rocket',{timeout:16000});
    assert.equal(await np.locator('#rj-portal-arrival.is-playing').count(),0);
    releaseNested(); await np.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:16000}); await nested.close();
    console.log('PASS: bootstrap projektu pokazuje rakietę również bez globalnego SW');

    // Przenoszenie nie wymaga skryptu, PR ani zmiany istniejącego workera projektu.
    const isolated=await browser.newContext({viewport:{width:1440,height:900}});
    await isolated.addInitScript(()=>{try{localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:[{name:'Isolated',homepage:location.origin+'/Isolated/'}]}));}catch(e){}});
    const ip=await isolated.newPage(); await ip.goto(origin+'/Isolated/setup');
    await ip.evaluate(async()=>{await navigator.serviceWorker.register('/Isolated/worker.js',{scope:'/Isolated/'}); await navigator.serviceWorker.ready;});
    await ip.goto(origin+'/podroz/?projekt=Isolated');
    assert.equal(await ip.locator('#project-name').textContent(),'Isolated');
    assert.equal(await ip.locator('.rocket-motion').evaluate(e=>getComputedStyle(e).animationName),'rocket-journey');
    await ip.waitForURL('**/Isolated/',{timeout:16000});
    assert.equal(await ip.locator('#destination').textContent(),'Oryginalny projekt');
    assert.equal(await ip.evaluate(()=>new URL(navigator.serviceWorker.controller.scriptURL).pathname),'/Isolated/worker.js');
    assert.equal(await ip.locator('#rj-portal-arrival').count(),0,'osobny worker bez bootstrapa nie otrzymuje zasłony');
    await isolated.close();
    console.log('PASS: podróż i automatyczne wejście bez zmian projektu, nawet z jego własnym workerem');

    const slow=await browser.newContext({viewport:{width:1440,height:900}});
    await slow.addInitScript(()=>{try{localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:[{name:'Slow',homepage:location.origin+'/Slow/'}]}));}catch(e){}});
    const p=await slow.newPage(); await p.goto(origin+'/podroz/?projekt=Slow',{waitUntil:'domcontentloaded'});
    await navigationRequest; // Po pełnym locie wybrano cel, ale serwer nie wysłał jeszcze dokumentu.
    assert.equal(new URL(p.url()).pathname,'/podroz/');
    releaseDoc(); await p.waitForURL('**/Slow/',{waitUntil:'commit',timeout:16000});
    await p.waitForSelector('#rj-portal-arrival .rj-arrival-rocket',{timeout:16000});
    assert.equal(await p.locator('#rj-portal-arrival.is-playing').count(),0,'zasłona pozostaje do załadowania zasobów');
    const idle=await p.locator('.rj-arrival-rocket').evaluate(e=>getComputedStyle(e).animationName); assert.equal(idle,'rj-rocket-idle');
    releaseImage(); await p.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:16000});
    assert.equal(await p.locator('#destination').textContent(),'Cel');
    await p.reload({waitUntil:'load'}); assert.equal(await p.locator('#rj-portal-arrival').count(),0,'znacznik jest jednorazowy');
    console.log('PASS: wolna odpowiedź i zasoby, rakieta podczas oczekiwania i jednorazowe odsłonięcie (SW/CSP)'); await slow.close();

    const small=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block'}); const sp=await small.newPage();
    await sp.goto(origin+'/podroz/?projekt=RejStream');
    assert.ok((await sp.evaluate(()=>document.documentElement.scrollWidth))<=320,'brak poziomego przepełnienia');
    assert.equal(await sp.locator('#skip').isVisible(),true); await small.close();
    console.log('PASS: dostępność przy wąskim ekranie (bez zrzutów)');
  } finally {releaseDoc();releaseImage();releaseNested();await browser.close();server.close();}
})().catch(e=>{console.error(e);releaseDoc();releaseImage();releaseNested();server.close();process.exitCode=1;});

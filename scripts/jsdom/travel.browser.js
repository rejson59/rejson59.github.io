/* Chromium: rakieta jako nakładka na prawdziwym dokumencie projektu. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),root=path.resolve(__dirname,'../..');
if(!process.env.CHROME_BIN) throw Error('Set CHROME_BIN');
let releaseImage; const imageGate=new Promise(r=>releaseImage=r);
const project=(name,slow=false)=>`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/project.css"><script src="/project.js"></script></head><body><main id="destination">${name}</main><button id="project-button">Projekt</button>${slow?'<img src="/slow-image">':''}</body></html>`;
const server=http.createServer(async(req,res)=>{
 const p=new URL(req.url,'http://local').pathname;
 if(p==='/slow-image'){await imageGate;res.writeHead(404);return res.end();}
 if(p==='/hang-image'){return;}
 if(p==='/Test/'||p==='/Slow/'||p==='/Isolated/'||p==='/Blocked/'||p==='/Timeout/') {res.writeHead(200,{'content-type':'text/html','content-security-policy':p==='/Blocked/' ? "default-src 'self'; style-src 'none'" : "default-src 'self'",'cache-control':'no-store'});return res.end(p==='/Timeout/'?project(p).replace('</body>','<img src="/hang-image"></body>'):project(p,p==='/Slow/'));}
 if(p==='/Legacy/') {const sample=fs.readFileSync(path.join(root,'koordynator/paczki/rakieta-20261031/mconline/index.html'),'utf8');const bootstrap=sample.match(/<script>([\s\S]*?)<\/script>/)[1].replace('https://rejson59.github.io','http://127.0.0.1:'+server.address().port).replace('rj_rocket_trip_v1','rj_portal_arrival_v1').replace('portal.css?v=13','portal.css?v=12').replace('portal-arrival.js?v=12','portal-arrival.js?v=11');res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});return res.end('<!doctype html><html><head><script>'+bootstrap+'</script></head><body><main id="destination">Legacy</main></body></html>');}
 if(p==='/project.css'){res.writeHead(200,{'content-type':'text/css'});return res.end('@media (prefers-reduced-motion:reduce) { * { animation:none !important } }');}
 if(p==='/project.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end('window.projectStarted=true;');}
 if(p==='/Isolated/worker.js'||p==='/Legacy/worker.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end("self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(fetch(e.request)));");}
 if(p==='/Isolated/setup'||p==='/Legacy/setup'){res.writeHead(200,{'content-type':'text/html'});return res.end('<!doctype html><html><body>setup</body></html>');}
 if(p==='/js/view-tracker.js'||p==='/js/rejson-account.js'||p==='/js/media-capture.js'||p==='/rejson-widgets/widget.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}
 let rel=p==='/'?'/index.html':p==='/podroz/'?'/podroz/index.html':p==='/portal/'?'/portal/index.html':p.startsWith('/portal/')?'/404.html':p;
 const f=path.resolve(root,'.'+rel);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
 const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[path.extname(f)]||'application/octet-stream';
 res.writeHead(200,{'content-type':type,'cache-control':'no-store'});fs.createReadStream(f).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
 const repo=name=>({name,homepage:origin+'/'+name+'/',has_pages:true,html_url:'https://github.com/rejson59/'+name,description:'Test',created_at:'2026-01-01',updated_at:'2026-01-01'});
 async function configure(c,repos) {
  await c.addInitScript(list=>{try{localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:list}));}catch(e){}},repos);
  await c.route('**/*',r=>{const u=r.request().url();if(u.startsWith(origin+'/'))return r.continue();if(u.startsWith('https://api.github.com/users/'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(repos)});if(u.startsWith('https://example.invalid/'))return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<html><body><main id="external">Zewnętrzny projekt</main></body></html>'});return r.abort();});
 }
 async function homepage(c) {
  const p=await c.newPage();await p.goto(origin+'/',{waitUntil:'domcontentloaded'});await p.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
  await p.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js?v=2',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;});
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller);return p;
 }
 async function openProject(home,name) {
  const card=home.locator('#grid .project-card').filter({has:home.locator('h3',{hasText:name})});
  const link=card.locator('.btn-journey');await link.waitFor({state:'visible'});
  assert.equal(await link.getAttribute('href'),origin+'/'+name+'/');
  const [tab]=await Promise.all([home.waitForEvent('popup'),link.click()]);await tab.waitForURL('**/'+name+'/',{waitUntil:'commit',timeout:15000});return tab;
 }
 try {
  const c=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}); await configure(c,[repo('Test')]);
  const home=await homepage(c);await home.evaluate(()=>sessionStorage.setItem('private-test','secret'));const tab=await openProject(home,'Test');
  await tab.waitForSelector('#rj-portal-arrival .rj-arrival-rocket',{timeout:10000});const started=Date.now();
  assert.equal(new URL(tab.url()).pathname,'/Test/','adres od początku jest adresem projektu');
  assert.equal(await tab.locator('#destination').textContent(),'/Test/');assert.equal(await tab.evaluate(()=>window.projectStarted),true,'projekt uruchamia się pod nakładką');
  assert.equal(await tab.evaluate(()=>window.opener),null);assert.equal(await tab.evaluate(()=>sessionStorage.getItem('rj_rocket_overlay_v2')),null);assert.equal(await tab.evaluate(()=>sessionStorage.getItem('private-test')),null,'karta nie otrzymuje kopii danych sesji');assert.equal(await home.evaluate(()=>sessionStorage.getItem('private-test')),'secret');
  assert.equal(await home.evaluate(()=>sessionStorage.getItem('rj_rocket_overlay_v2')),null,'znacznik nie pozostaje na stronie głównej');
  assert.equal(await tab.locator('.rj-arrival-name').textContent(),'Test');assert.equal(await tab.locator('.rj-arrival-puffs i').count(),3);
  assert.equal(await tab.locator('.rj-arrival-motion').evaluate(e=>getComputedStyle(e).animationName),'rj-arrival-flight');
  assert.equal(await tab.locator('.rj-arrival-puffs i').first().evaluate(e=>getComputedStyle(e).animationName),'rj-arrival-puff');
  assert.equal(await tab.locator('.rj-arrival-elevation').evaluate(e=>getComputedStyle(e).animationName),'rj-arrival-climb');
  const samples=await tab.evaluate(async()=>{const el=document.querySelector('.rj-arrival-rocket-wrap');const x=[];for(let i=0;i<12;i++){x.push(el.getBoundingClientRect().x);await new Promise(r=>setTimeout(r,220));}return x;});
  for(let i=1;i<samples.length;i++) assert.ok(samples[i]>samples[i-1], 'rakieta płynnie porusza się także między dawnymi etapami lotu');
  await tab.waitForTimeout(Math.max(0, 3100 - (Date.now() - started)));
  assert.equal(await tab.locator('#rj-portal-arrival').count(),1,'nakładka nie znika po sekundzie');
  assert.equal(await tab.locator('#rj-portal-arrival.is-playing').count(),0,'pozostaje widoczna przez co najmniej 3 sekundy');
  assert.equal(await tab.evaluate(()=>{const b=document.querySelector('#project-button').getBoundingClientRect();return document.elementFromPoint(b.left+b.width/2,b.top+b.height/2).closest('#rj-portal-arrival')!==null;}),true,'nie klika się strony pod nakładką');
  if(process.env.SCREENSHOT_OUT) await tab.screenshot({path:process.env.SCREENSHOT_OUT});
  await tab.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:15000});assert.ok(Date.now()-started>=3000);
  assert.equal(new URL(tab.url()).pathname,'/Test/');await tab.reload({waitUntil:'load'});assert.equal(await tab.locator('#rj-portal-arrival').count(),0,'jednorazowy znacznik');
  console.log('PASS: nowa karta ma prawdziwy adres projektu, projekt ładuje się pod pełnym lotem i odsłania po animacji');await c.close();

  const slow=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await configure(slow,[repo('Slow')]);const sh=await homepage(slow), st=await openProject(sh,'Slow');
  await st.waitForSelector('#rj-portal-arrival .rj-arrival-rocket');await st.waitForTimeout(6000);
  assert.equal(await st.locator('#rj-portal-arrival.is-playing').count(),0,'wolny zasób utrzymuje nakładkę po locie');
  assert.match(await st.locator('.rj-arrival-caption').textContent(),/ładujemy/);
  const progress=await st.locator('.rj-arrival-progress span').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a);assert.ok(progress>0.89&&progress<0.91,'pasek nie pokazuje 100%, dopóki projekt się ładuje');
  assert.equal(await st.locator('.rj-arrival-rocket').evaluate(e=>getComputedStyle(e).animationName),'rj-rocket-idle','rakieta ożywa również podczas oczekiwania');
  releaseImage();await st.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:8000});assert.equal(await st.locator('#destination').textContent(),'/Slow/');
  console.log('PASS: pełny lot i oczekiwanie na wolne zasoby przy CSP i ograniczonym ruchu systemu');await slow.close();

  const isolated=await browser.newContext();await configure(isolated,[repo('Isolated')]);
  const setup=await isolated.newPage();await setup.goto(origin+'/Isolated/setup');await setup.evaluate(async()=>{await navigator.serviceWorker.register('/Isolated/worker.js',{scope:'/Isolated/'});await navigator.serviceWorker.ready;});
  const ih=await homepage(isolated),it=await openProject(ih,'Isolated');await it.waitForLoadState('domcontentloaded');
  assert.equal(await it.locator('#destination').textContent(),'/Isolated/');assert.equal(await it.locator('#rj-portal-arrival').count(),0);
  assert.equal(await it.evaluate(()=>new URL(navigator.serviceWorker.controller.scriptURL).pathname),'/Isolated/worker.js');
  console.log('PASS: projekt z własnym workerem otwiera się bez ingerencji, jeśli nie ma bootstrapa');await isolated.close();

  const legacy=await browser.newContext();await configure(legacy,[repo('Legacy')]);const ls=await legacy.newPage();await ls.goto(origin+'/Legacy/setup');await ls.evaluate(async()=>{await navigator.serviceWorker.register('/Legacy/worker.js',{scope:'/Legacy/'});await navigator.serviceWorker.ready;});
  const lh=await homepage(legacy),lt=await openProject(lh,'Legacy');await lt.waitForSelector('#rj-portal-arrival .rj-arrival-rocket',{timeout:10000});
  assert.equal(await lt.evaluate(()=>new URL(navigator.serviceWorker.controller.scriptURL).pathname),'/Legacy/worker.js');
  assert.equal(await lt.locator('.rj-arrival-name').textContent(),'Legacy');
  await lt.locator('.rj-arrival-reduce').click();assert.equal(await lt.locator('.rj-arrival-reduce').getAttribute('aria-pressed'),'true');
  assert.equal(await lt.locator('.rj-arrival-motion').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
  await lt.locator('.rj-arrival-skip').click();await lt.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:5000});
  console.log('PASS: zgodny stary bootstrap i jego własny worker; ograniczenie ruchu i pominięcie');await legacy.close();

  const blocked=await browser.newContext();await configure(blocked,[repo('Blocked')]);const bh=await homepage(blocked),bt=await openProject(bh,'Blocked');await bt.waitForLoadState('domcontentloaded');
  assert.equal(await bt.locator('#destination').textContent(),'/Blocked/');assert.equal(await bt.locator('#rj-portal-arrival').count(),0,'brak stylów nie zasłania projektu');
  console.log('PASS: blokująca CSP pozostawia projekt dostępny');await blocked.close();

  const timeout=await browser.newContext();await configure(timeout,[repo('Timeout')]);const th=await homepage(timeout),tt=await openProject(th,'Timeout');
  await tt.waitForSelector('#rj-portal-arrival');await tt.waitForTimeout(13000);
  assert.equal(await tt.locator('#rj-portal-arrival.is-playing').count(),0,'wolny lub zawieszony zasób nie udaje załadowania strony');
  assert.match(await tt.locator('.rj-arrival-caption').textContent(),/trwa dłużej/);
  await tt.locator('.rj-arrival-skip').click();await tt.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:5000});
  assert.equal(await tt.locator('#destination').textContent(),'/Timeout/');console.log('PASS: bardzo długie ładowanie czeka, pominięcie umożliwia wejście do projektu');await timeout.close();

  const paused=await browser.newContext();await configure(paused,[repo('Test')]);const ph=await homepage(paused);
  await paused.addInitScript(()=>{if(location.pathname==='/Test/'){let state='hidden';Object.defineProperty(document,'visibilityState',{get:()=>state,configurable:true});window.__visible=()=>{state='visible';document.dispatchEvent(new Event('visibilitychange'));};}});
  const pt=await openProject(ph,'Test');await pt.waitForSelector('#rj-portal-arrival.is-paused');await pt.waitForTimeout(2500);
  assert.equal(await pt.locator('.rj-arrival-motion').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
  await pt.evaluate(()=>window.__visible());assert.equal(await pt.locator('.rj-arrival-motion').evaluate(e=>getComputedStyle(e).animationPlayState),'running');
  await pt.locator('#rj-portal-arrival').waitFor({state:'detached',timeout:12000});console.log('PASS: lot czeka na widoczną kartę');await paused.close();

  const nojs=await browser.newContext({javaScriptEnabled:false});await configure(nojs,[]);const nj=await nojs.newPage();await nj.goto(origin+'/');
  assert.match(await nj.locator('.showcase-item a[data-journey]').first().getAttribute('href'),/^https:\/\/rejson59\.github\.io\/RejStream\/$/);
  assert.equal(await nj.locator('.showcase-item a[data-journey]').first().getAttribute('target'),'_blank');
  console.log('PASS: bez JavaScript zostają zwykłe bezpośrednie linki');await nojs.close();

  const aliases=await browser.newContext({serviceWorkers:'block'});await configure(aliases,[repo('Test')]);
  const a=await aliases.newPage();await a.goto(origin+'/podroz/?projekt=Test');await a.waitForURL('**/Test/',{timeout:10000});
  const b=await aliases.newPage();await b.goto(origin+'/portal/?projekt=Test');await b.waitForURL('**/Test/',{timeout:10000});
  const q=await aliases.newPage();await q.goto(origin+'/podroz/?projekt='+encodeURIComponent('https://evil.example')+'&url=https://evil.example');
  assert.match(await q.locator('#legacy-status').textContent(),/Nie znaleziono/);console.log('PASS: stare linki prowadzą prosto do projektu, błędny cel jest odrzucony');await aliases.close();

  const ext=await browser.newContext({serviceWorkers:'block'});const extRepo={...repo('External'),homepage:'https://example.invalid/'};await configure(ext,[extRepo]);const eh=await ext.newPage();await eh.goto(origin+'/',{waitUntil:'domcontentloaded'});await eh.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
  const el=eh.locator('#grid .btn-journey').first();await el.waitFor({state:'visible'});const [et]=await Promise.all([eh.waitForEvent('popup'),el.click()]);await et.waitForURL('https://example.invalid/');assert.equal(await et.locator('#external').textContent(),'Zewnętrzny projekt');assert.equal(await et.locator('#rj-portal-arrival').count(),0);
  console.log('PASS: obcy origin otwiera się bezpośrednio bez wstrzykiwania kodu');await ext.close();
 }finally{releaseImage();await browser.close();server.close();}
})().catch(e=>{console.error(e);releaseImage();server.close();process.exitCode=1;});

/* Weryfikacja kolejkowania i sprzątania animacji podglądów, bez mierzenia FPS tiltu. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync(path.join(__dirname,'../../js/loader.js'),'utf8').replace('[700, 1800, 4000, 8000].forEach','[].forEach');
const balls='<span class="dough-slot"><i class="ball"></i><i class="shadow"></i></span>'.repeat(3);
const cards=Array.from({length:6},(_,i)=>`<a class="card-preview" href="#${i}"><div class="card-preview-frame"><iframe data-src="https://example.com/P${i}"></iframe></div><div class="card-preview-loader"><div class="rj-dough rj-dough--sm">${balls}</div></div></a>`).join('');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM('<!doctype html><html><body>'+cards+'</body></html>',{url:'https://rejson59.github.io/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,doc=w.document;let calls=0,cancelled=0,observers=[];
 w.Element.prototype.animate=function(){calls++;return {cancel(){cancelled++;}}};
 w.IntersectionObserver=class {constructor(cb,options){this.cb=cb;this.options=options;observers.push(this);}observe(){}unobserve(){}};
 w.eval(src);w.RJLoader.scan(doc);const previews=[...doc.querySelectorAll('.card-preview')];
 const near=(list)=>list.find(o=>o.options&&o.options.threshold===0.01&&/^\d+px 0px \d+px 0px$/.test(String(o.options.rootMargin)));
 const io=near(observers);assert(io,'wyprzedzające ładowanie');assert.equal(calls,0,'niewidoczne podglądy nie uruchamiają animacji');assert.equal(previews[0].querySelectorAll('.card-preview-loader').length,1,'nie duplikujemy istniejącego loadera');
 io.cb(previews.map(target=>({target,isIntersecting:true,intersectionRatio:1})));
 assert.equal(previews.filter(p=>p._rjMounting).length,1,'pierwszy start od razu');assert.equal(calls,6,'animowane są tylko kulki aktywnego podglądu');
 await wait(80);assert.equal(previews.filter(p=>p._rjMounting).length,1,'nie ma zrywu iframe w jednej klatce');
 await wait(100);assert.equal(previews.filter(p=>p._rjMounting).length,2,'kolejna ramka startuje po odstępie');
 const first=previews[0],iframe=first.querySelector('iframe');Object.defineProperty(iframe,'contentWindow',{configurable:true,value:{location:{href:'https://example.com/P0'},close(){}}});Object.defineProperty(iframe,'contentDocument',{configurable:true,value:{body:{children:[doc.createElement('div')],textContent:'ok'}}});iframe.dispatchEvent(new w.Event('load'));
 assert(first.classList.contains('is-loaded'));assert.equal(cancelled,6,'animacje gotowego podglądu zatrzymane');assert.equal(first.querySelectorAll('.card-preview-loader').length,1);
 const activeBefore=calls;w.RJLoader.retry(first);assert(first.classList.contains('is-loading'));assert.equal(calls,activeBefore+6,'ponowna próba uruchamia kulki od nowa');
 iframe.dispatchEvent(new w.Event('load'));assert(first.classList.contains('is-loaded'));assert.equal(cancelled,12,'sprzątanie także po ponowieniu');
 await wait(600);assert.equal(previews.filter(p=>p._rjMounted).length,6,'kolejka wciąż dociera do pozostałych kart');
 await wait(400);assert.equal(previews.filter(p=>p._rjMounted).length,6);
 let scans=0;const query=doc.querySelectorAll.bind(doc);doc.querySelectorAll=function(selector){if(selector==='.card-preview')scans++;return query(selector)};
 const harmless=doc.createElement('span');harmless.textContent='Aktualizacja licznika';doc.body.appendChild(harmless);await wait(400);assert.equal(scans,0,'zmiana licznika nie uruchamia skanowania wszystkich kart');for(let i=0;i<20;i++)w.dispatchEvent(new w.Event('scroll'));await wait(300);assert.equal(scans,0,'observer zastępuje pełne skanowanie podczas scrolla');
 const fresh=doc.createElement('div');fresh.innerHTML='<a class="card-preview" href="#new"><div class="card-preview-frame"><iframe data-src="https://example.com/new"></iframe></div></a>';doc.body.appendChild(fresh);await wait(450);assert(scans>=1,'nowa karta nadal zostaje wykryta');assert(fresh.querySelector('.card-preview')._rjObserved);
 dom.window.close();
 // Rzeczywiście widoczna karta wyprzedza kolejkę podglądów z marginesu.
 const priorityDom=new JSDOM('<!doctype html><html><body>'+cards+'</body></html>',{url:'https://rejson59.github.io/',runScripts:'outside-only',pretendToBeVisual:true});const pw=priorityDom.window,obs=[];pw.Element.prototype.animate=undefined;pw.IntersectionObserver=class{constructor(cb,options){this.cb=cb;this.options=options;obs.push(this)}observe(){}unobserve(){}};pw.eval(src);pw.RJLoader.scan(pw.document);const ps=[...pw.document.querySelectorAll('.card-preview')],probe=obs.find(o=>o.options&&o.options.threshold===0.01&&/^\d+px 0px \d+px 0px$/.test(String(o.options.rootMargin))),visible=obs.find(o=>!o.options.rootMargin);probe.cb(ps.slice(0,3).map(target=>({target,isIntersecting:true,intersectionRatio:1})));visible.cb([{target:ps[2],isIntersecting:true,intersectionRatio:1}]);await wait(150);assert(ps[2]._rjMounting&&!ps[1]._rjMounting,'widoczny podgląd wyprzedza prefetch');probe.cb([{target:ps[1],isIntersecting:false,intersectionRatio:0}]);await wait(150);assert(!ps[1]._rjMounting,'oddalona karta nie blokuje kolejki');probe.cb([{target:ps[1],isIntersecting:true,intersectionRatio:1}]);await wait(150);assert(ps[1]._rjMounting,'powrót do strefy wznawia podgląd');priorityDom.window.close();

 // Montowanie podglądów czeka, aż strona przestanie się przewijać.
 const quietDom=new JSDOM('<!doctype html><html><body>'+cards+'</body></html>',{url:'https://rejson59.github.io/',runScripts:'outside-only',pretendToBeVisual:true});
 const qw=quietDom.window,qd=qw.document,qobs=[];
 qw.Element.prototype.animate=undefined;
 qw.IntersectionObserver=class{constructor(cb,options){this.cb=cb;this.options=options;qobs.push(this)}observe(){}unobserve(){}};
 qw.eval(src);qw.RJLoader.scan(qd);
 const qp=[...qd.querySelectorAll('.card-preview')];
 const nearObs=qobs.find(o=>o.options&&o.options.threshold===0.01&&/^\d+px 0px \d+px 0px$/.test(String(o.options.rootMargin)));
 assert(nearObs,'observer wyprzedzający');
 nearObs.cb([{target:qp[0],isIntersecting:true,intersectionRatio:1}]);
 await wait(60);assert(qp[0]._rjMounting,'w spoczynku pierwszy podgląd startuje od razu');
 // przewijanie w toku: kolejna karta czeka
 const scrollTimer=setInterval(()=>qw.dispatchEvent(new qw.Event('scroll')),20);
 await wait(60);
 nearObs.cb([{target:qp[1],isIntersecting:true,intersectionRatio:1}]);
 await wait(300);assert(!qp[1]._rjMounting,'w trakcie przewijania nie startuje nowy iframe');
 clearInterval(scrollTimer);
 await wait(500);assert(qp[1]._rjMounting,'po zatrzymaniu przewijania kolejka rusza dalej');
 qw.close();

 // Profil „słabszego sprzętu” musi realnie skracać życie ramek i zamrażanie.
 assert.match(src,/var PREVIEW_RELEASE_DELAY_MS = weakDevice \? 400 : 1200;/,'krótsze trzymanie ramki poza kadrem');
 assert.match(src,/var NEAR_MARGIN = weakDevice \? "360px 0px 360px 0px" : "800px 0px 800px 0px";/,'mniejszy zapas wczytywania na telefonie');
 const appSource=fs.readFileSync(path.join(__dirname,'../../js/app.js'),'utf8');
 assert.match(appSource,/var FREEZE_DELAY_MS = isWeakDevice \? 1500 : 5000;/,'szybsze zamrażanie podglądu na słabszym sprzęcie');
 assert.match(appSource,/leaveObserver/,'karta poza kadrem jest zamrażana od razu');


 // Nakładka ładowania: pełne krycie, zero pełnoekranowego rozmywania.
 const glass2=fs.readFileSync(path.join(__dirname,'../../rejhub2/hub/glass2.css'),'utf8');
 assert.equal(/body #rj-page-loader/.test(glass2),false,'glass2 nie nadpisuje już nakładki półprzezroczystą szybą');
 const hubCss=fs.readFileSync(path.join(__dirname,'../../rejhub2/hub/loader.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 const overlayBlock=hubCss.slice(hubCss.indexOf('#rj-page-loader {'),hubCss.indexOf('#rj-page-loader .rj-loader-box'));
 assert.ok(!/backdrop-filter/.test(overlayBlock),'nakładka nie rozmywa tła (to była najdroższa rzecz na ekranie)');
 assert.match(overlayBlock,/background:/,'nakładka ma pełne tło');

 // Animacje poza kadrem są zatrzymywane, a nie usuwane.
 const shell=fs.readFileSync(path.join(__dirname,'../../rejhub2/hub/hub-shell.js'),'utf8');
 assert.match(shell,/IntersectionObserver/,'powłoka obserwuje widoczność');
 assert.match(shell,/rj-anim-paused/,'powłoka zatrzymuje animacje poza kadrem');
 assert.match(shell,/MutationObserver/,'karty z API też są obejmowane');
 assert.match(glass2,/\.rj-anim-paused[\s\S]*?animation-play-state:\s*paused/,'CSS zatrzymuje animacje klasy rj-anim-paused');

 console.log('PASS: animacje, kolejka iframe, priorytet widocznych kart, spoczynek przy przewijaniu, słabszy sprzęt, nakładka i animacje poza kadrem');
})().catch(e=>{console.error(e);process.exitCode=1});

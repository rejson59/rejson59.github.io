/* Weryfikacja kolejkowania i sprzątania animacji podglądów, bez mierzenia FPS tiltu. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync(path.join(__dirname,'../../js/loader.js'),'utf8').replace('[700, 1800, 4000, 8000].forEach','[].forEach');
const balls='<span class="dough-slot"><i class="ball"></i><i class="shadow"></i></span>'.repeat(3);
const cards=Array.from({length:6},(_,i)=>`<a class="card-preview" href="#${i}"><div class="card-preview-frame"><iframe data-src="https://example.com/P${i}"></iframe></div><div class="card-preview-loader"><div class="rj-dough rj-dough--sm">${balls}</div></div></a>`).join('');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM('<!doctype html><html><body>'+cards+'</body></html>',{url:'https://rejson59.github.io/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,doc=w.document;let calls=0,cancelled=0,io;
 w.Element.prototype.animate=function(){calls++;return {cancel(){cancelled++;}}};
 w.IntersectionObserver=class {constructor(cb,options){this.cb=cb;this.options=options;io=this;}observe(){}unobserve(){}};
 w.eval(src);w.RJLoader.scan(doc);const previews=[...doc.querySelectorAll('.card-preview')];
 assert.equal(io.options.rootMargin,'500px 0px 500px 0px');assert.equal(calls,0,'niewidoczne podglądy nie uruchamiają animacji');assert.equal(previews[0].querySelectorAll('.card-preview-loader').length,1,'nie duplikujemy istniejącego loadera');
 io.cb(previews.map(target=>({target,isIntersecting:true,intersectionRatio:1})));
 assert.equal(previews.filter(p=>p._rjMounting).length,1,'pierwszy start od razu');assert.equal(calls,6,'animowane są tylko kulki aktywnego podglądu');
 await wait(80);assert.equal(previews.filter(p=>p._rjMounting).length,1,'nie ma zrywu iframe w jednej klatce');
 await wait(200);assert.equal(previews.filter(p=>p._rjMounting).length,2,'kolejna ramka startuje po odstępie');
 const first=previews[0],iframe=first.querySelector('iframe');Object.defineProperty(iframe,'contentWindow',{configurable:true,value:{location:{href:'https://example.com/P0'},close(){}}});Object.defineProperty(iframe,'contentDocument',{configurable:true,value:{body:{children:[doc.createElement('div')],textContent:'ok'}}});iframe.dispatchEvent(new w.Event('load'));
 assert(first.classList.contains('is-loaded'));assert.equal(cancelled,6,'animacje gotowego podglądu zatrzymane');assert.equal(first.querySelectorAll('.card-preview-loader').length,1);
 const activeBefore=calls;w.RJLoader.retry(first);assert(first.classList.contains('is-loading'));assert.equal(calls,activeBefore+6,'ponowna próba uruchamia kulki od nowa');
 iframe.dispatchEvent(new w.Event('load'));assert(first.classList.contains('is-loaded'));assert.equal(cancelled,12,'sprzątanie także po ponowieniu');
 await wait(700);assert.equal(previews.filter(p=>p._rjMounted).length,5,'kolejka wciąż dociera do pozostałych kart');
 await wait(400);assert.equal(previews.filter(p=>p._rjMounted).length,6);
 let scans=0;const query=doc.querySelectorAll.bind(doc);doc.querySelectorAll=function(selector){if(selector==='.card-preview')scans++;return query(selector)};
 const harmless=doc.createElement('span');harmless.textContent='Aktualizacja licznika';doc.body.appendChild(harmless);await wait(400);assert.equal(scans,0,'zmiana licznika nie uruchamia skanowania wszystkich kart');
 const fresh=doc.createElement('div');fresh.innerHTML='<a class="card-preview" href="#new"><div class="card-preview-frame"><iframe data-src="https://example.com/new"></iframe></div></a>';doc.body.appendChild(fresh);await wait(450);assert(scans>=1,'nowa karta nadal zostaje wykryta');assert(fresh.querySelector('.card-preview')._rjObserved);
 dom.window.close();console.log('PASS: brak zdublowanych i ukrytych animacji, kolejka iframe, retry i ponowne uruchamianie');
})().catch(e=>{console.error(e);process.exitCode=1});

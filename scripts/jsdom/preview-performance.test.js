/* Weryfikacja kolejkowania i sprzątania animacji podglądów, bez mierzenia FPS tiltu. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync(path.join(__dirname,'../../js/loader.js'),'utf8').replace('[700, 1800, 4000, 8000].forEach','[].forEach');
const balls='<span class="dough-slot"><i class="ball"></i><i class="shadow"></i></span>'.repeat(3);
const cards=Array.from({length:6},(_,i)=>`<a class="card-preview" href="#${i}"><div class="card-preview-frame"><iframe data-src="https://example.com/P${i}"></iframe></div><div class="card-preview-loader"><div class="rj-dough rj-dough--sm">${balls}</div></div></a>`).join('');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const balls='<span class="dough-slot"><i class="ball"></i><i class="shadow"></i></span>'.repeat(3);
 const cards=Array.from({length:6},(_,i)=>`<a class="card-preview" href="#${i}"><div class="card-preview-frame"><iframe data-src="https://example.com/P${i}"></iframe></div><div class="card-preview-loader"><div class="rj-dough rj-dough--sm">${balls}</div></div></a>`).join('');
 const build=(strong)=>{
  const dom=new JSDOM('<!doctype html><html><body>'+cards+'</body></html>',{url:'https://rejson59.github.io/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, io=[];
  /* Sandbox ma 2 rdzenie, więc profil byłby zawsze „słaby”. Ustawiamy oba
     profile jawnie, żeby sprawdzić limity 3 i 2 żywe ramki. */
  Object.defineProperty(w.navigator,'hardwareConcurrency',{configurable:true,value:strong?8:2});
  Object.defineProperty(w.navigator,'deviceMemory',{configurable:true,value:strong?8:2});
  w.Element.prototype.animate=function(){return {cancel(){}}};
  w.IntersectionObserver=class{constructor(cb,options){this.cb=cb;this.options=options;io.push(this)}observe(){}unobserve(){}};
  w.eval(src);w.RJLoader.scan(w.document);
  const previews=[...w.document.querySelectorAll('.card-preview')];
  const hasMargin=(o)=>/^\d+px 0px \d+px 0px$/.test(String(o.options.rootMargin));
  return {
   dom,w,io,previews,
   visible:io.find(o=>o.options&&o.options.rootMargin===undefined),
   near:io.find(o=>o.options&&hasMargin(o)&&o.options.threshold===0.01),
   retain:io.find(o=>o.options&&hasMargin(o)&&o.options.threshold===0)
  };
 };
 const paintIframe=(w,preview)=>{
  const iframe=preview.querySelector('iframe');
  Object.defineProperty(iframe,'contentWindow',{configurable:true,value:{location:{href:iframe.getAttribute('data-src')},close(){}}});
  Object.defineProperty(iframe,'contentDocument',{configurable:true,value:{body:{children:[w.document.createElement('div')],textContent:'ok'}}});
  iframe.dispatchEvent(new w.Event('load'));
 };

 // 1. NIC nie startuje bez widoczności — i nigdy więcej niż jedna ramka naraz.
 const A=build(true);
 assert.equal(A.visible.options.threshold,0.01,'observer widoczności ma próg');
 assert.ok(A.near,'observer wyprzedzający');
 assert.ok(A.retain,'observer pasa zapasu');
 await wait(120);
 assert.equal(A.previews.filter(p=>p._rjMounted).length,0,'karta poza ekranem nie wczytuje iframe');

 // 2. Sześć kart „widocznych” → silnik wczytuje je po kolei, maksymalnie 3 żywe.
 A.visible.cb(A.previews.map((target,i)=>({target,isIntersecting:true,intersectionRatio:0.9-i*0.1})));
 A.retain.cb(A.previews.map(target=>({target,isIntersecting:true,intersectionRatio:1})));
 await wait(160);
 assert.equal(A.previews.filter(p=>p._rjMounting).length,1,'dokładnie jedna ramka wczytuje się naraz');
 const order=[];
 for(let step=0;step<8;step++){
  let mounting=null;
  for(let i=0;i<40&&!mounting;i++){ mounting=A.previews.find(p=>p._rjMounting); if(!mounting) await wait(100); }
  if(!mounting) break;
  order.push(A.previews.indexOf(mounting));
  paintIframe(A.w,mounting);
  await wait(60);
 }
 assert.deepEqual(order.slice(0,3),[0,1,2],'kolejność: najbardziej widoczna najpierw (limit 3 na mocnym sprzęcie)');
 assert.equal(A.previews.filter(p=>p._rjMounted).length,3,'na mocnym sprzęcie żyją dokładnie 3 ramki');
 assert.equal(A.w.RJLoader.liveCount(),A.previews.filter(p=>p._rjMounted).length,'API pokazuje realną liczbę żywych ramek');

 // 3. Karta wyjeżdża z kadru i z pasa zapasu → zwalniamy ją NATYCHMIAST (src znika).
 const gone=A.previews[0];
 A.visible.cb([{target:gone,isIntersecting:false,intersectionRatio:0}]);
 A.retain.cb([{target:gone,isIntersecting:false,intersectionRatio:0}]);
 await wait(400);
 assert.equal(gone._rjMounted,false,'ramka poza kadrem jest zwalniana');
 assert.equal(gone.querySelector('iframe').hasAttribute('src'),false,'usunięcie src kasuje dokument podglądu');
 assert.equal(gone.hasAttribute('data-src'),false,'data-src zostaje na iframe');
 assert.equal(gone.querySelector('iframe').getAttribute('data-src'),'https://example.com/P0','adres do powrotu nietknięty');

 // 4. Powrót do kadru budzi kartę ponownie (jedno przypisanie z data-src).
 A.visible.cb([{target:gone,isIntersecting:true,intersectionRatio:0.95}]);
 A.retain.cb([{target:gone,isIntersecting:true,intersectionRatio:1}]);
 await wait(220);
 assert.ok(gone._rjMounting||gone._rjMounted,'karta wraca po powrocie do kadru');
 A.dom.window.close();

 // 5. Przewijanie w toku: nowa ramka nie startuje.
 const B=build(false);
 B.visible.cb(B.previews.map((target,i)=>({target,isIntersecting:true,intersectionRatio:0.9-i*0.1})));
 B.retain.cb(B.previews.map(target=>({target,isIntersecting:true,intersectionRatio:1})));
 await wait(150);
 const first=B.previews.find(p=>p._rjMounting);
 assert(first,'pierwsza ramka rusza w spoczynku');
 assert.equal(B.w.RJLoader.liveCount()<=2,true,'słabszy profil: najwyżej 2 żywe ramki');
 paintIframe(B.w,first);
 await wait(100);
 const scrollTimer=setInterval(()=>B.w.dispatchEvent(new B.w.Event('scroll')),20);
 await wait(120);
 const before=B.previews.filter(p=>p._rjMounting).length;
 await wait(400);
 assert.equal(B.previews.filter(p=>p._rjMounting).length,before,'w trakcie przewijania nie rusza nowa ramka');
 clearInterval(scrollTimer);
 await wait(900);
 assert(B.previews.filter(p=>p._rjMounting).length>=1,'po zatrzymaniu przewijania kolejka rusza dalej');
 assert.ok(B.w.RJLoader.liveCount()<=2,'słabszy profil nigdy nie przekracza 2 żywych ramek');
 B.dom.window.close();

 // 6. Ustawienia i źródła.
 assert.match(src,/var MAX_LIVE_PREVIEWS = weakDevice \? 2 : 3;/,'limit żywych ramek');
 assert.match(src,/var MOUNT_GAP_MS = weakDevice \? 650 : 380;/,'odstęp między ramkami');
 assert.match(src,/var LIVE_RETAIN_PX = weakDevice \? 220 : 700;/,'pas zapasu');
 assert.match(src,/function releasePreview\(preview\)/,'zwalnianie ramki');
 assert.match(src,/iframe\.removeAttribute\("src"\)/,'zwolnienie przez usunięcie src');
 const appSource=fs.readFileSync(path.join(__dirname,'../../js/app.js'),'utf8');
 assert.match(appSource,/var FREEZE_DELAY_MS = isWeakDevice \? 1200 : 5000;/,'szybsze zamrażanie na słabszym sprzęcie');
 assert.match(appSource,/RJLoader\.refresh/,'zamrożenie oddaje slot silnikowi');

 // 7. Nakładka ładowania: pełne krycie, bez pełnoekranowego rozmywania.
 const glass2=fs.readFileSync(path.join(__dirname,'../../rejhub2/hub/glass2.css'),'utf8');
 assert.equal(/body #rj-page-loader/.test(glass2),false,'glass2 nie nadpisuje już nakładki półprzezroczystą szybą');
 const hubCss=fs.readFileSync(path.join(__dirname,'../../rejhub2/hub/loader.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 const overlayBlock=hubCss.slice(hubCss.indexOf('#rj-page-loader {'),hubCss.indexOf('#rj-page-loader .rj-loader-box'));
 assert.ok(!/backdrop-filter/.test(overlayBlock),'nakładka nie rozmywa tła');
 assert.match(overlayBlock,/background:/,'nakładka ma pełne tło');

 // 8. Karty: statyczna tafla szkła zamiast backdrop-filter przy przewijaniu.
 assert.match(glass2,/url\("\/hub\/wallpaper-glass\.webp"\)/,'ciemna tafla szkła');
 assert.match(glass2,/wallpaper-glass-light\.webp/,'jasna tafla szkła');
 const cardBlock=glass2.slice(glass2.indexOf('body.rj-home .project-card,\nbody.rj-home .projects .project-card {'));
 assert.match(cardBlock.slice(0,900),/backdrop-filter: none !important/,'karty nie liczą już rozmycia tła');
 assert.match(cardBlock.slice(0,900),/url\("\/hub\/wallpaper-glass\.webp"\)/,'karty dostają gotową taflę');
 ['wallpaper-glass.webp','wallpaper-glass-light.webp'].forEach(f=>{
  const size=fs.statSync(path.join(__dirname,'../../rejhub2/hub/'+f)).size;
  assert.ok(size<14000,f+' musi być lekkie (jest '+size+' B)');
 });

 // 9. Animacje poza kadrem są zatrzymywane, nie usuwane.
 const shell=fs.readFileSync(path.join(__dirname,'../../rejhub2/hub/hub-shell.js'),'utf8');
 assert.match(shell,/IntersectionObserver/,'powłoka obserwuje widoczność');
 assert.match(shell,/rj-anim-paused/,'powłoka zatrzymuje animacje poza kadrem');
 assert.match(shell,/MutationObserver/,'karty z API też są obejmowane');
 assert.match(glass2,/\.rj-anim-paused[\s\S]*?animation-play-state:\s*paused/,'CSS zatrzymuje animacje klasy rj-anim-paused');

 console.log('PASS: silnik szeregowy podglądów (max żywych, po kolei, spoczynek, zwalnianie), statyczna tafla szkła, nakładka i animacje poza kadrem');
})().catch(e=>{console.error(e);process.exitCode=1});

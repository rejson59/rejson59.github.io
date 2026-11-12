/* Bez sieci: banery we wszystkich stronach, bez zamykania i bez duplikowania. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'),root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pages=['index.html','uslugi.html','partnerstwo.html','rejchat.html','rejfile.html','logowanie.html','profil.html','404.html','rejtools.html','rejsejf.html','konto-demo.html'];
for(const file of pages){const dom=new JSDOM(read(file),{url:'https://rejson59.github.io/'+file,runScripts:'outside-only',virtualConsole:new VirtualConsole()});const w=dom.window,d=w.document;
 assert.ok(d.querySelector('noscript #rj-mobile-ads'),file+': fallback bez JS');assert.equal(d.querySelectorAll('noscript .rj-mobile-ad-icon svg').length,4,file+': ikony bez JS');
 d.querySelector('noscript #rj-mobile-ads').parentNode.remove();
 const computed=w.getComputedStyle.bind(w);w.getComputedStyle=el=>el.id==='rj-mobile-ads-check'?{position:'fixed',zIndex:'2147482999'}:computed(el);
 assert.equal(d.querySelectorAll('script[src="/js/mobile-ads.js?v=9"]').length,1,file);assert.equal(d.querySelectorAll('link[href="/css/mobile-ads.css?v=9"]').length,1,file);
 w.eval(read('js/mobile-ads.js'));w.eval(read('js/mobile-ads.js'));
 assert.equal(d.querySelectorAll('#rj-mobile-ads').length,1,file);assert.equal(d.querySelectorAll('.rj-mobile-ads-spacer').length,0,file+': bez pustego odstępu na dole');
 assert.equal(d.querySelectorAll('#rj-mobile-ads a').length,4,file);assert.equal(d.querySelectorAll('#rj-mobile-ads .rj-mobile-ad-icon svg').length,4,file+': ikony');assert.equal(d.querySelectorAll('#rj-mobile-ads button').length,0,file);assert.match(d.querySelector('#rj-mobile-ads').textContent,/mini reklamy/);
 assert.ok(d.querySelector('#rj-mobile-ads a[href="/rejchat"]'));assert.ok(d.querySelector('#rj-mobile-ads a[href="/rejfile"]'));assert.ok(d.querySelector('#rj-mobile-ads a[href="/uslugi"]'));assert.ok(d.querySelector('#rj-mobile-ads a[href="/partnerstwo#propozycja"]'));
 assert.ok(d.documentElement.classList.contains('rj-mobile-ads-active'));w.close();}
for(const url of ['https://rejson59.github.io/admin','https://rejson59.github.io/admin.html','https://rejson59.github.io/admin/','https://rejson59.github.io/OffChat/','https://rejson59.github.io/rejson-widgets/','https://rejson59.github.io/OtherProject/']) { const d=new JSDOM('<body></body>',{url,runScripts:'outside-only'});d.window.getComputedStyle=()=>({position:'fixed',zIndex:'2147482999'});d.window.eval(read('js/mobile-ads.js'));d.window.eval(read('js/side-ads.js'));assert.equal(d.window.document.querySelector('#rj-mobile-ads, .rj-side-ads'),null,url);d.window.close(); }
assert.doesNotMatch(read('rejson-widgets/index.html'),/mobile-ads\.js|side-ads\.js|rj-mobile-ads-spacer/);
assert.doesNotMatch(read('admin.html'),/mobile-ads\.(?:js|css)|side-ads\.(?:js|css)|rj-mobile-ads-spacer|id="rj-mobile-ads"/);
assert.match(read('rejson-widgets/widget.js'),/var\(--rj-mobile-ads-height, 0px\)/);
assert.match(read('css/mobile-ads.css'),/position:sticky/);assert.match(read('js/mobile-ads.js'),/STEP_MS = 3500/,'jedna promocja zostaje dłużej: zmiana co 3,5 s');assert.match(read('css/mobile-ads.css'),/grid-auto-columns:100%/,'jedna promocja na raz — kafel na całą szerokość');assert.match(read('css/mobile-ads.css'),/scroll-snap-type:x mandatory/,'slajdy przyciągają się po jednym');assert.doesNotMatch(read('css/mobile-ads.css'),/grid-auto-columns:calc\(\(100% - 6px\) \/ 2\)/,'nie ma już dwóch promocji obok siebie');assert.match(read('js/mobile-ads.js'),/header.nextSibling/);
assert.doesNotMatch(read('js/mobile-ads.js'),/fetch\(|localStorage|sessionStorage/);
console.log('PASS: mini reklamy mobilne, linki, miejsce na treść i brak przycisku zamykania');

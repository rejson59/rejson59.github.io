/* Bez sieci: banery we wszystkich stronach, bez zamykania i bez duplikowania. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'),root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pages=['index.html','uslugi.html','partnerstwo.html','rejchat.html','rejfile.html','tablica-pomyslow.html','widzety.html','logowanie.html','profil.html','admin.html','404.html','rejson-widgets/index.html'];
for(const file of pages){const dom=new JSDOM(read(file),{url:'https://rejson59.github.io/'+file,runScripts:'outside-only',virtualConsole:new VirtualConsole()});const w=dom.window,d=w.document;
 assert.ok(d.querySelector('noscript #rj-mobile-ads'),file+': fallback bez JS');
 d.querySelector('noscript #rj-mobile-ads').parentNode.remove();
 const computed=w.getComputedStyle.bind(w);w.getComputedStyle=el=>el.id==='rj-mobile-ads-check'?{position:'fixed',zIndex:'2147482999'}:computed(el);
 assert.equal(d.querySelectorAll('script[src="/js/mobile-ads.js?v=2"]').length,1,file);assert.equal(d.querySelectorAll('link[href="/css/mobile-ads.css?v=2"]').length,1,file);
 w.eval(read('js/mobile-ads.js'));w.eval(read('js/mobile-ads.js'));
 assert.equal(d.querySelectorAll('#rj-mobile-ads').length,1,file);assert.equal(d.querySelectorAll('.rj-mobile-ads-spacer').length,1,file);
 assert.equal(d.querySelectorAll('#rj-mobile-ads a').length,2,file);assert.equal(d.querySelectorAll('#rj-mobile-ads button').length,1,file);assert.match(d.querySelector('#rj-mobile-ads').textContent,/mini reklamy/);assert.equal(d.querySelector('#rj-mobile-ads button').getAttribute('aria-pressed'),'false');
 assert.ok(d.querySelector('#rj-mobile-ads a[href="/rejfile"]'));assert.ok(d.querySelector('#rj-mobile-ads a[href="/partnerstwo#propozycja"]'));
 assert.ok(d.documentElement.classList.contains('rj-mobile-ads-active'));w.close();}
assert.match(read('rejson-widgets/widget.js'),/var\(--rj-mobile-ads-height, 0px\)/);
assert.match(read('css/mobile-ads.css'),/scroll-padding-bottom/);
assert.doesNotMatch(read('js/mobile-ads.js'),/fetch\(|localStorage|sessionStorage/);
console.log('PASS: mini reklamy mobilne, linki, miejsce na treść i brak przycisku zamykania');

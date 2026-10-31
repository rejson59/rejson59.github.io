/* Bezpośrednie linki i jednorazowa nakładka na docelowym dokumencie. */
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'), root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const home=new JSDOM(read('index.html')).window.document;
const links=[...home.querySelectorAll('.showcase-item a[data-journey]')]; assert.equal(links.length,15);
for(const a of links) { assert.match(a.href,/^https:\/\/rejson59\.github\.io\/[^/]+\/$/); assert.equal(a.target,'_blank'); assert.match(a.rel,/noopener/); assert.match(a.rel,/noreferrer/); }
assert.ok(home.querySelector('[data-tilt]')); assert.ok(home.querySelector('script[src^="js/rocket-open.js"]'));
assert.doesNotMatch(read('js/app.js'),/journeyUrl|\/podroz\/\?projekt/);
assert.match(read('js/app.js'),/card-preview.*esc\(p.liveUrl\)/);
assert.match(read('js/app.js'),/btn-live btn-journey btn-sm.*esc\(p.liveUrl\)/);
assert.match(read('404.html'),/location.replace\("\/podroz\/\?projekt=/);
assert.match(read('js/portal-legacy.js'),/location.replace\('\/podroz\/\?projekt=/);
assert.match(read('podroz/index.html'),/travel-legacy\.js/);
assert.match(read('sw.js'),/\(\?:portal\|podroz\)/);
for(const color of ['#b9d3ff','#6aa6ff','#3f6fbe']) { assert.ok(read('css/loader.css').includes(color)); assert.ok(read('assets/travel-rocket.svg').includes(color)); }

const dom=new JSDOM('<article data-repo="Test"><a data-journey href="/Test/" target="_blank" rel="noopener noreferrer"><span>Test</span></a></article><article data-repo="External"><a id="external" data-journey href="https://example.org/" target="_blank">Zewnątrz</a></article>',{url:'https://rejson59.github.io/',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
let calls=0, store={private:'secret'}, dest='', child={sessionStorage:{clear:()=>{store={};},setItem:(k,v)=>store[k]=v},document:dom.window.document.implementation.createHTMLDocument(''),opener:{},location:{replace:(v)=>dest=v}};
dom.window.open=()=>{calls++;return child;};dom.window.eval(read('js/rocket-open.js'));
const e=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});dom.window.document.querySelector('span').dispatchEvent(e);
assert.equal(e.defaultPrevented,true);assert.equal(store.private,undefined);assert.equal(calls,1);assert.equal(dest,'https://rejson59.github.io/Test/');assert.equal(child.opener,null);
assert.deepEqual(JSON.parse(store.rj_rocket_overlay_v2).path,'/Test/');assert.equal(JSON.parse(store.rj_rocket_overlay_v2).name,'Test');assert.equal(JSON.parse(store.rj_portal_arrival_v1).at,0);
const modified=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:true});dom.window.document.querySelector('a').dispatchEvent(modified);assert.equal(modified.defaultPrevented,false);assert.equal(calls,1);
const external=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});dom.window.document.querySelector('#external').dispatchEvent(external);assert.equal(external.defaultPrevented,false);assert.equal(calls,1);
dom.window.open=()=>null;const blocked=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});dom.window.document.querySelector('a').dispatchEvent(blocked);assert.equal(blocked.defaultPrevented,false);dom.window.close();

function arrival(marker, url='/Project/', sheet=true) {
 const d=new JSDOM('<!doctype html><html><head><link data-rj-portal-style href="/css/portal.css?v=16"></head><body></body></html>',{url:'https://rejson59.github.io'+url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=d.window; w.matchMedia=()=>({matches:false}); w.requestAnimationFrame=()=>1;
 const computed=w.getComputedStyle.bind(w);w.getComputedStyle=el=>el.id==='rj-arrival-css-check'?{position:'fixed',zIndex:'2147483645'}:computed(el);
 if(sheet) Object.defineProperty(w.document.querySelector('link'),'sheet',{value:{}});
 w.sessionStorage.setItem('rj_rocket_overlay_v2',typeof marker==='string'?marker:JSON.stringify(marker));w.eval(read('js/portal-arrival.js'));return w;
}
let w=arrival({path:'/Project/',at:Date.now(),name:'<b>Test</b>',motionOverride:true});
assert.ok(w.document.querySelector('#rj-portal-arrival .rj-arrival-rocket'));
assert.equal(w.document.querySelector('.rj-arrival-name').textContent,'<b>Test</b>');assert.equal(w.document.querySelector('.rj-arrival-name b'),null);
assert.equal(w.document.querySelectorAll('.rj-arrival-puffs i').length,3);assert.equal(w.sessionStorage.getItem('rj_rocket_overlay_v2'),null);w.close();
for(const marker of ['not json',{path:'/Other/',at:Date.now()},{path:'/Project/',at:Date.now()-61000}]) { w=arrival(marker);assert.equal(w.document.querySelector('#rj-portal-arrival'),null);w.close(); }
w=arrival({path:'/Project/',at:Date.now()},'/Project/',false);assert.equal(w.document.querySelector('#rj-portal-arrival'),null);w.close();
console.log('PASS: bezpośrednie linki, prywatny znacznik karty, bezpieczne fallbacki i nakładka projektu');

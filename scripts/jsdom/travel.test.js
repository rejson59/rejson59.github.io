/* Struktura podróży i bezpieczeństwo jednorazowej zasłony. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const home = new JSDOM(read('index.html')).window.document;
const links = [...home.querySelectorAll('.showcase-item a[data-journey]')];
assert.equal(links.length,15);
for (const a of links) { assert.match(a.getAttribute('href'),/^\/podroz\/\?projekt=[\w.-]+$/); assert.equal(a.target,'_blank'); assert.match(a.rel,/noopener/); assert.match(a.rel,/noreferrer/); }
assert.equal(home.querySelectorAll('[data-tilt]').length >= 5,true);
assert.match(read('js/app.js'),/card-preview.*journeyUrl\(p.name\)/);
assert.match(read('js/app.js'),/btn-live btn-journey btn-sm.*journeyUrl\(p.name\)/);
assert.match(read('js/app.js'),/card-title.*journeyUrl\(p.name\)/);
assert.match(read('404.html'),/location.replace\("\/podroz\/\?projekt=/);
assert.match(read('js/portal-legacy.js'),/location.replace\('\/podroz\/\?projekt=/);
assert.match(read('sw.js'),/\(\?:portal\|podroz\)/);
assert.doesNotMatch(read('podroz/index.html'),/portal|three\.js/i);

function travel(name, cached) {
  const dom = new JSDOM(read('podroz/index.html'), {url:'https://rejson59.github.io/podroz/?projekt='+encodeURIComponent(name),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const w=dom.window; let fetched='';
  w.matchMedia=()=>({matches:false}); w.requestAnimationFrame=()=>1;
  w.fetch=(url)=>{fetched=url;return new Promise(()=>{});};
  if(cached) w.localStorage.setItem('rejson_repos_cache_v2',JSON.stringify({data:cached}));
  w.eval(read('js/travel.js')); return {w,fetched};
}
let t=travel('RejStream'); assert.equal(t.w.document.querySelector('#direct').href,'https://rejson59.github.io/RejStream/'); assert.equal(t.w.document.querySelector('#skip').disabled,false); t.w.close();
t=travel('Test',[{name:'Test',homepage:'https://example.com/path'}]); assert.equal(t.w.document.querySelector('#direct').href,'https://example.com/path'); t.w.close();
t=travel('Test',[{name:'Test',homepage:'javascript:alert(1)',has_pages:true}]); assert.equal(t.w.document.querySelector('#direct').href,'https://rejson59.github.io/Test/'); t.w.close();
t=travel('https://evil.example/'); assert.match(t.w.document.querySelector('#travel-status').textContent,/Nie znaleziono/); assert.equal(t.fetched,''); t.w.close();
t=travel('Unlisted'); assert.match(t.fetched,/^https:\/\/api\.github\.com\/repos\/rejson59\/Unlisted$/); assert.equal(t.w.document.querySelector('#direct').hidden,true); t.w.close();

function arrival(marker, url='/Project/', sheet=true) {
  const dom=new JSDOM('<!doctype html><html><head><link data-rj-portal-style></head><body></body></html>',{url:'https://rejson59.github.io'+url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const w=dom.window; w.matchMedia=()=>({matches:false});
  if(sheet) Object.defineProperty(w.document.querySelector('link'),'sheet',{value:{}});
  w.sessionStorage.setItem('rj_rocket_trip_v1',typeof marker==='string'?marker:JSON.stringify(marker));
  w.eval(read('js/portal-arrival.js')); return w;
}
let w=arrival({path:'/Project/',at:Date.now(),motionOverride:true,kind:'rocket'}); assert.ok(w.document.querySelector('#rj-portal-arrival .rj-arrival-rocket')); assert.equal(w.sessionStorage.getItem('rj_rocket_trip_v1'),null); assert.doesNotMatch(w.document.querySelector('#rj-portal-arrival').innerHTML,/tunnel|ring/i); w.close();
for(const marker of ['not json',{path:'/Other/',at:Date.now()},{path:'/Project/',at:Date.now()-61000}]) { w=arrival(marker); assert.equal(w.document.querySelector('#rj-portal-arrival'),null); w.close(); }
w=arrival({path:'/Project/',at:Date.now()},'/Project/',false); assert.equal(w.document.querySelector('#rj-portal-arrival'),null); w.close();
console.log('PASS: linki projektów, 3D, cele z listy, stare adresy i bezpieczna jednorazowa zasłona rakiety');

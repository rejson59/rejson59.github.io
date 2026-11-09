const assert=require('node:assert/strict'),{setup}=require('./studio-browser-helpers');
(async()=>{const app=await setup();try{
const ctx=await app.context(),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(app.origin+'/testy');
await p.waitForFunction(()=>[...document.querySelectorAll('.studio [data-lens]')].every(e=>e.style.getPropertyValue('--lens-filter').includes('url(')));
assert.equal(await p.locator('.example-card').count(),12);
assert(await p.locator('.example-card').evaluateAll(cards=>cards.every(card=>card.querySelector('[data-lens]'))),'Każdy przykład ma szklaną taflę');
assert(await p.locator('.motion-object').evaluateAll(cards=>cards.every(card=>card.hasAttribute('data-lens'))),'Wszystkie przykłady ruchu mają soczewkę');
assert(await p.locator('.world-card').evaluateAll(cards=>cards.every(card=>card.querySelector('[data-lens]'))),'Każdy kierunek ma soczewkę');
const lenses=p.locator('.studio [data-lens]'),count=await lenses.count();assert(count>=25);
assert.equal(await p.locator('filter[id^=studio-lens]').count(),count);
for(let i=0;i<count;i++){
 const lens=lenses.nth(i),info=await lens.evaluate(el=>({className:el.className,filter:getComputedStyle(el).backdropFilter,style:el.style.getPropertyValue('--lens-filter')}));
 assert.match(info.filter,/url\(.*studio-lens-/);assert.match(info.filter,/blur\(1px\)/);assert(!info.filter.includes('blur(6px)'));
 // Porównanie w tej samej tafli, przy tym samym rozmyciu i nasyceniu: wyłącznie SVG zmienia obraz.
 const withLens=await lens.screenshot({animations:'disabled'});await lens.evaluate(e=>e.style.setProperty('--lens-filter','blur(1px) saturate(115%)'));
 const withoutLens=await lens.screenshot({animations:'disabled'});await lens.evaluate((e,style)=>e.style.setProperty('--lens-filter',style),info.style);
 assert(!withLens.equals(withoutLens),`Rzeczywiste tło musi zmieniać się w próbce ${info.className}`);
}
// Aktywna reakcja nadal pozostaje półprzezroczystą soczewką.
const like=p.locator('.sample-main-action');await like.click();assert.equal(await like.getAttribute('aria-pressed'),'true');assert.match(await like.evaluate(e=>getComputedStyle(e).backdropFilter),/studio-lens-/);
const selected=await like.screenshot({animations:'disabled'}),style=await like.evaluate(e=>e.style.getPropertyValue('--lens-filter'));await like.evaluate(e=>e.style.setProperty('--lens-filter','blur(1px) saturate(115%)'));const selectedFlat=await like.screenshot({animations:'disabled'});assert(!selected.equals(selectedFlat),'Aktywny przycisk nadal powiększa tło');await like.evaluate((e,value)=>e.style.setProperty('--lens-filter',value),style);
// Filtry kategorii wyłączają i ponownie pokazują karty bez utraty soczewki.
await p.locator('[data-filter=nav]').click();await p.locator('[data-filter=all]').click();await p.waitForFunction(()=>[...document.querySelectorAll('.example-card [data-lens]')].every(e=>e.style.getPropertyValue('--lens-filter').includes('url(')));
await p.setViewportSize({width:390,height:850});await p.waitForFunction(()=>[...document.querySelectorAll('.studio [data-lens]')].every(e=>{let id=e.style.getPropertyValue('--lens-filter').match(/#([^)]*)/),f=id&&document.getElementById(id[1]);return f&&Number(f.getAttribute('width'))===e.offsetWidth&&Number(f.getAttribute('height'))===e.offsetHeight}));assert(!errors.length,errors.join('\n'));await ctx.close();
const fallback=await app.context();await fallback.addInitScript(()=>{const original=CSS.supports.bind(CSS);CSS.supports=(a,b)=>String(b||'').includes('url(')?false:original(a,b)});let fp=await fallback.newPage();await fp.goto(app.origin+'/testy');assert.equal(await fp.locator('filter[id^=studio-lens]').count(),0);assert.match(await fp.locator('.hero-demo').evaluate(e=>getComputedStyle(e).backdropFilter),/blur\(1px\)/);await fallback.close();console.log(`PASS: wszystkie ${count} tafle zmieniają piksele, filtry kategorii, resize i fallback`);
}finally{await app.close()}})().catch(e=>{console.error(e);process.exitCode=1});

const assert=require('node:assert/strict'),{setup}=require('./studio-browser-helpers');
(async()=>{const app=await setup();try{
const ctx=await app.context(),p=await ctx.newPage();await p.goto(app.origin+'/szklane-studio');await p.locator('.studio').waitFor();await p.locator('#tab-ruch').click();
assert.equal(await p.locator('.motion-card').count(),12);
for(const name of ['sheen','float','press','reveal','glow','slide','tilt','hue','pulse','enter','focus','magnet']){
 const b=p.locator(`[data-motion=${name}]`),object=b.locator('xpath=ancestor::article').locator('[data-motion-object]');
 for(let i=0;i<2;i++){await b.click();assert(await object.evaluate(e=>e.classList.contains('is-playing')),name);assert((await object.evaluate(e=>e.getAnimations({subtree:true}).length))>0,`Brak animacji ${name}`);}
}
await p.emulateMedia({reducedMotion:'reduce'});await p.locator('[data-motion=float]').click();assert.match(await p.locator('#motion-status').textContent(),/ograniczonego ruchu/);assert.equal(await p.locator('.motion-levitate').evaluate(e=>e.classList.contains('is-playing')),false);
await ctx.close();console.log('PASS: dwanaście animacji, wielokrotne odtwarzanie i ograniczony ruch');
}finally{await app.close()}})().catch(e=>{console.error(e);process.exitCode=1});

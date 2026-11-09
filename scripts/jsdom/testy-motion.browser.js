/* Sprawdza rzeczywiste, ponowne uruchomienie każdej animacji, bez zrzutów. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u==='/testy')u='/testy.html';const f=path.resolve(root,'.'+u);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox']});try{
const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',serviceWorkers:'block'});await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());const page=await ctx.newPage();await page.goto(origin+'/testy');
for(const [motion,animation] of [['sweep','lab-sweep'],['float','lab-float'],['pulse','lab-pulse']]){
 await page.locator('#lab-motion').selectOption(motion);
 await page.locator('[data-field=duration]').fill('2');assert.equal(await page.locator('#lab-stage').evaluate((e,name)=>e.getAnimations({subtree:true}).find(a=>a.animationName===name).effect.getTiming().duration,animation),2000);assert((await page.locator('#lab-css').textContent()).includes('2s'));
 for(let attempt=0;attempt<2;attempt++){
  const result=await page.evaluate(({animation})=>{const stage=document.querySelector('#lab-stage');const find=()=>stage.getAnimations({subtree:true}).filter(a=>a.animationName===animation);let old=find();if(!old.length)return {error:'brak animacji '+animation};old.forEach(a=>a.currentTime=2000);document.querySelector('#lab-play').click();let next=find();return {count:next.length,old:old.map(a=>a.playState),time:next.map(a=>a.currentTime),status:document.querySelector('#lab-motion-status').textContent};},{animation});
  assert(!result.error,result.error);assert(result.count>=1,animation+' nie odtworzono');assert(result.time.every(t=>t!==null && t<150),JSON.stringify({animation,...result}));assert.match(result.status,/Odtwarzam od początku/);
 }
}
await page.locator('#lab-motion').selectOption('none');await page.locator('#lab-play').click();assert.match(await page.locator('#lab-motion-status').innerText(),/Bez animacji/);
await page.locator('#lab-motion').selectOption('sweep');await page.locator('#lab-test-motion').check();await page.locator('#lab-play').click();assert.match(await page.locator('#lab-motion-status').innerText(),/ograniczenie ruchu/);assert.equal(await page.locator('#lab-stage').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.animationName==='lab-sweep').length),0);
await page.locator('#lab-test-motion').uncheck();assert(await page.locator('#lab-stage').evaluate(e=>e.getAnimations({subtree:true}).some(a=>a.animationName==='lab-sweep')));
await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#lab-play').click();assert.match(await page.locator('#lab-motion-status').innerText(),/ograniczenie ruchu/);assert.equal(await page.locator('#lab-stage').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.animationName==='lab-sweep').length),0);await ctx.close();console.log('PASS: odtwarzanie 3 animacji od początku wielokrotnie, bez animacji i ograniczony ruch');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

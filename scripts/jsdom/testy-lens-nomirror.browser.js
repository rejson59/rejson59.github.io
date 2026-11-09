/* Rzeczywista rasteryzacja: gradient w dwóch osiach nie może się odwrócić. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u==='/testy')u='/testy.html';const f=path.resolve(root,'.'+u);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox']});try{
const ctx=await browser.newContext({viewport:{width:1500,height:1000},serviceWorkers:'block'});await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());const page=await ctx.newPage();await page.goto(origin+'/testy');await page.locator('[data-preset=liquid]').click();await page.locator('[data-field=refraction]').fill('80');
// Przenosimy rzeczywisty, aktualny filtr do kontrolowanego tła; nie używamy stylu materiału.
for(const band of [8,36,70]){
 await page.locator('[data-field=edgeBand]').fill(String(band));
 for(const selector of ['.lab-demo-card','.lab-mock-nav']){
  const data=await page.locator(selector).evaluate(async el=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const id=el.style.getPropertyValue('--g-backdrop').match(/#([^)]*)/)[1],f=document.getElementById(id),clone=f.cloneNode(true);clone.id='measured';return {width:el.offsetWidth,height:el.offsetHeight,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><defs>'+clone.outerHTML+'</defs></svg>'};});
  let m=await ctx.newPage();await m.setContent(`<style>html,body{margin:0;background:#fff}.scene{position:relative;width:${data.width}px;height:${data.height}px;overflow:hidden}.lens{position:absolute;inset:0;backdrop-filter:url(#measured)}</style>${data.svg}<div class="scene"><div class="lens"></div></div>`);await m.waitForTimeout(250);
  for(const axis of ['x','y']){
   await m.locator('.scene').evaluate((el,axis)=>{el.style.background=`linear-gradient(to ${axis==='x'?'right':'bottom'},rgb(0,0,0),rgb(255,255,255))`},axis);
   const filtered=await m.locator('.scene').screenshot();await m.locator('.lens').evaluate(el=>el.style.backdropFilter='none');const base=await m.locator('.scene').screenshot();await m.locator('.lens').evaluate(el=>el.style.backdropFilter='');
   async function samples(image){return m.evaluate(async ({bytes,axis})=>{const img=new Image();img.src='data:image/png;base64,'+bytes;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const c=canvas.getContext('2d');c.drawImage(img,0,0);const d=c.getImageData(0,0,canvas.width,canvas.height).data;const cross=axis==='x'?canvas.height:canvas.width;return [2,Math.floor(cross/2),cross-3].map(pos=>{let a=[];for(let j=0;j<(axis==='x'?canvas.width:canvas.height);j++){let x=axis==='x'?j:pos,y=axis==='x'?pos:j;a.push(d[(y*canvas.width+x)*4]);}return a;});},{bytes:image.toString('base64'),axis});}
   let rows=await samples(filtered),bases=await samples(base);
   rows.forEach((actual,row)=>{let original=bases[row],n=actual.length;
    for(let i=3;i<n-3;i++)assert(actual[i]>=actual[i-1]-2,`Odwrócenie ${selector}, pas ${band}, oś ${axis}, linia ${row}, ${i}: ${actual[i-1]} → ${actual[i]}`);
    let region=Math.min(band,Math.floor(n/2)),left=Math.max(3,Math.floor(region/4)),right=n-1-left;
    if(row===1)assert(actual[left]>original[left],`Lewa/górna krawędź powinna przybliżać: ${selector} ${band} ${axis} ${actual[left]}/${original[left]}`);
    if(row===1)assert(actual[right]<original[right],`Prawa/dolna krawędź powinna przybliżać: ${selector} ${band} ${axis} ${actual[right]}/${original[right]}`);
    assert(Math.abs(actual[Math.floor(n/2)]-original[Math.floor(n/2)])<=2,'Środek powinien pozostać neutralny');
   });
  }
  await m.close();
 }
}
await ctx.close();console.log('PASS: brak lustrzanego zawijania i powiększenie z obu stron na rzeczywistych pikselach; różne krawędzie i rozmiary');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

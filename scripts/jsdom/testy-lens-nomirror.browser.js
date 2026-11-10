/* Piksele dowodzą niewielkiego powiększenia i braku odwrócenia w obu osiach. */
const assert=require('node:assert/strict'),{setup}=require('./studio-browser-helpers');
(async()=>{const app=await setup();try{
const ctx=await app.context(),page=await ctx.newPage();await page.goto(app.origin+'/szklane-studio');await page.locator('.studio').waitFor();await page.waitForFunction(()=>document.querySelector('.hero-demo').style.getPropertyValue('--lens-filter').includes('url('));
const data=await page.locator('.hero-demo').evaluate(el=>{const id=el.style.getPropertyValue('--lens-filter').match(/#([^)]*)/)[1],f=document.getElementById(id).cloneNode(true);f.id='measured';return {width:el.offsetWidth,height:el.offsetHeight,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><defs>'+f.outerHTML+'</defs></svg>'};});
const m=await ctx.newPage();await m.setContent(`<style>html,body{margin:0}.scene{position:relative;width:${data.width}px;height:${data.height}px}.lens{position:absolute;inset:0;backdrop-filter:url(#measured)}</style>${data.svg}<div class="scene"><div class="lens"></div></div>`);await m.waitForTimeout(200);
for(const axis of ['x','y']){
 await m.locator('.scene').evaluate((e,axis)=>{e.style.background=`linear-gradient(to ${axis==='x'?'right':'bottom'},black,white)`},axis);
 const actual=await m.locator('.scene').screenshot();await m.locator('.lens').evaluate(e=>e.style.backdropFilter='none');const base=await m.locator('.scene').screenshot();await m.locator('.lens').evaluate(e=>e.style.backdropFilter='');
 async function samples(image){return m.evaluate(async ({bytes,axis})=>{let img=new Image();img.src='data:image/png;base64,'+bytes;await img.decode();let canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;let c=canvas.getContext('2d');c.drawImage(img,0,0);let d=c.getImageData(0,0,canvas.width,canvas.height).data,n=axis==='x'?canvas.width:canvas.height,out=[];for(let i=0;i<n;i++){let x=axis==='x'?i:Math.floor(canvas.width/2),y=axis==='y'?i:Math.floor(canvas.height/2);out.push(d[(y*canvas.width+x)*4]);}return out},{bytes:image.toString('base64'),axis});}
 const a=await samples(actual),b=await samples(base),n=a.length;
 for(let i=3;i<n-3;i++)assert(a[i]>=a[i-1]-2,`Odbicie w osi ${axis}, piksel ${i}`);
 const l=Math.floor(n*.25),r=Math.floor(n*.75),slope=(a[r]-a[l])/(b[r]-b[l]);assert(slope>.87&&slope<.97,`Oczekiwane delikatne powiększenie w osi ${axis}: ${slope}`);
 assert(a[l]>b[l]&&a[r]<b[r],`Soczewka powinna przybliżać po obu stronach ${axis}`);
}
await ctx.close();console.log('PASS: delikatne powiększenie 8% bez odbicia, obie osie');
}finally{await app.close()}})().catch(e=>{console.error(e);process.exitCode=1});

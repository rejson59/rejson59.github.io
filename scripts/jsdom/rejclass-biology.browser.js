const {chromium}=require('playwright-core'),assert=require('assert');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
 try{
  for(const theme of ['dark','light']) for(const width of [320,375,760,1280,1600]){
   const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await ctx.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8889/')?r.continue():r.abort());
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(t=>localStorage.setItem('theme',t),theme);
   await page.goto('http://127.0.0.1:8889/rejclass.html',{waitUntil:'domcontentloaded'});
   await page.locator('#biology-area').waitFor();assert.equal(await page.locator('#bio-topics button').count(),7);
   assert.match(await page.locator('#bio-lesson').innerText(),/CHONPS/);
   const files=new Set();
   for(let i=0;i<7;i++){
    await page.locator('#bio-topics button').nth(i).click();
    assert.equal(await page.locator('.rjc-note-answer').count(),3);
    assert.equal(await page.locator('.rjc-note-table tbody tr').count(),i===3?5:4);
    assert.equal(await page.locator('.rjc-note-answer').first().evaluate(el=>el.open),false);
    assert(await page.locator('.rjc-note-hook').isVisible());
    const img=page.locator('.rjc-note-visual img');await img.evaluate(el=>el.decode());
    const image=await img.evaluate(el=>({src:el.getAttribute('src'),alt:el.alt,width:el.naturalWidth}));
    assert(image.alt&&image.width>0);files.add(image.src);
    assert((await page.locator('.rjc-note-visual figcaption').innerText()).length>20);
    const dims=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));
    assert(dims.doc<=dims.view+1,JSON.stringify({theme,width,topic:i,dims}));
   }
   assert.equal(files.size,7);
   const contrast=await page.evaluate(()=>{
    const rgb=s=>s.match(/\d+(?:\.\d+)?/g).slice(0,3).map(Number);
    const lum=c=>{c=c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
    return ['.rjc-note-hook p','.rjc-bio-point:nth-child(1) p','.rjc-bio-point:nth-child(2) p','.rjc-bio-point:nth-child(3) p','.rjc-bio-point:nth-child(4) p','.rjc-note-everyday p','.rjc-note-trap p'].map(sel=>{const el=document.querySelector(sel),fg=lum(rgb(getComputedStyle(el).color)),bg=lum(rgb(getComputedStyle(el.parentElement).backgroundColor));return {sel,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)};});
   });
   contrast.forEach(c=>assert(c.ratio>=4.5,JSON.stringify({theme,...c})));
   await page.locator('#bio-topics button').nth(2).click();await page.locator('.rjc-note-answer summary').first().click();
   assert.equal(await page.locator('.rjc-note-answer').first().evaluate(el=>el.open),true);
   assert.match(await page.locator('#bio-lesson').innerText(),/skrobia/i);
   await page.locator('.rjc-bio-complete').click();assert.equal(await page.locator('.rjc-note-answer').first().evaluate(el=>el.open),true);
   assert.match(await page.locator('#bio-progress-count').innerText(),/1 \/ 7/);
   await page.locator('[data-bio-mode=practice]').click();assert(await page.locator('#bio-lesson').isHidden());assert(await page.locator('#bio-quiz').isVisible());
   await page.locator('.rjc-bio-options button').first().click();assert(await page.locator('#bio-feedback').isVisible());
   await page.locator('#bio-next').click();assert.match(await page.locator('#bio-quiz-progress').innerText(),/2 \/ 3/);
   await page.locator('[data-bio-mode=summary]').click();assert.equal(await page.locator('.rjc-summary-card').count(),7);assert(await page.locator('#bio-quiz').isHidden());assert(await page.locator('#bio-sidebar').isHidden());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#bio-all-quiz').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.match(await page.locator('#bio-quiz-progress').innerText(),/1 \/ 21/);
   await page.locator('[data-subject=english]').click();await page.locator('#english-area').waitFor({state:'visible'});
   assert(await page.locator('#biology-area').isHidden());await page.locator('#flashcard').click();
   assert((await page.locator('#card-meaning').innerText()).length>0);
   await page.locator('[data-subject=chemia]').click();await page.locator('#empty-subject').waitFor({state:'visible'});
   assert.match(await page.locator('#empty-subject').innerText(),/nie ma tu gotowych/i);assert.deepEqual(errors,[]);
   await ctx.close();
  }
  console.log('PASS: 7 ilustracji, kontrast, oba motywy, biologia i angielski w Chromium 320–1600');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

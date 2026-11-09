/* Niezależnie od strefy urządzenia oba liczniki wskazują tę samą chwilę. */
const assert=require('node:assert/strict'),{chromium}=require('playwright-core');
if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,args:['--no-sandbox','--disable-webgl']});try{
 const context=await browser.newContext({timezoneId:'America/Los_Angeles',viewport:{width:1440,height:900},serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8889/')?r.continue():r.abort());
 await context.addInitScript(()=>{window.testNow=Date.parse('2026-11-10T08:19:58Z');Date.now=()=>window.testNow;});
 const page=await context.newPage();await page.goto('http://127.0.0.1:8889/rejclass.html#biologia',{waitUntil:'domcontentloaded'});
 await page.locator('#biology-area:not([hidden])').waitFor();for(const width of [320,375,760,1024,1440]){await page.setViewportSize({width,height:900});const bounds=await page.evaluate(()=>{const section=document.querySelector('[data-countdown=bio-countdown]').getBoundingClientRect(),clock=document.querySelector('#bio-countdown-clock').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,section:{left:section.left,right:section.right,bottom:section.bottom},clock:{left:clock.left,right:clock.right,bottom:clock.bottom}}});assert(!bounds.overflow,`overflow at ${width}`);assert(bounds.clock.left>=bounds.section.left && bounds.clock.right<=bounds.section.right && bounds.clock.bottom<=bounds.section.bottom,`clock at ${width}`);}assert.equal(await page.locator('#bio-countdown-clock').isVisible(),true);assert.equal(await page.locator('#bio-countdown-seconds').textContent(),'02');assert.equal(await page.locator('#countdown-clock').isHidden(),true);
 await page.evaluate(()=>{window.testNow=Date.parse('2026-11-10T08:19:59Z');dispatchEvent(new Event('pageshow'));});assert.equal(await page.locator('#bio-countdown-seconds').textContent(),'01');
 await page.evaluate(()=>{window.testNow=Date.parse('2026-11-10T08:20:00Z');dispatchEvent(new Event('pageshow'));});assert.equal(await page.locator('#bio-countdown-clock').isHidden(),true);assert.match(await page.locator('#bio-countdown-status').textContent(),/rozpoczęła/);
 await context.close();console.log('PASS: biologia i angielski, dokładna godzina CET także w innej strefie');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

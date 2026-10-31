/* Desktop Chromium: panel na imitacji danych, bez logowania do produkcji. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),root=path.resolve(__dirname,'../..');
if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,f=path.resolve(root,'.'+p);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[path.extname(f)]||'application/octet-stream';res.writeHead(200,{'content-type':type});fs.createReadStream(f).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
try{const p=await b.newPage({viewport:{width:1440,height:900}});
 await p.route('**/rejson-widgets/js/supabase-config.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:`window.RejsonCloud={getStoredSession:()=>({access_token:'test'}),setStoredSession:()=>{},rpc:async(name)=>name==='admin_setup_status'?{is_admin:true}:name==='get_admin_activity'?{totals:{online_total:3,views_today_total:41,views_total:1250},projects:[],multi:{}}:{},restTable:async()=>[],loadMirror:()=>[],saveMirror:()=>{}};`}));
 await p.route('https://**/*',r=>r.abort());await p.goto(`http://127.0.0.1:${server.address().port}/admin.html`,{waitUntil:'domcontentloaded'});
 await p.locator('#panel-dash').waitFor({state:'visible'});await p.waitForFunction(()=>document.querySelector('#overview-online').textContent==='3');
 const bounds=await p.evaluate(()=>({nav:document.querySelector('.adm-tabs').getBoundingClientRect().toJSON(),heading:document.querySelector('.overview-heading').getBoundingClientRect().toJSON(),width:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(bounds.nav.bottom<=bounds.heading.top,'nawigacja nie zasłania nagłówka');assert(bounds.width<=bounds.viewport);
 for(const theme of ['dark','light']){await p.evaluate(v=>document.documentElement.dataset.theme=v,theme);assert.equal(await p.locator('#tab-overview').isVisible(),true);assert.equal(await p.locator('.overview-tile').count(),6);}
 await p.locator('[data-open-tab="activity"]').click();assert.equal(await p.locator('#tab-activity').isVisible(),true);assert.equal(await p.locator('#tab-overview').isVisible(),false);
 await p.locator('#tab-btn-overview').click();await p.locator('#tab-btn-overview').press('ArrowRight');assert.equal(await p.locator('#tab-activity').isVisible(),true);
 console.log('PASS: desktop panelu, dwa motywy, nawigacja bez nachodzenia i skróty (mock danych)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

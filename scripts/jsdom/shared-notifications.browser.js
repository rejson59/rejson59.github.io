/* Wspólny dzwonek: układ, widoczność, fallback i przejście do RejChat. Bez zrzutów. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),root=path.resolve(__dirname,'../..');
if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
const server=http.createServer((req,res)=>{let u=new URL(req.url,'http://local').pathname;if(u==='/')u='/index.html';else if(!path.extname(u)&&fs.existsSync(path.join(root,u+'.html')))u+='.html';const f=path.resolve(root,'.'+u);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);});
const pages=['/','/rejchat','/rejfile','/rejtools','/logowanie','/profil','/admin','/tablica-pomyslow','/uslugi','/partnerstwo','/widzety','/404.html','/rejson-widgets/index.html'];
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
try {
 for(const theme of ["dark","light"]) for(const logged of [false,true]) for(const width of [320,375,1201,1440]) {
  const ctx=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});
  await ctx.addInitScript(t=>localStorage.setItem('theme',t),theme);
  if(logged) await ctx.addInitScript(()=>localStorage.setItem('rejson_community_session_v1',JSON.stringify({username:'Tester',token:'t'.repeat(40)})));
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith(origin+'/'))return r.continue();
   if(!u.includes('/rest/v1/rpc/'))return r.abort();const fn=u.split('/').pop();let data=[];
   if(fn==='community_whoami')data={username:'Tester'};
   if(fn==='rejchat_get_profiles')data=[{username:'Tester',avatar:'cat',color:'mint'}];
   if(fn==='rejchat_notifications_list')data={items:[],unread:0};
   if(fn==='community_list_posts')data={posts:[],total:0,available_tags:[]};
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const p=await ctx.newPage();
  for(const page of pages){
   await p.goto(origin+page,{waitUntil:'domcontentloaded'});await p.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
   const bell=p.locator('.rj-chat-bell');await bell.waitFor({state:'visible'});assert.equal(await bell.count(),1,page+' jeden dzwonek RejChat');
   if(logged)await p.locator('.rj-header-profile').waitFor({state:'visible'});
   await p.waitForFunction(({logged,width})=>{const b=document.querySelector('.rj-chat-bell'),a=logged?document.querySelector('.rj-header-profile'):width<=1200?document.querySelector('.mobile-account'):document.querySelector('.site-nav>a');if(!b||!a)return false;const x=b.getBoundingClientRect(),y=a.getBoundingClientRect();return Math.abs(x.right-y.left)<30;},{logged,width});
   const geom=await p.evaluate(()=>{const b=document.querySelector('.rj-chat-bell'),r=b.getBoundingClientRect(),t=document.querySelector('.brand-text');return {left:r.left,right:r.right,width:r.width,svg:b.querySelector('svg path')?.getBBox().width,scroll:document.documentElement.scrollWidth,brand:[t.clientWidth,t.scrollWidth],color:getComputedStyle(b).color,bg:getComputedStyle(b).backgroundColor};});
   assert(geom.left>=0&&geom.right<=width&&geom.width>=40,`${page} ${width}: dzwonek poza ekranem`);assert(geom.svg>5,`${page}: brak rysunku dzwonka`);assert(geom.scroll<=width,`${page} ${width}: overflow`);assert(geom.brand[0]+1>=geom.brand[1],`${page} ${width}: obcięta nazwa`);
   function luminance(rgb){const a=rgb.match(/\d+/g).slice(0,3).map(n=>{let v=+n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*a[0]+.7152*a[1]+.0722*a[2];}const f=luminance(geom.color),b=luminance(geom.bg);assert((Math.max(f,b)+.05)/(Math.min(f,b)+.05)>=3,`${page} ${theme}: kontrast dzwonka`);
   await bell.click();assert.equal(await p.locator('.rj-chat-alert-panel').isVisible(),true,page+': otwarcie panelu');const box=await p.locator('.rj-chat-alert-panel').boundingBox();assert(box.x>=0&&box.x+box.width<=width,page+': panel w ekranie');await p.keyboard.press('Escape');assert(await p.locator('.rj-chat-alert-panel').isHidden());
  }
  await ctx.close();
 }
 const nojs=await browser.newContext({viewport:{width:320,height:850},javaScriptEnabled:false});const np=await nojs.newPage();for(const page of pages){await np.goto(origin+page,{waitUntil:'domcontentloaded'});const bell=np.locator('.rj-chat-bell');assert(await bell.isVisible(),page+': statyczny dzwonek');assert.equal(await bell.getAttribute('href'),'/rejchat#wpisy');}await nojs.close();
 // Rzeczywiste przejście z innej strony z odczytem do konkretnego wpisu (backend mockowany).
 const ctx=await browser.newContext();await ctx.addInitScript(()=>localStorage.setItem('rejson_community_session_v1',JSON.stringify({username:'Tester',token:'t'.repeat(40)})));let read=false;
 await ctx.route('**/*',async r=>{const u=r.request().url();if(u.startsWith(origin+'/'))return r.continue();if(!u.includes('/rest/v1/rpc/'))return r.abort();const fn=u.split('/').pop();let data=[];
 if(fn==='community_whoami')data={username:'Tester'};if(fn==='rejchat_get_profiles')data=[{username:'Tester',avatar:'cat',color:'mint'}];
 if(fn==='rejchat_notifications_list')data={items:[{id:'11111111-1111-4111-8111-111111111111',kind:'comment',actor_name:'Ania',created_at:new Date().toISOString(),read_at:read?'2026-11-02T00:00:00Z':null}],unread:read?0:1};
 if(fn==='rejchat_notifications_read'){await new Promise(resolve=>setTimeout(resolve,200));read=true;data={marked:1};}
 if(fn==='community_list_posts')data={posts:[],total:0,available_tags:[]};
 if(fn==='rejchat_notification_post')data={id:'22222222-2222-4222-8222-222222222222',author_name:'Tester',content:'Właściwy wpis',created_at:new Date().toISOString(),media:[],tags:[],comments_count:0,likes_count:0};
 return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{});
 });const p=await ctx.newPage();await p.goto(origin+'/rejfile',{waitUntil:'domcontentloaded'});await p.locator('.rj-chat-bell').click();await p.locator('.rj-chat-alert-item').click();await p.waitForURL(/\/rejchat#powiadomienie=/);assert(read,'odczyt zapisany przed nawigacją');await p.locator('[data-post-id="22222222-2222-4222-8222-222222222222"]').waitFor();assert.match(await p.locator('#posts-feed').textContent(),/Właściwy wpis/);await ctx.close();
 console.log('PASS: dzwonek obok konta na 13 stronach, gość i zalogowany, oba motywy, 320–1440, fallback bez JS i przejście do wpisu');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

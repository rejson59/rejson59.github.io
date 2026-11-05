/* CHROME_BIN=/tmp/chromium node rejchat-notifications.browser.js — bez zrzutów */
const assert=require('node:assert/strict'), http=require('node:http'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
 let releaseChat,releaseA,chat=[],notesA=[{id:'11111111-1111-4111-8111-111111111111',kind:'comment',post_id:'22222222-2222-4222-8222-222222222222',actor_name:'Ania',created_at:'2026-11-02T10:00:00Z',read_at:null}],holdA=false,failed=false,requests=[];
 try {
  const ctx=await browser.newContext({viewport:{width:375,height:850}});
  await ctx.addInitScript(()=>localStorage.setItem('rejson_community_session_v1',JSON.stringify({token:'a'.repeat(32),username:'Tester'})));
  await ctx.route('**/*',async route=>{
   const u=route.request().url();if(u.startsWith(origin+'/'))return route.continue();if(!u.includes('/rest/v1/rpc/'))return route.abort();
   const fn=u.split('/').pop(),b=route.request().postDataJSON()||{};requests.push({fn,b});let d=[];
   if(fn==='community_whoami')d={username:b.p_token[0]==='a'?'Tester':'Other'};
   if(fn==='community_list_posts')d={posts:[],total:0,available_tags:[]};
   if(fn==='rejchat_room_list_v2') {if(!releaseChat){await new Promise(r=>releaseChat=r);d=[];}else d=chat.slice();}
   if(fn==='rejchat_room_send_v2'){d={id:'msg-new',author_name:'Tester',content:b.p_content,created_at:new Date().toISOString()};chat.push(d);}
   if(fn==='rejchat_notifications_list'){
    if(failed)return route.fulfill({status:503,contentType:'application/json',body:'{"message":"offline"}'});
    if(b.p_token[0]==='a'&&holdA)await new Promise(r=>releaseA=r);
    d=b.p_token[0]==='a'?{items:notesA,unread:notesA.filter(n=>!n.read_at).length}:{items:[],unread:0};
   }
   if(fn==='rejchat_notifications_read'){notesA=notesA.map(n=>(!b.p_ids||b.p_ids.includes(n.id))?{...n,read_at:new Date().toISOString()}:n);d={marked:1};}
   if(fn==='rejchat_notification_post')d=b.p_token[0]==='a'?{id:'22222222-2222-4222-8222-222222222222',author_name:'Tester',content:'Starszy wpis z powiadomienia',created_at:new Date().toISOString(),media:[],tags:[],comments_count:1,likes_count:0}:null;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(d)}).catch(()=>{});
  });
  const page=await ctx.newPage();await page.goto(origin+'/rejchat.html',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
  await page.waitForFunction(()=>document.querySelector('.rj-header-profile'));
  await page.waitForFunction(()=>document.querySelector('.rj-chat-bell-count')?.textContent==='1');
  assert.equal(await page.locator('.rj-chat-bell').isVisible(),true);
  for(const width of [320,375,760,1200,1201,1440]){await page.setViewportSize({width,height:850});const d=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,bell:document.querySelector('.rj-chat-bell').getBoundingClientRect().toJSON(),profile:document.querySelector('.rj-header-profile').getBoundingClientRect().toJSON()}));assert(d.scroll<=width,`${width}: overflow ${d.scroll}`);assert(d.bell.right<=width && d.bell.left>=0,`${width}: bell clipped`);assert(Math.abs(d.bell.right-d.profile.left)<30,`${width}: dzwonek nie jest obok konta`);}
  await page.setViewportSize({width:375,height:850});
  await page.locator('#chat-input').fill('Równoległa wiadomość');await page.locator('#chat-send').click();await page.locator('.chat-msg.is-mine').waitFor();
  assert.equal(typeof releaseChat,'function');releaseChat();await page.waitForTimeout(300);assert.equal(await page.locator('.chat-msg.is-mine .chat-text').textContent(),'Równoległa wiadomość');
  // Po odsunięciu od końca lista nie skacze; można wrócić przyciskiem.
  for(let i=0;i<30;i++)chat.push({id:'old-'+i,author_name:'Ania',content:'Starsza wiadomość '+i,created_at:new Date(Date.now()+i).toISOString()});
  await page.waitForFunction(()=>document.querySelectorAll('.chat-msg').length>=30,null,{timeout:8000});
  await page.locator('#chat-list').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
  chat.push({id:'after-scroll',author_name:'Ania',content:'Nowa na końcu',created_at:new Date(Date.now()+1000).toISOString()});
  // Mock dla dociągania zwraca te same wiersze, więc deduplikacja nadal jest wymagana.
  await page.locator('#chat-jump').waitFor({state:'visible',timeout:8000});
  assert.equal(await page.locator('#chat-list').evaluate(el=>el.scrollTop),0);
  await page.locator('#chat-jump').click();assert.equal(await page.locator('#chat-jump').isHidden(),true);
  await page.locator('.rj-chat-bell').click();assert.match(await page.locator('.rj-chat-alert-list').textContent(),/Ania.*skomentował/);
  await page.locator('.rj-chat-alert-item').click();await page.waitForURL(/#powiadomienie=/);await page.locator('#panel-posts').waitFor({state:'visible'});await page.locator('[data-post-id="22222222-2222-4222-8222-222222222222"]').waitFor();
  assert.match(await page.locator('#posts-feed').textContent(),/Starszy wpis z powiadomienia/);await page.waitForFunction(()=>document.querySelector('.rj-chat-bell-count').hidden);
  assert(requests.some(r=>r.fn==='rejchat_notifications_read'&&r.b.p_ids?.length===1));
  await page.locator('#posts-tab').click();await page.waitForFunction(()=>document.querySelector('#rejchat-target-note').hidden);
  holdA=true;await page.locator('.rj-chat-bell').click();await page.waitForFunction(()=>document.querySelector('.rj-chat-bell').getAttribute('aria-expanded')==='true');
  for(let i=0;i<20&&!releaseA;i++)await page.waitForTimeout(30);assert.equal(typeof releaseA,'function');
  await page.evaluate(()=>{localStorage.setItem('rejson_community_session_v1',JSON.stringify({token:'b'.repeat(32),username:'Other'}));window.dispatchEvent(new Event('rj:session-change'));});
  await page.waitForFunction(()=>document.querySelector('.rj-chat-alert-list').textContent.includes('Tu pojawią'));releaseA();await page.waitForTimeout(150);assert(!/Ania/.test(await page.locator('.rj-chat-alert-list').textContent()),'stara odpowiedź nie może wyciec po zmianie konta');
  failed=true;await page.locator('.rj-chat-alert-refresh').click();await page.waitForFunction(()=>document.querySelector('.rj-chat-alert-status').textContent.includes('Nie udało'));
  await page.keyboard.press('Escape');assert.equal(await page.locator('.rj-chat-alert-panel').isHidden(),true);
  await ctx.close();console.log('PASS: dzwonek obok konta, powiadomienia i wpis, izolacja sesji, błąd sieci, wyścig czatu i układ');
 }finally{if(releaseChat)releaseChat();if(releaseA)releaseA();await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

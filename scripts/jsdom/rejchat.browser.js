/* CHROME_BIN=/tmp/chromium node rejchat.browser.js — mock backendu, prawdziwy DOM. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../..');if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
const server=http.createServer((req,res)=>{
  let pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/')pathname='/index.html';
  let file=path.resolve(root,'.'+pathname);if(!path.extname(file)&&fs.existsSync(file+'.html'))file+='.html';
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
 const profiles={alice:{username:'Alice',avatar:'comet',color:'mint',bio:'Hej',is_bot:false},bob:{username:'Bob',avatar:'fox',color:'rose',bio:'Bob tu jest',is_bot:false}};
 const token='x'.repeat(48);let sendFail=false;
 let chat=[{id:'00000000-0000-4000-8000-000000000001',author_name:'Alice',content:'Bardzo lubię koty!',created_at:new Date().toISOString()},{id:'00000000-0000-4000-8000-000000000002',author_name:'Bob',content:'Cześć wszystkim',created_at:new Date().toISOString()}];
 try{
  const ctx=await browser.newContext();
  await ctx.addInitScript(t=>localStorage.setItem('rejson_community_session_v1',JSON.stringify({token:t,username:'Alice'})),token);
  await ctx.route('**/*',async route=>{
    const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();
    if(url.includes('/rest/v1/rpc/')){
      const fn=url.split('/').pop();let body=route.request().postDataJSON()||{},data=null,status=200;
      if(fn==='community_whoami')data={username:body.p_token===token?'Alice':null};
      else if(fn==='rejchat_get_profiles')data=(body.p_names||[]).map(n=>profiles[String(n).toLowerCase()]).filter(Boolean);
      else if(fn==='rejchat_update_profile'){if(body.p_token!==token){status=400;data={message:'Sesja wygasła'};}else{Object.assign(profiles.alice,{avatar:body.p_avatar,color:body.p_color,bio:body.p_bio});data=profiles.alice;}}
      else if(fn==='community_list_posts')data={posts:[{id:'00000000-0000-4000-8000-000000000010',author_name:'Bob',content:'Stary wpis',created_at:new Date().toISOString(),media:[],tags:[],comments_count:1,likes_count:0}],total:1,available_tags:[]};
      else if(fn==='community_list_comments')data=[{id:'00000000-0000-4000-8000-000000000020',author_name:'Alice',content:'Stary komentarz',created_at:new Date().toISOString()}];
      else if(fn==='community_online_users')data=[{username:'Alice',tabs:1,projects:[]}];
      else if(fn==='community_chat_list')data=body.p_after_id?[]:chat;
      else if(fn==='community_chat_send'){if(sendFail){status=400;data={message:'Spróbuj za chwilę'};}else{data={id:'00000000-0000-4000-8000-000000000003',author_name:'Alice',content:body.p_content,created_at:new Date().toISOString()};chat.push(data);}}
      else if(fn==='list_public_board')data=[];
      else if(fn==='community_link_submissions')data={username:'Alice',linked:0};
      else data=[];
      return route.fulfill({status,headers:{'Access-Control-Allow-Origin':'*','content-type':'application/json'},body:JSON.stringify(data)});
    }
    return route.abort();
  });
  const page=await ctx.newPage();await page.setViewportSize({width:1440,height:900});
  await page.goto(origin+'/spolecznosc.html#wpisy',{waitUntil:'domcontentloaded'});
  await page.waitForURL('**/rejchat#wpisy');
  await page.waitForFunction(()=>document.getElementById('posts-tab')?.getAttribute('aria-selected')==='true');
  await page.goto(origin+'/rejchat.html',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
  await page.locator('.rj-header-profile').waitFor();await page.locator('#chat-list .chat-msg').first().waitFor();
  assert.equal(await page.locator('#panel-chat').isVisible(),true);assert.equal(await page.locator('#panel-posts').isVisible(),false);
  await page.waitForFunction(()=>document.querySelector('.chat-author a')?.dataset.profileColor==='mint');
  assert.match(await page.locator('.chat-msg').first().locator('.comm-avatar img').getAttribute('src'),/comet\.svg$/);
  await page.locator('#chat-search').fill('koty');assert.equal(await page.locator('.chat-msg:visible').count(),1);
  await page.locator('#chat-search').fill('brak');assert.match(await page.locator('#chat-search-status').textContent(),/Pasuje 0 z 2/);
  await page.locator('#chat-search').fill('');
  sendFail=true;await page.locator('#chat-input').fill('Nie gub mnie');await page.locator('#chat-send').click();await page.waitForFunction(()=>document.getElementById('chat-send-status').textContent.includes('Spróbuj'));
  assert.equal(await page.locator('#chat-input').inputValue(),'Nie gub mnie');
  sendFail=false;await page.locator('#chat-send').click();await page.waitForFunction(()=>document.querySelectorAll('.chat-msg').length===3);
  assert.equal(await page.locator('#chat-input').inputValue(),'');
  await page.locator('#posts-tab').click();assert.equal(await page.locator('#panel-posts').isVisible(),true);assert.match(await page.locator('#posts-feed').innerText(),/Stary wpis/);
  await page.locator('[data-toggle-comments]').first().click();await page.waitForFunction(()=>document.querySelector('.comment-author a')?.textContent==='Alice');
  assert.match(await page.locator('.comment-content').textContent(),/Stary komentarz/);
  await page.locator('#posts-tab').press('ArrowLeft');assert.equal(await page.locator('#chat-tab').getAttribute('aria-selected'),'true');
  await page.evaluate(()=>{localStorage.removeItem('rejson_community_session_v1');window.dispatchEvent(new StorageEvent('storage',{key:'rejson_community_session_v1'}));});
  await page.waitForFunction(()=>document.getElementById('chat-form').hidden && !document.querySelector('.rj-header-profile'));
  assert.equal(await page.locator('#chat-note').isVisible(),true);assert.equal(await page.locator('#chat-list .chat-msg').count(),3);
  await page.evaluate(t=>{localStorage.setItem('rejson_community_session_v1',JSON.stringify({token:t,username:'Alice'}));window.dispatchEvent(new StorageEvent('storage',{key:'rejson_community_session_v1'}));},token);
  await page.locator('.rj-header-profile').waitFor();await page.waitForFunction(()=>!document.getElementById('chat-form').hidden);
  await page.screenshot({path:'/home/user/rejchat-desktop.png'});
  await page.goto(origin+'/profil.html');await page.locator('#profile-editor').waitFor();
  await page.locator('input[name=avatar][value=cat]').check();await page.locator('input[name=color][value=violet]').check();
  await page.locator('#profile-bio-input').fill('<img src=x onerror=alert(1)> cześć');await page.locator('#profile-save').click();
  await page.waitForFunction(()=>document.querySelector('#profile-result').textContent.includes('zapisany'));
  assert.equal(await page.locator('#profile-name').getAttribute('data-profile-color'),'violet');assert.equal(await page.locator('#profile-bio img').count(),0);
  assert.match(await page.locator('#profile-bio').textContent(),/<img/);assert.match(await page.locator('.rj-header-profile img').getAttribute('src'),/cat\.svg$/);
  await page.screenshot({path:'/home/user/rejchat-profile-desktop.png'});
  await page.reload();await page.locator('#profile-editor').waitFor();assert.equal(await page.locator('input[name=avatar]:checked').inputValue(),'cat');
  await page.goto(origin+'/profil.html?u=Bob');await page.locator('#profile-view').waitFor();assert.equal(await page.locator('#profile-editor').isVisible(),false);assert.equal(await page.locator('#profile-bio').textContent(),'Bob tu jest');
  // Geometria i dostępność profilowego na różnych szerokościach — bez zrzutów mobile.
  const pages=['/index.html','/rejchat.html','/logowanie.html','/profil.html','/partnerstwo.html','/rejfile.html','/tablica-pomyslow.html','/widzety.html','/admin.html','/rejson-widgets/index.html'];
  for(const width of [320,375,760,800,1024,1200,1440]){await page.setViewportSize({width,height:900});for(const url of pages){
    await page.goto(origin+url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());await page.locator('.rj-header-profile').waitFor({timeout:5000});
    const geometry=await page.evaluate(()=>{const el=document.querySelector('.rj-header-profile'),r=el.getBoundingClientRect();return {scroll:document.documentElement.scrollWidth,left:r.left,right:r.right,top:r.top,visible:!!el.getClientRects().length};});
    assert.ok(geometry.visible && geometry.left>=-1 && geometry.right<=width+1 && geometry.top>=0,`${url} ${width}: profilowy poza ekranem ${JSON.stringify(geometry)}`);
    assert.ok(geometry.scroll<=width,`${url} ${width}: poziomy overflow ${geometry.scroll}`);
  }}
  console.log('PASS: RejChat, wyszukiwanie, błędy wysyłania, zakładki, publiczne profile, zapis oraz nagłówki 320–1440 (mock backendu)');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

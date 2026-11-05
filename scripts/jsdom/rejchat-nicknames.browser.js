/* Test nickname w Chromium; API jest kontrolowanym mockiem. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../..');if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
try{let nickname='',calls=[];const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await ctx.addInitScript(()=>localStorage.setItem('rejson_community_session_v1',JSON.stringify({username:'Alicja',token:'a'.repeat(32)})));
 await ctx.route('**/*',async route=>{const u=route.request().url();if(u.startsWith(origin+'/'))return route.continue();if(!u.includes('/rest/v1/rpc/'))return route.abort();const fn=u.split('/').pop(),body=route.request().postDataJSON()||{};calls.push({fn,body});let d=[];
  if(fn==='community_whoami')d={username:'Alicja'};
  if(fn==='rejchat_get_profiles')d=(body.p_names||[]).map(name=>({username:name.toLowerCase()==='alicja'?'Alicja':name,avatar:'cat',color:'mint',bio:'',nickname}));
  if(fn==='rejchat_set_nickname'){nickname=body.p_nickname;d=true;}
  if(fn==='rejchat_notifications_list'||fn==='rejchat_reaction_inbox')d={items:[],unread:0};
  return route.fulfill({status:200,json:d});});
 const page=await ctx.newPage();await page.goto(origin+'/profil.html',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());await page.locator('#profile-editor').waitFor({state:'visible'});
 await page.locator('#nickname-input').fill('Kot <img>');await page.locator('#nickname-save').click();await page.getByText('Nick zapisany.').waitFor();assert.equal(await page.locator('#profile-name').textContent(),'Kot <img> (@Alicja)');assert.equal(await page.locator('#profile-name img').count(),0);assert(calls.some(c=>c.fn==='rejchat_set_nickname'&&c.body.p_token==='a'.repeat(32)));
 await page.goto(origin+'/rejchat.html',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
 await page.evaluate(async()=>{const root=document.createElement('div'),a=document.createElement('a');a.dataset.profileName='Alicja';root.appendChild(a);document.body.appendChild(root);await window.RJProfiles.hydrate(root);});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-profile-name="Alicja"]')).some(x=>x.textContent==='Kot <img> (@Alicja)'));
 assert.equal(await page.locator('[data-profile-name="Alicja"] img').count(),0);
 await page.goto(origin+'/admin.html',{waitUntil:'domcontentloaded'});await page.evaluate(()=>{document.querySelector('#rj-page-loader')?.remove();document.querySelector('#panel-dash').hidden=false;document.querySelector('#tab-community').hidden=false;window.__nickCalls=[];window.RejsonCloud.rpc=async(fn,args,auth)=>{window.__nickCalls.push({fn,args,auth});if(fn==='admin_rejchat_overview')return {phrases:[],blocks:[],messages:[]};return true;};window.confirm=()=>true;});
 await page.locator('#rcmod-panel > summary').click();await page.getByText('Dane aktualne.').waitFor();await page.locator('#rcmod-nick-user').fill('Bartek');await page.locator('#rcmod-nick-value').fill('Bartuś');await page.locator('#rcmod-nick-form button').click();
 await page.waitForFunction(()=>window.__nickCalls.some(c=>c.fn==='admin_rejchat_set_nickname'&&c.args.p_username==='Bartek'&&c.args.p_nickname==='Bartuś'&&c.auth===true));
 await ctx.close();console.log('PASS: nick właściciela, profil, bezpieczny tekst, panel admina (mock backend)');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

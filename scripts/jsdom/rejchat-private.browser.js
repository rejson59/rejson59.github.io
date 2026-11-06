/* Dwa konta i prawdziwe interakcje w Chromium; backend jest kontrolowanym mockiem. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../..'),tid='11111111-1111-4111-8111-111111111111',pub='22222222-2222-4222-8222-222222222222';
if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
const server=http.createServer((req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u==='/')u='/index.html';else if(!path.extname(u)&&fs.existsSync(path.join(root,u+'.html')))u+='.html';const f=path.resolve(root,'.'+u);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
let dm=[],react=[],publicRows=[{id:pub,author_name:'Alicja',content:'Wiadomość publiczna',created_at:new Date().toISOString()}],number=0,holdThread=false,releaseThread=null;
const newId=()=>String(++number).padStart(8,'0')+'-1111-4111-8111-111111111111';
function who(body){return body.p_token?.[0]==='a'?'Alicja':body.p_token?.[0]==='b'?'Bartek':null;}
async function mock(route){const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();if(!url.includes('/rest/v1/rpc/'))return route.abort();const fn=url.split('/').pop(),body=route.request().postDataJSON()||{},me=who(body);let d=[];
 if(fn==='community_whoami')d={username:me};
 if(fn==='rejchat_get_profiles')d=(body.p_names||[]).map(username=>({username,avatar:'cat',color:'mint'}));
 if(fn==='rejchat_room_list_v3')d=body.p_after_id?[]:publicRows;
 if(fn==='community_list_posts')d={posts:[],total:0,available_tags:[]};
 if(fn==='rejchat_notifications_list')d={items:[],unread:0};
 if(fn==='rejchat_dm_open') {if(!['Alicja','Bartek'].includes(body.p_username)||body.p_username===me)return route.fulfill({status:400,json:{message:'Nie znaleziono takiego konta.'}});d={id:tid,username:body.p_username};}
 if(fn==='rejchat_dm_send_v2'&&body.p_content==='Odrzucona prywatna treść')return route.fulfill({status:400,json:{message:'Ta treść została niedawno wysłana. Zmień ją lub spróbuj ponownie później.'}});
 if(fn==='rejchat_dm_send_v2'){const m={id:newId(),thread_id:tid,author_name:me,content:body.p_content,created_at:new Date().toISOString(),read_at:null};dm.push(m);d={id:m.id,created_at:m.created_at};}
 if(fn==='rejchat_dm_inbox'){const unread=dm.filter(m=>m.author_name!==me&&!m.read_at).length;d=dm.length?[{id:tid,username:me==='Alicja'?'Bartek':'Alicja',last_at:dm[dm.length-1].created_at,unread}]:[];}
 if(fn==='rejchat_dm_list_v2'){if(holdThread&&me==='Alicja')await new Promise(resolve=>{releaseThread=resolve;});d={username:me==='Alicja'?'Bartek':'Alicja',messages:dm.slice(-100).map(m=>({...m,mine:m.author_name===me,reactions:react.filter(r=>r.scope==='private'&&r.message_id===m.id).map(r=>({emoji:r.emoji,count:1,mine:r.actor===me}))}))};dm.forEach(m=>{if(m.author_name!==me)m.read_at=new Date().toISOString()});}
 if(fn==='rejchat_dm_history_v2')d=dm.slice(0,-100).map(m=>({...m,mine:m.author_name===me,reactions:[]}));
 if(fn==='rejchat_dm_read_all'){dm.forEach(m=>{if(m.author_name!==me)m.read_at=new Date().toISOString()});d={marked:1};}
 if(fn==='rejchat_react'){const idx=react.findIndex(r=>r.scope===body.p_scope&&r.message_id===body.p_message_id&&r.emoji===body.p_emoji&&r.actor===me);if(idx>=0){react.splice(idx,1);d={active:false};}else{const owner=body.p_scope==='public'?'Alicja':dm.find(m=>m.id===body.p_message_id)?.author_name;react.push({id:newId(),scope:body.p_scope,thread_id:body.p_scope==='private'?tid:null,message_id:body.p_message_id,emoji:body.p_emoji,actor:me,owner,created_at:new Date().toISOString(),read:false});d={active:true};}}
 if(fn==='rejchat_reactions_list')d=react.filter(r=>r.scope==='public'&&body.p_ids.includes(r.message_id)).map(r=>({message_id:r.message_id,emoji:r.emoji,count:1,mine:r.actor===me}));
 if(fn==='rejchat_reaction_inbox'){const items=react.filter(r=>r.owner===me&&r.actor!==me&&!r.read).map(r=>({...r,actor_name:r.actor}));d={items,unread:items.length};}
 if(fn==='rejchat_reaction_read'){react.forEach(r=>{if(r.owner===me&&(!body.p_ids||body.p_ids.includes(r.id)))r.read=true;});d={marked:1};}
 return route.fulfill({status:200,json:d}).catch(()=>{});
}
try{
 const contexts=[];for(const name of ['Alicja','Bartek']){const ctx=await browser.newContext({viewport:{width:375,height:850},serviceWorkers:'block'});contexts.push(ctx);await ctx.addInitScript(({name})=>localStorage.setItem('rejson_community_session_v1',JSON.stringify({username:name,token:(name==='Alicja'?'a':'b').repeat(32)})),{name});await ctx.route('**/*',mock);}
 const alice=await contexts[0].newPage(),bob=await contexts[1].newPage();
 for(const p of [alice,bob]){await p.goto(origin+'/rejchat',{waitUntil:'domcontentloaded'});await p.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());await p.locator('[data-chat-id="'+pub+'"] .rc-message-menu summary').waitFor();}
 // Reakcja na publiczną wiadomość pojawia się w dzwonku jej autora.
 await bob.locator('[data-chat-id="'+pub+'"] .rc-message-menu summary').click();await bob.locator('[data-chat-id="'+pub+'"] .rc-reaction-picker [data-reaction="👍"]').click();
 await alice.waitForFunction(()=>document.querySelector('.rj-chat-bell-count')?.textContent==='1',null,{timeout:12000});await alice.locator('.rj-chat-bell').click();assert.match(await alice.locator('.rj-chat-alert-list').innerText(),/Bartek.*zareagował/s);await alice.locator('[data-reaction-notification]').click();await alice.waitForURL(/#czat$/);
 // Rozmowa prywatna i powiadomienie widoczne na innej podstronie.
 await alice.locator('#channel-private').click();await alice.locator('#dm-username').fill('Bartek');await alice.locator('#dm-new-form button').click();await alice.locator('#dm-input').waitFor({state:'visible'});await alice.locator('#dm-input').fill('Odrzucona prywatna treść');await alice.locator('#dm-send').click();await alice.locator('#dm-status').getByText('Ta treść została niedawno wysłana.',{exact:false}).waitFor();await alice.waitForTimeout(3500);assert.match(await alice.locator('#dm-status').innerText(),/Ta treść została niedawno wysłana/,'odświeżenie rozmowy nie usuwa błędu wysyłki');assert.equal(await alice.locator('#dm-input').inputValue(),'Odrzucona prywatna treść');await alice.locator('#dm-input').fill('Cześć prywatnie <script>');await alice.locator('#dm-send').click();await alice.locator('#dm-messages').getByText('Cześć prywatnie <script>').waitFor();assert.equal(await alice.locator('#dm-messages script').count(),0);
 await bob.goto(origin+'/rejfile',{waitUntil:'domcontentloaded'});await bob.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());await bob.waitForFunction(()=>Number(document.querySelector('.rj-chat-bell-count')?.textContent)>0,null,{timeout:12000});await bob.locator('.rj-chat-bell').click();assert.match(await bob.locator('.rj-chat-alert-list').innerText(),/Alicja.*prywatne wiadomości/s);await bob.locator('[data-dm-notification]').click();await bob.waitForURL(/#rozmowa=/);await bob.locator('#dm-messages').getByText('Cześć prywatnie <script>').waitFor();
 await bob.locator('[data-dm-message] .rc-message-menu summary').first().click();await bob.locator('[data-report-scope=private]').first().click();assert.match(await bob.locator('.rj-safety-explain').innerText(),/tylko tej jednej wybranej wiadomości prywatnej/);await bob.locator('.rj-safety-dialog [data-cancel]').click();
 await bob.locator('#dm-input').fill('Odpowiadam!');await bob.locator('#dm-send').click();await alice.locator('#dm-messages').getByText('Odpowiadam!').waitFor({timeout:10000});
 await alice.locator('[data-dm-message] .rc-message-menu summary').last().click();await alice.locator('[data-dm-message] .rc-reaction-picker [data-dm-reaction="❤️"]').last().click();await alice.locator('[data-dm-message] .rc-reaction-summary [data-dm-reaction="❤️"][aria-pressed="true"]').waitFor({timeout:10000});
 await bob.waitForFunction(()=>Number(document.querySelector('.rj-chat-bell-count')?.textContent)>0,null,{timeout:12000});await bob.locator('.rj-chat-bell').click();assert.match(await bob.locator('.rj-chat-alert-list').innerText(),/Alicja.*zareagował/s);
 for(const width of [320,375,760,1440]){await alice.setViewportSize({width,height:850});assert(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': brak przepełnienia');}
 // Stronicowanie: ostatnie 100, potem starsze; nie przerywa bieżącej rozmowy.
 for(let i=0;i<105;i++)dm.push({id:newId(),thread_id:tid,author_name:'Alicja',content:'starsza próba '+i,created_at:new Date(Date.now()+i).toISOString(),read_at:null});
 await alice.locator('#dm-older').waitFor({state:'visible',timeout:10000});await alice.locator('#dm-older').click();await alice.locator('#dm-messages').getByText('Cześć prywatnie <script>').waitFor();
 // Zmiana konta podczas opóźnionej odpowiedzi nie przywraca rozmowy.
 holdThread=true;await alice.waitForTimeout(3500);assert(releaseThread,'rozpoczęto opóźniony odczyt');
 await alice.evaluate(()=>{localStorage.removeItem('rejson_community_session_v1');window.dispatchEvent(new Event('rj:session-change'));});await alice.locator('#dm-guest').waitFor({state:'visible'});releaseThread();await alice.waitForTimeout(200);assert.equal(await alice.locator('#dm-messages').innerText(),'');
 for(const c of contexts)await c.close();console.log('PASS: reakcje, prywatne rozmowy, powiadomienia, dwa konta, XSS i układ (mock backend)');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

/* Chromium, bez analizy zrzutów ekranu. CHROME_BIN=/ścieżka/chromium node rejchat-app.browser.js */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname, '../..');
if (!process.env.CHROME_BIN) throw new Error('Set CHROME_BIN');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'content-type':type});res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
  const origin=`http://127.0.0.1:${server.address().port}`;
  let oldResponse; let loginName=''; let chatRows=[], linkRows=[];
  try {
    const context=await browser.newContext({viewport:{width:375,height:850}});
    await context.route('**/*',async route=>{
      const url=route.request().url();
      if(url.startsWith(origin+'/'))return route.continue();
      if(!url.includes('/rest/v1/rpc/'))return route.abort();
      const fn=url.split('/').pop(),body=route.request().postDataJSON()||{};
      let data=[];
      if(fn==='rejchat_room_send_v2' && body.p_content==='Odrzucona treść testowa') return route.fulfill({status:400,json:{message:'Wysyłasz zbyt szybko. Odczekaj chwilę i spróbuj ponownie.'}});
      if(fn==='community_username_status') {
        if(body.p_username==='OldName') await new Promise(r=>{oldResponse=r;});
        data={valid:true,taken:body.p_username==='Tester'};
      } else if(fn==='community_login'||fn==='community_register') {
        loginName=body.p_username; data={username:body.p_username,token:'0123456789abcdef0123456789abcdef'};
      } else if(fn==='community_whoami') data={username:'Tester'};
      else if(fn==='rejchat_room_send_v2' && body.p_room==='general') {data={id:1,author_name:'Tester',content:body.p_content,created_at:new Date().toISOString()}; chatRows.push(data);}
      else if(fn==='rejchat_room_list_v3' && body.p_room==='general') data=body.p_after_id ? chatRows.filter(r=>r.id>body.p_after_id) : chatRows;
      else if(fn==='rejchat_room_list_v3' && body.p_room==='links') data=body.p_after_id ? [] : linkRows;
      else if(fn==='rejchat_room_send_v2' && body.p_room==='links') {
        if(!/https?:\/\//.test(body.p_content)) return route.fulfill({status:400,json:{message:'Dodaj do wiadomości link.'}});
        data={id:2,author_name:'Tester',content:body.p_content,created_at:new Date().toISOString()}; linkRows.push(data);
      }
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{});
    });
    const page=await context.newPage();
    await page.goto(origin+'/rejchat.html',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
    assert.equal(await page.locator('#panel-chat').isVisible(),true);
    assert.equal(await page.locator('#chat-form').isVisible(),false);
    assert.equal(await page.locator('#chat-join').isVisible(),true);
    await page.locator('#chat-join').click();
    assert.equal(await page.locator('#chat-auth-dialog').evaluate(el=>el.open),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#chat-auth-dialog').evaluate(el=>el.open),false);
    await page.locator('#chat-join').click();
    await page.locator('#auth-pin').fill('1234');
    await page.locator('#auth-username').fill('OldName');
    await page.waitForFunction(()=>false,{},{timeout:500}).catch(()=>{});
    assert.equal(typeof oldResponse,'function');
    await page.locator('#auth-username').fill('Tester');
    await page.waitForFunction(()=>document.querySelector('#auth-submit').textContent.includes('Zaloguj tą nazwą'));
    oldResponse();
    await page.waitForTimeout(100);
    assert.match(await page.locator('#auth-submit').textContent(),/Zaloguj tą nazwą/);
    await page.locator('#auth-submit').click();
    await page.locator('#chat-form').waitFor({state:'visible'});
    assert.equal(loginName,'Tester');
    assert.equal(await page.locator('#chat-auth-dialog').evaluate(el=>el.open),false);
    assert.equal(await page.locator('#auth-pin').inputValue(),'');
    assert.equal(await page.locator('#chat-input').evaluate(el=>document.activeElement===el),true);
    await page.locator('#chat-input').fill('Odrzucona treść testowa');
    await page.locator('#chat-send').click();
    await page.locator('#chat-send-status').getByText('Wysyłasz zbyt szybko.', {exact:false}).waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(),'Odrzucona treść testowa');
    await page.locator('#chat-input').fill('Cześć!');
    await page.locator('#chat-send').click();
    await page.locator('.chat-msg.is-mine').waitFor({state:'visible'});
    assert.equal(await page.locator('.chat-msg.is-mine .chat-text').textContent(),'Cześć!');
    assert.equal(await page.locator('#chat-input').inputValue(),'');
    await page.locator('#chat-input').fill('szkic ogólny');
    await page.locator('#channel-links').click();
    await page.waitForFunction(()=>document.querySelector('#chat-room-title').textContent==='Linki');
    assert.equal(await page.locator('#chat-input').inputValue(),'');
    assert.equal(await page.locator('#channel-links').getAttribute('aria-pressed'),'true');
    await page.locator('#chat-input').fill('bez linku'); await page.locator('#chat-send').click();
    await page.locator('#chat-send-status').getByText('Dodaj do wiadomości link.').waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(),'bez linku');
    await page.locator('#chat-input').fill('https://example.org/hello');await page.locator('#chat-send').click();
    await page.locator('#chat-list .chat-text').getByText('https://example.org/hello').waitFor();
    assert.equal(await page.locator('#chat-list').getByText('Cześć!').count(),0);
    await page.locator('#channel-general').click();
    await page.locator('#chat-list .chat-text').getByText('Cześć!').waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(),'szkic ogólny');
    assert.equal(await page.locator('#chat-list').getByText('https://example.org/hello').count(),0);
    await page.locator('.rc-chat-guide summary').click();
    assert.equal(await page.locator('.rc-chat-guide').getByText('Odczyty i reakcje', {exact:false}).isVisible(),true);
    await page.locator('.rc-chat-guide summary').click();
    assert.equal(await page.locator('.rc-chat-guide').getByText('Odczyty i reakcje', {exact:false}).isVisible(),false);
    await page.locator('#posts-tab').click();
    assert.equal(await page.locator('#panel-posts').isVisible(),true);
    assert.equal(await page.locator('#channel-general').getAttribute('aria-pressed'),'false');
    await page.locator('#channel-general').click();
    assert.equal(await page.locator('#panel-chat').isVisible(),true);
    assert.equal(await page.locator('#channel-general').getAttribute('aria-pressed'),'true');
    await page.locator('#chat-photo').setInputFiles({name:'bardzo-dluga-nazwa-zdjecia-testowego.png',mimeType:'image/png',buffer:Buffer.from('test')});
    for(const theme of ['dark','light']) for(const width of [320,375,760,800,1024,1200,1201,1366,1400,1401,1440,1920]) {
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.setViewportSize({width,height:850});
      const result=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth, chat:document.querySelector('.comm-chat').getBoundingClientRect().width, columns:getComputedStyle(document.querySelector('.comm-layout')).gridTemplateColumns.split(' ').length}));
      assert(result.scroll<=width,`${width}: poziome przewijanie ${result.scroll}`);
      assert(result.chat>0);
      const nav=await page.evaluate(()=>Array.from(document.querySelectorAll('.chat-channel')).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height}}));
      assert(nav.every(r=>r.x>=0&&r.right<=width&&r.width>=35&&r.height>=35),`${width}: widoczna i użyteczna nawigacja`);
      assert.equal(result.columns,width<=760?1:2,`${width}: kolumny`);
      if(theme==='light') {
        const colors=await page.evaluate(()=>{const active=document.querySelector('#channel-general');return [getComputedStyle(active).backgroundColor,getComputedStyle(active.querySelector('strong')).color];});
        const luminance=c=>{const [r,g,b]=c.match(/\d+/g).slice(0,3).map(v=>{v=Number(v)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
        const values=colors.map(luminance).sort((a,b)=>b-a);assert((values[0]+.05)/(values[1]+.05)>=4.5,`${width}: kontrast aktywnego kanału w jasnym motywie`);
      }
      const controls=await page.evaluate(()=>Array.from(document.querySelectorAll('#chat-form .rc-compose-tools > *')).filter(e=>getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}}));
      assert(controls.every(r=>r.left>=0 && r.right<=width && r.width>0),`${theme} ${width}: narzędzia pisania mieszczą się w widoku`);
      assert(await page.locator('#chat-photo-name').isVisible(),'nazwa wybranego zdjęcia jest widoczna');
      await page.locator('#chat-form .rc-emoji-toggle').click();
      const emoji=await page.locator('#chat-emojis').boundingBox();
      assert(emoji && emoji.x>=0 && emoji.x+emoji.width<=width,`${theme} ${width}: panel emoji w widoku`);
      await page.locator('#chat-form .rc-emoji-toggle').click();
    }
    await page.locator('#chat-photo-clear').click();
    assert.equal(await page.locator('#chat-photo').inputValue(),'');
    await page.setViewportSize({width:1440,height:900});
    const columns=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();const left=r('.comm-sidebar'),middle=r('.comm-primary'),info=r('.rejchat-info');return {left:left.right,middleLeft:middle.left,navBottom:left.bottom,infoTop:info.top,infoRight:info.right};});
    assert(columns.left<=columns.middleLeft && columns.navBottom<=columns.infoTop && columns.infoRight<=columns.middleLeft,'nawigacja i informacje pod sobą obok szerokiego czatu');
    await page.locator('#rejchat-rules summary').click();assert.equal(await page.locator('#rejchat-rules').evaluate(el=>el.open),true);
    await context.close();
    const fresh=await browser.newContext({viewport:{width:375,height:850}});
    let registration=null;
    await fresh.route('**/*',async route=>{
      const url=route.request().url();
      if(url.startsWith(origin+'/')) return route.continue();
      if(!url.includes('/rest/v1/rpc/')) return route.abort();
      const fn=url.split('/').pop(),body=route.request().postDataJSON()||{};
      let data=[];
      if(fn==='rejchat_room_send_v2' && body.p_content==='Odrzucona treść testowa') return route.fulfill({status:400,json:{message:'Wysyłasz zbyt szybko. Odczekaj chwilę i spróbuj ponownie.'}});
      if(fn==='community_username_status') data={valid:true,taken:false};
      if(fn==='community_register') {registration=body;data={username:body.p_username,token:'abcdef0123456789abcdef0123456789'};}
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{});
    });
    const np=await fresh.newPage(); await np.goto(origin+'/rejchat.html#linki',{waitUntil:'domcontentloaded'});
    await np.waitForFunction(()=>document.querySelector('#chat-room-title').textContent==='Linki');assert.equal(await np.locator('#channel-links').getAttribute('aria-pressed'),'true');
    await np.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
    await np.locator('#chat-join').click();
    await np.locator('#auth-username').fill('NowyUzytkownik');
    await np.waitForFunction(()=>document.querySelector('#name-status').textContent.includes('nazwa wolna'));
    await np.locator('#auth-pin').fill('1234');
    assert.equal(await np.locator('#auth-submit').isDisabled(),true,'nowe konto nie dopuszcza krótkiego PIN-u');
    await np.locator('#auth-pin').fill('Dobre hasło jest długie');
    await np.locator('#auth-submit').click();
    await np.locator('#chat-form').waitFor({state:'visible'});
    assert.deepEqual(registration,{p_username:'NowyUzytkownik',p_pin:'Dobre hasło jest długie'});
    await fresh.close();
    console.log('PASS: logowanie i rejestracja hasłem w czacie, Escape, sesja, zakładki i układ');
  } finally {if(oldResponse)oldResponse();await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

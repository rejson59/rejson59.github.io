// Desktop Chromium: prawdziwa nawigacja w tej karcie, mock backendu (bez publikacji).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://local');if(u.pathname==='/fake-upload'){req.resume();return res.writeHead(200).end();}
 let pathname=u.pathname==='/'?'/index.html':u.pathname;
 let f=path.resolve(root,'.'+pathname);if(!path.extname(f))f+='.html';
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(f)]||'application/octet-stream';res.writeHead(200,{'content-type':type});fs.createReadStream(f).pipe(res);
});
(async()=>{
 if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();let sent=[];
 await context.route('**/*',async route=>{
  const u=route.request().url();if(u.startsWith(origin+'/'))return route.continue();
  if(u.includes('/storage/v1/object/'))return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'PUT, OPTIONS','access-control-allow-headers':'*'},body:'{}'});
  const post=route.request().postDataJSON()||{};
  if(u.includes('/functions/v1/rejfile')){
   let data={};if(post.action==='create')data={id:'a47ac10b-58cc-4372-a567-0e02b2c3d479',chunkSize:10485760,urls:['https://hzbqzfimtroixnldzjeq.supabase.co/storage/v1/object/upload/sign/test?token=mock']};
   if(post.action==='finish')data={id:'a47ac10b-58cc-4372-a567-0e02b2c3d479',expires_at:new Date(Date.now()+86400000).toISOString()};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }
  if(u.includes('/rest/v1/rpc/')){
   const fn=u.split('/').pop();let data=[];
   if(fn==='community_username_status')data={valid:true,taken:true};
   if(fn==='community_login')data={username:'Tester',token:'0123456789abcdef0123456789abcdef'};
   if(fn==='community_whoami')data={username:'Tester'};
   if(fn==='community_chat_send'){sent.push(post);data={id:5,author_name:'Tester',content:post.p_content,created_at:new Date().toISOString()};}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }return route.abort();
 });
 // Sprawdzamy, że mapa ma załadowane style w obu motywach. Tylko zrzut desktop.
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
 assert.match(await page.locator('.backdrop').evaluate(el=>getComputedStyle(el,'::before').backgroundImage),/universe-network\.svg/);
 assert.match(await page.locator('.backdrop').evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);
 await page.screenshot({path:'/tmp/rejson-home-desktop.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
 assert.equal(await page.locator('.backdrop').evaluate(el=>getComputedStyle(el,'::before').opacity),'0.72');
 await page.goto(origin+'/rejfile',{waitUntil:'domcontentloaded'});
 await page.locator('#file-input').setInputFiles({name:'tekst.txt',mimeType:'text/plain',buffer:Buffer.from('test')});
 await page.locator('#upload-form button[type=submit]').click();await page.locator('#success').waitFor({state:'visible'});
 const link=await page.locator('#share-link').inputValue();assert.match(link,/\/rejfile#f=/);assert.equal(sent.length,0);
 await page.locator('#share-chat').click();await page.waitForURL(origin+'/rejchat');await page.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
 assert(!page.url().includes('#f='));assert.equal(await page.locator('#file-draft').isVisible(),true);assert.equal(sent.length,0);
 await page.locator('#file-draft-add').click();assert.match(await page.locator('#file-draft-status').textContent(),/Zaloguj/);
 await page.locator('#chat-join').click();await page.locator('#auth-username').fill('Tester');await page.waitForFunction(()=>document.querySelector('#auth-submit').textContent.includes('Zaloguj tą nazwą'));
 await page.locator('#auth-pin').fill('1234');await page.locator('#auth-submit').click();await page.locator('#chat-form').waitFor({state:'visible'});
 await page.locator('#chat-input').fill('Dla wszystkich:');await page.locator('#file-draft-add').click();assert.equal(await page.locator('#chat-input').inputValue(),'Dla wszystkich: Plik z RejFile: '+link);
 assert.equal(sent.length,0);assert.equal(await page.locator('#chat-send').isEnabled(),true);await page.locator('#chat-send').click();
 await page.waitForFunction(()=>document.querySelector('.chat-msg .comm-link'));assert.equal(sent.length,1);assert.equal(sent[0].p_content,'Dla wszystkich: Plik z RejFile: '+link);
 assert.equal(await page.locator('.chat-msg .comm-link').getAttribute('href'),link);
 console.log('PASS: desktop, tło w dwóch motywach, rzeczywista nawigacja i logowanie z RejFile do RejChat (mock backendu)');await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

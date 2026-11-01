/* Chromium: sformatowana notatka, bezpieczny podgląd, link i konto; mock API. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../..'),id='a47ac10b-58cc-4372-a567-0e02b2c3d479',base='https://hzbqzfimtroixnldzjeq.supabase.co';
const server=http.createServer((req,res)=>{let p=new URL(req.url,'http://local').pathname;if(!path.extname(p))p+='.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);});
(async()=>{
 if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
 let uploaded=Buffer.alloc(0), created, tracker=0;
 const cors={'access-control-allow-origin':'*','access-control-allow-methods':'POST, PUT, GET, OPTIONS','access-control-allow-headers':'*'};
 try {
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',async route=>{
   const request=route.request(),url=request.url();if(url.startsWith(origin+'/'))return route.continue();
   if(url.includes('tracker.invalid')){tracker++;return route.abort();}
   if(request.method()==='OPTIONS')return route.fulfill({status:200,headers:cors,body:''});
   if(url.includes('/storage/v1/object/')){if(request.method()==='PUT'){uploaded=request.postDataBuffer();return route.fulfill({status:200,headers:cors,body:'{}'});}return route.fulfill({status:200,headers:cors,body:uploaded});}
   if(url.includes('/functions/v1/rejfile')){
    const post=request.postDataJSON();let data={};
    if(post.action==='create'){created=post;data={id,chunkSize:10485760,urls:[base+'/storage/v1/object/upload/sign/test?token=mock']};}
    if(post.action==='finish')data={id,expires_at:'2030-01-01T00:00:00Z'};
    if(post.action==='info')data={id,name:'Notatka.rjnote',size:uploaded.length,chunks:1,expires_at:'2030-01-01T00:00:00Z'};
    if(post.action==='chunk')data={url:base+'/storage/v1/object/sign/test?token=mock'};
    return route.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify(data)});
   }
   if(url.includes('/rest/v1/rpc/community_whoami'))return route.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({username:'Tester'})});
   return route.fulfill({status:200,headers:cors,contentType:'application/json',body:'[]'});
  });
  const page=await context.newPage();await page.goto(origin+'/rejfile');
  await page.locator('[data-share-kind=note]').click();await page.locator('#note-title').fill('Ważna notatka');await page.locator('#note-content').fill('Do pogrubienia');
  await page.locator('#note-content').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(range);});
  await page.locator('[data-note-command=bold]').click();assert.equal(await page.locator('#note-content b, #note-content strong').count(),1);
  await page.locator('#note-content').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(range);});
  await page.locator('#note-heading').selectOption('h2');assert.equal(await page.locator('#note-content h2').count(),1);
  await page.locator('#note-content').evaluate(el=>{el.replaceChildren();el.focus();});
  const pasted='<h2 style="color: rgb(255, 0, 0)">Nagłówek</h2><p><strong>Grubo</strong> i <em>kursywa</em> <a href="https://example.com/">odnośnik</a></p><ul><li>Pierwszy</li><li>Drugi</li></ul><img src="https://tracker.invalid/a" onerror="window.pwned=1"><script>window.pwned=2</script><a href="javascript:alert(1)" onclick="window.pwned=3">zły link</a><span style="background-image:url(https://tracker.invalid/b);color:blue">kolor</span>';
  await page.locator('#note-content').evaluate((el,html)=>{const d=new DataTransfer();d.setData('text/html',html);d.setData('text/plain','Nagłówek');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));},pasted);
  assert.equal(await page.locator('#note-content h2').count(),1);assert.equal(await page.locator('#note-content strong').textContent(),'Grubo');assert.equal(await page.locator('#note-content li').count(),2);assert.equal(await page.locator('#note-content img, #note-content script, #note-content [onclick]').count(),0);
  assert.equal(await page.locator('#note-content a').last().getAttribute('href'),null);assert.equal(tracker,0);
  await page.locator('#send').click();await page.locator('#success').waitFor({state:'visible'});
  assert.equal(created.name,'Ważna notatka.rjnote');assert.equal(created.recipient,null);assert.equal(created.share.length,64);assert.notEqual(created.share,created.owner);
  const saved=JSON.parse(uploaded.toString());assert.equal(saved.kind,'rejfile-note');assert.match(saved.html,/<strong>Grubo<\/strong>/);assert.match(saved.html,/color: rgb\(255, 0, 0\)/);assert(!saved.html.includes('javascript:'));assert(!saved.html.includes('tracker.invalid'));
  const link=await page.locator('#share-link').inputValue();assert.match(link,/\/rejfile#f=/);
  const reader=await context.newPage();await reader.goto(link);await reader.locator('#note-preview').waitFor({state:'visible'});assert.equal(await reader.locator('#download-title').textContent(),'Ważna notatka');assert.equal(await reader.locator('#note-preview strong').textContent(),'Grubo');assert.equal(await reader.locator('#note-preview li').count(),2);assert.equal(await reader.locator('#note-preview a').first().getAttribute('rel'),'noopener noreferrer');assert.equal(await reader.locator('#download').isVisible(),true);
  await reader.evaluate(()=>{window.copied=[];Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{for(const item of items){window.copied.push({html:await (await item.getType('text/html')).text(),text:await (await item.getType('text/plain')).text()});}}},configurable:true});});
  await reader.locator('#copy-note').click();await reader.waitForFunction(()=>document.querySelector('#copy-note-status').textContent);assert.match(await reader.locator('#copy-note-status').textContent(),/z formatowaniem/);const copied=await reader.evaluate(()=>window.copied[0]);assert.match(copied.html,/<strong>Grubo<\/strong>/);assert.match(copied.text,/Nagłówek/);
  // Plik z magazynu jest filtrowany ponownie, nie tylko przy tworzeniu.
  uploaded=Buffer.from(JSON.stringify({kind:'rejfile-note',version:1,title:'<img onerror=alert(1)>',html:pasted}));await reader.reload();await reader.locator('#note-preview').waitFor({state:'visible'});assert.equal(await reader.locator('#note-preview img, #note-preview script, #note-preview [onclick]').count(),0);assert.equal(await reader.evaluate(()=>window.pwned),undefined);assert.equal(tracker,0);assert.equal(await reader.locator('#download-title').textContent(),'<img onerror=alert(1)>');
  uploaded=Buffer.from('not a note');await reader.reload();await reader.locator('#download-error').waitFor({state:'visible'});assert.equal(await reader.locator('#download').isVisible(),true);assert.equal(await reader.locator('#note-preview').isVisible(),false);
  // Szkic notatki przechodzi do publicznego czatu bez automatycznego wysyłania.
  await page.evaluate(()=>localStorage.setItem('rejson_community_session_v1',JSON.stringify({username:'Tester',token:'x'.repeat(32)})));
  await page.locator('#share-chat').click();await page.waitForURL(origin+'/rejchat');await page.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('rejfile_chat_draft_v1')).kind),'note');
  await page.locator('#chat-form').waitFor({state:'visible'});await page.locator('#file-draft-add').click();assert.equal(await page.locator('#chat-input').inputValue(),'Notatka z RejFile: '+link);
  await page.goto(origin+'/rejfile');await page.locator('[data-share-kind=note]').click();await page.locator('#send').click();assert.match(await page.locator('#error').textContent(),/treść notatki/);
  await page.evaluate(()=>{document.querySelector('#note-content').textContent='x'.repeat(1024*1024+1)});await page.locator('#send').click();assert.match(await page.locator('#error').textContent(),/za duża/);
  await page.evaluate(()=>{document.querySelector('#note-content').textContent='Dla konta';localStorage.setItem('rejson_community_session_v1',JSON.stringify({token:'x'.repeat(32)}));window.dispatchEvent(new StorageEvent('storage',{key:'rejson_community_session_v1'}));});
  await page.waitForFunction(()=>document.querySelector('#account-link .nav-label').textContent==='Tester');await page.locator('input[name=mode][value=account]').check();await page.locator('#recipient').fill('Odbiorca');await page.locator('#send').click();await page.locator('#success').waitFor({state:'visible'});assert.equal(created.recipient,'Odbiorca');assert.equal(created.share,null);assert.equal(await page.locator('#link-wrap').isVisible(),false);
  for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);for(const width of [320,760,1280]){await page.setViewportSize({width,height:900});assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width);}}
  console.log('PASS: notatka formatowana, link, konto, limity, nieufny HTML i odbiór (Chromium; mock API)');await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

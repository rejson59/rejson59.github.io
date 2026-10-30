const assert = require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {webcrypto}=require('node:crypto'); const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ID='a47ac10b-58cc-4372-a567-0e02b2c3d479', OWN='a'.repeat(64), SHARE='b'.repeat(64), BASE='https://hzbqzfimtroixnldzjeq.supabase.co';
(async()=>{
 let handler; const calls=[];
 const mockFetch=async(url,init={})=>{calls.push({url,init});const target=new URL(url);const name=target.pathname.split('/').pop();
  if(target.pathname.includes('/rest/v1/rpc/')){
   let response={};if(name==='rejfile_create')response={id:ID,chunks:10};if(name==='rejfile_access'||name==='rejfile_sign_chunk')response={id:ID,name:'a.txt',size:104857600,chunks:10,expires_at:'2030-01-01'};if(name==='rejfile_cleanup_list')response=[];
   return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(target.pathname.includes('/object/upload/sign/'))return new Response(JSON.stringify({url:'/object/upload/sign/rejfile/'+ID+'/'+name+'?token=abc'}),{status:200});
  if(target.pathname.includes('/object/sign/'))return new Response(JSON.stringify({signedURL:'/object/sign/rejfile/'+ID+'/'+name+'?token=abc'}),{status:200});
  throw new Error('unexpected '+url);
 };
 const ctx={Deno:{env:{get:k=>k==='SUPABASE_URL'?BASE:'TEST_SERVICE_KEY'},serve:fn=>handler=fn},URL,Request,Response,TextEncoder,crypto:webcrypto,fetch:mockFetch,console};vm.runInNewContext(read('supabase/functions/rejfile/index.js'),ctx);
 async function edge(body,origin='https://rejson59.github.io'){return handler(new Request('https://edge.test',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)}));}
 let r=await edge({action:'create',name:'a.txt',size:104857600,owner:OWN,share:SHARE});assert.equal(r.status,200);let data=await r.json();assert.equal(data.urls.length,10);assert.ok(data.urls.every(x=>new URL(x).origin===BASE));assert.equal(r.headers.get('access-control-allow-origin'),'https://rejson59.github.io');assert.ok(!JSON.stringify(data).includes('TEST_SERVICE_KEY'));
 r=await edge({action:'create',name:'x',size:104857601,owner:OWN,share:SHARE});assert.equal(r.status,400);
 r=await edge({action:'chunk',id:ID,index:10,share:SHARE});assert.equal(r.status,400);
 r=await edge({action:'chunk',id:ID,index:0,share:SHARE});assert.equal(r.status,200);assert.ok((await r.json()).url.includes('token=abc'));assert.ok(calls.some(x=>x.url.endsWith('/rpc/rejfile_sign_chunk')));
 r=await edge({action:'inbox'},'https://evil.example');assert.equal(r.headers.get('access-control-allow-origin'),'null');assert.equal(r.status,400);
 assert.ok(read('supabase/2026-10-30_rejfile.sql').includes('alter table public.rejfile_transfers enable row level security'));
 assert.match(read('supabase/2026-10-30_rejfile.sql'),/interval '3 days'/);
 assert.match(read('supabase/2026-10-30_rejfile.sql'),/file_size_limit/);
 const html=read('rejfile.html');const dom=new JSDOM(html,{url:'https://rejson59.github.io/rejfile',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 let uploadParts=[], callsUI=[], downloads=[];const f=new w.File([new Uint8Array(10485765)],'film.bin',{type:'application/octet-stream'});
 w.XMLHttpRequest=class {constructor(){this.upload={};} open(method,url){this.url=url;} setRequestHeader(){} send(blob){uploadParts.push(blob);this.status=200;setTimeout(()=>this.onload(),0);}};
 w.fetch=async(url,init={})=>{callsUI.push({url,init});if(String(url).includes('/functions/v1/rejfile')){const b=JSON.parse(init.body);let value={};
   if(b.action==='create') value={id:ID,chunkSize:10485760,urls:[BASE+'/storage/v1/object/upload/sign/rejfile/'+ID+'/0?token=1',BASE+'/storage/v1/object/upload/sign/rejfile/'+ID+'/1?token=2']};
   if(b.action==='finish')value={id:ID,expires_at:'2030-01-01T00:00:00Z'};
   if(b.action==='info')value={id:ID,name:'film.bin',size:f.size,chunks:2,expires_at:'2030-01-01T00:00:00Z'};
   if(b.action==='chunk')value={url:BASE+'/storage/v1/object/sign/rejfile/'+ID+'/'+b.index+'?token=abc'};
   if(b.action==='revoke')value={ok:true}; return {ok:true,json:async()=>value};}
   if(String(url).includes('/storage/v1/object/sign/')){const index=Number(new URL(url).pathname.split('/').pop());return {ok:true,blob:async()=>uploadParts[index]};}throw new Error('unexpected '+url);
 };
 w.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,download:this.download});};
 w.eval(read('js/rejfile.js'));
 Object.defineProperty(w.document.getElementById('file-input'),'files',{value:[f],configurable:true});w.document.getElementById('file-input').dispatchEvent(new w.Event('change'));
 w.document.getElementById('upload-form').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 async function wait(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('timeout');}
 await wait(()=>!w.document.getElementById('success').hidden);
 assert.deepEqual(uploadParts.map(x=>x.size),[10485760,5]);assert.equal(uploadParts[0].type,'application/octet-stream');
 const link=w.document.getElementById('share-link').value;assert.match(link,/^https:\/\/rejson59\.github\.io\/rejfile#f=/);assert.ok(!new URL(link).search);assert.ok(!link.includes('TEST_SERVICE_KEY'));
 const created=JSON.parse(callsUI.find(x=>x.url.includes('/functions/')&&JSON.parse(x.init.body).action==='create').init.body);assert.equal(created.size,10485765);assert.equal(created.name,'film.bin');assert.equal(created.share.length,64);assert.notEqual(created.share,created.owner);
 w.document.querySelector('#sent-list .file-actions button:nth-child(2)').click();await wait(()=>!w.document.getElementById('download').hidden);w.document.getElementById('download').click();await wait(()=>downloads.length>0);assert.equal(downloads[0].download,'film.bin');assert.equal(callsUI.filter(x=>x.url.includes('/functions/')&&JSON.parse(x.init.body).action==='chunk').length,2);
 dom.window.close();console.log('PASS: RejFile limit 100 MB i upload w częściach, limity, linki, pobieranie i API');
})().catch(e=>{console.error(e);process.exitCode=1;});

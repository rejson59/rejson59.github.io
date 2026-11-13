const assert = require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {webcrypto}=require('node:crypto'); const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ID='a47ac10b-58cc-4372-a567-0e02b2c3d479', OWN='a'.repeat(64), SHARE='b'.repeat(64), KEY='TEST_SERVICE_KEY', BASE='https://hzbqzfimtroixnldzjeq.supabase.co';
(async()=>{
 // --- Edge: nowa rewizja pod tym samym linkiem -------------------------------
 let handler; const edgeCalls=[];
 const edgeFetch=async(url,init={})=>{edgeCalls.push({url,init});const target=new URL(url);const name=target.pathname.split('/').pop();
  if(target.pathname.includes('/rest/v1/rpc/')){
   let response={};
   if(name==='rejfile_edit_begin')response={id:ID,chunks:2,revision:2,name:'nowy.bin'};
   if(name==='rejfile_finish')response={id:ID,expires_at:'2030-01-01T00:00:00Z',revision:2,previous_revision:1,previous_chunks:2};
   if(name==='rejfile_cleanup_list')response=[];
   return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(target.pathname.includes('/object/upload/sign/'))return new Response(JSON.stringify({url:'/object/upload/sign/rejfile/'+target.pathname.split('/rejfile/')[1]+'?token=abc'}),{status:200});
  if(target.pathname.includes('/storage/v1/object/list/'))return new Response(JSON.stringify([{name:'0'},{name:'1'}]),{status:200,headers:{'Content-Type':'application/json'}});
  if(target.pathname.includes('/storage/v1/object/'))return new Response('',{status:200});
  throw new Error('unexpected '+url);
 };
 const ctx={Deno:{env:{get:k=>k==='SUPABASE_URL'?BASE:KEY},serve:fn=>handler=fn},URL,Request,Response,TextEncoder,crypto:webcrypto,fetch:edgeFetch,console};
 vm.runInNewContext(read('supabase/functions/rejfile/index.js'),ctx);
 const edge=body=>handler(new Request('https://edge.test',{method:'POST',headers:{'content-type':'application/json',origin:'https://rejson59.github.io'},body:JSON.stringify(body)}));
 let r=await edge({action:'edit',id:ID,size:10485765,owner:OWN,name:'nowy.bin'});
 assert.equal(r.status,200);let out=await r.json();
 assert.equal(out.id,ID);assert.equal(out.revision,2);assert.equal(out.urls.length,2);
 assert.ok(out.urls.every(u=>/\/rejfile\/[^/]+\/r2\/[01]\?token=abc$/.test(new URL(u).pathname+new URL(u).search)));
 const begin=edgeCalls.find(x=>x.url.endsWith('/rpc/rejfile_edit_begin'));
 assert.ok(begin, 'edit musi iść przez rejfile_edit_begin');
 assert.equal(JSON.parse(begin.init.body).p_owner,OWN);
 r=await edge({action:'edit',id:ID,size:0,owner:OWN,name:'nowy.bin'});assert.equal(r.status,400);
 r=await edge({action:'edit',id:ID,size:10485765,owner:OWN,name:42});assert.equal(r.status,400);
 r=await edge({action:'finish',id:ID,owner:OWN});assert.equal(r.status,200);
 await new Promise(res=>setTimeout(res,20));
 const removed=edgeCalls.filter(x=>String(x.init.method).toUpperCase()==='DELETE');
 assert.equal(removed.length,1,'po finish stara rewizja musi zostać skasowana jednym żądaniem');
 const prefixes=JSON.parse(removed[0].init.body).prefixes;
 assert.deepEqual(prefixes.sort(),[ID+'/r1/0',ID+'/r1/1'],'kasujemy wszystkie części starej rewizji, bez nowej');

 // --- UI: edycja z historii pod tym samym linkiem ----------------------------
 const dom=new JSDOM(read('rejhub2/rejfile.html'),{url:'https://rejson59.github.io/rejfile',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.focus=function(){};
 w.confirm=()=>true;w.URL.createObjectURL=()=>'blob:test';w.URL.revokeObjectURL=()=>{};
 const saved=[{id:ID,name:'film.bin',owner:OWN,share:SHARE,status:'ready',expires:'2030-01-01T00:00:00Z',recipient:null}];
 w.localStorage.setItem('rejfile_sent_v1',JSON.stringify(saved));
 let uploads=[], api=[];const newFile=new w.File([new Uint8Array(10485765)],'nowy.bin',{type:'application/octet-stream'});
 w.XMLHttpRequest=class {constructor(){this.upload={};} open(method,url){this.method=method;this.url=url;} setRequestHeader(){} send(blob){uploads.push({url:this.url,size:blob.size,type:blob.type});this.status=200;setTimeout(()=>this.onload(),0);} };
 w.fetch=async(url,init={})=>{api.push({url:String(url),body:init.body?JSON.parse(init.body):null});if(String(url).includes('/functions/v1/rejfile')){const b=JSON.parse(init.body);let value={};
   if(b.action==='edit')value={id:ID,chunkSize:10485760,revision:2,urls:[BASE+'/storage/v1/object/upload/sign/rejfile/'+ID+'/r2/0?token=1',BASE+'/storage/v1/object/upload/sign/rejfile/'+ID+'/r2/1?token=2']};
   if(b.action==='finish')value={id:ID,expires_at:'2030-02-01T00:00:00Z',revision:2};
   if(b.action==='info')value={id:ID,name:'film.bin',size:10485765,chunks:2,expires_at:'2030-01-01T00:00:00Z'};
   return {ok:true,json:async()=>value};}
   throw new Error('unexpected '+url);};
 w.eval(read('js/rejfile.js'));
 const doc=w.document;
 assert.equal(JSON.parse(w.localStorage.getItem('rejfile_sent_v1')).length,1,'start: jeden wpis historii');
 // „Zmień plik” z historii (trzeci przycisk przy wpisie z linkiem).
 const editBtn=doc.querySelector('#sent-list .file-actions button:nth-child(3)');
 assert.equal(editBtn.textContent,'Zmień plik');
 editBtn.click();
 assert.equal(doc.getElementById('edit-banner').hidden,false,'banner edycji musi być widoczny');
 assert.match(doc.getElementById('edit-banner-text').textContent,/Adres się nie zmieni/);
 assert.equal(doc.querySelector('input[name="mode"]').disabled,true,'trybu udostępnienia nie zmieniamy w edycji');
 assert.match(doc.getElementById('send').textContent,/Zmień plik pod linkiem/);
 Object.defineProperty(doc.getElementById('file-input'),'files',{value:[newFile],configurable:true});
 doc.getElementById('file-input').dispatchEvent(new w.Event('change'));
 doc.getElementById('upload-form').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 async function wait(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(res=>setTimeout(res,5));}throw new Error('timeout');}
 await wait(()=>!doc.getElementById('success').hidden);
 const editCall=api.find(x=>x.body&&x.body.action==='edit');
 assert.ok(editCall,'UI musi wołać akcję edit');
 assert.equal(editCall.body.id,ID);assert.equal(editCall.body.owner,OWN);assert.equal(editCall.body.size,10485765);assert.equal(editCall.body.name,'nowy.bin');
 assert.ok(!api.some(x=>x.body&&x.body.action==='create'),'edycja nie tworzy nowej przesyłki');
 assert.deepEqual(uploads.map(x=>x.size),[10485760,5]);
 assert.ok(uploads.every(x=>/\/r2\/[01]$/.test(new URL(x.url).pathname)),'części trafiają pod nową rewizję r2: '+uploads.map(x=>x.url).join(','));
 const finish=api.find(x=>x.body&&x.body.action==='finish');assert.equal(finish.body.id,ID);assert.equal(finish.body.owner,OWN);
 const after=JSON.parse(w.localStorage.getItem('rejfile_sent_v1'));
 assert.equal(after.length,1,'historia nie może dostać drugiego wpisu');
 assert.equal(after[0].id,ID);assert.equal(after[0].share,SHARE,'link musi zostać ten sam');assert.equal(after[0].owner,OWN);
 assert.equal(after[0].status,'ready');assert.equal(after[0].expires,'2030-02-01T00:00:00Z');
 assert.match(doc.getElementById('success-text').textContent,/Link się nie zmienił/);
 assert.equal(doc.getElementById('edit-banner').hidden,true,'banner znika po zapisie');
 // Anulowanie edycji przywraca normalny formularz.
 editBtn.click();doc.getElementById('edit-cancel').click();
 assert.equal(doc.getElementById('edit-banner').hidden,true);
 assert.equal(doc.querySelector('input[name="mode"]').disabled,false);
 assert.match(doc.getElementById('send').textContent,/Prześlij plik/);
 assert.equal(JSON.parse(w.localStorage.getItem('rejfile_sent_v1')).length,1);
 dom.window.close();
 console.log('PASS: RejFile edycja pod tym samym linkiem (rewizja rN, bez nowego wpisu, bez zmiany linku)');
})().catch(e=>{console.error(e);process.exitCode=1;});

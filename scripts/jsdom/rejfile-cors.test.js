const assert = require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {webcrypto}=require('node:crypto'); const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ID='a47ac10b-58cc-4372-a567-0e02b2c3d479', OWN='a'.repeat(64), SHARE='b'.repeat(64), KEY='TEST_SERVICE_KEY', BASE='https://hzbqzfimtroixnldzjeq.supabase.co';
(async()=>{
 /* --- A. CORS: strona działa pod rejhub.vercel.app, nie pod starym adresem --- */
 let handler;
 const calls=[];
 const mockFetch=async(url,init={})=>{calls.push({url,init});const target=new URL(url);const name=target.pathname.split('/').pop();
  if(target.pathname.includes('/rest/v1/rpc/'))return new Response(JSON.stringify(name==='rejfile_create'?{id:ID,chunks:1}:{}),{status:200,headers:{'Content-Type':'application/json'}});
  if(target.pathname.includes('/object/upload/sign/'))return new Response(JSON.stringify({url:'/object/upload/sign/rejfile/'+ID+'/0?token=abc'}),{status:200});
  throw new Error('unexpected '+url);
 };
 const ctx={Deno:{env:{get:k=>k==='SUPABASE_URL'?BASE:KEY},serve:fn=>handler=fn},URL,Request,Response,TextEncoder,crypto:webcrypto,fetch:mockFetch,console};
 vm.runInNewContext(read('supabase/functions/rejfile/index.js'),ctx);
 const req=(origin,body)=>handler(new Request('https://edge.test',{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body||{action:'create',name:'n.rjnote',size:2048,owner:OWN,share:SHARE})}));
 const options=origin=>handler(new Request('https://edge.test',{method:'OPTIONS',headers:origin?{origin}:{}}));

 for (const origin of ['https://rejhub.vercel.app','https://rejson59.github.io','https://rejhub-jakubelozioms-projects.vercel.app','https://rejhub-git-main-jakubelozioms-projects.vercel.app','https://rejhub-egs8g2x6b-jakubelozioms-projects.vercel.app']) {
  const pre=await options(origin);assert.equal(pre.status,204,origin+': preflight');assert.equal(pre.headers.get('access-control-allow-origin'),origin,origin+': preflight musi zezwalać');
  const r=await req(origin);assert.equal(r.headers.get('access-control-allow-origin'),origin,origin+': odpowiedź bez ACAO = „NetworkError” w przeglądarce');
  assert.equal(r.status,200,origin+': create');
 }
 // Oba adresy produkcyjne muszą być w jednej, jawnej liście.
 const src=read('supabase/functions/rejfile/index.js');
 assert.ok(src.includes("'https://rejhub.vercel.app'"),'brak nowej domeny w CORS');
 assert.ok(src.includes("'https://rejson59.github.io'"),'stara domena nie może zniknąć z CORS');
 assert.ok(/CORS_PREVIEW/.test(src),'podglądy Vercela muszą mieć regułę, a nie wpis na sztywno');

 // Obce strony dalej nie dostają zgody.
 for (const origin of ['https://evil.example','https://rejhub.vercel.app.evil.example','https://rejhub.vercel.app.example.com','https://rejson59.github.io.evil.example']) {
  const r=await req(origin);
  assert.equal(r.headers.get('access-control-allow-origin'),'null',origin+': obcy origin nie może dostać zgody');
 }
 assert.equal((await req(null)).headers.get('access-control-allow-origin'),'null');

 /* --- B. UI: „NetworkError…” nie może już trafić do użytkownika --- */
 const dom=new JSDOM(read('rejhub2/rejfile.html'),{url:'https://rejhub.vercel.app/rejfile',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.URL.createObjectURL=()=>'blob:test';w.URL.revokeObjectURL=()=>{};
 w.fetch=async()=>{throw new TypeError('NetworkError when attempting to fetch resource.');};
 w.XMLHttpRequest=class {constructor(){this.upload={};} open(){} setRequestHeader(){} send(){}};
 w.eval(read('js/rejfile-notes.js'));
 w.eval(read('js/rejfile.js'));
 const doc=w.document;
 w.document.querySelector('[data-share-kind="note"]').click();
 doc.getElementById('note-title').value='Notatka';
 doc.getElementById('note-content').innerHTML='<p>Treść do wysłania w notatce.</p>';
 doc.getElementById('upload-form').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 async function wait(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('timeout');}
 await wait(()=>!doc.getElementById('error').hidden);
 const message=doc.getElementById('error').textContent;
 assert.ok(!/NetworkError when attempting/i.test(message),'surowy komunikat silnika nie może być pokazany: '+message);
 assert.match(message,/Nie udało się połączyć z RejFile/);
 assert.equal(doc.getElementById('success').hidden,true,'nie może udawać sukcesu');
 assert.equal(doc.getElementById('send').disabled,false,'formularz musi wrócić do stanu używalności');
 assert.ok(!doc.getElementById('progress-wrap').hidden===false);
 dom.window.close();
 console.log('PASS: RejFile — CORS dla rejhub.vercel.app i czytelny błąd sieci przy wysyłce notatki');
})().catch(e=>{console.error(e);process.exitCode=1;});

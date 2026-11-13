const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const wait=()=>new Promise(r=>setTimeout(r,25));
(async()=>{
 const dom=new JSDOM(read('rejhub2/rejsejf.html'),{url:'https://rejson59.github.io/rejsejf',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document;w.TextEncoder=TextEncoder;let session=null,notify;w.RejsonAccount={getSession:async()=>session,subscribe:fn=>{notify=fn;},open:()=>{}};w.confirm=()=>true;
 const db=[],requests=[];let id=0;w.fetch=async(url,opts)=>{const name=String(url).split('/').pop(),body=JSON.parse(opts.body);requests.push({name,body});let res;
  if(name==='rejsejf_list')res=db.filter(x=>x.owner===body.p_token).map(x=>({id:x.id,title:x.title,kind:x.kind,size:x.content.length,updated_at:x.updated_at}));
  else if(name==='rejsejf_get'){const x=db.find(x=>x.id===body.p_id&&x.owner===body.p_token);res=x&&{...x};}
  else if(name==='rejsejf_delete'){const i=db.findIndex(x=>x.id===body.p_id&&x.owner===body.p_token);res=i>=0;if(res)db.splice(i,1);}
  else if(name==='rejsejf_save'){let x=db.find(x=>x.id===body.p_id&&x.owner===body.p_token);if(!x){x={id:String(++id),owner:body.p_token};db.push(x);}Object.assign(x,{title:body.p_title,kind:body.p_kind,content:body.p_content,updated_at:'2026-11-04T12:00:0'+id+'Z'});res={id:x.id,updated_at:x.updated_at};}
  else throw Error(name);return {ok:true,json:async()=>res};};
 w.eval(read('js/rejsejf.js'));await wait();assert.equal(d.getElementById('safe-login').hidden,false);assert.equal(requests.length,0);
 session={username:'A',token:'a-token'};notify();await wait();assert.equal(d.getElementById('safe-workspace').hidden,false);
 d.getElementById('note-title').value='<img src=x onerror=alert(1)>';d.getElementById('note-content').value='Tajna treść';d.getElementById('note-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();
 assert.equal(db[0].content,'Tajna treść');assert.equal(d.querySelectorAll('.safe-item img').length,0);assert.match(d.querySelector('.safe-item strong').textContent,/<img/);
 d.querySelector('.safe-item button').click();await wait();assert.equal(d.getElementById('note-content').value,'Tajna treść');assert.equal(d.getElementById('note-cancel').hidden,false);
 d.getElementById('note-content').value='Nowa';d.getElementById('note-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(db[0].content,'Nowa');assert.ok(requests.filter(x=>x.name==='rejsejf_save')[1].body.p_updated);
 d.getElementById('mode-file').click();const file=new w.File([new Uint8Array([0,1,2,255])],'dane.bin');Object.defineProperty(d.getElementById('safe-file'),'files',{configurable:true,value:[file]});d.getElementById('file-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(db[1].content,'AAEC/w==');
 session={username:'B',token:'b-token'};notify();assert.equal(d.querySelector('.safe-item'),null,'zmiana konta natychmiast czyści zawartość');assert.equal(d.getElementById('note-content').value,'');await wait();assert.equal(d.querySelector('.safe-item'),null,'inne konto ma własną listę');
 session={username:'A',token:'a-token'};notify();await wait();assert.equal(d.querySelectorAll('.safe-item').length,2);d.querySelector('.safe-item-actions button:nth-child(2)').click();await wait();assert.equal(db.length,1);
 assert.equal(d.querySelector('main').hasAttribute('data-rj-private'),true);assert.equal(d.querySelector('a[href="/rejfile"]')!==null,true);assert.match(read('rejhub2/index.html'),/href="\/rejsejf"/);
 w.close();console.log('PASS: RejSejf: sesja, notatka, edycja, plik, usuwanie, izolacja kont i brak HTML injection (mock backend)');
})().catch(e=>{console.error(e);process.exitCode=1;});

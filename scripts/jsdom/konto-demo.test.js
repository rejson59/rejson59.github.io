/* Makieta i przejścia stanów z symulowaną weryfikacją, bez sieci i prawdziwych kont. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {JSDOM,VirtualConsole}=require('jsdom');const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');const wait=()=>new Promise(r=>setTimeout(r,10));
async function fixture(initial,opts={}){
 const dom=new JSDOM(read('rejhub2/konto-demo.html'),{url:'https://rejson59.github.io/konto-demo',runScripts:'outside-only',virtualConsole:new VirtualConsole()});const w=dom.window,d=w.document;let session=initial,subscriber,opened=0,fail=false,pending;
 if(opts.pending)w.sessionStorage.setItem('rejson_demo_login_pending_v1',String(opts.pending));if(opts.connected)w.sessionStorage.setItem('rejson_demo_connected_v1','1');
 w.RejsonAccount={getSession:()=>pending?pending:fail?Promise.reject(new Error('offline')):Promise.resolve(session),open:()=>opened++,subscribe:fn=>subscriber=fn};
 w.eval(read('js/konto-demo.js'));await wait();return{w,d,get opened(){return opened;},setSession:s=>session=s,change:()=>subscriber(),setFail:v=>fail=v,delay:p=>pending=p,close:()=>w.close()};
}
(async()=>{
 let x=await fixture({username:'Alice',token:'sekretny-token'});assert.equal(x.d.getElementById('demo-user').hidden,true);x.d.getElementById('demo-connect').click();await wait();assert.equal(x.d.getElementById('demo-name').textContent,'Alice');assert.equal(x.opened,0);assert.equal(x.w.sessionStorage.getItem('rejson_demo_connected_v1'),'1');assert(!JSON.stringify(x.w.sessionStorage).includes('sekretny-token'));
 x.setSession({username:'Bob',token:'inny-token'});x.change();await wait();assert.equal(x.d.getElementById('demo-name').textContent,'Bob');x.d.getElementById('demo-disconnect').click();assert.equal(x.d.getElementById('demo-guest').hidden,false);assert.equal(x.w.sessionStorage.getItem('rejson_demo_connected_v1'),null);x.close();
 x=await fixture(null);x.d.getElementById('demo-connect').click();await wait();assert.equal(x.opened,1);assert(Number(x.w.sessionStorage.getItem('rejson_demo_login_pending_v1'))>0);x.close();
 x=await fixture({username:'Alice',token:'token'}, {pending:Date.now()});assert.equal(x.d.getElementById('demo-name').textContent,'Alice');assert.equal(x.w.sessionStorage.getItem('rejson_demo_login_pending_v1'),null);x.setSession(null);x.change();await wait();assert.equal(x.d.getElementById('demo-user').hidden,true);x.close();
 x=await fixture({username:'Alice',token:'token'},{pending:Date.now()-31*60*1000});assert.equal(x.d.getElementById('demo-user').hidden,true);assert.equal(x.w.sessionStorage.getItem('rejson_demo_login_pending_v1'),null);x.close();
 x=await fixture(null);x.setFail(true);x.d.getElementById('demo-connect').click();await wait();assert.equal(x.opened,0);assert.match(x.d.getElementById('demo-status').textContent,/Nie udało się/);x.close();
 // Opóźnione potwierdzenie starego konta nie nadpisze rozłączenia.
 x=await fixture(null);let resolve;x.delay(new Promise(r=>resolve=r));x.d.getElementById('demo-connect').click();x.d.getElementById('demo-disconnect').click();resolve({username:'Stare',token:'stary'});await wait();assert.equal(x.d.getElementById('demo-user').hidden,true);x.close();
 assert.match(read('docs/wspolne-konto-projekty.md'),/PKCE/);assert.match(read('AGENTS.md'),/wspolne-konto-projekty/);console.log('PASS: makieta, sesja, powrót, przełączenie konta, rozłączenie i brak sieci (mock)');
})().catch(e=>{console.error(e);process.exitCode=1;});

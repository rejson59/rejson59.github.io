/* Wspólne, prawdziwe źródła — mock backendu i GitHuba, bez zrzutów.
 *
 * Po usunięciu publicznej tablicy (2026-10-19) powiadomienia mają dwa
 * prawdziwe źródła: aktualizacja obserwowanego projektu (GitHub) i zdarzenia
 * z RejChat. Ten test pilnuje, że panel ich nie gubi, nie dubluje, przeżywa
 * przejście na inną podstronę i nie miesza kont.
 */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u==='/')u='/index.html';else if(!path.extname(u)&&fs.existsSync(path.join(root,u+'.html')))u+='.html';let f=path.resolve(root,'.'+u);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return res.writeHead(404).end();res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json'})[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox','--disable-webgl']});
try{
 const ctx=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block'}),id='11111111-1111-4111-8111-111111111111';
 await ctx.addInitScript(({id})=>{if(!localStorage.getItem('rejson_community_session_v1'))localStorage.setItem('rejson_community_session_v1',JSON.stringify({username:'Tester',token:'a'.repeat(32)}));localStorage.setItem('rj_following_v1',JSON.stringify(['mconline']));
   /* punkt odniesienia z przeszłości — projekt od tego czasu naprawdę się zmienił */
   if(!localStorage.getItem('rj_seen_v1:tester'))localStorage.setItem('rj_seen_v1:tester',JSON.stringify({user:'Tester',projects:{mconline:'2026-10-01T00:00:00Z'},at:'2026-10-01T00:00:00Z'}));
 },{id});
 let notes=[{id:'22222222-2222-4222-8222-222222222222',kind:'comment',actor_name:'Ania',created_at:'2026-11-02T10:00:00Z',read_at:null}];
 await ctx.route('**/*',async r=>{let u=r.request().url();if(u.startsWith(origin+'/'))return r.continue();if(u.startsWith('https://api.github.com/'))return r.fulfill({json:[{name:'mconline',homepage:'https://rejson59.github.io/mconline/',pushed_at:'2026-11-01T00:00:00Z'}]});if(!u.includes('/rest/v1/rpc/'))return r.abort();let fn=u.split('/').pop(),b=r.request().postDataJSON()||{},d=[];
   if(fn==='community_whoami')d={username:b.p_token[0]==='a'?'Tester':'Other'};if(fn==='rejchat_get_profiles')d=[{username:'Tester',avatar:'cat',color:'mint'}];
   if(fn==='rejchat_notifications_list')d=b.p_token[0]==='a'?{items:notes,unread:notes.filter(n=>!n.read_at).length}:{items:[],unread:0};
   if(fn==='rejchat_notifications_read'){notes=notes.map(n=>({...n,read_at:'2026-11-02T12:00:00Z'}));d={marked:1};}
   if(fn==='get_ecosystem_summary')d={};if(fn==='community_list_posts')d={posts:[],total:0,available_tags:[]};return r.fulfill({json:d}).catch(()=>{});
 });
 const p=await ctx.newPage();await p.goto(origin+'/rejfile',{waitUntil:'domcontentloaded'});await p.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
 await p.waitForFunction(()=>window.RJPremium&&window.RJPremium.notifications().some(n=>n.kind==='update'));
 assert.equal(await p.locator('.rj-chat-bell').count(),1);assert.equal(await p.locator('#rj-bell').count(),0);
 const titles=await p.evaluate(()=>window.RJPremium.notifications().map(n=>n.kind+':'+n.title));
 assert(titles.some(t=>/^update:mconline/.test(t)),titles.join(' | '));
 assert(!titles.some(t=>/^(status|reply|new_submission)/.test(t)),'po tablicy nie ma śladu: '+titles.join(' | '));
 const stored=await p.evaluate(()=>localStorage.getItem('rj_seen_v1:tester'));
 assert.equal(JSON.parse(stored).subs,undefined,'migawka bez pola subs');
 // Zdarzenia z RejChat żyją obok lokalnych, ale mają własny panel.
 await p.locator('.rj-chat-bell').click();
 const panel=p.locator('.rj-chat-alert-list');
 for(const t of ['Ania','skomentował'])assert((await panel.innerText()).includes(t),t);
 assert.match(await p.locator('.rj-chat-bell').getAttribute('aria-label'),/nieprzeczytane: 1/);
 // Odświeżenie i przejście między stronami nie gubi zdarzeń.
 await p.reload({waitUntil:'domcontentloaded'});await p.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
 await p.waitForFunction(()=>document.querySelector('.rj-chat-bell-count')?.textContent==='1');
 await p.goto(origin+'/rejtools',{waitUntil:'domcontentloaded'});await p.evaluate(()=>document.querySelector('#rj-page-loader')?.remove());
 await p.waitForFunction(()=>window.RJPremium&&window.RJPremium.notifications().some(n=>n.kind==='update'));
 await p.locator('.rj-chat-bell').click();await p.locator('.rj-chat-alert-read').click();
 await p.waitForFunction(()=>document.querySelector('.rj-chat-bell-count').hidden);
 assert.equal(notes[0].read_at!==null,true);
 assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('rj_general_notifications_v1:tester')||'[]'))).length,1,'lokalne zdarzenie zostaje po odczycie RejChat');
 // Spóźniona odpowiedź poprzedniego konta nie może pojawić się nowemu.
 const p2=await ctx.newPage();
 await p2.goto(origin+'/rejtools',{waitUntil:'domcontentloaded'});
 await p2.waitForFunction(()=>window.RJPremium&&window.RJPremium.notifications().length>0);
 await p.evaluate(()=>{localStorage.setItem('rejson_community_session_v1',JSON.stringify({username:'Other',token:'b'.repeat(32)}));window.dispatchEvent(new Event('rj:session-change'));});
 await p.waitForTimeout(250);
 assert.equal(await p.evaluate(()=>window.RJPremium.notifications().filter(n=>/mconline/.test(n.title)).length),0,'cudze zdarzenia nie przeciekają');
 await p2.close();
 await ctx.close();console.log('PASS: dwa prawdziwe źródła powiadomień, trwałość, odczyt i izolacja kont');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});

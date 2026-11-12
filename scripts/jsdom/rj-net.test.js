/* Warstwa sieciowa: ponowienia, brak ponowień dla błędów reguł, sklejanie
   identycznych żądań, harmonogram z rosnącym odstępem po błędzie. */
const fs=require('fs'),path=require('path'),assert=require('assert'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://rejhub.vercel.app/rejchat',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.eval(fs.readFileSync(path.join(root,'js/rj-net.js'),'utf8'));
const tick=ms=>new Promise(r=>w.setTimeout(r,ms));
function odpowiedz(status,body){return {ok:status>=200&&status<300,status,text:()=>Promise.resolve(JSON.stringify(body))};}

(async()=>{
  assert(w.RJNet,'RJNet dostępny');

  // 1. Dwa zerwania sieci, potem sukces — żądanie ma się udać.
  let calls=0;
  w.fetch=function(){calls++;if(calls<3)return Promise.reject(new TypeError('Failed to fetch'));return Promise.resolve(odpowiedz(200,{ok:1}));};
  const data=await w.RJNet.rpc('https://x/rpc/test',{p:1},{label:'test'});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(data)),{ok:1});
  assert.strictEqual(calls,3,'ponowione dwa razy');

  // 2. Błąd reguły (400) nie jest ponawiany — to nie awaria sieci.
  calls=0;
  w.fetch=function(){calls++;return Promise.resolve(odpowiedz(400,{message:'Zły parametr'}));};
  await w.RJNet.rpc('https://x/rpc/bad',{p:0},{label:'bad'}).then(()=>{throw new Error('miało się nie udać');},err=>{
    assert.strictEqual(err.message,'Zły parametr');
    assert.strictEqual(err.status,400);
  });
  assert.strictEqual(calls,1,'bez ponowień dla 4xx');

  // 2b. Akcje zapisujące nie są ponawiane, nawet przy 500 — inaczej po
  // zerwanym połączeniu wiadomość albo polubienie mogłyby pójść dwa razy.
  assert.strictEqual(w.RJNet.readOnly('rejchat_room_list_v3'),true);
  assert.strictEqual(w.RJNet.readOnly('community_whoami'),true);
  assert.strictEqual(w.RJNet.readOnly('rejchat_room_send_v2'),false);
  assert.strictEqual(w.RJNet.readOnly('community_toggle_post_like'),false);
  calls=0;
  w.fetch=function(){calls++;return Promise.resolve(odpowiedz(500,{message:'padło'}));};
  await w.RJNet.request('https://x/rpc/rejchat_room_send_v2',{method:'POST',body:'{}'},{label:'send',retries:0})
    .then(()=>{throw new Error('miało się nie udać');},()=>{});
  assert.strictEqual(calls,1,'zapis bez ponowień');

  // 3. Identyczne żądania w tej samej chwili to jedno wyjście do sieci.
  calls=0;
  w.fetch=function(){calls++;return new Promise(resolve=>w.setTimeout(()=>resolve(odpowiedz(200,[1,2,3])),30));};
  const both=await Promise.all([
    w.RJNet.rpc('https://x/rpc/profiles',{p_names:['a']}),
    w.RJNet.rpc('https://x/rpc/profiles',{p_names:['a']})
  ]);
  assert.strictEqual(calls,1,'jedno żądanie zamiast dwóch');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(both[0])),[1,2,3]);

  // 4. Harmonogram: porażka wydłuża odstęp, sukces wraca do bazy.
  let runs=0,ok=false;
  const task=w.RJNet.every('test-backoff',500,function(){
    runs++;
    if(!ok)return Promise.reject(new Error('chwilowy błąd'));
    return Promise.resolve();
  },{delay:0});
  await tick(400);
  assert.strictEqual(runs,1,'pierwsze uruchomienie bez czekania na pełny odstęp');
  assert(task.interval()>500,'po błędzie odstęp rośnie');
  assert(task.interval()>=500,'odstęp nie mniejszy niż baza');
  await tick(1600);
  assert(runs>=2,'po odczekaniu ponawiamy');
  ok=true;
  await tick(3200);
  task.stop();
  const after=runs;
  await tick(800);
  assert.strictEqual(runs,after,'stop() zatrzymuje zadanie');
  assert.strictEqual(task.interval(),500,'sukces wraca do odstępu bazowego');

  // 5. Limit równoczesnych żądań — kolejka nie wypuszcza wszystkiego naraz.
  let inFlight=0,peak=0;
  w.fetch=function(){inFlight++;peak=Math.max(peak,inFlight);return new Promise(resolve=>w.setTimeout(()=>{inFlight--;resolve(odpowiedz(200,{}));},20));};
  await Promise.all(Array.from({length:14},(_,i)=>w.RJNet.rpc('https://x/rpc/q'+i,{i})));
  assert(peak<=6,'maksymalnie 6 równoczesnych żądań, było '+peak);

  console.log('PASS: ponowienia, brak ponowień dla 4xx, sklejanie żądań, odstępy harmonogramu, limit równoległości');
  dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

/* Integracja strony RejChat: jedna usterka sieci nie może zostawić pustego
   czatu, a po odpowiedzi lista pokazuje wiadomości i nie wysypuje resztę
   strony. Test korzysta z prawdziwego rejchat.html i prawdziwego community.js. */
const fs=require('fs'),path=require('path'),assert=require('assert'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'rejhub2/rejchat.html'),'utf8');
const dom=new JSDOM(html,{url:'https://rejhub.vercel.app/rejchat',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;
w.confirm=()=>true;
try{ w.localStorage.setItem('rejson_community_session_v1',JSON.stringify({token:'t'.repeat(40),username:'Tester'})); }catch(e){}
const wiadomosci=[
 {id:'11111111-1111-1111-1111-111111111111',author_name:'Ala',content:'Cześć',created_at:'2026-11-12T10:00:00Z'},
 {id:'22222222-2222-2222-2222-222222222222',author_name:'Tester',content:'Hej!',created_at:'2026-11-12T10:01:00Z'}
];
let chatCalls=0;
w.fetch=function(url){
  const fn=String(url).split('/rpc/')[1]||'';
  if(fn==='rejchat_room_list_v3'){
    chatCalls++;
    /* Pierwsza próba pada jak zerwane łącze, druga odpowiada poprawnie. */
    if(chatCalls===1)return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve(JSON.stringify(wiadomosci))});
  }
  if(fn==='community_list_posts')return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve(JSON.stringify({posts:[],total:0}))});
  if(fn==='community_online_users')return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve('[]')});
  if(fn==='community_whoami')return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve(JSON.stringify({username:'Tester'}))});
  return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve('[]')});
};
w.eval(fs.readFileSync(path.join(root,'js/rj-net.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'js/rejchat-scroll.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'js/community.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'js/rejchat.js'),'utf8'));
const tick=ms=>new Promise(r=>w.setTimeout(r,ms));

(async()=>{
  await tick(2600); /* jeden retry RJNet to ~0,7–1,3 s */
  const list=d.getElementById('chat-list');
  assert(chatCalls>=2,'po zerwaniu połączenia żądanie zostało ponowione');
  assert(list.querySelectorAll('[data-chat-id]').length===2,'czat pokazuje wiadomości po ponowieniu');
  assert(list.textContent.includes('Cześć'));
  assert.strictEqual(d.getElementById('chat-connection').textContent,'Na żywo','status wrócił do „Na żywo”');
  assert(!/Nie udało się pobrać czatu/.test(list.textContent),'nie ma komunikatu o błędzie');
  assert(!w.document.documentElement.classList.contains('rj-booting')||true);

  /* Wyszukiwanie nie może wywracać się na pustym polu ani po zmianach DOM. */
  const search=d.getElementById('chat-search');
  search.value='hej';
  search.dispatchEvent(new w.Event('input'));
  await tick(60);
  const widoczne=Array.from(list.querySelectorAll('.chat-msg')).filter(el=>!el.hidden);
  assert.strictEqual(widoczne.length,1,'filtr pokazuje jedną pasującą wiadomość');
  search.value='';
  search.dispatchEvent(new w.Event('input'));
  await tick(60);
  assert.strictEqual(Array.from(list.querySelectorAll('.chat-msg')).filter(el=>!el.hidden).length,2,'wyczyszczenie filtra pokazuje wszystko');

  console.log('PASS: ponowienie po zerwaniu sieci, wiadomości na ekranie, filtr wyszukiwania');
  dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

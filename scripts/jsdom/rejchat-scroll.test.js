/* Trzymanie końca rozmowy: dojazd do ostatniej wiadomości nawet wtedy, gdy
   lista nie miała jeszcze wysokości, i oddanie kontroli po przewinięciu w górę. */
const fs=require('fs'),path=require('path'),assert=require('assert'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');
const dom=new JSDOM('<!doctype html><html><body><div id="l"><div data-chat-id="a">A</div><div data-chat-id="b">B</div></div></body></html>',
  {url:'https://rejhub.vercel.app/rejchat',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document,list=d.getElementById('l');
let client=0,scroll=600,top=0;
Object.defineProperty(list,'clientHeight',{get:()=>client});
Object.defineProperty(list,'scrollHeight',{get:()=>scroll});
Object.defineProperty(list,'scrollTop',{get:()=>top,set:v=>{top=v;}});
list.getBoundingClientRect=()=>({top:0,bottom:client,height:client,left:0,right:300,width:300});
w.eval(fs.readFileSync(path.join(root,'js/rejchat-scroll.js'),'utf8'));
const tick=ms=>new Promise(r=>w.setTimeout(r,ms));

(async()=>{
  const s=w.RJChatScroll.create(list);
  assert(s,'API listy');

  // 1. Lista bez wysokości (typowe przy pierwszym renderze) — dojazd ponawiany.
  s.bottom();
  client=100;
  await tick(120);
  assert.strictEqual(top,600,'pojawienie się wysokości kończy dojazd do końca');
  assert(s.isFollowing(),'czytelnik jest przy końcu');

  // 2. Przewinięcie w górę oddaje kontrolę i nie jest cofane.
  list.dispatchEvent(new w.Event('wheel'));
  top=120;
  list.dispatchEvent(new w.Event('scroll'));
  await tick(50);
  assert.strictEqual(s.isFollowing(),false,'przewinięcie w górę zatrzymuje podążanie');
  const before=top;
  scroll=900; // np. doszła nowa wiadomość
  await tick(80);
  assert(top<=before+2,'nowa treść nie wyrwała czytelnika z miejsca');

  // 3. capture() w trybie czytania zwraca pozycję do przywrócenia.
  const cap=s.capture();
  assert.strictEqual(cap.following,false);

  // 4. Przycisk „nowe wiadomości” wraca na koniec.
  s.bottom();
  await tick(100);
  assert.strictEqual(top,900,'powrót na koniec po nowych wiadomościach');
  assert.strictEqual(s.capture().following,true);

  console.log('PASS: dojazd do końca mimo braku wysokości, poszanowanie przewinięcia, powrót na koniec');
  dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

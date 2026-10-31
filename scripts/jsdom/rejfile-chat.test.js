// RejFile → RejChat: bez automatycznego wysyłania i bez utraty szkicu.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const root = path.resolve(__dirname, '../..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');
const origin='https://rejson59.github.io', key='rejfile_chat_draft_v1';
const id='a47ac10b-58cc-4372-a567-0e02b2c3d479', share='b'.repeat(64);
const url=origin+'/rejfile#f='+id+'.'+share;
const item={id,owner:'a'.repeat(64),share,name:'test.txt',status:'ready',expires:new Date(Date.now()+86400000).toISOString()};
const draft=()=>({link:url,at:Date.now(),expires:Date.now()+86400000});
function make(page) {
  const d=new JSDOM(read(page+'.html'),{url:origin+'/'+page,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  d.window.fetch=async()=>({ok:true,json:async()=>[]});
  return d;
}
function chat(value) {
  const d=make('rejchat'), w=d.window;
  if(value!==undefined) w.sessionStorage.setItem(key,typeof value==='string'?value:JSON.stringify(value));
  w.eval(read('js/rejchat.js'));
  return d;
}
{
  const d=make('rejfile'),w=d.window, alerts=[];
  w.alert=x=>alerts.push(x);w.confirm=()=>true;
  w.localStorage.setItem('rejfile_sent_v1',JSON.stringify([item,{...item,id:'b47ac10b-58cc-4372-a567-0e02b2c3d479',share:null,name:'private.txt'}]));
  w.eval(read('js/rejfile.js'));
  const rows=w.document.querySelectorAll('#sent-list .file-item');
  assert.equal(rows.length,2);
  const button=Array.from(rows[0].querySelectorAll('button')).find(b=>b.textContent.includes('RejChat'));
  assert.ok(button); assert.ok(!rows[1].textContent.includes('RejChat'),'plik dostępny na konto nie oferuje linku');
  button.click();
  let staged=JSON.parse(w.sessionStorage.getItem(key));
  assert.equal(staged.link,url);assert.equal(staged.expires,Date.parse(item.expires));assert.ok(!JSON.stringify(staged).includes(item.owner));
  w.sessionStorage.setItem(key,JSON.stringify({...draft(),link:origin+'/rejfile#f='+id+'.'+'c'.repeat(64)}));
  const previous=w.sessionStorage.getItem(key);w.confirm=()=>false;button.click();assert.equal(w.sessionStorage.getItem(key),previous);
  w.sessionStorage.setItem(key,'{bad json');w.confirm=()=>{throw Error('stary niepoprawny szkic nie wymaga potwierdzenia');};button.click();assert.equal(JSON.parse(w.sessionStorage.getItem(key)).link,url);
  Object.defineProperty(w.Storage.prototype,'setItem',{value(){throw new Error('storage blocked');}});
  button.click();assert.match(alerts.pop(),/Skopiuj/);
  d.window.close();
}
{
  const d=chat(draft()),w=d.window,doc=w.document;
  const box=doc.getElementById('file-draft'), add=doc.getElementById('file-draft-add'), field=doc.getElementById('chat-input');
  assert.equal(box.hidden,false);
  assert.match(box.textContent,/czat publiczny/i);assert.match(box.textContent,/każdy/i);assert.match(box.textContent,/dopiero po kliknięciu/i);
  assert.ok(!box.textContent.includes(share),'sekret nie jest automatycznie wyświetlany');
  let inputs=0,submits=0;field.addEventListener('input',()=>inputs++);doc.getElementById('chat-form').addEventListener('submit',()=>submits++);
  add.click();assert.match(doc.getElementById('file-draft-status').textContent,/Zaloguj/);assert.equal(field.value,'');assert.ok(w.sessionStorage.getItem(key));
  // Po zalogowaniu modalem form jest odsłonięty; rozpoczęty tekst musi pozostać.
  doc.getElementById('chat-form').hidden=false;
  field.value='x'.repeat(280);add.click();assert.equal(field.value,'x'.repeat(280));assert.match(doc.getElementById('file-draft-status').textContent,/Skróć/);assert.ok(w.sessionStorage.getItem(key));
  field.value='  Mój tekst  ';add.click();assert.equal(field.value,'  Mój tekst  Plik z RejFile: '+url);assert.equal(inputs,1);assert.equal(submits,0);assert.equal(w.sessionStorage.getItem(key),null);assert.equal(box.hidden,true);
  d.window.close();
}
for(const bad of [
  {...draft(),at:Date.now()-31*60*1000}, {...draft(),expires:Date.now()-1}, {...draft(),at:Date.now()+60000},
  {...draft(),link:'https://evil.example/rejfile#f='+id+'.'+share}, {...draft(),link:origin+'/rejfile?token=x#f='+id+'.'+share},
  {...draft(),link:origin+'/rejfile#f='+id+'.short'}, {...draft(),link:'https://bad@rejson59.github.io/rejfile#f='+id+'.'+share},
  '{malformed'
]) {
 const d=chat(bad);assert.equal(d.window.document.getElementById('file-draft').hidden,true);d.window.close();
}
{
 const d=chat(draft()),w=d.window;w.document.getElementById('file-draft-discard').click();assert.equal(w.sessionStorage.getItem(key),null);assert.equal(w.document.getElementById('file-draft').hidden,true);d.window.close();
}
console.log('PASS: RejFile → publiczny RejChat: tryb konto, walidacja, wygasanie, logowanie, limit i świadomy szkic');

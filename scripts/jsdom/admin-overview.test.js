// Przegląd nie zmyśla danych, a skróty prowadzą do istniejących narzędzi.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pause=()=>new Promise(r=>setTimeout(r,30));
async function test(auth,fail){
 const dom=new JSDOM(read('admin.html'),{url:'https://rejson59.github.io/admin',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document,calls=[];
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 w.RejsonCloud={getStoredSession:()=>({access_token:'mock'}),setStoredSession(){},rpc:async(name)=>{calls.push(name);if(name==='admin_setup_status')return {is_admin:auth};if(name==='get_admin_activity'){if(fail)throw Error('offline');return {totals:{online_total:3,views_today_total:41,views_total:1250},projects:[],multi:{}};}return {};}};
 w.RJAdminPartner={load(){calls.push('partner-load');}};w.RJAdminErrors={load(){calls.push('error-load');}};
 w.eval(read('js/admin-panel.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));await pause();
 if(!auth){assert.equal(d.getElementById('panel-dash').hidden,true);assert.equal(d.getElementById('panel-auth').hidden,false);assert(!calls.includes('get_admin_activity'));dom.window.close();return;}
 assert.equal(d.getElementById('panel-dash').hidden,false);assert.equal(d.getElementById('tab-overview').hidden,false);assert.equal(d.getElementById('tab-activity').hidden,true);
 if(fail){assert.equal(d.getElementById('overview-online').textContent,'—');assert.match(d.getElementById('overview-status').textContent,/Nie udało/);}else{
  assert.equal(d.getElementById('overview-online').textContent,'3');assert.equal(d.getElementById('overview-today').textContent,'41');assert.match(d.getElementById('overview-total').textContent,/1\s?250/);assert.match(d.getElementById('overview-status').textContent,/automatycznie/);
 }
 for(const tab of ['submissions','errors','partnership','community','activity','visitors']){
  d.querySelector(`[data-open-tab="${tab}"]`).click();assert.equal(d.getElementById('tab-'+tab).hidden,false);assert.equal(d.getElementById('tab-overview').hidden,true);
  assert.equal(d.getElementById('tab-btn-'+tab).getAttribute('aria-selected'),'true');assert.equal(d.getElementById('tab-btn-'+tab).getAttribute('aria-controls'),'tab-'+tab);
  d.getElementById('tab-btn-overview').click();
 }
 assert(calls.includes('partner-load'));assert(calls.includes('error-load'));
 d.getElementById('tab-btn-overview').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(d.getElementById('tab-activity').hidden,false);assert.equal(d.activeElement.id,'tab-btn-activity');
 dom.window.close();
}
(async()=>{await test(false,false);await test(true,true);await test(true,false);console.log('PASS: panel — uprawnienia, prawdziwe dane, błąd, skróty i klawiatura');})().catch(e=>{console.error(e);process.exitCode=1;});

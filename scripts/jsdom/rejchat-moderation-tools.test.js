const fs=require('fs'),path=require('path'),assert=require('assert'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');
const dom=new JSDOM(fs.readFileSync(path.join(root,'admin.html'),'utf8'),{url:'https://rejson59.github.io/admin',runScripts:'outside-only'});
const {window:w}=dom,d=w.document,calls=[];let previewResolve;
w.confirm=()=>true;
w.RejsonCloud={rpc(name,args){calls.push({name,args});if(name==='admin_rejchat_overview')return Promise.resolve({phrases:[{id:'1',phrase:'seks',match_mode:'substring'},{id:'2',phrase:'rdzen',match_mode:'prefix'},{id:'3',phrase:'wyraz',match_mode:'word'}],blocks:[],messages:[]});if(name==='admin_rejchat_reports')return Promise.resolve([]);if(name==='admin_rejchat_filter_check')return new Promise(resolve=>{previewResolve=resolve;});return Promise.resolve(true);}};
w.eval(fs.readFileSync(path.join(root,'js/admin-rejchat-moderation.js'),'utf8'));
const el=id=>d.getElementById('rcmod-'+id),tick=()=>new Promise(r=>setTimeout(r,0)),submit=form=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
(async()=>{
 const panel=el('panel');panel.open=true;panel.dispatchEvent(new w.Event('toggle'));await tick();
 assert(el('phrases').textContent.includes('Fragment tekstu'));assert(el('phrases').textContent.includes('Początek słowa'));assert(el('phrases').textContent.includes('Całe słowo'));assert(el('phrases').textContent.includes('Uwaga'));assert(el('phrases').textContent.includes('Przykład'));
 el('phrase-search').value='rdzen';el('phrase-search').dispatchEvent(new w.Event('input'));assert(el('phrases').textContent.includes('rdzen'));assert(!el('phrases').textContent.includes('seks'));
 el('phrase').value='testowy';el('phrase-mode').value='word';el('filter-test').value='testowy';submit(el('filter-test-form'));
 const check=calls.find(x=>x.name==='admin_rejchat_filter_check');assert.deepStrictEqual(JSON.parse(JSON.stringify(check.args)),{p_text:'testowy',p_candidate:'testowy',p_mode:'word'});previewResolve({blocked:false,candidate_blocked:true});await tick();assert(el('filter-test-result').textContent.includes('tekst przeszedłby'));assert(el('filter-test-result').textContent.includes('zablokowałaby'));
 el('filter-test').value='inny';el('filter-test').dispatchEvent(new w.Event('input'));assert.equal(el('filter-test-result').textContent,'');
 submit(el('filter-test-form'));const stale=previewResolve;w.RJAdminRejChat.clear();stale({blocked:true,candidate_blocked:true});await tick();assert.equal(el('filter-test-result').textContent,'');assert.equal(el('filter-test').value,'');
 el('phrase').value='nowywyraz';el('phrase-mode').value='prefix';submit(el('phrase-form'));await tick();const add=calls.find(x=>x.name==='admin_rejchat_phrase_v2');assert.deepStrictEqual(JSON.parse(JSON.stringify(add.args)),{p_phrase:'nowywyraz',p_mode:'prefix'});
 console.log('PASS: typy reguł, ostrzeżenia, podgląd, brak zapisu podglądu, czyszczenie i dodawanie');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

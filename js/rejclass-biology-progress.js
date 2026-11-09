/* Postęp tematów jest oddzielny dla gościa oraz każdego konta. */
(function(window){
 'use strict';
 var api=window.RJProfiles,valid=new Set((window.REJCLASS_BIOLOGY||[]).map(function(t){return t.id;}));
 var guestKey='rejclass-biology-topics-guest-v1',pendingPrefix='rejclass-biology-pending-v1:';
 var state={},pending={},session=null,userId=null,username='',ready=false,busy=false,serial=0,timer=null,error='',storageOK=true,subscriber=function(){};
 function read(key){try{return JSON.parse(localStorage.getItem(key)||'{}');}catch(_){return {};}}
 function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}}
 function clean(value){var result={};if(value&&typeof value==='object'&&!Array.isArray(value))Object.keys(value).forEach(function(k){if(valid.has(k)&&typeof value[k]==='boolean')result[k]=value[k];});return result;}
 function emit(){subscriber({entries:Object.assign({},state),ready:ready,account:!!session,username:username,error:error,busy:busy,pending:Object.keys(pending).length,storageOK:storageOK});}
 function same(turn,token){var current=api&&api.session();return turn===serial&&current&&current.token===token;}
 function savePending(){if(userId)storageOK=write(pendingPrefix+userId,pending);}
 function schedule(){clearTimeout(timer);timer=setTimeout(flush,400);}
 function flush(){if(!session||!ready||busy||!Object.keys(pending).length)return;var turn=serial,token=session.token,sent=Object.assign({},pending);busy=true;error='';emit();
  api.rpc('rejclass_topics_set',{p_token:token,p_entries:sent}).then(function(result){if(!same(turn,token))return;if(result!==true)throw Error('Błędna odpowiedź');Object.keys(sent).forEach(function(k){if(pending[k]===sent[k])delete pending[k];});savePending();error='';}).catch(function(){if(same(turn,token))error='Nie udało się zapisać postępów. Spróbuj ponownie.';}).finally(function(){if(!same(turn,token))return;busy=false;emit();if(!error&&Object.keys(pending).length)schedule();});
 }
 function load(){if(!session||busy)return;var turn=serial,token=session.token;busy=true;error='';emit();
  api.rpc('rejclass_topics_get',{p_token:token}).then(function(result){if(!same(turn,token))return;if(!result||typeof result.user_id!=='string'||!/^([0-9a-f-]{36})$/i.test(result.user_id)||typeof result.username!=='string'||!result.entries||typeof result.entries!=='object')throw Error('Błędna odpowiedź');userId=result.user_id;username=result.username;pending=clean(read(pendingPrefix+userId));state=Object.assign(clean(result.entries),pending);ready=true;error='';}).catch(function(){if(same(turn,token))error='Nie udało się wczytać postępów konta. Spróbuj ponownie.';}).finally(function(){if(!same(turn,token))return;busy=false;emit();if(ready&&Object.keys(pending).length)schedule();});
 }
 function reset(){serial++;clearTimeout(timer);session=api&&api.session();userId=null;username='';state={};pending={};ready=!session;busy=false;error='';storageOK=true;if(session){emit();load();}else{state=clean(read(guestKey));emit();}}
 function set(id,done){if(!ready||!valid.has(id)||typeof done!=='boolean')return;state[id]=done;if(session){pending[id]=done;savePending();schedule();}else storageOK=write(guestKey,state);emit();}
 function retry(){if(!session)return;if(!ready)load();else if(Object.keys(pending).length)flush();}
 window.RJClassBiologyProgress={start:function(fn){subscriber=fn;reset();},set:set,retry:retry};
 window.addEventListener('rj:session-change',reset);window.addEventListener('storage',function(e){if(e.key==='rejson_community_session_v1'||e.key===null)reset();});
})(window);

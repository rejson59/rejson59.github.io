/* Postępy gościa i konta są oddzielne. Konto identyfikuje wyłącznie odpowiedź serwera. */
(function(window,document){
 'use strict';
 var verbs=window.REJCLASS_VERBS||[],valid=new Set(verbs.map(function(v){return v[0];})),api=window.RJProfiles;
 var guestHard='rejclass-irregular-hard-v1',guestKnown='rejclass-irregular-known-v1',prefix='rejclass-progress-pending-v1:';
 var state={},pending={},session=null,userId=null,username='',ready=false,busy=false,refreshing=false,serial=0,revision=0,timer=null,error='',storageOK=true,subscriber=function(){};
 function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch(_){return fallback;}}
 function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}}
 function clean(obj){var result={};if(obj&&typeof obj==='object'&&!Array.isArray(obj))Object.keys(obj).forEach(function(k){if(valid.has(k)&&(obj[k]==='hard'||obj[k]==='known'))result[k]=obj[k];});return result;}
 function guest(){var h=read(guestHard,[]),k=read(guestKnown,[]),o={};if(Array.isArray(k))k.forEach(function(v){if(valid.has(v))o[v]='known';});if(Array.isArray(h))h.forEach(function(v){if(valid.has(v))o[v]='hard';});return o;}
 function writeGuest(){var h=[],k=[];Object.keys(state).forEach(function(v){(state[v]==='hard'?h:k).push(v);});storageOK=write(guestHard,h)&&write(guestKnown,k);}
 function writePending(){if(userId)storageOK=write(prefix+userId,pending);}
 function emit(reset){subscriber({ready:ready,account:!!session,username:username,error:error,busy:busy||refreshing,pending:Object.keys(pending).length,storageOK:storageOK,entries:Object.assign({},state),guestCount:Object.keys(guest()).length,reset:!!reset});}
 function same(turn,token){var s=api&&api.session();return turn===serial&&s&&s.token===token;}
 function schedule(){clearTimeout(timer);timer=setTimeout(flush,450);}
 function flush(){
  if(!session||!ready||busy||!Object.keys(pending).length)return;var turn=serial,token=session.token,sent=Object.assign({},pending);busy=true;error='';emit();
  api.rpc('rejclass_progress_set',{p_token:token,p_entries:sent}).then(function(ok){if(!same(turn,token))return;if(ok!==true)throw Error('Nieprawidłowa odpowiedź serwera.');Object.keys(sent).forEach(function(k){if(pending[k]===sent[k])delete pending[k];});writePending();error='';}).catch(function(){if(same(turn,token))error='Nie udało się zapisać postępów na koncie. Spróbuj ponownie.';}).finally(function(){if(!same(turn,token))return;busy=false;emit();if(!error&&Object.keys(pending).length)schedule();});
 }
 function load(initial){
  if(!session||refreshing||busy)return;var turn=serial,token=session.token,rev=revision;refreshing=true;if(initial)error='';emit();
  api.rpc('rejclass_progress_get',{p_token:token}).then(function(result){if(!same(turn,token))return;if(!result||typeof result.user_id!=='string'||!/^([0-9a-f-]{36})$/i.test(result.user_id)||typeof result.username!=='string'||!result.entries||typeof result.entries!=='object')throw Error('Nieprawidłowa odpowiedź serwera.');
   if(!initial&&rev!==revision)return;
   if(initial){userId=result.user_id;username=result.username;pending=clean(read(prefix+userId,{}));}
   state=Object.assign(clean(result.entries),pending);ready=true;error='';emit(initial);if(Object.keys(pending).length)schedule();
  }).catch(function(){if(same(turn,token))error=initial?'Nie udało się wczytać postępów konta. Spróbuj ponownie.':'Nie udało się odświeżyć postępów konta.';}).finally(function(){if(!same(turn,token))return;refreshing=false;emit();});
 }
 function reset(){
  serial++;revision=0;clearTimeout(timer);session=api&&api.session();userId=null;username='';state={};pending={};busy=false;refreshing=false;error='';storageOK=true;ready=!session;
  if(!session){state=guest();emit(true);}else{emit(true);load(true);}
 }
 function set(verb,status){if(!ready||!valid.has(verb)||!['hard','known'].includes(status))return;state[verb]=status;revision++;if(session){pending[verb]=status;writePending();schedule();}else writeGuest();emit();}
 function importGuest(){if(!session||!ready)return;var local=guest(),added=0;Object.keys(local).forEach(function(k){if(!state[k]){state[k]=local[k];pending[k]=local[k];added++;}});if(added){revision++;writePending();error='';schedule();emit();}return added;}
 function retry(){if(!session)return;if(!ready)load(true);else if(Object.keys(pending).length)flush();else load(false);}
 window.RJClassProgress={start:function(fn){subscriber=fn;reset();},set:set,importGuest:importGuest,retry:retry};
 window.addEventListener('rj:session-change',reset);window.addEventListener('storage',function(e){if(e.key==='rejson_community_session_v1'||e.key===null)reset();});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&session){if(Object.keys(pending).length)flush();else if(ready)load(false);}});window.setInterval(function(){if(document.visibilityState==='visible'&&session&&ready&&!Object.keys(pending).length)load(false);},30000);
})(window,document);

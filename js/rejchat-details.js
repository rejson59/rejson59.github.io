/* Informacje o odczytach i reakcjach; odczyt rejestrujemy tylko po widoczności. */
(function(window,document){
  'use strict';
  var api=window.RJProfiles,dialog=document.getElementById('rc-message-dialog'),body=document.getElementById('rc-message-details');
  if(!api||!dialog||!body)return;
  var serial=0,seenToken=null,seen=new Set(),since=new Map(),pending=false,retryAt=0;
  function current(){var s=api.session();return s&&s.token;}
  function text(tag,cls,value){var e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value;return e;}
  function close(){serial++;if(dialog.open)dialog.close();}
  document.getElementById('rc-dialog-close').addEventListener('click',close);
  dialog.addEventListener('close',function(){serial++;});
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-message-info]');
    if(!b){if(!e.target.closest('.rc-message-menu'))document.querySelectorAll('.rc-message-menu[open]').forEach(function(d){d.open=false;});return;}
    var token=current(),id=b.dataset.messageId,scope=b.dataset.messageInfo;if(!token||!id)return;
    var seq=++serial;body.replaceChildren(text('p','','Ładowanie…'));if(!dialog.open)dialog.showModal();
    api.rpc('rejchat_message_details',{p_token:token,p_scope:scope,p_id:id}).then(function(data){
      if(seq!==serial||current()!==token||!dialog.open)return;
      body.replaceChildren();var readers=Array.isArray(data.readers)?data.readers:[],reactions=Array.isArray(data.reactions)?data.reactions:[];
      body.appendChild(text('h3','','Odczytali ('+(Number(data.reader_count)||0)+')'));
      body.appendChild(text('p','rc-detail-names',readers.length?readers.map(function(r){return String(r.username);}).join(', ')+(Number(data.reader_count)>readers.length?' i inni':''):'Brak potwierdzonych odczytów.'));
      body.appendChild(text('h3','','Reakcje'));
      if(!reactions.length)body.appendChild(text('p','rc-detail-names','Brak reakcji.'));
      else {var groups={};reactions.forEach(function(r){if(typeof r.emoji!=='string'||typeof r.username!=='string')return;(groups[r.emoji]||(groups[r.emoji]=[])).push(r.username);});Object.keys(groups).forEach(function(emoji){var p=text('p','rc-detail-names',emoji+'  '+groups[emoji].join(', '));body.appendChild(p);});}
      body.appendChild(text('p','rc-detail-foot','Odczyty zapisują się od wprowadzenia tej funkcji. Lista pokazuje maksymalnie 100 osób i 500 reakcji.'));
    }).catch(function(err){if(seq===serial&&current()===token&&dialog.open)body.replaceChildren(text('p','','Nie udało się pobrać szczegółów. Spróbuj ponownie.'));});
  });
  document.addEventListener('click',function(e){var menu=e.target.closest('.rc-message-menu');if(menu&&e.target.closest('button')&&(!e.target.closest('.rc-emoji-picker-ui')&&!e.target.closest('.rc-reaction-expand')||e.target.closest('[data-emoji-choice]')))menu.open=false;});
  document.addEventListener('toggle',function(e){var menu=e.target;if(menu.matches&&menu.matches('.rc-message-menu')&&menu.open)document.querySelectorAll('.rc-message-menu[open]').forEach(function(other){if(other!==menu)other.open=false;});},true);
  function reset(){serial++;if(dialog.open)dialog.close();seenToken=current();seen.clear();since.clear();pending=false;retryAt=0;}
  window.addEventListener('rj:session-change',reset);window.addEventListener('storage',function(e){if(!e.key||e.key==='rejson_community_session_v1')reset();});
  function scan(){
    var token=current();if(token!==seenToken)reset();
    if(!token||document.visibilityState!=='visible'||!document.hasFocus()||document.getElementById('panel-chat').hidden||document.querySelector('dialog[open]')){since.clear();return;}
    var publicView=document.getElementById('chat-public-view'),privateView=document.getElementById('chat-private-view');
    var scope=publicView.hidden?'private':'public',view=scope==='public'?publicView:privateView;
    var list=document.getElementById(scope==='public'?'chat-list':'dm-messages');
    if(view.hidden||!list||!list.clientHeight){since.clear();return;}
    var box=list.getBoundingClientRect(),top=Math.max(0,box.top),bottom=Math.min(window.innerHeight,box.bottom),left=Math.max(0,box.left),right=Math.min(window.innerWidth,box.right),now=Date.now(),visible=new Set(),ready=[];
    if(bottom<=top||right<=left){since.clear();return;}
    list.querySelectorAll(scope==='public'?'[data-chat-id]':'[data-dm-message]').forEach(function(row){
      var id=scope==='public'?row.dataset.chatId:row.dataset.dmMessage,key=scope+':'+id;if(!/^[0-9a-f-]{36}$/i.test(id)||seen.has(key))return;
      var r=row.getBoundingClientRect(),h=Math.max(0,Math.min(bottom,r.bottom)-Math.max(top,r.top)),w=Math.max(0,Math.min(right,r.right)-Math.max(left,r.left));
      if(h<Math.min(80,r.height*.5)||w<Math.min(80,r.width*.5))return;
      visible.add(key);if(!since.has(key))since.set(key,now);if(now-since.get(key)>=800)ready.push(id);
    });
    Array.from(since.keys()).forEach(function(key){if(!visible.has(key))since.delete(key);});
    if(pending||Date.now()<retryAt||!ready.length)return;
    var batch=ready.slice(0,50),captured=token;pending=true;
    api.rpc('rejchat_mark_seen',{p_token:token,p_scope:scope,p_ids:batch}).then(function(){if(current()===captured)batch.forEach(function(id){seen.add(scope+':'+id);since.delete(scope+':'+id);});}).catch(function(){if(current()===captured)retryAt=Date.now()+5000;}).finally(function(){if(current()===captured)pending=false;});
  }
  document.addEventListener('visibilitychange',function(){if(document.visibilityState!=='visible')since.clear();});
  window.addEventListener('blur',function(){since.clear();});
  /* Odczytów nie trzeba liczyć co sekundę: próg to 800 ms widoczności,
     a skanowanie pozycji wszystkich wiadomości wymusza układ strony. */
  if(window.RJNet&&window.RJNet.every){window.RJNet.every('rejchat-reads',2500,function(){scan();});}
  else setInterval(scan,2500);
})(window,document);

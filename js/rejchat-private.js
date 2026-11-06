/* Prywatne rozmowy kont Rejsona. Widok nie udaje szyfrowania end-to-end. */
(function(window,document){
  'use strict';
  var api=window.RJProfiles, view=document.getElementById('chat-private-view'), publicView=document.getElementById('chat-public-view');
  if(!api||!view||!publicView)return;
  var channel=document.getElementById('channel-private'),general=document.getElementById('channel-general'),member=document.getElementById('dm-member'),guest=document.getElementById('dm-guest');
  var inboxEl=document.getElementById('dm-inbox'), navCount=document.getElementById('dm-nav-unread'), status=document.getElementById('dm-status'),threadEl=document.getElementById('dm-thread');
  var messages=document.getElementById('dm-messages'),title=document.getElementById('dm-thread-title'),input=document.getElementById('dm-input');
  var scroll=window.RJChatScroll?window.RJChatScroll.create(messages):null;
  var composeMode=null, draftBeforeEdit='', photoPicker=window.RJChatPhotos && window.RJChatPhotos.picker('dm');
  if(window.RJChatPhotos)window.RJChatPhotos.attach(messages,'private');
  var emojis=['👍','❤️','😂','😮','😢'], inbox=[],selected=null,selectionSeq=0,inboxSeq=0,activeToken=null,threadBusy=false,sendBusy=false,reactBusy=false,lastRender='', olderRows=[],latestRows=[],hasOlder=false,historyBusy=false;
  function session(){return api.session();}
  function same(token){var s=session();return !!s&&s.token===token;}
  function currentToken(){var s=session();return s?s.token:null;}
  function notifyBell(){window.dispatchEvent(new Event('rj:dm-read'));}
  function sync(){var s=session(),token=s?s.token:null;if(token!==activeToken){activeToken=token;selectionSeq++;inboxSeq++;selected=null;inbox=[];threadBusy=false;sendBusy=false;if(photoPicker)photoPicker.disabled(false);reactBusy=false;lastRender='';olderRows=[];latestRows=[];hasOlder=false;historyBusy=false;document.getElementById('dm-send').disabled=false;document.getElementById('dm-older').disabled=false;messages.replaceChildren();if(scroll)scroll.reset();threadEl.hidden=true;input.value='';composeMode=null;if(photoPicker)photoPicker.clear();document.getElementById('dm-compose-context').hidden=true;status.textContent='';document.getElementById('dm-save-status').textContent='';}guest.hidden=!!s;member.hidden=!s;paintInbox();}
  function setActive(privateMode){
    if(privateMode){document.getElementById('chat-tab').click();}
    view.hidden=!privateMode;publicView.hidden=privateMode;
    channel.classList.toggle('is-active',privateMode);channel.setAttribute('aria-pressed',String(privateMode));if(privateMode){general.classList.remove('is-active');general.setAttribute('aria-pressed','false');var links=document.getElementById('channel-links');if(links){links.classList.remove('is-active');links.setAttribute('aria-pressed','false');}}
  }
  function show(){setActive(true);sync();if(session()){refreshInbox();if(selected)loadThread();}}
  function formatTime(value){var d=new Date(value);return isNaN(d)?'':d.toLocaleString('pl-PL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
  function paintInbox(){
    inboxEl.replaceChildren();var total=0;
    inbox.forEach(function(row){if(!row||!row.id||!row.username)return;total+=Math.max(0,Number(row.unread)||0);var b=document.createElement('button');b.type='button';b.className='dm-conversation';b.dataset.thread=row.id;b.setAttribute('aria-pressed',String(row.id===selected));var name=document.createElement('span');name.dataset.profileName=row.username;name.textContent=row.username;b.appendChild(name);if(row.unread)b.appendChild(document.createTextNode(' · '+row.unread));inboxEl.appendChild(b);});
    api.hydrate(inboxEl);
    navCount.hidden=!total;navCount.textContent=total>99?'99+':String(total);
  }
  function refreshInbox(){
    var s=session();if(!s)return Promise.resolve();var token=s.token,seq=++inboxSeq;
    return api.rpc('rejchat_dm_inbox',{p_token:token}).then(function(rows){if(seq!==inboxSeq||!same(token)||!Array.isArray(rows))return;inbox=rows;paintInbox();}).catch(function(){if(seq===inboxSeq&&same(token)&&!view.hidden)status.textContent='Nie udało się odświeżyć rozmów. Spróbuj ponownie.';});
  }
  function appendText(el,content){
    var text=String(content||''), regex=/(?:https?:\/\/|www\.)[^\s<>"']+/g,last=0,m;
    while((m=regex.exec(text))){el.appendChild(document.createTextNode(text.slice(last,m.index)));var raw=m[0],suffix='';while(/[.,!?;:)\]]$/.test(raw)){suffix=raw.slice(-1)+suffix;raw=raw.slice(0,-1);}var a=document.createElement('a');a.className='comm-link';a.href=/^https?:\/\//i.test(raw)?raw:'https://'+raw;a.target='_blank';a.rel='noopener noreferrer nofollow';a.textContent=raw;el.appendChild(a);if(suffix)el.appendChild(document.createTextNode(suffix));last=m.index+m[0].length;}
    el.appendChild(document.createTextNode(text.slice(last)));
  }
  function render(rows){
    var signature=JSON.stringify(rows);if(signature===lastRender)return;lastRender=signature;
    var position=scroll?scroll.capture():{following:messages.scrollHeight-messages.scrollTop-messages.clientHeight<48,top:messages.scrollTop};
    messages.replaceChildren();
    if(!rows.length){var empty=document.createElement('p');empty.className='comm-chat-empty';empty.textContent='Napisz pierwszą wiadomość w tej rozmowie.';messages.appendChild(empty);}
    rows.forEach(function(m){
      var row=document.createElement('div');row.className='chat-msg'+(m.mine?' is-mine':'');row.dataset.dmMessage=m.id;
      var bubble=document.createElement('div');bubble.className='chat-bubble';var meta=document.createElement('div');meta.className='chat-meta';var author=document.createElement('strong');author.textContent=m.author_name;author.dataset.profileName=m.author_name;var time=document.createElement('span');time.className='chat-time mono';time.textContent=formatTime(m.created_at);meta.append(author,time);
      if(m.reply){var quote=document.createElement('div');quote.className='rejchat-reply-quote';quote.textContent='↩ '+m.reply.author_name+': '+m.reply.content;bubble.appendChild(quote);}
      var text=document.createElement('p');text.className='chat-text';appendText(text,m.content);bubble.prepend(meta);bubble.appendChild(text);
      if(m.photo && window.RJChatPhotos){var photo=document.createElement('div');photo.innerHTML=window.RJChatPhotos.button(m.photo);bubble.appendChild(photo);}
      if(m.edited_at){var edited=document.createElement('span');edited.className='rejchat-edited';edited.textContent='Edytowano';bubble.appendChild(edited);}
      var reply=document.createElement('button');reply.type='button';reply.className='rejchat-message-action';reply.dataset.dmReply=m.id;reply.textContent='Odpowiedz';bubble.appendChild(reply);
      ['text'].concat(m.photo && Date.parse(m.photo.expires_at)>Date.now()?['photo']:[]).forEach(function(part){var save=document.createElement('button');save.type='button';save.className='rejchat-message-action';save.dataset.saveSejf=part;save.dataset.saveScope='private';save.dataset.saveMessage=m.id;save.textContent=part==='photo'?'Zapisz zdjęcie w RejSejfie':'Zapisz tekst w RejSejfie';if(part==='photo')save.title='Kopia w Sejfie nie wygaśnie po 14 dniach';bubble.appendChild(save);});
      if(m.mine){var edit=document.createElement('button');edit.type='button';edit.className='rejchat-message-action';edit.dataset.dmEdit=m.id;edit.textContent='Edytuj';bubble.appendChild(edit);}
      var reactions=document.createElement('div');reactions.className='rejchat-reactions';reactions.setAttribute('aria-label','Reakcje na wiadomość');
      emojis.forEach(function(emoji){var r=(Array.isArray(m.reactions)?m.reactions:[]).find(function(x){return x.emoji===emoji;});var b=document.createElement('button');b.type='button';b.className='rejchat-reaction';b.dataset.dmReaction=emoji;b.setAttribute('aria-pressed',String(!!(r&&r.mine)));b.setAttribute('aria-label','Reakcja '+emoji+(r?' · '+r.count:''));b.textContent=emoji+(r&&r.count?' '+r.count:'');reactions.appendChild(b);});bubble.appendChild(reactions);row.appendChild(bubble);messages.appendChild(row);
    });
    api.hydrate(messages);
    if(scroll)scroll.restore(position);else if(position.following)messages.scrollTop=messages.scrollHeight;else messages.scrollTop=position.top;
  }
  function loadThread(){
    var s=session();if(!s||!selected||view.hidden||document.getElementById('panel-chat').hidden||threadBusy)return Promise.resolve();
    var token=s.token,id=selected,seq=selectionSeq;threadBusy=true;
    return api.rpc('rejchat_dm_list_v2',{p_token:token,p_thread_id:id}).then(function(data){
      if(!same(token)||seq!==selectionSeq||id!==selected||!data||!Array.isArray(data.messages))return;
      title.textContent='Rozmowa z '+data.username;document.getElementById('dm-rejfile').href=api.safeName(data.username)?'/rejfile#odbiorca='+encodeURIComponent(data.username):'/rejfile';threadEl.hidden=false;status.textContent='';if(olderRows.length){var ids=data.messages.map(function(m){return m.id;});var oldIds=olderRows.map(function(m){return m.id;});olderRows=olderRows.concat(latestRows.filter(function(m){return ids.indexOf(m.id)<0 && oldIds.indexOf(m.id)<0;}));}latestRows=data.messages;if(!olderRows.length)hasOlder=latestRows.length===100;document.getElementById('dm-older').hidden=!hasOlder;render(olderRows.concat(latestRows));
      var unread=inbox.some(function(x){return x.id===id&&Number(x.unread)>0;});if(unread){inbox.forEach(function(x){if(x.id===id)x.unread=0;});paintInbox();notifyBell();}
    }).catch(function(err){if(same(token)&&seq===selectionSeq)status.textContent=err.message||'Nie udało się wczytać rozmowy.';}).finally(function(){if(seq===selectionSeq)threadBusy=false;});
  }
  function select(id){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id||'')))return;selected=id;selectionSeq++;threadBusy=false;historyBusy=false;sendBusy=false;if(photoPicker)photoPicker.disabled(false);reactBusy=false;document.getElementById('dm-send').disabled=false;document.getElementById('dm-older').disabled=false;olderRows=[];latestRows=[];hasOlder=false;lastRender='';document.getElementById('dm-save-status').textContent='';composeMode=null;input.value='';if(photoPicker)photoPicker.clear();document.getElementById('dm-compose-context').hidden=true;messages.replaceChildren();if(scroll)scroll.reset();threadEl.hidden=true;paintInbox();history.replaceState(null,'',location.pathname+location.search+'#rozmowa='+encodeURIComponent(id));loadThread();}
  document.getElementById('dm-older').addEventListener('click',function(){
    var s=session(),first=(olderRows.length?olderRows:latestRows)[0];if(!s||!selected||!first||historyBusy)return;
    var token=s.token,id=selected,seq=selectionSeq,oldHeight=messages.scrollHeight,oldTop=messages.scrollTop;historyBusy=true;this.disabled=true;
    api.rpc('rejchat_dm_history_v2',{p_token:token,p_thread_id:id,p_before:first.created_at,p_before_id:first.id}).then(function(rows){
      if(!same(token)||seq!==selectionSeq||!Array.isArray(rows))return;
      hasOlder=rows.length===100;document.getElementById('dm-older').hidden=!hasOlder;olderRows=rows.concat(olderRows);lastRender='';render(olderRows.concat(latestRows));if(!scroll)messages.scrollTop=oldTop+messages.scrollHeight-oldHeight;notifyBell();
    }).catch(function(err){if(same(token)&&seq===selectionSeq)status.textContent=err.message||'Nie udało się wczytać starszych wiadomości.';}).finally(function(){if(same(token)&&seq===selectionSeq){historyBusy=false;document.getElementById('dm-older').disabled=false;}});
  });
  function openUser(username){
    var s=session();show();if(!s)return;var token=s.token,seq=++selectionSeq;threadBusy=false;historyBusy=false;sendBusy=false;if(photoPicker)photoPicker.disabled(false);reactBusy=false;document.getElementById('dm-send').disabled=false;document.getElementById('dm-older').disabled=false;status.textContent='Otwieranie rozmowy…';
    api.rpc('rejchat_dm_open',{p_token:token,p_username:String(username||'').trim()}).then(function(data){if(!same(token)||seq!==selectionSeq)return;if(!data||!data.id)throw new Error('Nie udało się otworzyć rozmowy.');status.textContent='';select(data.id);refreshInbox();}).catch(function(err){if(same(token)&&seq===selectionSeq)status.textContent=err.message||'Nie udało się otworzyć rozmowy.';});
  }
  channel.addEventListener('click',function(){show();history.replaceState(null,'',location.pathname+location.search+'#rozmowy');});
  inboxEl.addEventListener('click',function(e){var b=e.target.closest('[data-thread]');if(b)select(b.dataset.thread);});
  document.getElementById('dm-new-form').addEventListener('submit',function(e){e.preventDefault();openUser(document.getElementById('dm-username').value);});
  input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();if(!sendBusy)document.getElementById('dm-send-form').requestSubmit();}});
  input.addEventListener('input',function(){document.getElementById('dm-length').textContent=input.value.length+' / 1000 znaków · Enter — wyślij, Shift+Enter — nowa linia';});
  document.getElementById('dm-send-form').addEventListener('submit',function(e){
    e.preventDefault();var s=session(),content=input.value.trim(),file=photoPicker&&photoPicker.file();if(!s||!selected||(!content&&!file)||sendBusy)return;
    if(file&&composeMode&&composeMode.kind==='edit'){status.textContent='Podczas edycji usuń wybrane nowe zdjęcie. Istniejące zdjęcie pozostanie przy wiadomości.';return;}
    var token=s.token,id=selected,seq=selectionSeq;sendBusy=true;document.getElementById('dm-send').disabled=true;if(photoPicker)photoPicker.disabled(true);status.textContent='';
    var mode=composeMode,fn=mode&&mode.kind==='edit'?'rejchat_message_edit':'rejchat_dm_send_v2',args=mode&&mode.kind==='edit'?{p_token:token,p_scope:'private',p_id:mode.id,p_content:content}:{p_token:token,p_thread_id:id,p_content:content,p_reply_to:mode&&mode.id||null};
    var sending=file?window.RJChatPhotos.read(file).then(function(data){if(!same(token)||seq!==selectionSeq||id!==selected)throw new Error('Rozmowa została zmieniona. Zdjęcie nie zostało wysłane.');return api.rpc('rejchat_send_photo',{p_token:token,p_scope:'private',p_room:null,p_thread_id:id,p_content:content,p_reply_to:mode&&mode.id||null,p_mime:data.mime,p_data_base64:data.data});}):api.rpc(fn,args);
    sending.then(function(){if(!same(token)||seq!==selectionSeq)return;if(input.value.trim()===content){input.value=mode&&mode.kind==='edit'?draftBeforeEdit:'';input.dispatchEvent(new Event('input'));}if(file&&photoPicker.file()===file)photoPicker.clear();if(composeMode===mode){composeMode=null;document.getElementById('dm-compose-context').hidden=true;}
      if(mode&&mode.kind==='edit'){olderRows.forEach(function(m){if(m.id===mode.id){m.content=content;m.edited_at=true;}if(m.reply&&m.reply.id===mode.id)m.reply.content=content.slice(0,140);});}
      lastRender='';render(olderRows.concat(latestRows));loadThread();refreshInbox();}).catch(function(err){if(same(token)&&seq===selectionSeq)status.textContent=err.message||'Nie udało się wysłać wiadomości.';}).finally(function(){if(same(token)&&seq===selectionSeq){sendBusy=false;document.getElementById('dm-send').disabled=false;if(photoPicker)photoPicker.disabled(false);}});
  });
  document.getElementById('dm-compose-cancel').addEventListener('click',function(){if(composeMode&&composeMode.kind==='edit')input.value=draftBeforeEdit;composeMode=null;document.getElementById('dm-compose-context').hidden=true;input.dispatchEvent(new Event('input'));input.focus();});
  messages.addEventListener('click',function(e){var b=e.target.closest('[data-dm-reply],[data-dm-edit]');if(!b||!session()||sendBusy)return;var edit=b.hasAttribute('data-dm-edit'),id=edit?b.dataset.dmEdit:b.dataset.dmReply,m=olderRows.concat(latestRows).find(function(x){return x.id===id;});if(!m)return;if(composeMode&&composeMode.kind==='edit')input.value=draftBeforeEdit;composeMode={kind:edit?'edit':'reply',id:id};if(edit){draftBeforeEdit=input.value;input.value=m.content;}document.getElementById('dm-compose-label').textContent=edit?'Edytujesz wiadomość':'Odpowiadasz: '+m.author_name+' — '+m.content.slice(0,100);document.getElementById('dm-compose-context').hidden=false;input.dispatchEvent(new Event('input'));input.focus();});
  messages.addEventListener('click',function(e){var b=e.target.closest('[data-dm-reaction]'),s=session();if(!b||!s||reactBusy)return;var row=b.closest('[data-dm-message]');if(!row)return;var token=s.token,seq=selectionSeq;reactBusy=true;b.disabled=true;api.rpc('rejchat_react',{p_token:token,p_scope:'private',p_message_id:row.dataset.dmMessage,p_emoji:b.dataset.dmReaction}).then(function(result){if(same(token)&&seq===selectionSeq){var old=olderRows.find(function(m){return m.id===row.dataset.dmMessage;});if(old){var r=(old.reactions||[]).find(function(x){return x.emoji===b.dataset.dmReaction;});if(!r){r={emoji:b.dataset.dmReaction,count:0,mine:false};(old.reactions||(old.reactions=[])).push(r);}r.count=Math.max(0,r.count+(result.active?1:-1));r.mine=!!result.active;if(!r.count)old.reactions=old.reactions.filter(function(x){return x!==r;});lastRender='';render(olderRows.concat(latestRows));}else{lastRender='';loadThread();}}}).catch(function(err){if(same(token)&&seq===selectionSeq)status.textContent=err.message||'Nie udało się zapisać reakcji.';}).finally(function(){if(same(token)&&seq===selectionSeq){reactBusy=false;if(b.isConnected)b.disabled=false;}});});
  function hash(){var match=location.hash.match(/^#rozmowa=([0-9a-f-]{36})$/i);if(match){show();select(match[1]);}else if(location.hash==='#rozmowy'){show();history.replaceState(null,'',location.pathname+location.search+'#rozmowy');}}
  window.addEventListener('hashchange',hash);window.addEventListener('rj:dm-open-user',function(e){openUser(e.detail);});
  window.addEventListener('rj:session-change',function(){sync();if(session())refreshInbox();hash();});
  window.addEventListener('storage',function(e){if(e.key==='rejson_community_session_v1'||e.key===null){sync();if(session())refreshInbox();}});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&!view.hidden){refreshInbox();loadThread();}});
  setInterval(function(){if(document.visibilityState==='visible'&&!view.hidden){refreshInbox();loadThread();}},3000);
  sync();hash();
})(window,document);

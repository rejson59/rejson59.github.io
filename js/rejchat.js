/* Zakładki RejChat i filtrowanie tylko aktualnie wczytanych wiadomości. */
(function(){
  'use strict';
  var tabs=[document.getElementById('chat-tab'),document.getElementById('posts-tab')];
  var panels=[document.getElementById('panel-chat'),document.getElementById('panel-posts')];
  if(!tabs[0]||!tabs[1])return;
  var publicRoom='general';
  function activate(index,focus,updateHash){
    tabs.forEach(function(tab,i){tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;panels[i].hidden=i!==index;});
    var privateView=document.getElementById('chat-private-view'), isPrivate=privateView&&!privateView.hidden;
    [['channel-general',index===0&&!isPrivate&&publicRoom==='general'],['channel-links',index===0&&!isPrivate&&publicRoom==='links'],['channel-private',index===0&&isPrivate]].forEach(function(pair){var el=document.getElementById(pair[0]);if(el){el.classList.toggle('is-active',pair[1]);el.setAttribute('aria-pressed',String(pair[1]));}});
    if(focus)tabs[index].focus();
    if(updateHash && history.replaceState){history.replaceState(null,'',location.pathname+location.search+(index?'#wpisy':isPrivate?'#rozmowy':publicRoom==='links'?'#linki':'#czat'));window.dispatchEvent(new Event('rj:tab-change'));}
  }
  tabs.forEach(function(tab,i){
    tab.addEventListener('click',function(){activate(i,false,true);});
    tab.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key==='Home'||e.key==='End'){e.preventDefault();activate(e.key==='Home'?0:e.key==='End'?1:1-i,true,true);}});
  });
  function openRoom(room,updateHash){
    publicRoom=room;document.getElementById('chat-private-view').hidden=true;document.getElementById('chat-public-view').hidden=false;
    activate(0,false,false);if(updateHash)history.replaceState(null,'',location.pathname+location.search+(room==='links'?'#linki':'#czat'));
    window.dispatchEvent(new CustomEvent('rj:room-change',{detail:room}));window.dispatchEvent(new Event('rj:dm-hide'));
  }
  function hash(){
    if(location.hash==='#czat'||location.hash==='#linki')openRoom(location.hash==='#linki'?'links':'general',false);
    activate(location.hash==='#wpisy'||/^#powiadomienie=[0-9a-f-]{36}$/i.test(location.hash)?1:0,false,false);
  }
  window.addEventListener('hashchange',hash);
  var channel=document.getElementById('channel-general'),links=document.getElementById('channel-links');
  if(channel)channel.addEventListener('click',function(){openRoom('general',true);});
  if(links)links.addEventListener('click',function(){openRoom('links',true);});
  hash();
  var dialog=document.getElementById('chat-auth-dialog'),join=document.getElementById('chat-join'),fallback=document.getElementById('chat-join-fallback'),close=document.getElementById('chat-auth-close');
  if(dialog && join && typeof dialog.showModal==='function'){
    join.hidden=false;if(fallback)fallback.hidden=true;
    join.addEventListener('click',function(){if(!dialog.open)dialog.showModal();var name=document.getElementById('auth-username');if(name)name.focus();});
    if(close)close.addEventListener('click',function(){dialog.close();join.focus();});
    dialog.addEventListener('click',function(e){if(e.target===dialog){dialog.close();join.focus();}});
  }
  // Jednorazowy szkic w tej karcie. Żaden plik ani wiadomość nie jest wysyłana automatycznie.
  var draftKey='rejfile_chat_draft_v1', draftBox=document.getElementById('file-draft'), draftStatus=document.getElementById('file-draft-status');
  function readFileDraft(){
    try {
      var d=JSON.parse(sessionStorage.getItem(draftKey)||'null');
      if(!d) return null;
      if(typeof d.link!=='string' || typeof d.at!=='number' || typeof d.expires!=='number'){sessionStorage.removeItem(draftKey);return null;}
      var age=Date.now()-d.at, u=new URL(d.link);
      if(age<0 || age>30*60*1000 || d.expires<=Date.now() || u.origin!==location.origin || u.username || u.password || u.href!==d.link || u.pathname!=='/rejfile' || u.search || !/^#f=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/i.test(u.hash)){sessionStorage.removeItem(draftKey);return null;}
      return d;
    } catch (_) { try{sessionStorage.removeItem(draftKey);}catch(e){} return null; }
  }
  function showDraft(){ if(draftBox)draftBox.hidden=!readFileDraft(); }
  if(draftBox){
    showDraft();
    var firstDraft=readFileDraft();
    if(firstDraft) setTimeout(showDraft, Math.max(1,Math.min(firstDraft.at+30*60*1000,firstDraft.expires)-Date.now()+1));
    document.getElementById('file-draft-add').addEventListener('click',function(){
      var d=readFileDraft(), form=document.getElementById('chat-form'), field=document.getElementById('chat-input');
      if(!d){draftBox.hidden=true;return;}
      if(!form || form.hidden){draftStatus.textContent='Zaloguj się, aby przygotować wiadomość na czacie.';return;}
      var text=field.value||'', next=text+(text && !/\s$/.test(text) ? ' ' : '')+(d.kind==='note'?'Notatka z RejFile: ':'Plik z RejFile: ')+d.link;
      if(next.length>field.maxLength){draftStatus.textContent='W wiadomości nie ma miejsca na link. Skróć tekst i spróbuj ponownie.';return;}
      field.value=next; field.dispatchEvent(new Event('input',{bubbles:true}));
      try{sessionStorage.removeItem(draftKey);}catch(_){}
      draftBox.hidden=true; field.focus();
    });
    document.getElementById('file-draft-discard').addEventListener('click',function(){try{sessionStorage.removeItem(draftKey);}catch(_){}draftBox.hidden=true;});
  }
  var input=document.getElementById('chat-search'),list=document.getElementById('chat-list'),status=document.getElementById('chat-search-status');
  function filter(){
    var q=input.value.trim().toLocaleLowerCase('pl'), count=0,all=0,changed=false;
    list.querySelectorAll('.chat-msg').forEach(function(row){
      all++;
      var fullLinks=Array.from(row.querySelectorAll('.chat-text a[title]')).map(function(a){return a.title;}).join(' ');
      var show=!q||(row.textContent+' '+fullLinks).toLocaleLowerCase('pl').indexOf(q)>=0;
      var wantHidden=!show;
      if(row.hidden!==wantHidden){row.hidden=wantHidden;changed=true;}
      if(show)count++;
    });
    /* Bez wpisanej frazy i bez ukrytych wierszy nie ma czego przeliczać —
       wcześniej każda nowa wiadomość uruchamiała pełny przebieg po DOM. */
    if(!q&&!changed)return;
    if(window.RJChatMessageUI)window.RJChatMessageUI.group(list);
    status.textContent=q?'Pasuje '+count+' z '+all+' wczytanych wiadomości.':'Widoczne są ostatnie wczytane wiadomości.';
  }
  var filterFrame=0;
  function scheduleFilter(){if(filterFrame)return;filterFrame=requestAnimationFrame(function(){filterFrame=0;filter();});}
  var searchToggle=document.getElementById('chat-search-toggle'),searchPanel=document.getElementById('chat-search-panel');
  function closeSearch(){searchPanel.hidden=true;searchToggle.setAttribute('aria-expanded','false');if(input.value){input.value='';filter();}searchToggle.focus();}
  searchToggle.addEventListener('click',function(){if(searchPanel.hidden){searchPanel.hidden=false;searchToggle.setAttribute('aria-expanded','true');input.focus();}else closeSearch();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!searchPanel.hidden&&searchPanel.contains(document.activeElement)){e.preventDefault();closeSearch();}});
  input.addEventListener('input',filter);
  new MutationObserver(scheduleFilter).observe(list,{childList:true});filter();
})();

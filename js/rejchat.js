/* Zakładki RejChat i filtrowanie tylko aktualnie wczytanych wiadomości. */
(function(){
  'use strict';
  var tabs=[document.getElementById('chat-tab'),document.getElementById('posts-tab')];
  var panels=[document.getElementById('panel-chat'),document.getElementById('panel-posts')];
  if(!tabs[0]||!tabs[1])return;
  function activate(index,focus,updateHash){
    tabs.forEach(function(tab,i){tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;panels[i].hidden=i!==index;});
    if(focus)tabs[index].focus();
    if(updateHash && history.replaceState)history.replaceState(null,'',location.pathname+location.search+(index?'#wpisy':'#czat'));
  }
  tabs.forEach(function(tab,i){
    tab.addEventListener('click',function(){activate(i,false,true);});
    tab.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.key==='Home'||e.key==='End'){e.preventDefault();activate(e.key==='Home'?0:e.key==='End'?1:1-i,true,true);}});
  });
  function hash(){activate(location.hash==='#wpisy'?1:0,false,false);}
  window.addEventListener('hashchange',hash);hash();
  var channel=document.getElementById('channel-general');
  if(channel)channel.addEventListener('click',function(){activate(0,false,true);});
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
      var text=field.value||'', next=text+(text && !/\s$/.test(text) ? ' ' : '')+'Plik z RejFile: '+d.link;
      if(next.length>field.maxLength){draftStatus.textContent='W wiadomości nie ma miejsca na link. Skróć tekst i spróbuj ponownie.';return;}
      field.value=next; field.dispatchEvent(new Event('input',{bubbles:true}));
      try{sessionStorage.removeItem(draftKey);}catch(_){}
      draftBox.hidden=true; field.focus();
    });
    document.getElementById('file-draft-discard').addEventListener('click',function(){try{sessionStorage.removeItem(draftKey);}catch(_){}draftBox.hidden=true;});
  }
  var input=document.getElementById('chat-search'),list=document.getElementById('chat-list'),status=document.getElementById('chat-search-status');
  function filter(){
    var q=input.value.trim().toLocaleLowerCase('pl'), count=0,all=0;
    list.querySelectorAll('.chat-msg').forEach(function(row){all++;var show=!q||row.textContent.toLocaleLowerCase('pl').indexOf(q)>=0;row.hidden=!show;if(show)count++;});
    status.textContent=q?'Pasuje '+count+' z '+all+' wczytanych wiadomości.':'Widoczne są ostatnie wczytane wiadomości.';
  }
  input.addEventListener('input',filter);
  new MutationObserver(filter).observe(list,{childList:true});filter();
})();

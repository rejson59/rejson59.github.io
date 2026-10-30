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
  var input=document.getElementById('chat-search'),list=document.getElementById('chat-list'),status=document.getElementById('chat-search-status');
  function filter(){
    var q=input.value.trim().toLocaleLowerCase('pl'), count=0,all=0;
    list.querySelectorAll('.chat-msg').forEach(function(row){all++;var show=!q||row.textContent.toLocaleLowerCase('pl').indexOf(q)>=0;row.hidden=!show;if(show)count++;});
    status.textContent=q?'Pasuje '+count+' z '+all+' wczytanych wiadomości.':'Widoczne są ostatnie wczytane wiadomości.';
  }
  input.addEventListener('input',filter);
  new MutationObserver(filter).observe(list,{childList:true});filter();
})();

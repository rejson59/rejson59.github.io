/* Reakcje na publiczny czat; serwer przechowuje tylko rzeczywiste wybory kont. */
(function(window,document){
  'use strict';
  var list=document.getElementById('chat-list'), api=window.RJProfiles;
  if(!list || !api)return;
  var busy=false, seq=0, cache={};
  function session(){return api.session();}
  function same(token){var s=session();return (s?s.token:null)===token;}
  function ids(){return Array.from(list.querySelectorAll('[data-chat-id]')).map(function(el){return el.getAttribute('data-chat-id');}).filter(function(id){return /^[0-9a-f-]{36}$/i.test(id);}).slice(-100);}
  function paint(){
    var s=session();
    list.querySelectorAll('[data-chat-id]').forEach(function(row){
      var bubble=row.querySelector('.chat-bubble'), id=row.getAttribute('data-chat-id');if(!bubble||!window.RJChatMessageUI)return;
      window.RJChatMessageUI.reactions(bubble,cache[id]||[],'public',!!s);
    });
  }
  function refresh(){
    var selected=ids(), s=session(), token=s?s.token:null, current=++seq;if(!selected.length||!token){cache={};paint();return;}
    api.rpc('rejchat_reactions_list',{p_ids:selected,p_token:token}).then(function(rows){if(current!==seq||!same(token)||!Array.isArray(rows))return;cache={};rows.forEach(function(r){if(selected.indexOf(String(r.message_id))<0||typeof r.emoji!=='string'||r.emoji.length>40)return;(cache[r.message_id]||(cache[r.message_id]=[])).push(r);});paint();}).catch(function(){ /* nie udajemy nowego stanu przy błędzie */ });
  }
  list.addEventListener('click',function(e){var button=e.target.closest('[data-reaction]'),s=session();if(!button||!s||busy)return;var row=button.closest('[data-chat-id]');if(!row)return;busy=true;button.disabled=true;var token=s.token;api.rpc('rejchat_react',{p_token:token,p_scope:'public',p_message_id:row.getAttribute('data-chat-id'),p_emoji:button.dataset.reaction}).then(function(){if(same(token))refresh();}).catch(function(err){if(same(token)){var status=document.getElementById('chat-send-status');if(status)status.textContent=err.message||'Nie udało się zapisać reakcji.';}}).finally(function(){busy=false;if(button.isConnected)button.disabled=!session();});});
  new MutationObserver(function(){paint();refresh();}).observe(list,{childList:true});
  window.addEventListener('rj:session-change',function(){seq++;cache={};paint();refresh();});
  window.addEventListener('storage',function(e){if(e.key==='rejson_community_session_v1'||e.key===null){seq++;cache={};paint();refresh();}});
  setInterval(function(){if(document.visibilityState==='visible'&&!document.getElementById('chat-public-view').hidden)refresh();},4000);
  paint();refresh();
})(window,document);

/* Wizualne grupowanie, reakcje i menu rozmów; nie zmienia treści wiadomości. */
(function(window,document){
  'use strict';
  var emojis=['👍','❤️','😂','😮','😢'];
  function shortLink(raw){
    if(raw.length<=65)return raw;
    try { var url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
      if(!/^https?:$/.test(url.protocol)||url.username||url.password)return raw;
      var path=url.pathname==='/'?'':url.pathname, shortened=path.length>36?path.slice(0,35)+'…':path;
      return url.protocol+'//'+url.host+shortened+((url.search||url.hash)?'…':'');
    } catch(e){return raw;}
  }
  function group(list){
    var previous=null;
    Array.prototype.forEach.call(list.children,function(row){
      if(row.hidden||!row.matches('[data-chat-id],[data-dm-message]')){previous=null;return;}
      var time=Number(row.dataset.messageTime), author=row.dataset.messageAuthor, same=previous&&author&&author===previous.author&&time&&previous.time&&time>=previous.time&&time-previous.time<=300000&&new Date(time).toDateString()===new Date(previous.time).toDateString();
      row.classList.toggle('is-grouped',!!same); previous={author:author,time:time};
    });
  }
  function observe(list){if(!list)return;new MutationObserver(function(){group(list);}).observe(list,{childList:true});group(list);}
  observe(document.getElementById('chat-list'));observe(document.getElementById('dm-messages'));
  function reactions(bubble,rows,scope,enabled){
    /* Podsumowanie reakcji jest wierszem dymka (order: 3), nie nagłówka:
       nazwa i godzina są teraz zwykłym wierszem w środku dymka. */
    var menu=bubble.querySelector('.rc-menu-items');if(!menu)return;
    rows=Array.isArray(rows)?rows:[];
    var picker=menu.querySelector('.rc-reaction-picker'),summary=bubble.querySelector('.rc-reaction-summary');
    if(!picker){picker=document.createElement('div');picker.className='rc-reaction-picker';picker.setAttribute('aria-label','Dodaj lub usuń reakcję');menu.prepend(picker);}
    if(!summary){summary=document.createElement('span');summary.className='rc-reaction-summary';summary.setAttribute('aria-label','Dodane reakcje');bubble.appendChild(summary);}
    var signature=JSON.stringify([rows,enabled,scope]);if(picker.dataset.signature===signature)return;picker.dataset.signature=signature;picker.replaceChildren();summary.replaceChildren();var prior=menu.querySelector('.rc-reaction-full');if(prior)prior.remove();
    function button(emoji,r,compact){var b=document.createElement('button');b.type='button';b.className='rejchat-reaction'+(compact?' rc-reaction-count':'');b.dataset[scope==='public'?'reaction':'dmReaction']=emoji;b.setAttribute('aria-pressed',String(!!(r&&r.mine)));b.setAttribute('aria-label','Reakcja '+emoji+(r?' · '+r.count:''));b.disabled=!enabled;b.title=enabled?'Dodaj lub usuń reakcję':'Zaloguj się, aby reagować';b.textContent=emoji+(compact?' '+r.count:'');return b;}
    emojis.forEach(function(emoji){var r=rows.find(function(x){return x.emoji===emoji&&Number(x.count)>0;});picker.appendChild(button(emoji,r,false));});
    var expand=document.createElement('button');expand.type='button';expand.className='rc-reaction-expand';expand.textContent='＋';expand.setAttribute('aria-label','Wybierz inną emotkę');expand.setAttribute('aria-expanded','false');picker.appendChild(expand);
    var full=document.createElement('div');full.className='rc-reaction-full';full.hidden=true;menu.insertBefore(full,picker.nextSibling);
    expand.addEventListener('click',function(){full.hidden=!full.hidden;expand.setAttribute('aria-expanded',String(!full.hidden));if(!full.hidden&&window.RJEmojiPicker)window.RJEmojiPicker.mount(full,function(){},{reaction:true,scope:scope});menu.dispatchEvent(new CustomEvent('rj:emoji-picker-resize',{bubbles:true}));});
    rows.forEach(function(r){if(typeof r.emoji==='string'&&r.emoji.length<=40&&Number(r.count)>0)summary.appendChild(button(r.emoji,r,true));});
    summary.hidden=!summary.children.length;
  }
  /* Popover jest w warstwie górnej — lista wiadomości nie przycina menu. */
  var active=null, supportsPopover=typeof HTMLElement.prototype.showPopover==='function';
  function close(restoreFocus){if(!active)return;var menu=active,summary=menu.querySelector('summary'),panel=menu.querySelector('.rc-menu-items');active=null;if(supportsPopover&&panel&&panel.matches(':popover-open'))panel.hidePopover();if(panel)panel.classList.remove('rc-menu-fixed');menu.open=false;if(restoreFocus&&summary&&summary.isConnected)summary.focus();}
  function position(menu){
    var panel=menu.querySelector('.rc-menu-items'),anchor=menu.querySelector('summary');if(!panel||!anchor)return;
    var r=anchor.getBoundingClientRect(),width=Math.min(280,window.innerWidth-16);panel.style.width=width+'px';
    var h=panel.getBoundingClientRect().height,left=Math.max(8,Math.min(window.innerWidth-width-8,r.right-width)),below=window.innerHeight-r.bottom-8,above=r.top-8,top;
    if(below>=h+5)top=r.bottom+5;else if(above>=h+5)top=r.top-h-5;else top=Math.max(8,Math.min(window.innerHeight-h-8,r.top-h/2));
    panel.style.left=left+'px';panel.style.top=Math.max(8,top)+'px';
  }
  document.addEventListener('toggle',function(e){var menu=e.target;if(!menu.matches||!menu.matches('.rc-message-menu'))return;
    if(!menu.open){if(active===menu)close(false);return;}
    if(active&&active!==menu)close(false);active=menu;
    if(menu.isConnected){var panel=menu.querySelector('.rc-menu-items');if(supportsPopover){panel.setAttribute('popover','manual');try{panel.showPopover();}catch(_){panel.removeAttribute('popover');panel.classList.add('rc-menu-fixed');}}else panel.classList.add('rc-menu-fixed');position(menu);}
  },true);
  document.addEventListener('rj:emoji-picker-resize',function(){if(active)requestAnimationFrame(function(){if(active)position(active);});});
  document.addEventListener('click',function(e){if(active&&!active.contains(e.target))close(false);});
  document.addEventListener('keydown',function(e){if(e.key!=='Escape')return;var menu=active||document.querySelector('.rc-message-menu[open]');if(menu){active=menu;e.preventDefault();e.stopPropagation();close(true);}},true);
  window.addEventListener('resize',function(){if(active)position(active);});
  document.addEventListener('scroll',function(e){if(active){var r=active.querySelector('summary').getBoundingClientRect(),list=active.closest('.comm-chat-list'),bounds=list&&list.getBoundingClientRect();if(r.bottom<=0||r.top>=window.innerHeight||(bounds&&(r.bottom<=bounds.top||r.top>=bounds.bottom)))close(false);else position(active);}},true);
  window.RJChatMessageUI={shortLink:shortLink,reactions:reactions,group:group};
})(window,document);

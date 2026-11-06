/* Własny wybór emotek dla każdego pola wiadomości, także bez systemowego pickera. */
(function(window,document){
  'use strict';
  var groups={
    'Buźki':['😀','😃','😄','😁','😆','😅','😂','🤣','😊','🙂','🙃','😉','😍','🥰','😘','😋','😎','🤩','🥳','🤔','🫡','😐','😅','😴','😢','😭','😮','😱','😡','🤯','🤗','🫠','😇','🤭','🫣','🙄','😜','😏','🤤','🤒'],
    'Gesty':['👍','👎','👏','🙌','🤝','👋','✌️','🤞','🤟','🤘','👌','🤌','🫶','💪','🙏','👀','💬','💯','✅','❌','✨','🔥','🎉','🎈','🎮','🚀','💻','📷','🎵','⭐','💡'],
    'Serca':['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💖','💗','💕','💞','💔','💘','💝','🌸','🌼','🌈','🌞','🌙','☁️','🍀','🐱','🐶','🐼','🍕','🍰','☕','🍎']
  };
  document.querySelectorAll('.rc-emoji-wrap').forEach(function(wrap){
    var form=wrap.closest('form'),field=wrap.dataset.target?document.getElementById(wrap.dataset.target):form&&form.querySelector('textarea'),toggle=wrap.querySelector('button'),panel=wrap.querySelector('.rc-emoji-panel');
    if(!field||!toggle||!panel)return;
    var tabs=document.createElement('div'),grid=document.createElement('div'),status=document.createElement('p');tabs.className='rc-emoji-tabs';grid.className='rc-emoji-grid';status.className='rc-emoji-status';status.setAttribute('role','status');
    function choose(name){
      tabs.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.group===name));});grid.replaceChildren();
      groups[name].forEach(function(emoji){var b=document.createElement('button');b.type='button';b.textContent=emoji;b.title='Wstaw '+emoji;b.setAttribute('aria-label','Wstaw emotkę '+emoji);b.addEventListener('click',function(){
        var start=field.selectionStart,end=field.selectionEnd,max=field.maxLength;
        if(max>0&&field.value.length-(end-start)+emoji.length>max){status.textContent='Brak miejsca w wiadomości.';return;}
        field.setRangeText(emoji,start,end,'end');field.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='';field.focus();
      });grid.appendChild(b);});
    }
    Object.keys(groups).forEach(function(name){var b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.group=name;b.addEventListener('click',function(){choose(name);});tabs.appendChild(b);});
    panel.append(tabs,grid,status);choose('Buźki');
    function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}
    toggle.addEventListener('click',function(){var show=panel.hidden;document.querySelectorAll('.rc-emoji-panel').forEach(function(p){p.hidden=true;var b=p.parentElement.querySelector('.rc-emoji-toggle');if(b)b.setAttribute('aria-expanded','false');});panel.hidden=!show;toggle.setAttribute('aria-expanded',String(show));if(show){panel.style.transform='';var rect=panel.getBoundingClientRect(),shift=rect.left<8?8-rect.left:rect.right>window.innerWidth-8?window.innerWidth-8-rect.right:0;if(shift)panel.style.transform='translateX('+shift+'px)';}});
    document.addEventListener('click',function(e){if(!wrap.contains(e.target))close();});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden){e.preventDefault();close();toggle.focus();}});
    window.addEventListener('rj:session-change',close);
  });
})(window,document);

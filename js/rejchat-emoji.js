/* Wspólny wybór emoji dla wiadomości i reakcji. Dane: emojibase-data (MIT). */
(function(window,document){
  'use strict';
  var names=['Buźki','Gesty','Odcienie','Przyroda','Jedzenie','Podróże','Aktywności','Przedmioty','Symbole','Flagi'],dataPromise=null;
  function load(){
    if(!dataPromise)dataPromise=fetch('/assets/emoji/pl.json?v=1').then(function(r){if(!r.ok)throw Error('Nie udało się pobrać emotek.');return r.json();}).then(function(data){if(!Array.isArray(data.groups)||data.groups.length!==10)throw Error('Nieprawidłowe dane emotek.');return data.groups;}).catch(function(err){dataPromise=null;throw err;});
    return dataPromise;
  }
  function mount(panel,onPick,options){
    options=options||{};var tabs=document.createElement('div'),search=document.createElement('input'),grid=document.createElement('div'),more=document.createElement('button'),status=document.createElement('p'),groups=null,selected=0,shown=0,limit=56;
    panel.classList.add('rc-emoji-picker-ui');tabs.className='rc-emoji-tabs';search.className='rc-emoji-search';search.type='search';search.placeholder='Szukaj emotki…';search.setAttribute('aria-label','Szukaj emotki');grid.className='rc-emoji-grid';more.type='button';more.className='rc-emoji-more';more.textContent='Pokaż więcej';status.className='rc-emoji-status';status.setAttribute('role','status');
    panel.replaceChildren(search,tabs,grid,more,status);more.hidden=true;status.textContent='Wczytywanie emotek…';
    function update(){
      if(!groups)return;var q=search.value.trim().toLocaleLowerCase('pl');var values=q?groups.flat().filter(function(x){return (x[0]+' '+x[1]+' '+x[2]).toLocaleLowerCase('pl').includes(q);}):groups[selected];
      tabs.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(!q&&Number(b.dataset.group)===selected));});grid.replaceChildren();
      values.slice(0,shown).forEach(function(item){var b=document.createElement('button');b.type='button';b.textContent=item[0];b.title=item[1];b.setAttribute('aria-label',(options.reaction?'Reakcja: ':'Wstaw emotkę: ')+item[1]+' '+item[0]);b.dataset.emojiChoice=item[0];if(options.scope)b.dataset[options.scope==='public'?'reaction':'dmReaction']=item[0];b.addEventListener('click',function(){onPick(item[0],b);});grid.appendChild(b);});
      more.hidden=shown>=values.length;status.textContent=values.length?'Pokazano '+Math.min(shown,values.length)+' z '+values.length+'.':'Nie znaleziono emotek.';
      panel.dispatchEvent(new CustomEvent('rj:emoji-picker-resize',{bubbles:true}));
    }
    names.forEach(function(name,i){var b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.group=i;b.addEventListener('click',function(){selected=i;search.value='';shown=limit;update();});tabs.appendChild(b);});
    search.addEventListener('input',function(){shown=limit;update();});more.addEventListener('click',function(){shown+=limit;update();});
    load().then(function(result){if(!panel.isConnected)return;groups=result;shown=limit;update();}).catch(function(){status.textContent='Nie udało się wczytać emotek. Zamknij i otwórz wybór ponownie.';});
  }
  window.RJEmojiPicker={mount:mount};
  document.querySelectorAll('.rc-emoji-wrap').forEach(function(wrap){
    var form=wrap.closest('form'),field=wrap.dataset.target?document.getElementById(wrap.dataset.target):form&&form.querySelector('textarea'),toggle=wrap.querySelector('button'),panel=wrap.querySelector('.rc-emoji-panel');if(!field||!toggle||!panel)return;
    function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}
    toggle.addEventListener('click',function(){var show=panel.hidden;document.querySelectorAll('.rc-emoji-panel').forEach(function(p){p.hidden=true;var b=p.parentElement.querySelector('.rc-emoji-toggle');if(b)b.setAttribute('aria-expanded','false');});panel.hidden=!show;toggle.setAttribute('aria-expanded',String(show));if(show){
      mount(panel,function(emoji){var start=field.selectionStart,end=field.selectionEnd,max=field.maxLength,status=panel.querySelector('.rc-emoji-status');if(max>0&&field.value.length-(end-start)+emoji.length>max){status.textContent='Brak miejsca w wiadomości.';return;}field.setRangeText(emoji,start,end,'end');field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();});
      panel.style.transform='';var rect=panel.getBoundingClientRect(),shift=rect.left<8?8-rect.left:rect.right>window.innerWidth-8?window.innerWidth-8-rect.right:0;if(shift)panel.style.transform='translateX('+shift+'px)';
    }});
    document.addEventListener('click',function(e){if(!wrap.contains(e.target))close();});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden){e.preventDefault();close();toggle.focus();}});window.addEventListener('rj:session-change',close);
  });
})(window,document);

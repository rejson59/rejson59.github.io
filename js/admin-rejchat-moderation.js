/* Moderacja RejChat: wyłącznie JWT administratora, bez odczytu prywatnych rozmów. */
(function(window,document){
  'use strict';
  var panel=document.getElementById('rcmod-panel'); if(!panel)return;
  var $=function(id){return document.getElementById('rcmod-'+id);}, seq=0, busy=false;
  function node(tag,cls,text){var el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
  function rpc(name,args){return window.RejsonCloud.rpc(name,args||{},true);}
  function message(text){$('status').textContent=text||'';}
  function button(text,fn){var b=node('button','btn btn-glass btn-sm',text);b.type='button';b.addEventListener('click',function(){fn(b);});return b;}
  function action(fn,args,success){if(busy)return;busy=true;message('Zapisywanie…');var generation=seq;rpc(fn,args).then(function(result){if(generation!==seq)return;if(result===false)throw Error('Nie znaleziono elementu.');if(success)success(result);return load();}).catch(function(err){if(generation===seq)message(err.message||'Nie udało się wykonać operacji.');}).finally(function(){busy=false;});}
  function empty(container,text){container.appendChild(node('p','',text));}
  function render(data){
    var phrases=$('phrases'),blocks=$('blocks'),messages=$('messages');phrases.replaceChildren();blocks.replaceChildren();messages.replaceChildren();$('select-all').checked=false;$('delete').disabled=true;
    if(!data.phrases.length)empty(phrases,'Brak aktywnych fraz.');
    data.phrases.forEach(function(f){var row=node('div','rcmod-row'),name=node('span','',f.phrase);row.append(name,button('Usuń',function(){if(window.confirm('Usunąć tę frazę z filtra?'))action('admin_rejchat_phrase',{p_phrase:'',p_delete_id:f.id});}));phrases.appendChild(row);});
    if(!data.blocks.length)empty(blocks,'Brak aktywnych blokad.');
    data.blocks.forEach(function(b){var row=node('div','rcmod-row'),name=node('span','',b.username),until=b.until_at?new Date(b.until_at).toLocaleString('pl-PL'):'bezterminowo';name.appendChild(node('small','',b.until_at?'Do: '+until:until));if(b.reason)name.appendChild(node('small','','Powód: '+b.reason));row.append(name,button('Zdejmij mute',function(){if(window.confirm('Przywrócić pisanie kontu '+b.username+'?'))action('admin_rejchat_mute',{p_username:b.username,p_minutes:0,p_reason:''});}));blocks.appendChild(row);});
    if(!data.messages.length)empty(messages,'Brak wiadomości publicznych.');
    data.messages.forEach(function(m){var row=node('div','rcmod-row'),check=node('input'),body=node('span','');check.type='checkbox';check.value=m.id;check.dataset.message='';check.setAttribute('aria-label','Zaznacz wiadomość użytkownika '+m.author_name);body.appendChild(node('strong','',m.author_name));body.appendChild(node('small','',new Date(m.created_at).toLocaleString('pl-PL')));body.appendChild(node('div','',m.content));var mute=button('Wycisz',function(){$('user').value=m.author_name;$('user').focus();$('block-form').scrollIntoView({block:'nearest'});});mute.classList.add('rcmod-author-mute');row.append(check,body,mute);messages.appendChild(row);});
  }
  function load(){var generation=++seq;message('Wczytuję moderację…');return rpc('admin_rejchat_overview',{}).then(function(data){if(generation!==seq)return;if(!data||!Array.isArray(data.phrases)||!Array.isArray(data.blocks)||!Array.isArray(data.messages))throw Error('Nieprawidłowa odpowiedź.');render(data);message('Dane aktualne.');}).catch(function(err){if(generation===seq)message(err.message||'Nie udało się wczytać danych.');});}
  panel.addEventListener('toggle',function(){if(panel.open)load();});
  $('refresh').addEventListener('click',load);
  $('phrase-form').addEventListener('submit',function(e){e.preventDefault();var value=$('phrase').value.trim();if(!value)return;action('admin_rejchat_phrase',{p_phrase:value,p_delete_id:null},function(){$('phrase').value='';});});
  $('block-form').addEventListener('submit',function(e){e.preventDefault();var name=$('user').value.trim(),minutes=Number($('duration').value),why=$('reason').value.trim();if(!name||!window.confirm(minutes===0?'Zdjąć wyciszenie konta '+name+'?':'Wyciszyć konto '+name+'?'))return;action('admin_rejchat_mute',{p_username:name,p_minutes:minutes,p_reason:why},function(){$('user').value='';$('reason').value='';});});
  function selected(){return Array.from($('messages').querySelectorAll('[data-message]:checked')).map(function(c){return c.value;});}
  function selectionChanged(){var n=selected().length,all=$('messages').querySelectorAll('[data-message]').length;$('delete').disabled=!n;$('delete').textContent=n?'Usuń zaznaczone ('+n+')':'Usuń zaznaczone';$('select-all').checked=!!all&&n===all;$('select-all').indeterminate=n>0&&n<all;}
  $('messages').addEventListener('change',selectionChanged);
  $('select-all').addEventListener('change',function(){$('messages').querySelectorAll('[data-message]').forEach(function(c){c.checked=$('select-all').checked;});selectionChanged();});
  $('delete').addEventListener('click',function(){var ids=selected();if(ids.length&&window.confirm('Usunąć '+ids.length+' zaznaczonych wiadomości publicznych? Tej operacji nie można cofnąć.'))action('admin_rejchat_delete_messages',{p_ids:ids});});
  window.RJAdminRejChat={clear:function(){seq++;panel.open=false;['phrases','blocks','messages'].forEach(function(id){$(id).replaceChildren();});message('');$('phrase-form').reset();$('block-form').reset();}};
})(window,document);

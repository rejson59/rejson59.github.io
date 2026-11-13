/* Moderacja RejChat: wyłącznie JWT administratora, dostęp tylko do świadomie zgłoszonej pojedynczej wiadomości prywatnej. */
(function(window,document){
  'use strict';
  var panel=document.getElementById('rcmod-panel'); if(!panel)return;
  var $=function(id){return document.getElementById('rcmod-'+id);}, seq=0, busy=false, phraseCache=[], testSeq=0;
  function node(tag,cls,text){var el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
  function rpc(name,args){return window.RejsonCloud.rpc(name,args||{},true);}
  function message(text){$('status').textContent=text||'';}
  function button(text,fn){var b=node('button','btn btn-glass btn-sm',text);b.type='button';b.addEventListener('click',function(){fn(b);});return b;}
  function action(fn,args,success){if(busy)return;busy=true;message('Zapisywanie…');var generation=seq;rpc(fn,args).then(function(result){if(generation!==seq)return;if(result===false)throw Error('Nie znaleziono elementu.');if(success)success(result);return load();}).catch(function(err){if(generation===seq)message(err.message||'Nie udało się wykonać operacji.');}).finally(function(){busy=false;});}
  function empty(container,text){container.appendChild(node('p','',text));}
  function render(data){
    var phrases=$('phrases'),blocks=$('blocks'),messages=$('messages');phrases.replaceChildren();blocks.replaceChildren();messages.replaceChildren();$('select-all').checked=false;$('delete').disabled=true;
    phraseCache=data.phrases;renderPhrases();
    if(!data.blocks.length)empty(blocks,'Brak aktywnych blokad.');
    data.blocks.forEach(function(b){var row=node('div','rcmod-row'),name=node('span','',b.username),until=b.until_at?new Date(b.until_at).toLocaleString('pl-PL'):'bezterminowo';name.appendChild(node('small','',b.until_at?'Do: '+until:until));if(b.reason)name.appendChild(node('small','','Powód: '+b.reason));row.append(name,button('Zdejmij mute',function(){if(window.confirm('Przywrócić pisanie kontu '+b.username+'?'))action('admin_rejchat_mute',{p_username:b.username,p_minutes:0,p_reason:''});}));blocks.appendChild(row);});
    if(!data.messages.length)empty(messages,'Brak wiadomości publicznych.');
    data.messages.forEach(function(m){var row=node('div','rcmod-row'),check=node('input'),body=node('span','');check.type='checkbox';check.value=m.id;check.dataset.message='';check.setAttribute('aria-label','Zaznacz wiadomość użytkownika '+m.author_name);body.appendChild(node('strong','',m.author_name));body.appendChild(node('small','',new Date(m.created_at).toLocaleString('pl-PL')));body.appendChild(node('div','',m.content));var mute=button('Wycisz',function(){$('user').value=m.author_name;$('user').focus();$('block-form').scrollIntoView({block:'nearest'});});mute.classList.add('rcmod-author-mute');row.append(check,body,mute);messages.appendChild(row);});
    renderPhotos(Array.isArray(data.photos)?data.photos:[]);renderAutoActions(Array.isArray(data.actions)?data.actions:[]);
  }
  function sizeText(bytes){var n=Number(bytes)||0;return n>=1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" kB";}
  function renderPhotos(list){
    var box=$("photos");if(!box)return;box.replaceChildren();
    if(!list.length)return empty(box,"Brak zdjęć w czacie.");
    list.forEach(function(p){
      var row=node("div","rcmod-row"),body=node("span",""),actionsWrap=node("span","rcmod-row-actions");
      body.appendChild(node("strong","",p.username||"konto usunięte"));
      var opis=new Date(p.created_at).toLocaleString("pl-PL");
      if(p.width&&p.height)opis+=" · "+p.width+"×"+p.height+" px";
      opis+=" · "+sizeText(p.bytes_size);
      if(p.status==="blocked")opis+=" · ukryte"+(p.blocked_reason?": "+p.blocked_reason:"");
      body.appendChild(node("small","",opis));
      if(p.status==="ok"){
        actionsWrap.appendChild(button("Pokaż",function(b){
          if(body.querySelector("img"))return;b.disabled=true;b.textContent="Wczytuję…";
          rpc("rejchat_get_photo",{p_id:p.id}).then(function(photo){
            if(!photo||!photo.data)throw Error("Zdjęcie jest niedostępne.");
            var img=node("img","rcmod-photo");img.alt="Podgląd zdjęcia dodanego przez "+p.username;img.loading="lazy";img.src="data:"+photo.mime+";base64,"+photo.data;
            body.appendChild(img);b.remove();
          }).catch(function(err){b.disabled=false;b.textContent="Pokaż";body.appendChild(node("small","",err.message||"Nie udało się wczytać zdjęcia."));});
        }));
        actionsWrap.appendChild(button("Ukryj",function(){if(window.confirm("Ukryć to zdjęcie w czacie? Treść wpisu zostanie, zdjęcie przestanie być pokazywane."))action("admin_rejchat_photo_action",{p_id:p.id,p_action:"block"});}));
      }else{
        actionsWrap.appendChild(button("Przywróć",function(){if(window.confirm("Przywrócić to zdjęcie w czacie?"))action("admin_rejchat_photo_action",{p_id:p.id,p_action:"restore"});}));
      }
      row.append(body,actionsWrap);box.appendChild(row);
    });
  }
  function renderAutoActions(list){
    var box=$("actions");if(!box)return;box.replaceChildren();
    if(!list.length)return empty(box,"Automat nie podjął jeszcze żadnej decyzji.");
    var etykiety={tekst:"Usunięta treść",zdjęcie:"Ukryte zdjęcie",blokada:"Automatyczne wyciszenie"};
    list.forEach(function(a){
      var row=node("div","rcmod-row"),body=node("span","");
      body.appendChild(node("strong","",(etykiety[a.kind]||a.kind)+(a.author_name?" · "+a.author_name:"")));
      body.appendChild(node("small","",new Date(a.created_at).toLocaleString("pl-PL")+" · "+a.reason));
      if(a.excerpt)body.appendChild(node("div","",a.excerpt));
      row.append(body);box.appendChild(row);
    });
  }
  var modeDescriptions={substring:'Fragment tekstu — także wewnątrz dłuższych słów',word:'Całe słowo lub fraza',prefix:'Początek słowa — rdzeń'};
  function renderPhrases(){var phrases=$('phrases'),q=$('phrase-search').value.trim().toLocaleLowerCase('pl'),filtered=phraseCache.filter(function(f){return String(f.phrase).toLocaleLowerCase('pl').includes(q);});phrases.replaceChildren();$('phrase-count').textContent='Widoczne: '+filtered.length+' z '+phraseCache.length+'.';if(!filtered.length)empty(phrases,q?'Nie znaleziono frazy.':'Brak aktywnych fraz.');filtered.forEach(function(f){var row=node('div','rcmod-row'),name=node('span','',f.phrase),description=modeDescriptions[f.match_mode]||'Nieznany typ';name.appendChild(node('small','',description));if(f.match_mode==='substring')name.appendChild(node('small','','Przykład fragmentu: „…'+f.phrase+'…”'));else if(f.match_mode==='word')name.appendChild(node('small','','Przykład: „'+f.phrase+'” jako osobne słowo lub fraza.'));else if(f.match_mode==='prefix')name.appendChild(node('small','','Przykład początku słowa: „'+f.phrase+'…”.'));if(f.match_mode==='substring')name.appendChild(node('small','','Uwaga: może wystąpić również w innych wyrazach.'));row.append(name,button('Usuń',function(){if(window.confirm('Usunąć tę frazę z filtra?'))action('admin_rejchat_phrase',{p_phrase:'',p_delete_id:f.id});}));phrases.appendChild(row);});}
  function clearFilterTest(){testSeq++;$('filter-test-result').textContent='';}
  $('filter-test-form').addEventListener('submit',function(e){e.preventDefault();var text=$('filter-test').value, candidate=$('phrase').value.trim(),mode=$('phrase-mode').value,turn=++testSeq;if(!text.trim())return;$('filter-test-result').textContent='Sprawdzam…';rpc('admin_rejchat_filter_check',{p_text:text,p_candidate:candidate,p_mode:mode}).then(function(result){if(turn!==testSeq)return;if(!result||typeof result.blocked!=='boolean'||typeof result.candidate_blocked!=='boolean')throw Error('Nieprawidłowa odpowiedź.');$('filter-test-result').textContent=(result.blocked?'Obecny filtr: tekst zostałby zablokowany.':'Obecny filtr: tekst przeszedłby.')+(candidate?(result.candidate_blocked?' Nowa reguła: zablokowałaby tekst.':' Nowa reguła: nie zablokowałaby tekstu.'):'');}).catch(function(err){if(turn===testSeq)$('filter-test-result').textContent=err.message||'Nie udało się sprawdzić tekstu.';});});
  ['filter-test','phrase','phrase-mode'].forEach(function(id){$(id).addEventListener('input',clearFilterTest);$(id).addEventListener('change',clearFilterTest);});
  $('phrase-search').addEventListener('input',renderPhrases);
  function load(){var generation=++seq;message('Wczytuję moderację…');return rpc('admin_rejchat_overview',{}).then(function(data){if(generation!==seq)return;if(!data||!Array.isArray(data.phrases)||!Array.isArray(data.blocks)||!Array.isArray(data.messages))throw Error('Nieprawidłowa odpowiedź.');render(data);message('Dane aktualne.');}).catch(function(err){if(generation===seq)message(err.message||'Nie udało się wczytać danych.');});}
  panel.addEventListener('toggle',function(){if(panel.open){load();loadReports();}else clearFilterTest();});
  $('refresh').addEventListener('click',load);
  $('phrase-form').addEventListener('submit',function(e){e.preventDefault();var value=$('phrase').value.trim();if(!value)return;action('admin_rejchat_phrase_v2',{p_phrase:value,p_mode:$('phrase-mode').value},function(){$('phrase').value='';clearFilterTest();});});
  $('nick-form').addEventListener('submit',function(e){e.preventDefault();var name=$('nick-user').value.trim(),nick=$('nick-value').value.trim();if(!name||!window.confirm('Zmienić publiczny nick konta '+name+'?'))return;action('admin_rejchat_set_nickname',{p_username:name,p_nickname:nick},function(){$('nick-form').reset();});});
  $('rename-form').addEventListener('submit',function(e){e.preventDefault();var name=$('rename-user').value.trim(),next=$('rename-value').value.trim(),why=$('rename-reason').value.trim();if(!name||!next||!window.confirm('Zmienić nazwę konta '+name+' na '+next+'? Użytkownik zaloguje się od teraz nową nazwą.'))return;action('admin_rejchat_rename_user',{p_username:name,p_new_username:next,p_reason:why},function(result){$('rename-form').reset();if(typeof result==='string'&&result)message('Nazwa konta zmieniona na '+result+'.');});});
  $('block-form').addEventListener('submit',function(e){e.preventDefault();var name=$('user').value.trim(),minutes=Number($('duration').value),why=$('reason').value.trim();if(!name||!window.confirm(minutes===0?'Zdjąć wyciszenie konta '+name+'?':'Wyciszyć konto '+name+'?'))return;action('admin_rejchat_mute',{p_username:name,p_minutes:minutes,p_reason:why},function(){$('user').value='';$('reason').value='';});});
  function selected(){return Array.from($('messages').querySelectorAll('[data-message]:checked')).map(function(c){return c.value;});}
  function selectionChanged(){var n=selected().length,all=$('messages').querySelectorAll('[data-message]').length;$('delete').disabled=!n;$('delete').textContent=n?'Usuń zaznaczone ('+n+')':'Usuń zaznaczone';$('select-all').checked=!!all&&n===all;$('select-all').indeterminate=n>0&&n<all;}
  $('messages').addEventListener('change',selectionChanged);
  $('select-all').addEventListener('change',function(){$('messages').querySelectorAll('[data-message]').forEach(function(c){c.checked=$('select-all').checked;});selectionChanged();});
  $('delete').addEventListener('click',function(){var ids=selected();if(ids.length&&window.confirm('Usunąć '+ids.length+' zaznaczonych wiadomości publicznych? Tej operacji nie można cofnąć.'))action('admin_rejchat_delete_messages',{p_ids:ids});});
  var reportSeq=0;
  function reportSelection(){var checked=$('reports').querySelectorAll('[data-report]:checked').length,all=$('reports').querySelectorAll('[data-report]').length;$('reports-resolve').disabled=!checked;$('reports-resolve').textContent=checked?'Rozpatrz zaznaczone ('+checked+')':'Rozpatrz zaznaczone';$('reports-all').checked=!!all&&checked===all;$('reports-all').indeterminate=checked>0&&checked<all;}
  function loadReports(){var turn=++reportSeq;$('reports-status').textContent='Wczytuję zgłoszenia…';return rpc('admin_rejchat_reports',{}).then(function(rows){if(turn!==reportSeq)return;if(!Array.isArray(rows))throw Error('Nieprawidłowa odpowiedź.');$('reports').replaceChildren();if(!rows.length)empty($('reports'),'Brak oczekujących zgłoszeń.');rows.forEach(function(r){var row=node('div','rcmod-row'),check=node('input'),body=node('span','');check.type='checkbox';check.dataset.report=r.id;check.setAttribute('aria-label','Zaznacz zgłoszenie konta '+r.target_name);body.appendChild(node('strong','',r.target_name+' · '+({public:'Wiadomość publiczna',private:'Wiadomość prywatna',profile:'Profil'}[r.scope]||r.scope)));var link=node('a','','Otwórz profil');link.href='/profil?u='+encodeURIComponent(r.target_name);link.target='_blank';link.rel='noopener noreferrer';body.appendChild(node('br'));body.appendChild(link);body.appendChild(node('small','','Zgłosił(a): '+r.reporter+' · '+new Date(r.created_at).toLocaleString('pl-PL')));body.appendChild(node('small','','Powód: '+({spam:'spam',abuse:'obrażanie lub nękanie',sexual:'treści seksualne',threat:'groźby',other:'inny'}[r.category]||r.category)));if(r.snapshot)body.appendChild(node('div','',r.snapshot));if(r.note)body.appendChild(node('small','','Opis: '+r.note));row.append(check,body);$('reports').appendChild(row);});reportSelection();$('reports-status').textContent=rows.length===100?'Pokazano 100 najstarszych oczekujących zgłoszeń.':'Dane aktualne.';}).catch(function(err){if(turn===reportSeq)$('reports-status').textContent=err.message||'Nie udało się wczytać zgłoszeń.';});}
  $('photos-refresh').addEventListener('click',function(){load();});
  $('reports-refresh').addEventListener('click',loadReports);$('reports').addEventListener('change',reportSelection);$('reports-all').addEventListener('change',function(){$('reports').querySelectorAll('[data-report]').forEach(function(c){c.checked=$('reports-all').checked;});reportSelection();});
  $('reports-resolve').addEventListener('click',async function(){var ids=Array.from($('reports').querySelectorAll('[data-report]:checked')).map(function(c){return c.dataset.report;});if(!ids.length||!window.confirm('Oznaczyć '+ids.length+' zgłoszeń jako rozpatrzone? Nie nakłada to kary.'))return;var turn=reportSeq;this.disabled=true;var results=await Promise.allSettled(ids.map(function(id){return rpc('admin_rejchat_resolve_report',{p_id:id});}));if(turn!==reportSeq)return;var failed=results.filter(function(r){return r.status!=='fulfilled'||r.value!==true;}).length;await loadReports();if(failed)$('reports-status').textContent='Nie udało się rozpatrzyć '+failed+' zgłoszeń. Spróbuj ponownie.';});
  $('warning-form').addEventListener('submit',function(e){e.preventDefault();var name=$('warning-user').value.trim(),reason=$('warning-reason').value.trim();if(!name||reason.length<3||!window.confirm('Wysłać ostrzeżenie do '+name+'?'))return;action('admin_rejchat_warn',{p_username:name,p_reason:reason},function(){$('warning-form').reset();});});
  window.RJAdminRejChat={clear:function(){seq++;reportSeq++;clearFilterTest();$('filter-test-form').reset();$('reports').replaceChildren();$('reports-status').textContent='';$('warning-form').reset();reportSelection();panel.open=false;['phrases','blocks','messages','photos','actions'].forEach(function(id){$(id).replaceChildren();});message('');phraseCache=[];$('phrase-search').value='';$('phrase-count').textContent='';$('phrase-form').reset();$('block-form').reset();$('nick-form').reset();}};
})(window,document);

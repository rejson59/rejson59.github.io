/* RejSejf: dostęp zawsze przez sesję wspólnego konta, bez publicznych linków. */
(function () {
  'use strict';
  var BASE='https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/';
  // Publiczny anon key jest używany również przez wspólne konto.
  var KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';
  var $=function(id){return document.getElementById(id);};
  var account=null, epoch=0, editing=null, busy=false;
  function status(message){$('safe-status').textContent=message||'';}
  function rpc(name,data,session){
    return fetch(BASE+name,{method:'POST',cache:'no-store',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(Object.assign({p_token:session.token},data||{}))})
      .then(function(res){return res.json().catch(function(){return null;}).then(function(body){if(!res.ok)throw new Error(body&&body.message||'Nie udało się połączyć z RejSejfem.');return body;});});
  }
  function current(session,version){return account && session && account.token===session.token && version===epoch;}
  function bytes(n){return n>=1048576?(n/1048576).toFixed(2)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':n+' B';}
  function resetEditor() { editing=null; $('note-title').value=''; $('note-content').value=''; $('note-save').textContent='Zapisz notatkę ↗'; $('note-cancel').hidden=true; }
  function clearPrivate(){resetEditor();$('safe-list').textContent='';$('safe-usage').textContent='';$('safe-file').value='';$('safe-workspace').hidden=true;}
  function setBusy(value){busy=value; document.querySelectorAll('#safe-workspace button,#safe-workspace input,#safe-workspace textarea').forEach(function(x){x.disabled=value;});}
  function button(text,fn){var b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;}
  function mode(kind){$('note-form').hidden=kind!=='note';$('file-form').hidden=kind!=='file';$('mode-note').setAttribute('aria-pressed',String(kind==='note'));$('mode-file').setAttribute('aria-pressed',String(kind==='file'));}
  function refresh(session,version){
    return rpc('rejsejf_list',{},session).then(function(items){
      if(!current(session,version))return;
      if(!Array.isArray(items))throw new Error('Nieprawidłowa odpowiedź serwera.');
      var list=$('safe-list');list.textContent='';var size=0;
      items.forEach(function(item){
        size+=Number(item.size)||0;
        var row=document.createElement('article');row.className='safe-item';
        var title=document.createElement('strong');title.textContent=(item.kind==='note'?'✎  ':'↥  ')+item.title;row.appendChild(title);
        var meta=document.createElement('small');var date=new Date(item.updated_at);meta.textContent=(item.kind==='note'?'Notatka':'Plik')+' · '+bytes(item.size)+' · '+(isNaN(date)?'':date.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'}));row.appendChild(meta);
        var actions=document.createElement('div');actions.className='safe-item-actions';
        actions.appendChild(button(item.kind==='note'?'Otwórz i edytuj':'Pobierz',function(){openItem(item,session,version);}));
        actions.appendChild(button('Usuń',function(){removeItem(item,session,version);}));row.appendChild(actions);list.appendChild(row);
      });
      $('safe-usage').textContent=items.length+' / 200 elementów · '+bytes(size)+' / 25 MiB';
      if(!items.length){var empty=document.createElement('p');empty.textContent='Na razie jest tu pusto. Dodaj pierwszą notatkę lub plik ✨';list.appendChild(empty);}
    });
  }
  function fail(err,session,version){if(current(session,version))status(err&&err.message||'Coś poszło nie tak. Spróbuj ponownie.');}
  async function openItem(item,session,version){
    if(busy)return;setBusy(true);status('Otwieram…');
    try{var data=await rpc('rejsejf_get',{p_id:item.id},session);if(!current(session,version))return;
      if(data.kind==='note'){mode('note');editing={id:data.id,updated:data.updated_at};$('note-title').value=data.title;$('note-content').value=data.content;$('note-save').textContent='Zapisz zmiany ↗';$('note-cancel').hidden=false;$('note-title').focus();status('Edytujesz notatkę.');}
      else if(data.kind==='file'){
        var decoded=atob(data.content), arr=new Uint8Array(decoded.length);for(var i=0;i<decoded.length;i++)arr[i]=decoded.charCodeAt(i);
        var url=URL.createObjectURL(new Blob([arr],{type:'application/octet-stream'}));var a=document.createElement('a');a.href=url;a.download=data.title;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},60000);status('Plik jest gotowy do pobrania.');
      } else throw new Error('Nieznany rodzaj elementu.');
    }catch(e){fail(e,session,version);}finally{if(version===epoch)setBusy(false);}
  }
  async function removeItem(item,session,version){
    if(busy||!confirm('Usunąć „'+item.title+'”? Tej operacji nie można cofnąć.'))return;setBusy(true);status('Usuwam…');
    try{var removed=await rpc('rejsejf_delete',{p_id:item.id},session);if(!current(session,version))return;if(!removed)throw new Error('Nie znaleziono elementu.');if(editing&&editing.id===item.id)resetEditor();await refresh(session,version);if(current(session,version))status('Usunięto.');}catch(e){fail(e,session,version);}finally{if(version===epoch)setBusy(false);}
  }
  $('note-form').addEventListener('submit',async function(e){
    e.preventDefault();if(busy||!account)return;var session=account,version=epoch,title=$('note-title').value.trim(),content=$('note-content').value;
    if(new TextEncoder().encode(content).length>102400){status('Notatka może mieć maksymalnie 100 KiB.');return;}
    setBusy(true);status('Zapisuję…');
    try{await rpc('rejsejf_save',{p_kind:'note',p_title:title,p_content:content,p_id:editing?editing.id:null,p_updated:editing?editing.updated:null},session);if(!current(session,version))return;resetEditor();await refresh(session,version);if(current(session,version))status('Notatka zapisana.');}catch(err){fail(err,session,version);}finally{if(version===epoch)setBusy(false);}
  });
  $('file-form').addEventListener('submit',async function(e){
    e.preventDefault();if(busy||!account)return;var session=account,version=epoch,file=$('safe-file').files[0];if(!file)return;
    if(file.size>5242880){status('Plik może mieć maksymalnie 5 MiB.');return;}
    setBusy(true);status('Zapisuję plik…');
    try{var data=await new Promise(function(resolve,reject){var reader=new FileReader();reader.onerror=function(){reject(new Error('Nie udało się odczytać pliku.'));};reader.onload=function(){resolve(String(reader.result).split(',')[1]);};reader.readAsDataURL(file);});if(!current(session,version))return;
      await rpc('rejsejf_save',{p_kind:'file',p_title:file.name,p_content:data,p_id:null,p_updated:null},session);if(!current(session,version))return;$('safe-file').value='';await refresh(session,version);if(current(session,version))status('Plik zapisany.');
    }catch(err){fail(err,session,version);}finally{if(version===epoch)setBusy(false);}
  });
  $('mode-note').addEventListener('click',function(){mode('note');});$('mode-file').addEventListener('click',function(){mode('file');});$('note-cancel').addEventListener('click',resetEditor);
  $('refresh-safe').addEventListener('click',async function(){if(busy||!account)return;var session=account,version=epoch;setBusy(true);try{await refresh(session,version);if(current(session,version))status('Odświeżono.');}catch(e){fail(e,session,version);}finally{if(version===epoch)setBusy(false);}});
  $('safe-login-button').addEventListener('click',function(){window.RejsonAccount.open();});
  async function accountChanged(){
    var version=++epoch;account=null;setBusy(false);clearPrivate();$('safe-login').hidden=true;$('safe-retry').hidden=true;status('Sprawdzam konto…');
    try{var session=await window.RejsonAccount.getSession();if(version!==epoch)return;if(!session){$('safe-login').hidden=false;status('');return;}
      account=session;$('safe-workspace').hidden=false;status('Twoja przestrzeń · '+session.username);await refresh(session,version);
    }catch(err){if(version===epoch){status(err&&err.message||'Nie udało się sprawdzić konta.');if(!account)$('safe-retry').hidden=false;}}
  }
  $('safe-retry').addEventListener('click',accountChanged);
  window.RejsonAccount.subscribe(accountChanged);accountChanged();
})();

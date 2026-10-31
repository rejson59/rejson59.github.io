/* RejFile: bezpośrednie wysyłanie części do prywatnego magazynu. */
(function () {
  'use strict';
  var BASE = 'https://hzbqzfimtroixnldzjeq.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';
  var LIMIT = 104857600, CHUNK = 10485760;
  var SESSION = 'rejson_community_session_v1', HISTORY = 'rejfile_sent_v1', CHAT_DRAFT = 'rejfile_chat_draft_v1';
  var $ = function (id) { return document.getElementById(id); };
  var form=$('upload-form'), fileInput=$('file-input'), zone=$('dropzone'), selected=null, token=null, history=[], active=null, busy=false, downloadBusy=false, sessionVersion=0;
  var uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, secret=/^[0-9a-f]{64}$/;
  function validItem(x) { return x && uuid.test(x.id) && secret.test(x.owner) && typeof x.name === 'string' && (x.share == null || secret.test(x.share)); }
  try { var saved=JSON.parse(localStorage.getItem(HISTORY)||'[]'); if(Array.isArray(saved)) history=saved.filter(validItem).slice(0,50); } catch (_) {}
  function persist() { try { localStorage.setItem(HISTORY, JSON.stringify(history.slice(0,50))); } catch (_) {} }
  function key() { var bytes=new Uint8Array(32); crypto.getRandomValues(bytes); return Array.from(bytes, function(n){return n.toString(16).padStart(2,'0');}).join(''); }
  function escapeName(n) { return String(n || 'plik').replace(/[\x00-\x1f\x7f/\\]/g,'_').replace(/[\u202a-\u202e\u2066-\u2069]/g,'').slice(0,200) || 'plik'; }
  function human(n) { return n >= 1048576 ? (n/1048576).toFixed(n>=10485760?0:1)+' MB' : (n/1024).toFixed(1)+' KB'; }
  function when(iso) { var d=new Date(iso); return isNaN(d.getTime()) ? 'nieznany termin' : d.toLocaleString('pl-PL',{dateStyle:'medium',timeStyle:'short'}); }
  function report(node,message) { node.textContent=message||''; node.hidden=!message; }
  function rpc(action, data) {
    var body=Object.assign({action:action},data||{});
    return fetch(BASE+'/functions/v1/rejfile', {method:'POST',cache:'no-store',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){ return r.json().catch(function(){return null;}).then(function(json){if(!r.ok) throw new Error(json&&json.error||'Nie udało się połączyć z RejFile.'); if(!json) throw new Error('Nieprawidłowa odpowiedź serwera.'); return json;}); });
  }
  function publicUrl(url) { var u=new URL(url); if(u.origin !== BASE || u.pathname.indexOf('/storage/v1/object/')!==0) throw new Error('Nieprawidłowy adres magazynu.'); return u.href; }
  function shareLink(item) { return location.origin+'/rejfile#f='+item.id+'.'+item.share; }
  // Wyłącznie gotowy link publiczny. Prywatny dostęp na konto nie staje się linkiem.
  function prepareChat(item) {
    var expiry=Date.parse(item.expires);
    if(!validItem(item) || !item.share || item.status!=='ready' || !Number.isFinite(expiry) || expiry<=Date.now()) { window.alert('Ten link nie jest już dostępny.'); return; }
    try {
      var raw=sessionStorage.getItem(CHAT_DRAFT), old=null;
      try { old=JSON.parse(raw||'null'); } catch (_) {}
      if(old && typeof old.at==='number' && Date.now()-old.at>=0 && Date.now()-old.at<30*60*1000 && old.expires>Date.now() && old.link!==shareLink(item) && !window.confirm('W RejChat czeka już inny link z RejFile. Zastąpić go tym linkiem?')) return;
      sessionStorage.setItem(CHAT_DRAFT, JSON.stringify({link:shareLink(item), at:Date.now(), expires:expiry}));
    } catch (_) { window.alert('Nie można przygotować linku w tej karcie. Skopiuj go i wklej w RejChat ręcznie.'); return; }
    location.assign('/rejchat');
  }
  function updateFile(file) {
    selected=file || null; $('file-label').textContent=file ? file.name : 'Przeciągnij plik tutaj';
    $('file-help').textContent=file ? human(file.size)+' · kliknij, aby zmienić' : 'lub wybierz z urządzenia';
    report($('error'),'');
  }
  fileInput.addEventListener('change',function(){updateFile(fileInput.files && fileInput.files[0]);});
  ['dragenter','dragover'].forEach(function(type){zone.addEventListener(type,function(e){e.preventDefault();zone.classList.add('dragging');});});
  ['dragleave','drop'].forEach(function(type){zone.addEventListener(type,function(e){e.preventDefault();zone.classList.remove('dragging');if(type==='drop')updateFile(e.dataTransfer.files && e.dataTransfer.files[0]);});});
  document.querySelectorAll('input[name="mode"]').forEach(function(el){el.addEventListener('change',function(){var account=document.querySelector('input[name="mode"]:checked').value==='account';$('recipient-wrap').hidden=!account;$('recipient').required=account;});});
  function progress(label, done, total) { var value=Math.min(100,Math.max(0,Math.round(done/total*100)));$('progress-wrap').hidden=false;$('progress-label').textContent=label;$('progress-percent').textContent=value+'%';$('progress').value=value; }
  function uploadPart(url, blob, done, total) {
    return new Promise(function(resolve,reject){
      var xhr=new XMLHttpRequest(); xhr.open('PUT',publicUrl(url)); xhr.setRequestHeader('apikey',KEY); xhr.setRequestHeader('Authorization','Bearer '+KEY); xhr.setRequestHeader('Content-Type','application/octet-stream'); xhr.timeout=180000;
      xhr.upload.onprogress=function(e){if(e.lengthComputable)progress('Przesyłanie…',done+e.loaded,total);};
      xhr.onload=function(){if(xhr.status>=200&&xhr.status<300)resolve();else reject(new Error('Nie udało się przesłać części pliku. Spróbuj ponownie.'));};
      xhr.onerror=xhr.ontimeout=function(){reject(new Error('Połączenie zostało przerwane podczas przesyłania.'));}; xhr.send(blob);
    });
  }
  function button(label,fn,cls) { var b=document.createElement('button');b.type='button';b.textContent=label;if(cls)b.className=cls;b.addEventListener('click',fn);return b; }
  function row(list,item,meta,actions) {
    var wrap=document.createElement('div');wrap.className='file-item';var title=document.createElement('strong');title.textContent=escapeName(item.name);wrap.appendChild(title);
    var sub=document.createElement('small');sub.textContent=meta;wrap.appendChild(sub);var bar=document.createElement('div');bar.className='file-actions';actions.forEach(function(a){bar.appendChild(a);});wrap.appendChild(bar);list.appendChild(wrap);
  }
  function copy(text,b) {
    var attempt=navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject();
    return attempt.catch(function(){var input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.focus();input.select();var ok=false;try {ok=document.execCommand('copy');} catch (_) {} input.remove();if(!ok){window.prompt('Skopiuj link:',text);return false;}return true;}).then(function(ok){if(b&&ok!==false)b.textContent='Skopiowano ✓';});
  }
  function renderHistory() {
    var list=$('sent-list');list.textContent='';
    history=history.filter(function(x){return !x.expires || new Date(x.expires).getTime()>Date.now();});persist();
    if(!history.length){var empty=document.createElement('p');empty.textContent='Nie ma tu jeszcze żadnych przesyłek.';list.appendChild(empty);return;}
    history.forEach(function(item){var acts=[];
      if(item.share && item.status==='ready'){var cp=button('Kopiuj link',function(){copy(shareLink(item),cp);});acts.push(cp);}
      if(item.status==='ready')acts.push(button('Pobierz',function(){openFile({id:item.id,owner:item.owner});}));
      acts.push(button('Cofnij dostęp',function(){
        if(!confirm('Cofnąć dostęp do tego pliku?'))return;
        rpc('revoke',{id:item.id,owner:item.owner,session:token}).then(function(){history=history.filter(function(x){return x.id!==item.id;});persist();renderHistory();}).catch(function(e){report($('error'),e.message);});
      },'danger'));
      if(item.share && item.status==='ready') acts.push(button('Przygotuj w RejChat',function(){prepareChat(item);}));
      row(list,item,(item.status==='ready' ? 'Wygasa: '+when(item.expires) : 'Przesyłanie nieukończone')+(item.recipient?' · dla '+item.recipient:''),acts);
    });
  }
  async function refreshInbox() {
    var requestedToken=token;
    var list=$('inbox-list');list.textContent='';$('refresh').hidden=true;
    if(!token){$('inbox-status').textContent='Zaloguj się, aby zobaczyć pliki wysłane do Twojego konta.';$('login').hidden=false;return;}
    $('login').hidden=true;$('inbox-status').textContent='Sprawdzam skrzynkę…';
    try { var data=await rpc('inbox',{session:requestedToken}); if(token!==requestedToken)return; if(!Array.isArray(data))throw new Error('Nieprawidłowa odpowiedź serwera.');
      $('inbox-status').textContent=data.length ? 'Pliki udostępnione Twojemu kontu.' : 'Twoja skrzynka jest pusta.';
      data.forEach(function(x){if(!uuid.test(x.id)||typeof x.name!=='string')return;row(list,x,(x.sender?'Od: '+x.sender+' · ':'')+human(x.size)+' · wygasa: '+when(x.expires_at),[button('Odbierz plik',function(){openFile({id:x.id});})]);});
    } catch(e){if(token!==requestedToken)return;$('inbox-status').textContent=e.message;}$('refresh').hidden=false;
  }
  $('refresh').addEventListener('click',refreshInbox);
  async function verifySession() {
    var version=++sessionVersion;token=null;$('inbox-list').textContent='';var link=$('account-link'), label=link.querySelector('.nav-label'); if(label) label.textContent='Konto'; else link.textContent='Konto'; link.setAttribute('aria-label','Konto / logowanie'); link.title='Konto / logowanie';var s;try{s=JSON.parse(localStorage.getItem(SESSION)||'null');}catch(_){}
    if(!s||typeof s.token!=='string'||s.token.length<16){refreshInbox();return;}
    try {var r=await fetch(BASE+'/rest/v1/rpc/community_whoami',{method:'POST',cache:'no-store',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({p_token:s.token})});var d=await r.json();if(version!==sessionVersion)return;if(!r.ok||!d||typeof d.username!=='string')throw new Error();token=s.token;var accountLink=$('account-link'); var accountLabel=accountLink.querySelector('.nav-label'); if(accountLabel) accountLabel.textContent=d.username; else accountLink.textContent=d.username; accountLink.setAttribute('aria-label','Konto: '+d.username); accountLink.title='Konto: '+d.username;await refreshInbox();}
    catch(_){if(version!==sessionVersion)return;$('inbox-status').textContent='Nie można potwierdzić sesji. Sprawdź połączenie lub zaloguj się ponownie.';$('login').hidden=false;$('refresh').hidden=false;}
  }
  form.addEventListener('submit',async function(e){e.preventDefault();if(busy)return;report($('error'),'');var file=selected;
    if(!file){report($('error'),'Wybierz plik.');return;} if(file.size<1||file.size>LIMIT){report($('error'),'Plik musi mieć od 1 bajtu do 100 MB.');return;}
    if(!window.crypto||!crypto.getRandomValues){report($('error'),'Ta przeglądarka nie obsługuje bezpiecznego tworzenia linków.');return;}
    var mode=document.querySelector('input[name="mode"]:checked').value, recipient=mode==='account'?$('recipient').value.trim():null;
    if(recipient&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(recipient)){report($('error'),'Wpisz poprawną nazwę odbiorcy.');return;} if(mode==='account'&&!recipient){report($('error'),'Podaj nazwę odbiorcy.');return;}
    busy=true;$('send').disabled=true;var item={name:escapeName(file.name),owner:key(),share:mode==='link'?key():null,recipient:recipient,status:'uploading'},created=false;
    try {
      progress('Przygotowuję przesyłkę…',0,file.size);
      var start=await rpc('create',{name:item.name,size:file.size,owner:item.owner,share:item.share,recipient:recipient,session:token});
      if(!uuid.test(start.id)||start.chunkSize!==CHUNK||!Array.isArray(start.urls)||start.urls.length!==Math.ceil(file.size/CHUNK))throw new Error('Nieprawidłowa odpowiedź magazynu.');
      item.id=start.id;history.unshift(item);history=history.slice(0,50);persist();renderHistory();created=true;
      for(var i=0;i<start.urls.length;i++){var pos=i*CHUNK;await uploadPart(start.urls[i],file.slice(pos,Math.min(pos+CHUNK,file.size),'application/octet-stream'),pos,file.size);}
      progress('Kończę przesyłanie…',file.size,file.size);
      var result=await rpc('finish',{id:item.id,owner:item.owner});if(!result.expires_at)throw new Error('Nie udało się potwierdzić przesłania.');
      item.status='ready';item.expires=result.expires_at;persist();renderHistory();form.hidden=true;$('success').hidden=false;
      $('success-text').textContent=mode==='link'?'Wyślij link osobie, której chcesz udostępnić plik. Wygasa: '+when(item.expires)+'.':'Plik czeka w skrzynce użytkownika '+recipient+'. Wygasa: '+when(item.expires)+'.';
      $('link-wrap').hidden=!item.share;if(item.share){$('share-link').value=shareLink(item);$('share-chat').onclick=function(){prepareChat(item);};}$('copy-link').textContent='Kopiuj';
    } catch(err){report($('error'),err.message || 'Nie udało się przesłać pliku.'); if(created)renderHistory();}
    finally {busy=false;$('send').disabled=false;$('progress-wrap').hidden=true;}
  });
  $('copy-link').addEventListener('click',function(){copy($('share-link').value,$('copy-link'));});
  $('another').addEventListener('click',function(){form.hidden=false;$('success').hidden=true;fileInput.value='';updateFile(null);});
  function credentials(entry) { entry=entry||active; return entry ? {id:entry.id,share:entry.share||null,owner:entry.owner||null,session:token} : {}; }
  async function openFile(data) {
    if(!data||!uuid.test(data.id))return;if(downloadBusy){report($('download-error'),'Poczekaj na zakończenie bieżącego pobierania.');return;}active=data;$('download-panel').hidden=false;$('download').hidden=true;$('download-progress').hidden=true;report($('download-error'),'');$('download-meta').textContent='Sprawdzam plik…';$('download-panel').scrollIntoView({behavior:'smooth',block:'center'});
    var opening=active;
    try {var info=await rpc('info',credentials(opening));if(active!==opening)return;if(typeof info.name!=='string'||!Number.isSafeInteger(info.size)||info.size<1||info.size>LIMIT||!Number.isInteger(info.chunks)||info.chunks!==Math.ceil(info.size/CHUNK))throw new Error('Nieprawidłowe dane pliku.');active.info=info;$('download-title').textContent=escapeName(info.name);$('download-meta').textContent=human(info.size)+' · dostępny do '+when(info.expires_at)+(info.sender?' · od '+info.sender:'');$('download').hidden=false;}
    catch(e){if(active!==opening)return;$('download-meta').textContent='';report($('download-error'),e.message);}
  }
  $('download').addEventListener('click',async function(){if(!active||!active.info)return;var entry=active,parts=[];downloadBusy=true;$('download').disabled=true;$('download-progress').hidden=false;report($('download-error'),'');
    try {for(var i=0;i<entry.info.chunks;i++){var grant=await rpc('chunk',Object.assign(credentials(entry),{index:i}));var res=await fetch(publicUrl(grant.url),{cache:'no-store',referrerPolicy:'no-referrer'});if(!res.ok)throw new Error('Nie udało się pobrać części pliku.');var blob=await res.blob();var expected=Math.min(CHUNK,entry.info.size-i*CHUNK);if(blob.size!==expected)throw new Error('Pobrana część ma nieprawidłowy rozmiar.');parts.push(blob);var percent=Math.round(Math.min((i+1)*CHUNK,entry.info.size)/entry.info.size*100);$('download-bar').value=percent;$('download-percent').textContent=percent+'%';}
      var object=URL.createObjectURL(new Blob(parts,{type:'application/octet-stream'}));var a=document.createElement('a');a.href=object;a.download=escapeName(entry.info.name);document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(object);},60000);
    }catch(e){report($('download-error'),e.message||'Nie udało się pobrać pliku.');}finally{downloadBusy=false;$('download').disabled=false;$('download-progress').hidden=true;}
  });
  window.addEventListener('storage',function(e){if(e.key===SESSION)verifySession();});
  renderHistory(); verifySession(); var match=location.hash.match(/^#f=([0-9a-f-]{36})\.([a-f0-9]{64})$/i);if(match&&uuid.test(match[1]))openFile({id:match[1],share:match[2].toLowerCase()});
})();

/* Świadoma kopia wiadomości do prywatnego RejSejfu. */
(function(window,document){
  'use strict';
  var api=window.RJProfiles;if(!api)return;
  var draftKey='rejsejf_chat_draft_v1',box=document.getElementById('sejf-draft'),draftStatus=document.getElementById('sejf-draft-status'),draftSeq=0;
  function removeDraft(){draftSeq++;try{sessionStorage.removeItem(draftKey);}catch(_){}box.hidden=true;draftStatus.textContent='';}
  function draft(){try{var d=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(!d)return null;if(typeof d.content!=='string'||!d.content.trim()||d.content.length>2000||typeof d.at!=='number'||Date.now()-d.at<0||Date.now()-d.at>600000||!/^[0-9a-f]{64}$/.test(d.fingerprint)){removeDraft();return null;}return d;}catch(_){removeDraft();return null;}}
  function fingerprint(token){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)).then(function(hash){return Array.from(new Uint8Array(hash),function(b){return b.toString(16).padStart(2,'0');}).join('');});}
  async function syncDraft(){var seq=++draftSeq,d=draft(),s=api.session();box.hidden=true;if(!d)return;if(!s||!window.crypto||!crypto.subtle){removeDraft();return;}try{var hash=await fingerprint(s.token),now=api.session();if(seq!==draftSeq)return;if(!now||now.token!==s.token||hash!==d.fingerprint){removeDraft();return;}box.hidden=false;setTimeout(function(){if(seq===draftSeq&&!draft())box.hidden=true;},Math.max(1,d.at+600001-Date.now()));}catch(_){if(seq===draftSeq)removeDraft();}}
  if(box){syncDraft();window.addEventListener('pagehide',removeDraft);window.addEventListener('rj:session-change',syncDraft);window.addEventListener('storage',function(e){if(e.key==='rejson_community_session_v1'||e.key===null)syncDraft();});
    document.getElementById('sejf-draft-discard').addEventListener('click',removeDraft);
    document.getElementById('sejf-draft-add').addEventListener('click',async function(){
      var d=draft(),s=api.session(),form=document.getElementById('chat-form'),field=document.getElementById('chat-input');
      if(!d||!s||!form||form.hidden){draftStatus.textContent='Zaloguj się na konto, z którego przygotowano szkic.';return;}
      if(document.getElementById('chat-public-view').hidden||document.getElementById('chat-room-title').textContent!=='Czat ogólny'){draftStatus.textContent='Otwórz czat ogólny, aby dodać szkic.';return;}
      if(!document.getElementById('chat-compose-context').hidden){draftStatus.textContent='Najpierw zakończ odpowiadanie lub edycję wiadomości.';return;}
      var seq=++draftSeq;try{var hash=await fingerprint(s.token),now=api.session();if(seq!==draftSeq)return;if(!now||now.token!==s.token||hash!==d.fingerprint||!draft()){removeDraft();return;}
        if(document.getElementById('chat-public-view').hidden||document.getElementById('chat-room-title').textContent!=='Czat ogólny'||!document.getElementById('chat-compose-context').hidden){draftStatus.textContent='Wróć do czatu ogólnego i zakończ edycję lub odpowiadanie.';return;}
        var next=field.value+(field.value?'\n':'')+d.content;if(next.length>field.maxLength){draftStatus.textContent='Nie ma miejsca na całą notatkę. Skróć wiadomość i spróbuj ponownie.';return;}
        field.value=next;field.dispatchEvent(new Event('input',{bubbles:true}));removeDraft();field.focus();
      }catch(_){draftStatus.textContent='Nie udało się bezpiecznie otworzyć szkicu.';}
    });
  }
  function clearStatuses(){['chat-save-status','dm-save-status'].forEach(function(id){var el=document.getElementById(id);if(el)el.textContent='';});}
  window.addEventListener('rj:session-change',clearStatuses);window.addEventListener('storage',function(e){if(e.key==='rejson_community_session_v1'||e.key===null)clearStatuses();});
  ['chat-list','dm-messages'].forEach(function(id){
    var list=document.getElementById(id);if(!list)return;
    list.addEventListener('click',function(e){
      var button=e.target.closest('[data-save-sejf]');if(!button||button.disabled)return;
      var s=api.session(),scope=button.dataset.saveScope,part=button.dataset.saveSejf,message=button.dataset.saveMessage;
      if(!s||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(message)||!['public','private'].includes(scope)||!['text','photo'].includes(part))return;
      var output=document.getElementById(scope==='public'?'chat-save-status':'dm-save-status');
      button.disabled=true;output.textContent='Zapisuję w RejSejfie…';
      api.rpc('rejchat_save_to_rejsejf',{p_token:s.token,p_scope:scope,p_message_id:message,p_part:part}).then(function(){
        var now=api.session();if(!button.isConnected||!now||now.token!==s.token)return;
        output.replaceChildren(document.createTextNode(part==='photo'?'Zdjęcie zapisano w Twoim RejSejfie. ':'Tekst zapisano w Twoim RejSejfie. '));
        var a=document.createElement('a');a.href='/rejsejf';a.textContent='Otwórz RejSejf ↗';output.appendChild(a);
      }).catch(function(err){var now=api.session();if(button.isConnected&&now&&now.token===s.token)output.textContent=err.message||'Nie udało się zapisać w RejSejfie.';}).finally(function(){if(button.isConnected)button.disabled=false;});
    });
  });
})(window,document);

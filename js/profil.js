(function(){
  'use strict';
  var api=window.RJProfiles, $=function(id){return document.getElementById(id);};
  var avatarNames={comet:'Kometa',planet:'Planeta',cat:'Kot',fox:'Lis',leaf:'Liść',cloud:'Chmurka',heart:'Serce',spark:'Gwiazdka'};
  var colorNames={mint:'Mięta',blue:'Błękit',violet:'Fiolet',rose:'Róż',amber:'Bursztyn',slate:'Grafit'};
  var target=new URLSearchParams(location.search).get('u'), current=null, confirmed=null, seq=0;
  api.avatars.forEach(function(id){var label=document.createElement('label');label.className='avatar-option';var radio=document.createElement('input');radio.type='radio';radio.name='avatar';radio.value=id;radio.required=true;var image=document.createElement('img');image.src='/assets/avatars/'+id+'.svg';image.alt='';var span=document.createElement('span');span.textContent=avatarNames[id];label.append(radio,image,span);$('avatar-options').appendChild(label);});
  api.colors.forEach(function(id){var label=document.createElement('label');label.className='color-option';label.dataset.profileColor=id;var radio=document.createElement('input');radio.type='radio';radio.name='color';radio.value=id;radio.required=true;var span=document.createElement('span');span.textContent=colorNames[id];label.append(radio,span);$('color-options').appendChild(label);});
  function status(text){$('profile-status').hidden=!text;$('profile-status').textContent=text||'';}
  function showProfile(p){
    current=p;$('profile-view').hidden=false;$('profile-name').textContent=p.username;$('profile-name').dataset.profileColor=p.color;
    $('profile-avatar').src=p.is_bot?'/assets/agent-avatar.png':'/assets/avatars/'+p.avatar+'.svg';
    $('profile-bio').textContent=p.bio || 'Tu może pojawić się kilka słów o tej osobie.';
    document.title=p.username+' — RejChat';
  }
  function editor(p){
    $('profile-editor').hidden=false;
    var a=document.querySelector('input[name="avatar"][value="'+p.avatar+'"]'), c=document.querySelector('input[name="color"][value="'+p.color+'"]');
    if(a)a.checked=true;if(c)c.checked=true;$('profile-bio-input').value=p.bio;
  }
  async function load(){
    var turn=++seq,s=api.session();confirmed=null;current=null;$('profile-view').hidden=true;$('profile-editor').hidden=true;status('Ładowanie profilu…');
    if(target && !api.safeName(target)){status('Nieprawidłowa nazwa profilu.');return;}
    try {
      if(s){
        try{var who=await api.rpc('community_whoami',{p_token:s.token});if(who && api.safeName(who.username))confirmed={username:who.username,token:s.token};}
        catch(e){if(!target)throw e;}
      }
      if(turn!==seq)return;
      var wanted=target||(confirmed&&confirmed.username);
      if(!wanted){status('Zaloguj się, aby otworzyć swój profil.');$('profile-login-link').hidden=false;var a=document.createElement('a');a.href='/logowanie';a.textContent=' Przejdź do logowania →';$('profile-status').appendChild(a);return;}
      var rows=await api.getMany([wanted],true);if(turn!==seq)return;
      if(!rows.length){status('Nie znaleziono takiego profilu.');return;}
      status('');showProfile(rows[0]);
      var own=confirmed&&confirmed.username.toLowerCase()===rows[0].username.toLowerCase();
      $('profile-login-link').hidden=!!confirmed;
      if(own)editor(rows[0]);
    }catch(e){if(turn===seq)status('Nie udało się wczytać profilu. Sprawdź połączenie i spróbuj ponownie.');}
  }
  $('profile-form').addEventListener('submit',async function(e){
    e.preventDefault();var s=api.session();if(!confirmed||!s||s.token!==confirmed.token||!current){$('profile-result').textContent='Sesja się zmieniła — odśwież stronę.';return;}
    var a=document.querySelector('input[name="avatar"]:checked'),c=document.querySelector('input[name="color"]:checked');if(!a||!c)return;
    var button=$('profile-save');button.disabled=true;$('profile-result').textContent='Zapisywanie…';
    try{
      var result=await api.rpc('rejchat_update_profile',{p_token:s.token,p_avatar:a.value,p_color:c.value,p_bio:$('profile-bio-input').value});
      var latest=api.session();if(!latest||latest.token!==s.token){load();return;}
      api.invalidate(confirmed.username);var p=(await api.getMany([confirmed.username],true))[0];if(!p)throw new Error('Nie udało się odświeżyć profilu.');
      showProfile(p);$('profile-result').textContent='Gotowe! Twój profil został zapisany.';api.refreshHeader();
    }catch(err){$('profile-result').textContent=err.message||'Nie udało się zapisać profilu.';}
    finally{button.disabled=false;}
  });
  window.addEventListener('storage',function(e){if(e.key==='rejson_community_session_v1'||e.key===null)load();});
  load();
})();

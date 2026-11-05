/* Osobisty stan wyciszenia: tylko prawdziwa odpowiedź serwera i aktualna sesja. */
(function(window,document){
  'use strict';
  var api=window.RJProfiles,notice=document.getElementById('rejchat-mute-notice'),detail=document.getElementById('rejchat-mute-detail'),reason=document.getElementById('rejchat-mute-reason');
  if(!api||!notice||!detail||!reason)return;
  var seq=0;
  function reset(){notice.hidden=true;detail.textContent='';reason.textContent='';reason.hidden=true;}
  function refresh(){
    var session=api.session(), request=++seq;if(!session){reset();return;}
    var token=session.token;
    api.rpc('rejchat_my_mute',{p_token:token}).then(function(state){
      var current=api.session();if(request!==seq||!current||current.token!==token)return;
      if(!state||state.muted!==true){reset();return;}
      var when=state.until_at?new Date(state.until_at):null;
      detail.textContent=when&&!isNaN(when.getTime())?'Pisanie jest wstrzymane do '+when.toLocaleString('pl-PL')+'. Po tym czasie wyciszenie wygaśnie automatycznie.':'Pisanie jest wstrzymane bezterminowo, do decyzji administratora.';
      var why=typeof state.reason==='string'?state.reason:'';reason.textContent=why?'Powód: '+why:'';reason.hidden=!why;notice.hidden=false;
    }).catch(function(){/* Błąd sieci nie zmienia ostatniego potwierdzonego stanu. */});
  }
  function sessionChanged(){seq++;reset();refresh();}
  window.addEventListener('rj:session-change',sessionChanged);
  window.addEventListener('storage',function(e){if(e.key==='rejson_community_session_v1'||e.key===null)sessionChanged();});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')refresh();});
  window.setInterval(function(){if(document.visibilityState==='visible'&&api.session())refresh();},15000);
  refresh();
})(window,document);

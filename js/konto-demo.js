/* Makieta na tym samym originie: nigdy nie przekazuje tokenu do URL ani innego projektu. */
(function(){
  'use strict';
  var PENDING='rejson_demo_login_pending_v1', CONNECTED='rejson_demo_connected_v1', age=30*60*1000;
  var $=function(id){return document.getElementById(id);}, sequence=0;
  function read(key){try{return sessionStorage.getItem(key);}catch(e){return null;}}
  function remove(key){try{sessionStorage.removeItem(key);}catch(e){}}
  function save(key,val){try{sessionStorage.setItem(key,val);return true;}catch(e){return false;}}
  function message(text){$('demo-status').textContent=text||'';}
  function reset(){remove(CONNECTED);$('demo-name').textContent='';$('demo-user').hidden=true;$('demo-guest').hidden=false;}
  function pending(){var t=Number(read(PENDING));return t>0&&Date.now()-t>=0&&Date.now()-t<age;}
  async function check(fromClick){
    var turn=++sequence; $('demo-connect').disabled=true;message('Sprawdzam konto…');
    try{
      var session=await window.RejsonAccount.getSession();if(turn!==sequence)return;
      if(session){
        if(!save(CONNECTED,'1')){message('Nie można zapisać stanu demonstracji w tej karcie.');return;}
        remove(PENDING);$('demo-name').textContent=session.username;$('demo-guest').hidden=true;$('demo-user').hidden=false;message('');return;
      }
      reset();
      if(!fromClick){remove(PENDING);message('Nie jesteś zalogowany. Kliknij przycisk, aby spróbować ponownie.');return;}
      if(!save(PENDING,String(Date.now()))){message('Ta przeglądarka blokuje pamięć sesji. Nie można bezpiecznie wrócić do demonstracji.');return;}
      window.RejsonAccount.open();
    }catch(e){if(turn===sequence)message('Nie udało się sprawdzić konta. Spróbuj ponownie.');}
    finally{if(turn===sequence)$('demo-connect').disabled=false;}
  }
  $('demo-connect').addEventListener('click',function(){check(true);});
  $('demo-disconnect').addEventListener('click',function(){++sequence;remove(PENDING);reset();$('demo-connect').disabled=false;message('Demonstracja odłączona. Nadal jesteś zalogowany na stronie.');});
  window.RejsonAccount.subscribe(function(){if(read(CONNECTED)==='1'||pending())check(false);});
  if(read(PENDING)&&!pending())remove(PENDING);
  if(read(CONNECTED)==='1'||pending())check(false);
})();

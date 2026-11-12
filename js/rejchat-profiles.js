/* Publiczny wygląd profili RejChat — żadne dane uwierzytelniające nie są publiczne. */
(function (window, document) {
  'use strict';
  var base='https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/';
  // Klucz anon jest publiczny i wspólny z kontem.
  var key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';
  var sessionKey='rejson_community_session_v1';
  /* Katalog awatarów — jedno źródło prawdy dla profilu i podglądów.
     Klucze `group` odpowiadają kategoriom w edytorze profilu. */
  var avatarCatalog=[
    {id:'comet',name:'Kometa',group:'kosmos'},
    {id:'planet',name:'Planeta',group:'kosmos'},
    {id:'moon',name:'Księżyc',group:'kosmos'},
    {id:'star',name:'Gwiazda',group:'kosmos'},
    {id:'rocket',name:'Rakieta',group:'kosmos'},
    {id:'cat',name:'Kot',group:'zwierzeta'},
    {id:'fox',name:'Lis',group:'zwierzeta'},
    {id:'bee',name:'Pszczoła',group:'zwierzeta'},
    {id:'panda',name:'Panda',group:'zwierzeta'},
    {id:'owl',name:'Sowa',group:'zwierzeta'},
    {id:'whale',name:'Wieloryb',group:'zwierzeta'},
    {id:'leaf',name:'Liść',group:'natura'},
    {id:'flower',name:'Kwiat',group:'natura'},
    {id:'mushroom',name:'Grzyb',group:'natura'},
    {id:'cactus',name:'Kaktus',group:'natura'},
    {id:'wave',name:'Fala',group:'natura'},
    {id:'snow',name:'Śnieżynka',group:'natura'},
    {id:'cloud',name:'Chmurka',group:'klimat'},
    {id:'flame',name:'Płomień',group:'klimat'},
    {id:'heart',name:'Serce',group:'klimat'},
    {id:'spark',name:'Iskra',group:'klimat'},
    {id:'gem',name:'Klejnot',group:'klimat'},
    {id:'music',name:'Muzyka',group:'klimat'},
    {id:'coffee',name:'Kawa',group:'klimat'}
  ];
  var avatars=avatarCatalog.map(function(a){return a.id;});
  var colors=['mint','blue','violet','rose','amber','slate'];
  var frames=['none','ice','violet','rose','amber','prism'];
  var banners=['aurora','ocean','dusk','ember','mono','prism'];
  var cache=Object.create(null), pending=Object.create(null), syncSeq=0;
  /* Wspólna warstwa sieciowa: limit czasu, ponowienia i sklejanie identycznych
     żądań. Bez niej pojedynczy pakiet gubiony w drodze zostawiał pusty profil. */
  function rpc(name, data) {
    var url=base+name;
    if (window.RJNet && window.RJNet.rpc) {
      return window.RJNet.rpc(url,data||{},{label:name,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},retries:window.RJNet.readOnly(name)?2:0});
    }
    return fetch(url,{method:'POST',cache:'no-store',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(data)}).then(function (r) {
      return r.json().catch(function(){return null;}).then(function (body) {if(!r.ok) throw new Error(body && body.message || 'Nie udało się połączyć.');return body;});
    });
  }
  function session() {
    try {var s=JSON.parse(localStorage.getItem(sessionKey)||'null');return s && typeof s.token==='string' && s.token.length>=16 && typeof s.username==='string' ? s:null;} catch(e){return null;}
  }
  function safeName(name){return typeof name==='string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(name);}
  function normalized(p) {
    if(!p || !safeName(p.username)) return null;
    return {username:p.username,avatar:avatars.indexOf(p.avatar)>=0?p.avatar:'comet',color:colors.indexOf(p.color)>=0?p.color:'mint',frame:frames.indexOf(p.frame)>=0?p.frame:'none',banner:banners.indexOf(p.banner)>=0?p.banner:'aurora',bio:typeof p.bio==='string'?p.bio.slice(0,240):'',nickname:typeof p.nickname==='string'?p.nickname.slice(0,64):'',updated_at:typeof p.updated_at==='string'?p.updated_at:'',is_bot:p.is_bot===true,is_owner:p.is_owner===true};
  }
  function getMany(names, fresh) {
    var valid=Array.from(new Set(names.filter(safeName).map(function(n){return n.toLowerCase();}))).slice(0,100), waits=[];
    // Po zapisie nie używaj żądania, które mogło wystartować przed zmianą profilu.
    if(fresh && valid.some(function(n){return !!pending[n];})) {
      return Promise.all(valid.map(function(n){return pending[n] ? pending[n].catch(function(){}) : Promise.resolve();})).then(function(){return getMany(valid,true);});
    }
    var missing=valid.filter(function(n){if(!fresh && cache[n] && Date.now()-cache[n].at<60000)return false;if(pending[n]){waits.push(pending[n]);return false;}return true;});
    if(missing.length){
      var req=rpc('rejchat_get_profiles',{p_names:missing}).then(function(rows){
        if(!Array.isArray(rows))throw new Error('Nieprawidłowa odpowiedź profilu.');
        missing.forEach(function(n){cache[n]={value:null,at:Date.now()};});
        rows.forEach(function(row){var p=normalized(row);if(p)cache[p.username.toLowerCase()]={value:p,at:Date.now()};});
      }).finally(function(){missing.forEach(function(n){delete pending[n];});});
      missing.forEach(function(n){pending[n]=req;}); waits.push(req);
    }
    return Promise.all(waits).then(function(){return valid.map(function(n){return cache[n] && cache[n].value;}).filter(Boolean);});
  }
  function apply(root) {
    var nodes=Array.prototype.slice.call((root||document).querySelectorAll('[data-profile-name], [data-profile-avatar]'));
    var names=nodes.map(function(el){return el.getAttribute('data-profile-name')||el.getAttribute('data-profile-avatar');});
    return getMany(names).then(function(){nodes.forEach(function(el){
      if(!el.isConnected)return;
      var name=el.getAttribute('data-profile-name')||el.getAttribute('data-profile-avatar');
      var entry=cache[String(name).toLowerCase()];var p=entry && entry.value;if(!p)return;
      if(el.hasAttribute('data-profile-name')){el.dataset.profileColor=p.color;el.textContent=p.nickname ? p.nickname+' (@'+p.username+')' : p.username;}
      else if(!p.is_bot){
        var img=el.querySelector('img[data-profile-img]');if(!img){img=document.createElement('img');img.alt='';img.setAttribute('data-profile-img','');el.textContent='';el.appendChild(img);}
        img.src='/assets/avatars/'+p.avatar+'.svg';
      }
    });}).catch(function(){ /* Treść i inicjały pozostają widoczne bez sieci. */ });
  }
  function refreshHeader(){
    var seq=++syncSeq,s=session(), header=document.querySelector('body > header.site-header, body > header.topbar, body > header.portal-header');
    if(!header)return;
    function clear(){var old=header.querySelector('.rj-header-profile');if(old)old.remove();header.querySelectorAll('.rj-profile-nav-replaced').forEach(function(a){a.classList.remove('rj-profile-nav-replaced');});}
    if(!s){clear();return;}
    rpc('community_whoami',{p_token:s.token}).then(function(who){
      if(seq!==syncSeq)return;
      if(!who || !safeName(who.username)){clear();return;}
      return getMany([who.username]).catch(function(){return [];}).then(function(rows){
        if(seq!==syncSeq)return;
        var p=rows[0]||{username:who.username,avatar:'comet'};
        clear();
        header.querySelectorAll('a[href]').forEach(function(a){
          var u;try{u=new URL(a.href,location.href);}catch(e){return;}
          if(u.origin===location.origin && /^\/logowanie(?:\.html)?\/?$/.test(u.pathname))a.classList.add('rj-profile-nav-replaced');
        });
        var link=document.createElement('a');link.className='rj-header-profile';link.href='/profil';link.title='Mój profil — '+who.username;link.setAttribute('aria-label',link.title);
        var img=document.createElement('img');img.alt='';img.src='/assets/avatars/'+p.avatar+'.svg';link.appendChild(img);
        var parent=header.querySelector('.header-right')||header.querySelector('.header-inner')||header;
        var toggle=parent.querySelector('.hamburger-btn'); if(toggle && toggle.parentNode===parent)parent.insertBefore(link,toggle);else parent.appendChild(link);
      });
    }).catch(function(){if(seq===syncSeq)clear();});
  }
  function invalidate(name){if(safeName(name))delete cache[name.toLowerCase()];}
  window.RJProfiles={rpc:rpc,session:session,getMany:getMany,hydrate:apply,invalidate:invalidate,refreshHeader:refreshHeader,avatars:avatars.slice(),avatarCatalog:avatarCatalog.map(function(a){return {id:a.id,name:a.name,group:a.group};}),colors:colors.slice(),frames:frames.slice(),banners:banners.slice(),safeName:safeName};
  window.addEventListener('storage',function(e){if(e.key===sessionKey||e.key===null)refreshHeader();});
  window.addEventListener('rj:session-change',refreshHeader);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshHeader);else refreshHeader();
})(window,document);

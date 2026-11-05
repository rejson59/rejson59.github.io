/* Bezpieczne karty linków: bez automatycznych zapytań do obcych stron. */
(function(window,document){
  'use strict';
  var root=document.querySelector('.rj-community');if(!root)return;
  function element(tag,cls,text){var el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
  function info(link){
    var u;try{u=new URL(link.href,location.href);}catch(e){return null;}
    if(!/^https?:$/.test(u.protocol)||u.username||u.password||!u.hostname)return null;
    var host=u.hostname.toLowerCase(),parts=u.pathname.split('/').filter(Boolean),repo=null,video=null;
    if(host==='github.com'&&parts.length===2&&/^[a-z0-9-]{1,39}$/i.test(parts[0])&&/^[a-z0-9_.-]{1,100}$/i.test(parts[1])&&!/\.git$/i.test(parts[1]))repo=parts;
    if(host==='youtu.be'&&parts.length===1)video=parts[0];
    if((host==='www.youtube.com'||host==='youtube.com'||host==='m.youtube.com')&&u.pathname==='/watch')video=u.searchParams.get('v');
    if(video&&!/^[A-Za-z0-9_-]{11}$/.test(video))video=null;
    return {url:u,host:host,repo:repo,video:video};
  }
  function add(text){
    if(text.dataset.linkPreviewReady)return;text.dataset.linkPreviewReady='1';
    var link=text.querySelector('a.comm-link'),item=link&&info(link);if(!item)return;
    var card=element('div','rc-link-card'),head=element('div','rc-link-head'),icon=element('span','rc-link-icon','↗'),title=element('strong','',item.host),caption=element('small','',item.repo?'Repozytorium GitHub':item.video?'Film YouTube':'Podgląd adresu • bez metadanych');
    var labels=element('span','rc-link-labels');labels.append(title,caption);head.append(icon,labels);card.appendChild(head);
    var path=element('span','rc-link-path',item.url.pathname.length>100?item.url.pathname.slice(0,97)+'…':item.url.pathname);card.appendChild(path);
    var open=element('a','rc-link-open','Otwórz link ↗');open.href=link.href;open.target='_blank';open.rel='noopener noreferrer nofollow';card.appendChild(open);
    if(item.repo||item.video){
      var btn=element('button','rc-link-load',item.repo?'Pokaż informacje z GitHub':'Pokaż miniaturę z YouTube');btn.type='button';card.appendChild(btn);
      var result=element('div','rc-link-result');card.appendChild(result);
      btn.addEventListener('click',function(){
        btn.disabled=true;result.textContent=item.repo?'Pobieranie z GitHub…':'Ładowanie z YouTube…';
        if(item.video){var image=element('img','rc-link-image');image.alt='Miniatura filmu YouTube';image.referrerPolicy='no-referrer';image.loading='lazy';image.addEventListener('load',function(){btn.hidden=true;});image.addEventListener('error',function(){result.textContent='Nie udało się pobrać miniatury.';btn.disabled=false;});result.replaceChildren(image);image.src='https://i.ytimg.com/vi/'+item.video+'/hqdefault.jpg';return;}
        var controller=new AbortController(), timer=setTimeout(function(){controller.abort();},6000);
        fetch('https://api.github.com/repos/'+encodeURIComponent(item.repo[0])+'/'+encodeURIComponent(item.repo[1]),{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal}).then(function(r){if(!r.ok)throw Error('Nie udało się pobrać repozytorium.');return r.json();}).then(function(data){if(!card.isConnected)return;result.replaceChildren();result.appendChild(element('strong','',String(data.full_name||item.repo.join('/')).slice(0,150)));result.appendChild(element('p','',String(data.description||'Publiczne repozytorium GitHub.').slice(0,300)));btn.hidden=true;}).catch(function(){if(card.isConnected){result.textContent='Nie udało się pobrać informacji. Link nadal działa.';btn.disabled=false;}}).finally(function(){clearTimeout(timer);});
      });
    }
    text.insertAdjacentElement('afterend',card);
  }
  function scan(){root.querySelectorAll('.chat-text,.post-content,.comment-content').forEach(add);}
  var queued=false;new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;scan();});}).observe(root,{childList:true,subtree:true});scan();
})(window,document);

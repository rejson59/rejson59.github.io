/* Zdjęcia są pobierane na żądanie, nie przez publiczny adres w DM. */
(function(window,document){
  'use strict';
  var allowed=['image/jpeg','image/png','image/webp','image/gif'];
  function picker(prefix,onChange){
    var input=document.getElementById(prefix+'-photo'),label=document.getElementById(prefix+'-photo-name'),clear=document.getElementById(prefix+'-photo-clear');
    var hint='Do 10 MiB (GIF do 1 MiB). Większe zdjęcia zmniejszymy do JPG. Wygasa po 14 dniach.';
    function update(){var file=input.files&&input.files[0];label.textContent=file?file.name+' · '+Math.ceil(file.size/1024)+' KiB':hint;clear.hidden=!file;if(onChange)onChange();}
    input.addEventListener('change',update);clear.addEventListener('click',function(){input.value='';update();});
    return {file:function(){return input.files&&input.files[0]||null;},clear:function(){input.value='';update();},disabled:function(value){input.disabled=value;clear.disabled=value;}};
  }
  function read(file){
    if(!file || allowed.indexOf(file.type)<0) return Promise.reject(new Error('Wybierz zdjęcie JPG, PNG, WebP lub GIF.'));
    if(!file.size || file.size>10485760) return Promise.reject(new Error('Zdjęcie może mieć maksymalnie 10 MiB.'));
    if(file.size>1048576 && file.type==='image/gif')return Promise.reject(new Error('Animowany GIF może mieć maksymalnie 1 MiB.'));
    if(file.size>1048576) return new Promise(function(resolve,reject){
      var url=URL.createObjectURL(file),image=new Image();
      image.onerror=function(){URL.revokeObjectURL(url);reject(new Error('Nie udało się zmniejszyć zdjęcia.'));};
      image.onload=function(){try{
        URL.revokeObjectURL(url);if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw new Error('Zdjęcie ma zbyt duże wymiary.');
        var scale=Math.min(1,1600/image.naturalWidth,1600/image.naturalHeight),canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        var ctx=canvas.getContext('2d');if(!ctx)throw new Error('Nie udało się zmniejszyć zdjęcia.');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
        var quality=0.82,result='';do{result=canvas.toDataURL('image/jpeg',quality);quality-=0.13;}while(result.length>1398127&&quality>=0.3);
        var prefix='data:image/jpeg;base64,';if(result.indexOf(prefix)!==0||result.length>1398127)throw new Error('Nie udało się zmniejszyć zdjęcia do 1 MiB.');
        resolve({mime:'image/jpeg',data:result.slice(prefix.length)});
      }catch(err){reject(err);}};image.src=url;
    });
    return new Promise(function(resolve,reject){var reader=new FileReader();reader.onerror=function(){reject(new Error('Nie udało się odczytać zdjęcia.'));};reader.onload=function(){var value=String(reader.result||''),prefix='data:'+file.type+';base64,';if(value.indexOf(prefix)!==0)return reject(new Error('Nie udało się odczytać zdjęcia.'));resolve({mime:file.type,data:value.slice(prefix.length)});};reader.readAsDataURL(file);});
  }
  function attach(container,scope){
    container.addEventListener('click',function(e){
      var button=e.target.closest('[data-photo-id]');if(!button||button.disabled)return;
      var s=window.RJProfiles.session(),token=s?s.token:null;if(!token)return;
      var id=button.getAttribute('data-photo-id');if(!/^[0-9a-f-]{36}$/i.test(id))return;
      button.disabled=true;button.textContent='Wczytywanie zdjęcia…';
      window.RJProfiles.rpc('rejchat_get_photo',{p_id:id,p_token:token}).then(function(result){
        if(!button.isConnected)return;var now=window.RJProfiles.session();if(!now||now.token!==token)return;
        if(!result||allowed.indexOf(result.mime)<0||typeof result.data!=='string'||result.data.length>1400000||!/^[A-Za-z0-9+/=\r\n]+$/.test(result.data))throw new Error('Nieprawidłowe zdjęcie.');
        var image=document.createElement('img');image.className='rejchat-photo';image.alt='Zdjęcie w wiadomości';image.src='data:'+result.mime+';base64,'+result.data.replace(/[\r\n]/g,'');image.addEventListener('error',function(){image.replaceWith(document.createTextNode('Nie udało się wyświetlić zdjęcia.'));});button.replaceWith(image);
      }).catch(function(err){if(button.isConnected){button.disabled=false;button.textContent=(err&&err.message)||'Nie udało się wczytać zdjęcia.';}});
    });
  }
  function button(photo){if(!photo||!/^[0-9a-f-]{36}$/i.test(String(photo.id||'')))return '';var expired=Date.parse(photo.expires_at)<=Date.now();return expired?'<span class="rejchat-photo-expired">Zdjęcie wygasło po 14 dniach.</span>':'<button type="button" class="rejchat-photo-load" data-photo-id="'+photo.id+'">📷 Pokaż zdjęcie</button>';}
  window.RJChatPhotos={picker:picker,read:read,attach:attach,button:button};
})(window,document);

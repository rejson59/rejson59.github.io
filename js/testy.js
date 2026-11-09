(function () {
  'use strict';
  var specs = [
    ['opacity','Przezroczystość szkła',0,80,1,16,'%','Ile koloru pozostaje na powierzchni.','material'],
    ['blur','Rozmycie tła',0,60,1,20,'px','Oddziela treść od szczegółów za panelem.','material'],
    ['saturate','Nasycenie tła',0,250,5,160,'%','Wzmacnia lub przycisza kolory za szkłem.','material'],
    ['border','Widoczność krawędzi',0,100,1,45,'%','','light'],
    ['borderWidth','Grubość krawędzi',0,4,0.5,1,'px','','light'],
    ['radius','Zaokrąglenie',0,48,1,22,'px','','light'],
    ['reflect','Siła refleksu',0,80,1,20,'%','','light'],
    ['angle','Kierunek światła',0,360,5,135,'°','','light'],
    ['convex','Wypukłość powierzchni',0,100,1,30,'%','Modeluje krzywiznę za pomocą światła i cienia.','shape'],
    ['bevel','Grubość szlifowanej krawędzi',0,16,1,3,'px','Jaśniejszy i ciemniejszy brzeg tafli.','shape'],
    ['depth','Głębokość warstwy',0,20,1,3,'px','Widoczna grubość pod panelem.','shape'],
    ['tiltX','Pochylenie w pionie',-18,18,1,0,'°','Obraca dużą kartę pod kątem do podglądu.','shape'],
    ['tiltY','Pochylenie w poziomie',-18,18,1,0,'°','','shape'],
    ['perspective','Perspektywa podglądu',400,1600,50,800,'px','Mniejsza wartość daje mocniejszą perspektywę.','shape'],
    ['glow','Siła poświaty',0,80,1,12,'%','','shadow'],
    ['glowSize','Zasięg poświaty',0,80,1,22,'px','','shadow'],
    ['shadow','Siła cienia',0,80,1,30,'%','','shadow'],
    ['shadowY','Odsunięcie cienia',0,50,1,14,'px','','shadow'],
    ['shadowBlur','Rozmycie cienia',0,90,1,35,'px','','shadow'],
    ['duration','Czas animacji',2,15,0.5,5,' s','','motion']
  ];
  var defaults={color:'#a8cfff',motion:'sweep',hover:true,background:'aurora'};
  specs.forEach(function(s){defaults[s[0]]=s[5];});
  var presets={
    crystal:{color:'#a8cfff',opacity:16,blur:20,saturate:160,border:45,reflect:20,glow:12},
    midnight:{color:'#1c2b48',opacity:55,blur:24,saturate:140,border:25,reflect:12,shadow:48,glow:7},
    frost:{color:'#ffffff',opacity:36,blur:42,saturate:110,border:55,reflect:28,shadow:18,glow:9},
    prism:{color:'#c6b5ff',opacity:22,blur:24,saturate:200,border:55,reflect:35,glow:32,glowSize:45},
    lens:{color:'#b6ddff',opacity:20,blur:24,saturate:170,border:58,reflect:30,convex:75,bevel:9,depth:9,shadow:42,tiltX:8,tiltY:-10},
    flat:{color:'#a8cfff',opacity:16,blur:20,convex:0,bevel:0,depth:0,shadow:18}
  };
  var state=Object.assign({},defaults), stage=document.getElementById('lab-stage'), status=document.getElementById('lab-status');
  var storageKey='rejson_glass_lab_saved_v1';
  var motionStatus=document.getElementById('lab-motion-status');
  var reduceMotion=window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function motionBlocked(){return document.getElementById('lab-test-motion').checked || !!(reduceMotion && reduceMotion.matches);}
  function describeMotion(replayed){
    var blocked=motionBlocked(); motionStatus.dataset.blocked=String(blocked || state.motion==='none');
    var message;
    if(blocked)message='Animacja jest wyłączona przez ograniczenie ruchu (ustawienie systemu lub test poniżej).';
    else if(state.motion==='none')message='Wybrano „Bez animacji”. Wybierz rodzaj ruchu, aby go odtworzyć.';
    else {var target=state.motion==='sweep'?'na wszystkich szklanych panelach':'na dużej karcie';message=(replayed?'Odtwarzam od początku':'Animacja odtwarza się w pętli')+' '+target+' ('+state.duration+' s).';}
    if(motionStatus.textContent!==message)motionStatus.textContent=message;
  }
  if(reduceMotion){if(reduceMotion.addEventListener)reduceMotion.addEventListener('change',function(){describeMotion(false);});else if(reduceMotion.addListener)reduceMotion.addListener(function(){describeMotion(false);});}
  function validate(data){
    if(!data || typeof data!=='object')return null;
    var result=Object.assign({},defaults);
    specs.forEach(function(s){var v=Number(data[s[0]]);if(Number.isFinite(v))result[s[0]]=Math.min(s[3],Math.max(s[2],v));});
    // Zapisy sprzed dodania wypukłości zachowują dawny, płaski materiał.
    ['convex','bevel','depth'].forEach(function(key){if(!Object.prototype.hasOwnProperty.call(data,key))result[key]=0;});
    if(typeof data.color==='string' && /^#[0-9a-f]{6}$/i.test(data.color))result.color=data.color;
    if(['none','sweep','float','pulse'].indexOf(data.motion)!==-1)result.motion=data.motion;
    if(typeof data.hover==='boolean')result.hover=data.hover;
    if(['aurora','night','day','colorful'].indexOf(data.background)!==-1)result.background=data.background;
    return result;
  }
  specs.forEach(function(s){
    var label=document.createElement('label');label.className='lab-range';
    var top=document.createElement('span');top.className='lab-range-label';var text=document.createElement('span');text.textContent=s[1];var output=document.createElement('output');top.append(text,output);
    var input=document.createElement('input');input.type='range';input.min=s[2];input.max=s[3];input.step=s[4];input.value=s[5];input.dataset.field=s[0];input.setAttribute('aria-label',s[1]);
    label.append(top,input);if(s[7]){var hint=document.createElement('small');hint.textContent=s[7];label.append(hint);}document.getElementById('lab-sliders-'+s[8]).append(label);
  });
  function rgb(hex){return [1,3,5].map(function(i){return parseInt(hex.slice(i,i+2),16);}).join(' ');}
  function cssText(){
    var c=rgb(state.color), s=state;
    var result='/* Szkło z laboratorium /testy. Dobierz kolor tekstu do tła. */\n.glass {\n  color: inherit;\n  border: '+s.borderWidth+'px solid rgb('+c+' / '+s.border/100+');\n  border-radius: '+s.radius+'px;\n  background: radial-gradient(ellipse at 30% 0%, rgb(255 255 255 / '+s.convex/100+') 0%, transparent 70%), linear-gradient(155deg, transparent 45%, rgb(0 5 20 / '+s.convex/250+') 100%), linear-gradient('+s.angle+'deg, rgb(255 255 255 / '+s.reflect/100+'), transparent 45%), rgb('+c+' / '+s.opacity/100+');\n  box-shadow: 0 '+s.shadowY+'px '+s.shadowBlur+'px rgb(0 5 20 / '+s.shadow/100+'), 0 '+s.depth+'px 0 -1px rgb(7 18 35 / .38), inset 0 '+s.bevel+'px '+(s.bevel*2)+'px rgb(255 255 255 / '+s.convex/100+'), inset 0 -'+s.bevel+'px '+(s.bevel*2)+'px rgb(0 5 20 / '+s.convex/250+'), inset 0 1px 0 rgb(255 255 255 / '+s.reflect/100+'), 0 0 '+s.glowSize+'px rgb('+c+' / '+s.glow/100+');\n  -webkit-backdrop-filter: blur('+s.blur+'px) saturate('+s.saturate+'%);\n  backdrop-filter: blur('+s.blur+'px) saturate('+s.saturate+'%);\n}\n@supports not (backdrop-filter: blur(1px)) {\n  .glass { background: #34435d; color: #fff; }\n}\n';
    result+='\n/* Opcjonalny widok pod kątem: umieść .glass wewnątrz .glass-view. */\n.glass-view { transform: perspective('+s.perspective+'px) rotateX('+s.tiltX+'deg) rotateY('+s.tiltY+'deg); }\n';
    if(s.hover)result+='\n.glass { transition: translate .28s; }\n.glass:hover { translate: 0 -3px; }\n';
    if(s.motion!=='none'){
      if(s.motion==='sweep')result+='\n.glass { position: relative; isolation: isolate; overflow: hidden; }\n.glass::before { content: ""; position: absolute; z-index: 0; inset: 0; pointer-events: none; background: linear-gradient(110deg, transparent 25%, #ffffff80 50%, transparent 75%); animation: glass-sweep '+s.duration+'s linear infinite; }\n.glass > * { position: relative; z-index: 1; }\n@keyframes glass-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }\n';
      if(s.motion==='float')result+='\n.glass { animation: glass-float '+s.duration+'s ease-in-out infinite; }\n@keyframes glass-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }\n';
      if(s.motion==='pulse')result+='\n.glass { animation: glass-pulse '+s.duration+'s ease-in-out infinite; }\n@keyframes glass-pulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.32); } }\n';
      result+='@media (prefers-reduced-motion: reduce) { .glass, .glass::before { animation: none !important; transition: none !important; } }\n';
    }else if(s.hover)result+='@media (prefers-reduced-motion: reduce) { .glass { transition: none; } }\n';
    return result;
  }
  function render(){
    var values={'rgb':rgb(state.color),'opacity':state.opacity/100,'blur':state.blur+'px','saturate':state.saturate+'%','border':state.border/100,'border-width':state.borderWidth+'px','radius':state.radius+'px','reflect':state.reflect/100,'angle':state.angle+'deg','glow':state.glow/100,'glow-size':state.glowSize+'px','shadow':state.shadow/100,'shadow-y':state.shadowY+'px','shadow-blur':state.shadowBlur+'px','duration':state.duration+'s','convex':state.convex/100,'convex-shade':state.convex/250,'bevel':state.bevel+'px','bevel-blur':(state.bevel*2)+'px','depth':state.depth+'px','tilt-x':state.tiltX+'deg','tilt-y':state.tiltY+'deg','perspective':state.perspective+'px'};
    Object.keys(values).forEach(function(k){stage.style.setProperty('--g-'+k,values[k]);});
    stage.dataset.background=state.background;stage.dataset.motion=state.motion;stage.dataset.hover=String(state.hover);
    document.querySelectorAll('[data-field]').forEach(function(input){var field=input.dataset.field;if(input.type==='checkbox')input.checked=state[field];else input.value=state[field];if(input.type==='range'){var spec=specs.find(function(s){return s[0]===field;});input.parentElement.querySelector('output').textContent=state[field]+spec[6];}});
    document.querySelectorAll('[data-background]').forEach(function(button){if(button.tagName==='BUTTON')button.setAttribute('aria-pressed',String(button.dataset.background===state.background));});
    document.getElementById('lab-css').textContent=cssText();
    describeMotion(false);
  }
  document.addEventListener('input',function(e){var field=e.target.dataset.field;if(!field)return;if(e.target.type==='range')state[field]=Number(e.target.value);else if(field==='color')state.color=e.target.value;else if(field==='motion')state.motion=e.target.value;else if(field==='hover')state.hover=e.target.checked;render();});
  document.getElementById('lab-colors').addEventListener('click',function(e){var b=e.target.closest('[data-color]');if(b){state.color=b.dataset.color;render();}});
  document.getElementById('lab-presets').addEventListener('click',function(e){var b=e.target.closest('[data-preset]');if(b){state=Object.assign({},defaults,presets[b.dataset.preset],{background:state.background});render();status.textContent='Wczytano propozycję: '+b.querySelector('strong').textContent+'.';}});
  document.querySelector('.lab-segments').addEventListener('click',function(e){var b=e.target.closest('[data-background]');if(b){state.background=b.dataset.background;render();}});
  document.getElementById('lab-reset').addEventListener('click',function(){state=Object.assign({},defaults);render();status.textContent='Przywrócono ustawienia początkowe.';});
  document.getElementById('lab-save').addEventListener('click',function(){try{localStorage.setItem(storageKey,JSON.stringify(state));status.textContent='Zapisano styl w tej przeglądarce.';}catch(e){status.textContent='Nie udało się zapisać stylu w przeglądarce.';}});
  document.getElementById('lab-load').addEventListener('click',function(){try{var saved=validate(JSON.parse(localStorage.getItem(storageKey)||'null'));if(!saved){status.textContent='Nie ma jeszcze zapisanego stylu.';return;}state=saved;render();status.textContent='Wczytano zapisany styl.';}catch(e){status.textContent='Nie udało się wczytać zapisanego stylu.';}});
  function copy(text){if(!navigator.clipboard||!navigator.clipboard.writeText){status.textContent='Kopiowanie jest niedostępne. Rozwiń CSS i zaznacz go ręcznie.';return;}navigator.clipboard.writeText(text).then(function(){status.textContent='Skopiowano do schowka.';}).catch(function(){status.textContent='Nie udało się skopiować. Rozwiń CSS i zaznacz go ręcznie.';});}
  document.getElementById('lab-copy').addEventListener('click',function(){copy(cssText());});
  document.getElementById('lab-copy-settings').addEventListener('click',function(){copy(JSON.stringify(state,null,2));});
  document.getElementById('lab-play').addEventListener('click',function(){
    if(state.motion==='none' || motionBlocked()){describeMotion(false);return;}
    // Zatrzymaj właściwy efekt, wymuś przeliczenie stylu, a potem uruchom go od zera.
    stage.dataset.motion='none';
    var sample=stage.querySelector('.lab-demo-card');
    if(sample)window.getComputedStyle(sample).animationName;
    stage.dataset.motion=state.motion;
    describeMotion(true);
  });
  document.getElementById('lab-test-fallback').addEventListener('change',function(){stage.dataset.testFallback=String(this.checked);});
  document.getElementById('lab-test-motion').addEventListener('change',function(){stage.dataset.testMotion=String(this.checked);describeMotion(false);});
  render();
})();

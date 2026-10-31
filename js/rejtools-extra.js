/* Dodatkowe narzędzia RejTools: dane pozostają w przeglądarce. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var urls = {};
  function reset(id) { if (urls[id]) URL.revokeObjectURL(urls[id]); delete urls[id]; $(id).removeAttribute('href'); $(id).hidden = true; }
  function result(id, blob, name) { reset(id); urls[id] = URL.createObjectURL(blob); $(id).href = urls[id]; $(id).download = name; $(id).hidden = false; }
  window.addEventListener('pagehide', function () { Object.keys(urls).forEach(reset); });
  function filesAllowed(files) {
    if (!files.length) throw Error('Wybierz plik.');
    if (files.length > 20) throw Error('Możesz wybrać najwyżej 20 plików.');
    if (files.reduce(function (sum, f) { return sum + f.size; }, 0) > 50 * 1024 * 1024) throw Error('Łączny rozmiar plików przekracza 50 MiB.');
  }
  function indices(text, count, allowEmpty) {
    if (!text.trim() && allowEmpty) return Array.from({length:count}, function (_, i) { return i; });
    if (!text.trim()) throw Error('Podaj numery stron.');
    var output = [];
    text.split(',').forEach(function (part) {
      var m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) throw Error('Podaj strony w formacie np. 1, 3-5, 2.');
      var first = Number(m[1]), last = m[2] ? Number(m[2]) : first;
      if (first < 1 || last < first || last > count) throw Error('Numery stron muszą być w zakresie od 1 do ' + count + '.');
      if (output.length + last - first + 1 > 1000) throw Error('Maksymalnie 1000 stron w wyniku.');
      for (var i = first; i <= last; i++) output.push(i - 1);
    });
    return output;
  }
  var pdfAction = $('pdf-action'), pdfInput = $('pdf-files');
  function pdfReset() { reset('pdf-download'); $('pdf-status').textContent = ''; $('pdf-pages-wrap').hidden = pdfAction.value === 'merge'; }
  pdfAction.addEventListener('change', pdfReset); pdfInput.addEventListener('change', pdfReset); $('pdf-pages').addEventListener('input', pdfReset);
  $('pdf-run').addEventListener('click', async function () {
    var button = this, status = $('pdf-status'), files = Array.from(pdfInput.files), action = pdfAction.value;
    reset('pdf-download');
    try {
      filesAllowed(files);
      if (files.some(function(f) { return !/\.pdf$/i.test(f.name); })) throw Error('Wybierz pliki PDF.');
      if (action !== 'merge' && files.length !== 1) throw Error('Do tej operacji wybierz dokładnie jeden plik PDF.');
      button.disabled = pdfInput.disabled = pdfAction.disabled = $('pdf-pages').disabled = true;
      status.textContent = 'Przygotowywanie dokumentu…';
      var lib = await import('/vendor/pdf-lib/pdf-lib.esm.min.js');
      var out = await lib.PDFDocument.create(), total = 0;
      if (action === 'merge') {
        for (var file of files) {
          var source = await lib.PDFDocument.load(await file.arrayBuffer());
          total += source.getPageCount(); if (total > 1000) throw Error('Łącznie maksymalnie 1000 stron.');
          var pages = await out.copyPages(source, source.getPageIndices()); pages.forEach(function (p) { out.addPage(p); });
        }
      } else {
        var doc = await lib.PDFDocument.load(await files[0].arrayBuffer());
        if (doc.getPageCount() > 1000) throw Error('Maksymalnie 1000 stron w dokumencie.');
        var selected = indices($('pdf-pages').value, doc.getPageCount(), action === 'rotate');
        if (action === 'rotate') { Array.from(new Set(selected)).forEach(function (i) { var page = doc.getPage(i); page.setRotation(lib.degrees((page.getRotation().angle + 90) % 360)); }); out = doc; }
        else { var copied = await out.copyPages(doc, selected); copied.forEach(function (p) { out.addPage(p); }); }
      }
      if (!out.getPageCount()) throw Error('Dokument nie zawiera stron.');
      var bytes = await out.save(); result('pdf-download', new Blob([bytes], {type:'application/pdf'}), 'rejtools.pdf');
      status.textContent = 'Gotowe! Stron: ' + out.getPageCount() + '.';
    } catch (e) { status.textContent = e && /^(Wybierz|Możesz|Łączny|Łącznie|Maksymalnie|Numery|Podaj|Do tej|Dokument)/.test(e.message) ? e.message : 'Nie udało się odczytać PDF. Plik może być uszkodzony, zabezpieczony hasłem lub zbyt duży dla urządzenia.'; }
    finally { button.disabled = pdfInput.disabled = pdfAction.disabled = $('pdf-pages').disabled = false; }
  });
  $('pdf-images').addEventListener('change', function () { reset('images-pdf-download'); $('images-pdf-status').textContent = ''; });
  $('images-pdf-run').addEventListener('click', async function () {
    var button=this, input=$('pdf-images'), status=$('images-pdf-status'), files=Array.from(input.files); reset('images-pdf-download');
    try {
      filesAllowed(files); if (files.some(function(f) { return !/\.(png|jpe?g)$/i.test(f.name); })) throw Error('Wybierz obrazy PNG lub JPEG.');
      button.disabled=input.disabled=true; status.textContent='Tworzenie dokumentu…';
      var lib=await import('/vendor/pdf-lib/pdf-lib.esm.min.js'), doc=await lib.PDFDocument.create();
      for (var file of files) {
        var image=/\.png$/i.test(file.name)?await doc.embedPng(await file.arrayBuffer()):await doc.embedJpg(await file.arrayBuffer());
        var page=doc.addPage([595.28,841.89]), scale=Math.min(555.28/image.width,801.89/image.height), w=image.width*scale, h=image.height*scale;
        page.drawImage(image,{x:(595.28-w)/2,y:(841.89-h)/2,width:w,height:h});
      }
      result('images-pdf-download', new Blob([await doc.save()],{type:'application/pdf'}),'obrazy-rejtools.pdf'); status.textContent='Gotowe! Stron: '+doc.getPageCount()+'.';
    } catch(e) { status.textContent=e && /^(Wybierz|Możesz|Łączny)/.test(e.message)?e.message:'Nie udało się odczytać obrazu. Sprawdź plik i dostępną pamięć.'; }
    finally { button.disabled=input.disabled=false; }
  });
  function loadScript(url) { return new Promise(function(resolve,reject) { var script=document.createElement('script'); script.src=url; script.onload=resolve; script.onerror=reject; document.head.appendChild(script); }); }
  var qrPromise, qrGeneration=0;
  $('qr-text').addEventListener('input', function () { qrGeneration++; reset('qr-download'); $('qr-canvas').hidden=true; $('qr-status').textContent=''; });
  $('qr-run').addEventListener('click', async function () {
    var text=$('qr-text').value, seq=++qrGeneration, status=$('qr-status'), canvas=$('qr-canvas'); reset('qr-download'); canvas.hidden=true;
    if(!text.trim()) { status.textContent='Wpisz tekst lub link.'; return; }
    try {
      status.textContent='Tworzenie kodu…';
      if(!qrPromise) qrPromise=loadScript('/vendor/qrcode/qrcode.js').then(function(){return loadScript('/vendor/qrcode/qrcode_UTF8.js');}).catch(function(e){qrPromise=null;throw e;});
      await qrPromise; if(seq!==qrGeneration)return;
      var qr=window.qrcode(0,'M'); qr.addData(text); qr.make(); var size=qr.getModuleCount(), scale=6, margin=4;
      canvas.width=canvas.height=(size+margin*2)*scale; var ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#000';
      for(var row=0;row<size;row++) for(var col=0;col<size;col++) if(qr.isDark(row,col)) ctx.fillRect((col+margin)*scale,(row+margin)*scale,scale,scale);
      canvas.toBlob(function(blob){ if(seq!==qrGeneration)return; if(!blob){status.textContent='Nie udało się utworzyć obrazu.';return;} result('qr-download',blob,'kod-qr-rejtools.png');canvas.hidden=false;status.textContent='Kod gotowy!'; },'image/png');
    } catch(e) { if(seq===qrGeneration)status.textContent='Nie udało się utworzyć kodu. Spróbuj krótszego tekstu lub sprawdź połączenie.'; }
  });
  $('encode-input').addEventListener('input', function () { $('encode-output').value=''; $('encode-status').textContent=''; });
  document.querySelectorAll('[data-encoding]').forEach(function(button){button.addEventListener('click',function(){
    var text=$('encode-input').value, action=button.dataset.encoding, out=$('encode-output'), status=$('encode-status'); out.value='';
    try { if(action==='url-encode')out.value=encodeURIComponent(text); else if(action==='url-decode')out.value=decodeURIComponent(text); else if(action==='base64-encode') { var bytes=new TextEncoder().encode(text), binary=''; for(var b of bytes)binary+=String.fromCharCode(b); out.value=btoa(binary); } else { var raw=atob(text.trim()), bytes2=Uint8Array.from(raw,function(c){return c.charCodeAt(0)}); out.value=new TextDecoder('utf-8',{fatal:true}).decode(bytes2); } status.textContent='Gotowe.'; }
    catch(e){status.textContent='Niepoprawne dane do dekodowania.';}
  });});
  $('percent-run').addEventListener('click',function(){var a=$('percent-value'),b=$('percent-rate'),v=Number(a.value),p=Number(b.value);$('percent-status').textContent=a.value!==''&&b.value!==''&&Number.isFinite(v*p)?p+'% z '+v+' = '+Number((v*p/100).toPrecision(12)):'Podaj poprawne liczby.';});
  var units={length:{m:1,km:1000,cm:.01,mm:.001,mi:1609.344,ft:.3048,in:.0254},mass:{kg:1,g:.001,mg:.000001,lb:.45359237,oz:.028349523125},temperature:{'°C':1,'°F':1,K:1}};
  function convertUnit(){var kind=$('unit-kind').value, n=Number($('unit-value').value), from=$('unit-from').value, to=$('unit-to').value;if($('unit-value').value===''||!Number.isFinite(n)){ $('unit-status').textContent='Podaj poprawną liczbę.';return; }var value;if(kind==='temperature'){var c=from==='°F'?(n-32)*5/9:from==='K'?n-273.15:n;value=to==='°F'?c*9/5+32:to==='K'?c+273.15:c;}else value=n*units[kind][from]/units[kind][to];$('unit-status').textContent=Number(value.toPrecision(12))+' '+to;}
  $('unit-kind').addEventListener('change',function(){var list=Object.keys(units[this.value]); ['unit-from','unit-to'].forEach(function(id){$(id).replaceChildren();list.forEach(function(u){var opt=document.createElement('option');opt.value=opt.textContent=u;$(id).appendChild(opt);});});$('unit-to').selectedIndex=1;convertUnit();});
  ['unit-value','unit-from','unit-to'].forEach(function(id){$(id).addEventListener('input',convertUnit);$(id).addEventListener('change',convertUnit);});$('unit-kind').dispatchEvent(new Event('change'));
  $('date-run').addEventListener('click',function(){var a=$('date-from').value,b=$('date-to').value,one=Date.parse(a+'T00:00:00Z'),two=Date.parse(b+'T00:00:00Z');$('date-status').textContent=!a||!b||!Number.isFinite(one)||!Number.isFinite(two)?'Wybierz dwie poprawne daty.':'Różnica: '+Math.abs((two-one)/86400000)+' dni.';});
  $('random-number').addEventListener('click',function(){var a=$('random-min').value,b=$('random-max').value,min=Number(a),max=Number(b),status=$('random-status');if(!a||!b||!Number.isInteger(min)||!Number.isInteger(max)||min < -1000000000||max > 1000000000||min>max){status.textContent='Podaj poprawny zakres liczb całkowitych.';return;}if(!window.crypto||!crypto.getRandomValues){status.textContent='Bezpieczny generator nie jest dostępny.';return;}var range=max-min+1,limit=4294967296-(4294967296%range),random=new Uint32Array(1);do{crypto.getRandomValues(random);}while(random[0]>=limit);status.textContent='Wylosowana liczba: '+(min+random[0]%range);});
  $('random-uuid').addEventListener('click',function(){var status=$('random-status');if(!window.crypto||!crypto.getRandomValues){status.textContent='Bezpieczny generator nie jest dostępny.';return;}var b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var hex=Array.from(b,function(x){return x.toString(16).padStart(2,'0');}).join('');status.textContent='UUID: '+hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);});
})();

/* Konwersja lokalna w jednowątkowym Web Workerze FFmpeg.wasm. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var videoInputs = ['mp4','m4v','mov','mkv','webm','avi','flv','mpeg','mpg','ts','3gp'];
  var audioInputs = ['mp3','wav','m4a','aac','ogg','oga','opus','flac','aif','aiff','wma'];
  var formats = {
    mp4: { label:'MP4 · wideo H.264 + AAC', mime:'video/mp4', kind:'video' },
    webm: { label:'WebM · wideo VP8 + Vorbis', mime:'video/webm', kind:'video' },
    mov: { label:'MOV · wideo H.264 + AAC', mime:'video/quicktime', kind:'video' },
    mkv: { label:'MKV · wideo H.264 + AAC', mime:'video/x-matroska', kind:'video' },
    gif: { label:'GIF · animacja bez dźwięku', mime:'image/gif', kind:'video' },
    mp3: { label:'MP3 · dźwięk', mime:'audio/mpeg', kind:'audio' },
    m4a: { label:'M4A · dźwięk AAC', mime:'audio/mp4', kind:'audio' },
    wav: { label:'WAV · dźwięk PCM', mime:'audio/wav', kind:'audio' },
    ogg: { label:'OGG · dźwięk Vorbis', mime:'audio/ogg', kind:'audio' },
    flac: { label:'FLAC · dźwięk bezstratny', mime:'audio/flac', kind:'audio' }
  };
  var keys = ['mp4','webm','mov','mkv','gif','mp3','m4a','wav','ogg','flac'];
  var input = $('convert-file'), select = $('convert-format'), runButton = $('convert-run'), cancel = $('convert-cancel'), download = $('convert-download'), status = $('convert-status'), progress = $('convert-progress');
  var worker = null, serial = 0, objectUrl = '', busy = false;

  function sourceExtension(file) {
    var match = file && file.name.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
  }
  function resetDownload() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = ''; download.hidden = true; download.removeAttribute('href');
  }
  function setBusy(value) {
    busy = value; input.disabled = value; select.disabled = value || !input.files.length || !select.value;
    runButton.disabled = value || !input.files.length || !select.value;
    cancel.hidden = !value; progress.hidden = !value; if (!value) progress.value = 0;
  }
  function refreshFormats() {
    resetDownload(); status.textContent = ''; select.replaceChildren();
    var file = input.files[0], ext = sourceExtension(file);
    var isVideo = videoInputs.indexOf(ext) !== -1, isAudio = audioInputs.indexOf(ext) !== -1;
    if (!file || (!isVideo && !isAudio)) {
      var placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Najpierw wybierz obsługiwany plik'; select.appendChild(placeholder);
      if (file) status.textContent = 'Nieobsługiwany format. Wybierz plik audio lub wideo z podanej listy.';
      setBusy(false); return;
    }
    keys.filter(function (key) { return isVideo || formats[key].kind === 'audio'; }).forEach(function (key) {
      var option = document.createElement('option'); option.value = key; option.textContent = formats[key].label; select.appendChild(option);
    });
    if (isAudio) select.value = ext === 'mp3' ? 'm4a' : 'mp3';
    else select.value = ext === 'mp4' ? 'webm' : 'mp4';
    status.textContent = 'Wybrano: ' + file.name + '. Jeśli plik nie ma ścieżki wideo lub dźwięku, odpowiednia konwersja nie będzie możliwa.';
    setBusy(false);
  }
  input.addEventListener('change', refreshFormats);
  select.addEventListener('change', function () { resetDownload(); status.textContent = ''; });
  function abortConversion(message) {
    serial++;
    if (worker) { worker.terminate(); worker = null; }
    resetDownload(); setBusy(false); status.textContent = message;
  }
  cancel.addEventListener('click', function () { if (busy) abortConversion('Konwersja anulowana. Możesz wybrać inny format.'); });
  window.addEventListener('pagehide', function () { if (busy) abortConversion('Konwersja przerwana po opuszczeniu strony.'); else { serial++; if (objectUrl) { resetDownload(); status.textContent = 'Wynik usunięty po opuszczeniu strony.'; } } });

  function command(ext, target) {
    var args = ['-i', 'input.' + ext, '-map_metadata', '-1', '-sn'];
    if (formats[target].kind === 'audio') {
      args.push('-map', '0:a:0', '-vn');
      if (target === 'mp3') args.push('-c:a', 'libmp3lame', '-q:a', '4');
      if (target === 'm4a') args.push('-c:a', 'aac', '-b:a', '160k');
      if (target === 'wav') args.push('-c:a', 'pcm_s16le');
      if (target === 'ogg') args.push('-c:a', 'libvorbis', '-q:a', '4');
      if (target === 'flac') args.push('-c:a', 'flac');
    } else {
      args.push('-map', '0:v:0');
      if (target === 'gif') args.push('-an', '-vf', 'fps=10,scale=min(640\\,iw):-2', '-loop', '0');
      else {
        args.push('-map', '0:a:0?', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2');
        if (target === 'webm') args.push('-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '1M', '-c:a', 'libvorbis', '-q:a', '4');
        else {
          args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k');
          if (target === 'mp4' || target === 'mov') args.push('-movflags', '+faststart');
        }
      }
    }
    args.push('output.' + target);
    return args;
  }

  runButton.addEventListener('click', async function () {
    if (busy) return;
    var file = input.files[0], ext = sourceExtension(file), target = select.value;
    if (!file || !(ext && (videoInputs.indexOf(ext) !== -1 || audioInputs.indexOf(ext) !== -1)) || !Object.prototype.hasOwnProperty.call(formats, target) || (audioInputs.indexOf(ext) !== -1 && formats[target].kind === 'video')) { status.textContent = 'Wybierz obsługiwany plik i format.'; return; }
    if (file.size > 100 * 1024 * 1024) { resetDownload(); status.textContent = 'Plik przekracza limit 100 MiB.'; return; }
    resetDownload(); var token = ++serial, engine = null; setBusy(true);
    status.textContent = 'Ładowanie silnika konwersji (pierwszy raz około 31 MB)…';
    progress.removeAttribute('value');
    try {
      var module = await import('/vendor/ffmpeg/ffmpeg/index.js');
      if (token !== serial) return;
      engine = new module.FFmpeg(); worker = engine;
      engine.on('progress', function (event) {
        if (token !== serial) return;
        if (Number.isFinite(event.progress) && event.progress >= 0) { progress.value = Math.min(99, Math.round(event.progress * 100)); status.textContent = 'Konwertowanie… ' + progress.value + '%'; }
      });
      await engine.load({ coreURL: new URL('/vendor/ffmpeg/core/ffmpeg-core.js', location.origin).href, wasmURL: new URL('/vendor/ffmpeg/core/ffmpeg-core.wasm', location.origin).href });
      if (token !== serial) return;
      status.textContent = 'Wczytywanie pliku do pamięci urządzenia…';
      var data = new Uint8Array(await file.arrayBuffer());
      if (token !== serial) return;
      await engine.writeFile('input.' + ext, data);
      if (token !== serial) return;
      progress.value = 0; status.textContent = 'Konwertowanie…';
      var exitCode = await engine.exec(command(ext, target));
      if (token !== serial) return;
      if (exitCode !== 0) throw new Error('Konwersja nie powiodła się. Plik może być uszkodzony, mieć nieobsługiwany kodek lub nie zawierać wymaganej ścieżki wideo/dźwięku.');
      var result = await engine.readFile('output.' + target);
      if (token !== serial) return;
      if (!result || !result.length) throw new Error('Nie udało się utworzyć pliku wynikowego.');
      objectUrl = URL.createObjectURL(new Blob([result], { type: formats[target].mime }));
      download.href = objectUrl; download.download = (file.name.replace(/\.[^.]+$/, '') || 'plik') + '-rejtools.' + target; download.hidden = false;
      status.textContent = 'Gotowe! Plik wynikowy: ' + (result.length / (1024 * 1024)).toFixed(2) + ' MB.';
    } catch (error) {
      if (token === serial) status.textContent = error && error.message && /^Konwersja nie powiodła|^Nie udało się utworzyć/.test(error.message) ? error.message : 'Nie udało się uruchomić konwersji. Sprawdź połączenie i dostępną pamięć, a następnie spróbuj ponownie.';
    } finally {
      if (engine && worker === engine) { engine.terminate(); worker = null; }
      if (token === serial) setBusy(false);
    }
  });
})();

/* RejTools: wszystkie operacje wykonują się w tej przeglądarce. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  $('tools-theme').addEventListener('click', function () {
    var theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch (_) {}
  });
  var text = $('text-input');
  function countText() {
    var value = text.value;
    $('text-words').textContent = value.trim() ? value.trim().split(/\s+/u).length : 0;
    $('text-chars').textContent = Array.from(value).length;
    $('text-lines').textContent = value ? value.split(/\r\n|\r|\n/).length : 0;
  }
  text.addEventListener('input', countText);
  document.querySelectorAll('[data-text-action]').forEach(function (button) {
    button.addEventListener('click', function () {
      var action = button.dataset.textAction;
      if (action === 'upper') text.value = text.value.toLocaleUpperCase('pl');
      else if (action === 'lower') text.value = text.value.toLocaleLowerCase('pl');
      else text.value = text.value.split('\n').map(function (line) { return line.trim().replace(/[^\S\r\n]+/g, ' '); }).join('\n').trim();
      countText(); $('text-status').textContent = 'Gotowe.';
    });
  });
  document.querySelectorAll('[data-json]').forEach(function (button) {
    button.addEventListener('click', function () {
      try {
        var parsed = JSON.parse($('json-input').value);
        $('json-input').value = JSON.stringify(parsed, null, button.dataset.json === 'pretty' ? 2 : 0);
        $('json-status').textContent = 'Poprawny JSON. Gotowe!';
      } catch (_) { $('json-status').textContent = 'Niepoprawny JSON — sprawdź składnię. Tekst pozostał bez zmian.'; }
    });
  });
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', async function () {
      var input = $(button.dataset.copy), status = $(button.dataset.copy === 'text-input' ? 'text-status' : button.dataset.copy === 'json-input' ? 'json-status' : button.dataset.copy === 'password-output' ? 'password-status' : 'hash-status');
      if (!input.value) { status.textContent = 'Najpierw przygotuj zawartość do skopiowania.'; return; }
      try { await navigator.clipboard.writeText(input.value); status.textContent = 'Skopiowano!'; }
      catch (_) { input.focus(); input.select(); status.textContent = 'Nie udało się skopiować automatycznie. Zaznaczony tekst możesz skopiować ręcznie.'; }
    });
  });
  $('password-run').addEventListener('click', function () {
    var length = Number($('password-length').value);
    if (!Number.isInteger(length) || length < 12 || length > 128) { $('password-output').value = ''; $('password-status').textContent = 'Wybierz od 12 do 128 znaków.'; return; }
    if (!window.crypto || !window.crypto.getRandomValues) { $('password-status').textContent = 'Bezpieczny generator nie jest dostępny w tej przeglądarce.'; return; }
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' + ($('password-symbols').checked ? '!@#$%*-_=+?' : '');
    var result = '', bytes = new Uint8Array(128), ceiling = 256 - (256 % chars.length);
    do {
      result = '';
      while (result.length < length) { window.crypto.getRandomValues(bytes); for (var i = 0; i < bytes.length && result.length < length; i++) if (bytes[i] < ceiling) result += chars[bytes[i] % chars.length]; }
    } while ($('password-symbols').checked && !/[!@#$%*\-_=+?]/.test(result));
    $('password-output').value = result; $('password-status').textContent = 'Hasło gotowe — zapisz je w bezpiecznym miejscu.';
  });
  var hashRun = 0;
  $('hash-file').addEventListener('change', function () { hashRun++; $('hash-output').value = ''; $('hash-status').textContent = ''; });
  $('hash-run').addEventListener('click', async function () {
    var file = $('hash-file').files[0], run = ++hashRun;
    $('hash-output').value = '';
    if (!file) { $('hash-status').textContent = 'Wybierz plik.'; return; }
    if (file.size > 100 * 1024 * 1024) { $('hash-status').textContent = 'Plik jest większy niż 100 MB.'; return; }
    if (!window.crypto || !crypto.subtle) { $('hash-status').textContent = 'Obliczanie SHA-256 wymaga bezpiecznego połączenia HTTPS i zgodnej przeglądarki.'; return; }
    try {
      $('hash-status').textContent = 'Obliczanie…';
      var digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      if (run !== hashRun) return;
      $('hash-output').value = Array.from(new Uint8Array(digest), function (n) { return n.toString(16).padStart(2, '0'); }).join('');
      $('hash-status').textContent = 'Gotowe.';
    } catch (_) { if (run === hashRun) $('hash-status').textContent = 'Nie udało się odczytać pliku.'; }
  });
  var imageUrl = '', imageRun = 0;
  function clearImage() { imageRun++; if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = ''; $('image-download').hidden = true; $('image-download').removeAttribute('href'); }
  ['image-file', 'image-width', 'image-format'].forEach(function (id) { $(id).addEventListener('change', function () { clearImage(); $('image-status').textContent = ''; }); });
  $('image-run').addEventListener('click', async function () {
    clearImage(); var run = imageRun, file = $('image-file').files[0], width = Number($('image-width').value), type = $('image-format').value;
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) { $('image-status').textContent = 'Wybierz obraz PNG, JPEG lub WebP.'; return; }
    if (file.size > 20 * 1024 * 1024) { $('image-status').textContent = 'Obraz jest większy niż 20 MB.'; return; }
    if (!Number.isInteger(width) || width < 1 || width > 6000) { $('image-status').textContent = 'Szerokość musi wynosić od 1 do 6000 px.'; return; }
    if (!['image/jpeg','image/png','image/webp'].includes(type)) return;
    var source = URL.createObjectURL(file);
    try {
      $('image-status').textContent = 'Przygotowywanie…';
      var img = new Image();
      await new Promise(function (resolve, reject) { img.onload = resolve; img.onerror = reject; img.src = source; });
      if (run !== imageRun) return;
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 40000000) throw new Error('Obraz jest zbyt duży (maks. 40 mln pikseli).');
      var scale = Math.min(1, width / img.naturalWidth), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      var ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Przeglądarka nie obsługuje edycji obrazu.');
      if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, type, 0.88); });
      if (run !== imageRun) return;
      if (!blob || blob.type !== type) throw new Error('Ten format nie jest obsługiwany przez przeglądarkę.');
      imageUrl = URL.createObjectURL(blob);
      var link = $('image-download'); link.href = imageUrl; link.download = (file.name.replace(/\.[^.]+$/, '') || 'obraz') + '-rejtools.' + ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[type]; link.hidden = false;
      $('image-status').textContent = 'Gotowe: ' + canvas.width + ' × ' + canvas.height + ' px, ' + Math.ceil(blob.size / 1024) + ' KB.';
    } catch (e) { if (run === imageRun) $('image-status').textContent = e.message || 'Nie udało się odczytać obrazu.'; }
    finally { URL.revokeObjectURL(source); }
  });
  window.addEventListener('pagehide', clearImage);
})();

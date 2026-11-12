/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * RejMeme — generator memów z wysyłką do RejChatu (v1).
 *
 * Wszystko rysuje canvas: żadnych gotowych obrazków z internetu, więc mem
 * nie zależy od cudzego serwera i nie łamie licencji. Własne tło można
 * wgrać z dysku — zostaje w przeglądarce.
 *
 * „Wyślij na RejChat” korzysta z tej samej funkcji co zdjęcia w czacie
 * (`rejchat_send_photo`), więc mem trafia do rozmowy jak każde inne zdjęcie
 * i wygasa po 14 dniach. Wymaga zalogowanej sesji.
 */
(function (window, document) {
  'use strict';

  var W = 1080;
  var H = 1080;
  var state = {
    template: 'classic',
    top: 'Kiedy w końcu',
    bottom: 'działa na telefonie',
    size: 92,
    uppercase: true,
    color: '#ffffff',
    bg: null,
    caption: 'Mem z RejMeme'
  };
  var canvas, ctx, statusEl, modal;

  function $(id) { return document.getElementById(id); }

  function status(message, tone) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    if (tone) statusEl.setAttribute('data-tone', tone);
    else statusEl.removeAttribute('data-tone');
  }

  function rounded(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function verticalGradient(from, to) {
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  }

  function drawBackground() {
    if (state.bg) {
      var img = state.bg;
      var scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      var w = img.naturalWidth * scale;
      var h = img.naturalHeight * scale;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      ctx.fillStyle = 'rgba(4, 9, 18, 0.34)';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    if (state.template === 'classic') {
      ctx.fillStyle = verticalGradient('#13233d', '#070d18');
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(150, 190, 255, 0.1)';
      ctx.lineWidth = 2;
      for (var x = 60; x < W; x += 90) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (var y = 60; y < H; y += 90) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(127, 178, 255, 0.16)';
      ctx.beginPath(); ctx.arc(880, 190, 150, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(200, 224, 255, 0.1)';
      ctx.beginPath(); ctx.arc(210, 860, 110, 0, Math.PI * 2); ctx.fill();
    } else if (state.template === 'glass') {
      ctx.fillStyle = verticalGradient('#dfeeff', '#a9c8ee');
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
      ctx.beginPath(); ctx.arc(220, 210, 170, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(72, 122, 196, 0.2)';
      ctx.beginPath(); ctx.arc(880, 300, 210, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      rounded(90, 690, 900, 320, 44); ctx.fill();
    } else if (state.template === 'split') {
      ctx.fillStyle = '#0a1220';
      ctx.fillRect(0, 0, W, H / 2);
      ctx.fillStyle = '#2f5f9e';
      ctx.fillRect(0, H / 2, W, H / 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(0, H / 2 - 60);
      ctx.lineTo(W, H / 2 - 200);
      ctx.lineTo(W, H / 2 + 40);
      ctx.lineTo(0, H / 2 + 210);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#05080f';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(127, 178, 255, 0.35)';
      ctx.lineWidth = 3;
      for (var i = 0; i < 6; i += 1) {
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 190 + i * 74, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(127, 178, 255, 0.14)';
      ctx.fillRect(0, H / 2 - 4, W, 8);
    }
  }

  function wrap(text, maxWidth, maxLines) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    words.forEach(function (word) {
      var candidate = line ? line + ' ' + word : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last.trim() + '…';
    }
    return lines;
  }

  function drawText(text, y, align) {
    var value = state.uppercase ? String(text || '').toUpperCase() : String(text || '');
    if (!value.trim()) return;
    var size = state.size;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    var x = align === 'left' ? 96 : W / 2;
    var maxWidth = align === 'left' ? 780 : 900;
    var lines;
    do {
      ctx.font = '900 ' + size + 'px "Inter", "Segoe UI", Arial, sans-serif';
      lines = wrap(value, maxWidth, 3);
      if (lines.length <= 2) break;
      size -= 6;
    } while (size > 44);

    var lineHeight = size * 1.06;
    var start = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach(function (line, index) {
      var lineY = start + index * lineHeight;
      if (state.template === 'classic' || state.bg) {
        ctx.strokeStyle = state.color.toLowerCase() === '#0b1220' ? 'rgba(255,255,255,0.85)' : 'rgba(3, 7, 14, 0.82)';
        ctx.lineWidth = Math.max(6, size * 0.1);
        ctx.strokeText(line, x, lineY, maxWidth);
      }
      if (state.template === 'neon') {
        ctx.shadowColor = 'rgba(127, 178, 255, 0.85)';
        ctx.shadowBlur = 26;
      }
      ctx.fillStyle = state.color;
      ctx.fillText(line, x, lineY, maxWidth);
      ctx.shadowBlur = 0;
    });
  }

  function watermark() {
    ctx.save();
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillStyle = state.template === 'glass' ? 'rgba(16, 38, 68, 0.55)' : 'rgba(235, 245, 255, 0.5)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('REJHUB · REJMEME', W - 32, H - 26);
    ctx.restore();
  }

  function draw() {
    if (!canvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    if (state.template === 'glass' && !state.bg) {
      drawText(state.top, 150, 'left');
      drawText(state.bottom, 860, 'left');
    } else if (state.template === 'split' && !state.bg) {
      drawText(state.top, 280, 'center');
      drawText(state.bottom, 800, 'center');
    } else {
      drawText(state.top, 180, 'center');
      drawText(state.bottom, H - 190, 'center');
    }
    watermark();
  }

  /* -------------------------------------------------------------- wysyłka */

  function session() {
    var profiles = window.RJProfiles;
    if (!profiles || typeof profiles.session !== 'function' || typeof profiles.rpc !== 'function') return null;
    var current = profiles.session();
    return current && current.token ? { token: current.token, rpc: profiles.rpc } : null;
  }

  function targets(select) {
    select.textContent = '';
    var general = document.createElement('option');
    general.value = 'public:general';
    general.textContent = 'Czat ogólny';
    var links = document.createElement('option');
    links.value = 'public:links';
    links.textContent = 'Linki i zdjęcia';
    select.append(general, links);

    var who = session();
    if (!who) return Promise.resolve();
    return who.rpc('rejchat_dm_inbox', { p_token: who.token }).then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) return;
      var group = document.createElement('optgroup');
      group.label = 'Prywatne rozmowy';
      rows.forEach(function (row) {
        if (!row || !/^[0-9a-f-]{36}$/i.test(row.id || '')) return;
        var option = document.createElement('option');
        option.value = 'private:' + row.id;
        option.textContent = '@' + (row.username || 'rozmowa') + (row.unread ? ' · ' + row.unread + ' nowych' : '');
        group.appendChild(option);
      });
      if (group.children.length) select.appendChild(group);
    }).catch(function () { /* brak DM nie blokuje wysyłki na czat ogólny */ });
  }

  function asJpeg() {
    var quality = 0.84;
    var data = canvas.toDataURL('image/jpeg', quality);
    while (data.length > 1300000 && quality > 0.42) {
      quality -= 0.1;
      data = canvas.toDataURL('image/jpeg', quality);
    }
    if (data.length > 1400000) {
      var small = document.createElement('canvas');
      small.width = 760;
      small.height = 760;
      small.getContext('2d').drawImage(canvas, 0, 0, 760, 760);
      data = small.toDataURL('image/jpeg', 0.7);
    }
    return data;
  }

  function send() {
    var who = session();
    if (!who) { status('Zaloguj się, żeby wysłać mema do RejChatu.', 'error'); return; }
    var select = $('meme-target');
    var caption = $('meme-caption');
    var value = select ? select.value : 'public:general';
    var isPrivate = value.indexOf('private:') === 0;
    var thread = isPrivate ? value.slice(8) : null;
    var room = isPrivate ? null : value.slice(7);
    var button = $('meme-send');
    if (button) button.disabled = true;
    var data = asJpeg();
    var base64 = data.slice(data.indexOf(',') + 1);
    who.rpc('rejchat_send_photo', {
      p_token: who.token,
      p_scope: isPrivate ? 'private' : 'public',
      p_room: room,
      p_thread_id: thread,
      p_content: String(caption && caption.value || state.caption).slice(0, 200),
      p_reply_to: null,
      p_mime: 'image/jpeg',
      p_data_base64: base64
    }).then(function () {
      closeModal();
      status(isPrivate ? 'Mem wysłany w prywatnej rozmowie.' : 'Mem wysłany na czat.');
    }).catch(function (error) {
      status((error && error.message) || 'Nie udało się wysłać mema.', 'error');
    }).then(function () {
      if (button) button.disabled = false;
    });
  }

  function openModal() {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.removeAttribute('aria-hidden');
    var select = $('meme-target');
    if (select) targets(select).then(function () {
      var caption = $('meme-caption');
      if (caption && !caption.value) caption.value = state.caption;
    });
    var first = modal.querySelector('select, button');
    if (first) first.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  /* ----------------------------------------------------------------- start */

  function bind() {
    canvas = $('meme-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;
    statusEl = $('meme-status');
    modal = $('meme-modal');

    var top = $('meme-top');
    var bottom = $('meme-bottom');
    var size = $('meme-size');
    var upper = $('meme-upper');
    var template = $('meme-template');
    var bgInput = $('meme-bg');

    if (top) { top.value = state.top; top.addEventListener('input', function () { state.top = top.value; draw(); }); }
    if (bottom) { bottom.value = state.bottom; bottom.addEventListener('input', function () { state.bottom = bottom.value; draw(); }); }
    if (size) size.addEventListener('input', function () { state.size = Number(size.value) || 92; draw(); });
    if (upper) {
      upper.checked = state.uppercase;
      upper.addEventListener('change', function () { state.uppercase = upper.checked; draw(); });
    }
    if (template) template.addEventListener('change', function () { state.template = template.value; draw(); });

    document.querySelectorAll('[data-meme-color]').forEach(function (swatch) {
      swatch.addEventListener('click', function () {
        state.color = swatch.getAttribute('data-meme-color');
        document.querySelectorAll('[data-meme-color]').forEach(function (el) {
          el.classList.toggle('is-on', el === swatch);
        });
        draw();
      });
    });

    if (bgInput) bgInput.addEventListener('change', function () {
      var file = bgInput.files && bgInput.files[0];
      if (!file) return;
      if (file.size > 10485760) { status('Tło może mieć maksymalnie 10 MiB.', 'error'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { state.bg = img; draw(); status('Własne tło wgrane (zostaje na urządzeniu).'); };
        img.onerror = function () { status('Nie udało się wczytać obrazu.', 'error'); };
        img.src = String(reader.result || '');
      };
      reader.onerror = function () { status('Nie udało się wczytać pliku.', 'error'); };
      reader.readAsDataURL(file);
    });

    var reset = $('meme-reset');
    if (reset) reset.addEventListener('click', function () {
      state.bg = null;
      if (bgInput) bgInput.value = '';
      state.top = 'Kiedy w końcu';
      state.bottom = 'działa na telefonie';
      if (top) top.value = state.top;
      if (bottom) bottom.value = state.bottom;
      state.template = 'classic';
      if (template) template.value = 'classic';
      state.color = '#ffffff';
      document.querySelectorAll('[data-meme-color]').forEach(function (el) {
        el.classList.toggle('is-on', el.getAttribute('data-meme-color') === '#ffffff');
      });
      state.size = 92;
      if (size) size.value = '92';
      draw();
      status('Szablon przywrócony.');
    });

    var download = $('meme-download');
    if (download) download.addEventListener('click', function () {
      var link = document.createElement('a');
      link.download = 'rejmeme.png';
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      link.remove();
      status('Pobrano mem jako PNG.');
    });

    var copy = $('meme-copy');
    if (copy) copy.addEventListener('click', function () {
      if (!navigator.clipboard || !window.ClipboardItem) { status('Ta przeglądarka nie pozwala skopiować obrazu — pobierz PNG.', 'error'); return; }
      canvas.toBlob(function (blob) {
        if (!blob) { status('Nie udało się przygotować obrazu.', 'error'); return; }
        navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]).then(function () {
          status('Mem skopiowany do schowka.');
        }).catch(function () { status('Nie udało się skopiować — pobierz PNG.', 'error'); });
      }, 'image/png');
    });

    var share = $('meme-share');
    if (share) share.addEventListener('click', openModal);
    var close = $('meme-close');
    if (close) close.addEventListener('click', closeModal);
    var cancel = $('meme-cancel');
    if (cancel) cancel.addEventListener('click', closeModal);
    var sendBtn = $('meme-send');
    if (sendBtn) sendBtn.addEventListener('click', send);
    if (modal) modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal && modal.classList.contains('is-open')) closeModal();
    });

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    draw();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.RejMeme = {
    draw: draw,
    png: function () { return canvas ? canvas.toDataURL('image/png') : ''; }
  };
})(window, document);

/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * RejMusic — następca Jakuplayera w RejHubie (v1).
 *
 * Dwa źródła dźwięku, bo tylko takie da się uczciwie obsłużyć w przeglądarce:
 *  1. pliki z dysku (audio/*) — zostają na urządzeniu, nie są wysyłane,
 *  2. linki do Spotify / YouTube / SoundCloud / Deezer — odtwarzane przez
 *     oficjalny odtwarzacz osadzony (iframe), bo te serwisy nie pozwalają
 *     pobierać ani „przesyłać” swoich utworów na obcą stronę.
 *
 * Playlista linków jest zapamiętywana (`rj_music_links_v1`). Pliki lokalne
 * żyją tylko w tej karcie — po odświeżeniu trzeba je wybrać ponownie, bo
 * przeglądarka nie daje trwałego dostępu do dysku bez zgody użytkownika.
 */
(function (window, document) {
  'use strict';

  var KEY = 'rj_music_links_v1';
  var state = {
    tracks: [],
    links: [],
    order: [],
    index: -1,
    shuffle: false,
    repeat: false,
    embed: false
  };

  var audio, el;

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function time(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + pad(s);
  }
  function status(message, tone) {
    if (!el.status) return;
    el.status.textContent = message || '';
    if (tone) el.status.setAttribute('data-tone', tone);
    else el.status.removeAttribute('data-tone');
  }

  function loadLinks() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      state.links = Array.isArray(parsed) ? parsed.filter(function (item) {
        return item && typeof item.url === 'string' && /^[a-z]+$/.test(item.service || '') && typeof item.embed === 'string';
      }).slice(0, 60) : [];
    } catch (error) { state.links = []; }
  }

  function saveLinks() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state.links)); }
    catch (error) { status('Przeglądarka nie pozwoliła zapamiętać playlisty.', 'error'); }
  }

  /* Rozpoznajemy tylko oficjalne adresy osadzeń — żadnego zgadywania. */
  function parseLink(raw) {
    var value = String(raw || '').trim();
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    var url;
    try { url = new URL(value); } catch (error) { return null; }
    var host = url.hostname.replace(/^www\./, '').toLowerCase();
    var parts = url.pathname.split('/').filter(Boolean);
    var out = null;

    if (host === 'open.spotify.com') {
      var kind = parts[0];
      var id = parts[1];
      if (['track', 'album', 'playlist', 'episode', 'show', 'artist'].indexOf(kind) >= 0 && /^[A-Za-z0-9]+$/.test(id || '')) {
        out = {
          service: 'Spotify',
          title: 'Spotify · ' + ({ track: 'utwór', album: 'album', playlist: 'playlista', episode: 'odcinek', show: 'podcast', artist: 'artysta' }[kind]),
          embed: 'https://open.spotify.com/embed/' + kind + '/' + id,
          height: kind === 'track' ? 152 : 352,
          url: 'https://open.spotify.com/' + kind + '/' + id
        };
      }
    } else if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      var video = host === 'youtu.be' ? parts[0] : url.searchParams.get('v');
      if (!video && parts[0] === 'shorts') video = parts[1];
      if (video && /^[A-Za-z0-9_-]{6,20}$/.test(video)) {
        out = {
          service: 'YouTube',
          title: 'YouTube · film',
          embed: 'https://www.youtube.com/embed/' + video,
          height: 220,
          url: 'https://www.youtube.com/watch?v=' + video
        };
      }
    } else if (host === 'soundcloud.com' || host === 'on.soundcloud.com') {
      out = {
        service: 'SoundCloud',
        title: 'SoundCloud · utwór',
        embed: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url.href) + '&color=%237fb2ff&auto_play=false',
        height: 166,
        url: url.href
      };
    } else if (host === 'deezer.com' || host === 'www.deezer.com') {
      var deezerKind = parts[0] === 'track' || parts[0] === 'album' || parts[0] === 'playlist' ? parts[0] : '';
      var deezerId = parts[1];
      if (deezerKind && /^\d+$/.test(deezerId || '')) {
        out = {
          service: 'Deezer',
          title: 'Deezer · ' + deezerKind,
          embed: 'https://widget.deezer.com/widget/dark/' + deezerKind + '/' + deezerId,
          height: 220,
          url: url.href
        };
      }
    }
    return out;
  }

  /* ------------------------------------------------------------- playlista */

  function rebuildOrder() {
    state.order = [];
    state.tracks.forEach(function (track) { state.order.push({ kind: 'file', ref: track }); });
    state.links.forEach(function (link) { state.order.push({ kind: 'link', ref: link }); });
  }

  function current() {
    return state.order[state.index] || null;
  }

  function renderList() {
    if (!el.list) return;
    el.list.textContent = '';
    if (!state.order.length) {
      var empty = document.createElement('li');
      empty.className = 'rjapp-empty';
      empty.textContent = 'Playlista jest pusta. Dodaj pliki z dysku albo wklej link do utworu.';
      el.list.appendChild(empty);
      return;
    }
    state.order.forEach(function (entry, index) {
      var li = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'music-row' + (index === state.index ? ' is-active' : '');
      button.setAttribute('data-index', String(index));
      button.setAttribute('aria-current', index === state.index ? 'true' : 'false');
      var name = document.createElement('span');
      name.textContent = entry.kind === 'file' ? entry.ref.name : entry.ref.title;
      var meta = document.createElement('small');
      meta.textContent = entry.kind === 'file' ? 'PLIK' : entry.ref.service.toUpperCase();
      button.append(name, meta);
      li.appendChild(button);
      el.list.appendChild(li);
    });
  }

  function paintNow() {
    var entry = current();
    if (el.art) {
      el.art.textContent = '';
      if (entry && entry.kind === 'file' && entry.ref.cover) {
        var img = document.createElement('img');
        img.alt = '';
        img.src = entry.ref.cover;
        el.art.appendChild(img);
      } else {
        el.art.textContent = entry ? (entry.kind === 'file' ? '♪' : '◉') : '♪';
      }
    }
    if (el.title) el.title.textContent = entry ? (entry.kind === 'file' ? entry.ref.name : entry.ref.title) : 'Nic nie jest odtwarzane';
    if (el.artist) el.artist.textContent = entry ? (entry.kind === 'file' ? 'Plik lokalny · ' + entry.ref.ext : 'Osadzony odtwarzacz · ' + entry.ref.service) : 'Dodaj plik lub link, żeby zacząć.';
    var isFile = entry && entry.kind === 'file';
    if (el.play) {
      el.play.disabled = !isFile;
      el.play.setAttribute('aria-label', audio && !audio.paused ? 'Pauza' : 'Odtwórz');
      el.play.textContent = audio && !audio.paused ? '❚❚' : '▶';
    }
    if (el.seek) el.seek.disabled = !isFile;
    if (el.volume) el.volume.disabled = !isFile;
    if (el.embedWrap) {
      el.embedWrap.textContent = '';
      el.embedWrap.classList.toggle('is-on', Boolean(entry && entry.kind === 'link'));
      if (entry && entry.kind === 'link') {
        var frame = document.createElement('iframe');
        frame.className = 'music-embed';
        frame.src = entry.ref.embed;
        frame.height = String(entry.ref.height || 200);
        frame.loading = 'lazy';
        frame.title = 'Odtwarzacz ' + entry.ref.service;
        frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        el.embedWrap.appendChild(frame);
        el.embedWrap.appendChild(note('Osadzony odtwarzacz ' + entry.ref.service + ' — steruj nim w ramce.'));
      }
    }
    renderList();
  }

  function note(text) {
    var p = document.createElement('p');
    p.className = 'rjapp-muted';
    p.style.marginTop = '8px';
    p.textContent = text;
    return p;
  }

  function playIndex(index) {
    if (index < 0 || index >= state.order.length) return;
    state.index = index;
    var entry = current();
    if (!entry) return;
    if (entry.kind === 'link') {
      if (audio) { audio.pause(); audio.removeAttribute('src'); }
      paintNow();
      return;
    }
    state.embed = false;
    if (!audio) return;
    audio.src = entry.ref.url;
    audio.play().catch(function () {
      status('Przeglądarka zablokowała odtwarzanie — kliknij ▶.', 'error');
    });
    paintNow();
  }

  function toggle() {
    var entry = current();
    if (!entry || entry.kind !== 'file' || !audio) return;
    if (!audio.src) { playIndex(state.index); return; }
    if (audio.paused) audio.play().catch(function () { status('Nie udało się odtworzyć pliku.', 'error'); });
    else audio.pause();
    paintNow();
  }

  function next() {
    if (!state.order.length) return;
    var index;
    if (state.shuffle) {
      do { index = Math.floor(Math.random() * state.order.length); } while (state.order.length > 1 && index === state.index);
    } else {
      index = state.index + 1;
      if (index >= state.order.length) index = state.repeat ? 0 : state.order.length - 1;
    }
    playIndex(index);
  }

  function prev() {
    if (!state.order.length) return;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    playIndex(state.index <= 0 ? state.order.length - 1 : state.index - 1);
  }

  function addFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    var added = 0;
    list.forEach(function (file) {
      if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba|webm)$/i.test(file.name)) return;
      var ext = (file.name.split('.').pop() || '').toUpperCase();
      var track = {
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 90) || 'Utwór',
        ext: ext,
        url: URL.createObjectURL(file),
        cover: ''
      };
      state.tracks.push(track);
      added += 1;
    });
    if (!added) { status('Wybierz pliki audio (MP3, M4A, OGG, WAV, FLAC…).', 'error'); return; }
    rebuildOrder();
    status('Dodano ' + added + (added === 1 ? ' plik' : ' pliki') + '. Pliki zostają na tym urządzeniu.');
    if (state.index < 0) state.index = state.order.length - added;
    renderList();
    paintNow();
  }

  function addLink() {
    if (!el.link) return;
    var parsed = parseLink(el.link.value);
    if (!parsed) {
      status('Wklej link Spotify, YouTube, SoundCloud lub Deezer.', 'error');
      el.link.focus();
      return;
    }
    var duplicate = state.links.some(function (item) { return item.embed === parsed.embed; });
    if (duplicate) { status('Ten utwór jest już na playliście.'); return; }
    state.links.push(parsed);
    saveLinks();
    rebuildOrder();
    el.link.value = '';
    status('Dodano osadzony odtwarzacz ' + parsed.service + '.');
    renderList();
    if (state.index < 0) { state.index = state.order.length - 1; paintNow(); }
  }

  function boot() {
    el = {
      audio: $('music-audio'),
      list: $('music-list'),
      status: $('music-status'),
      art: $('music-art'),
      title: $('music-title'),
      artist: $('music-artist'),
      play: $('music-play'),
      prev: $('music-prev'),
      next: $('music-next'),
      seek: $('music-seek'),
      volume: $('music-volume'),
      elapsed: $('music-elapsed'),
      total: $('music-total'),
      link: $('music-link'),
      addLink: $('music-add-link'),
      files: $('music-files'),
      drop: $('music-drop'),
      embedWrap: $('music-embed'),
      shuffle: $('music-shuffle'),
      repeat: $('music-repeat')
    };
    if (!el.list) return;
    audio = el.audio;

    loadLinks();
    rebuildOrder();
    if (state.order.length) state.index = 0;

    if (el.play) el.play.addEventListener('click', toggle);
    if (el.prev) el.prev.addEventListener('click', prev);
    if (el.next) el.next.addEventListener('click', next);
    if (el.list) el.list.addEventListener('click', function (event) {
      var row = event.target.closest('[data-index]');
      if (row) playIndex(Number(row.getAttribute('data-index')));
    });
    if (el.files) el.files.addEventListener('change', function () { addFiles(el.files.files); el.files.value = ''; });
    if (el.addLink) el.addLink.addEventListener('click', addLink);
    if (el.link) el.link.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); addLink(); }
    });
    if (el.drop) {
      ['dragenter', 'dragover'].forEach(function (name) {
        el.drop.addEventListener(name, function (event) { event.preventDefault(); el.drop.classList.add('is-over'); });
      });
      ['dragleave', 'drop'].forEach(function (name) {
        el.drop.addEventListener(name, function (event) { event.preventDefault(); el.drop.classList.remove('is-over'); });
      });
      el.drop.addEventListener('drop', function (event) {
        if (event.dataTransfer && event.dataTransfer.files) addFiles(event.dataTransfer.files);
      });
      el.drop.addEventListener('click', function () { if (el.files) el.files.click(); });
      el.drop.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (el.files) el.files.click(); }
      });
    }
    if (el.shuffle) el.shuffle.addEventListener('click', function () {
      state.shuffle = !state.shuffle;
      el.shuffle.setAttribute('aria-pressed', state.shuffle ? 'true' : 'false');
      status(state.shuffle ? 'Losowa kolejność włączona.' : 'Losowa kolejność wyłączona.');
    });
    if (el.repeat) el.repeat.addEventListener('click', function () {
      state.repeat = !state.repeat;
      el.repeat.setAttribute('aria-pressed', state.repeat ? 'true' : 'false');
      status(state.repeat ? 'Powtarzanie playlisty włączone.' : 'Powtarzanie wyłączone.');
    });
    if (audio) {
      audio.addEventListener('timeupdate', function () {
        if (el.seek && audio.duration) {
          el.seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
        }
        if (el.elapsed) el.elapsed.textContent = time(audio.currentTime);
        if (el.total) el.total.textContent = time(audio.duration);
      });
      audio.addEventListener('play', paintNow);
      audio.addEventListener('pause', paintNow);
      audio.addEventListener('ended', function () {
        if (state.repeat && state.index === state.order.length - 1) playIndex(0);
        else next();
      });
      audio.addEventListener('error', function () { status('Nie udało się odtworzyć tego pliku.', 'error'); });
      audio.volume = 0.85;
    }
    if (el.seek) el.seek.addEventListener('input', function () {
      if (audio && audio.duration) audio.currentTime = (Number(el.seek.value) / 1000) * audio.duration;
    });
    if (el.volume) el.volume.addEventListener('input', function () {
      if (audio) audio.volume = Math.max(0, Math.min(1, Number(el.volume.value) / 100));
    });

    paintNow();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.RejMusic = {
    addLink: function (url) {
      var parsed = parseLink(url);
      if (!parsed) return null;
      state.links.push(parsed);
      saveLinks();
      rebuildOrder();
      renderList();
      return parsed;
    }
  };
})(window, document);

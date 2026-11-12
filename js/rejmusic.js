/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * RejMusic — wyszukiwarka utworów + odtwarzacz (v2).
 *
 * Trzy uczciwe źródła dźwięku:
 *  1. pliki z dysku (audio/*) — zostają na urządzeniu, nic nie jest wysyłane,
 *  2. wyszukiwarka katalogów Deezer i Apple Music — korzysta z ich oficjalnych
 *     API i odtwarza oficjalne 30-sekundowe zapowiedzi (bez pobierania),
 *  3. linki do Spotify / YouTube / SoundCloud / Deezer — odtwarzane przez
 *     osadzony odtwarzacz (iframe), bo te serwisy nie pozwalają
 *     „przesyłać” swoich utworów na obcą stronę.
 *
 * Playlista (`rj_music_links_v1`), ulubione (`rj_music_favs_v1`) i historia
 * (`rj_music_history_v1`) są zapamiętywane lokalnie. Pliki lokalne żyją tylko
 * w tej karcie — przeglądarka nie daje trwałego dostępu do dysku bez zgody.
 */
(function (window, document) {
  'use strict';

  var KEY = 'rj_music_links_v1';
  var FAV_KEY = 'rj_music_favs_v1';
  var HIST_KEY = 'rj_music_history_v1';
  var state = {
    tracks: [],
    links: [],
    favorites: [],
    history: [],
    order: [],
    index: -1,
    shuffle: false,
    repeat: false,
    embed: false,
    view: 'list',
    platform: 'all',
    query: '',
    results: [],
    offsets: { deezer: 0, itunes: 0 },
    previewUrl: '',
    previewAudio: null
  };

  var audio, el, jsonpSeq = 0;

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
  function searchStatus(message, tone) {
    if (!el.searchStatus) return;
    el.searchStatus.textContent = message || '';
    if (tone) el.searchStatus.setAttribute('data-tone', tone);
    else el.searchStatus.removeAttribute('data-tone');
  }
  function readJson(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : fallback;
      return parsed == null ? fallback : parsed;
    } catch (error) { return fallback; }
  }
  function writeJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { return false; }
  }

  /* ------------------------------------------------------------- playlista */

  function loadLinks() {
    var parsed = readJson(KEY, []);
    state.links = Array.isArray(parsed) ? parsed.filter(function (item) {
      return item && typeof item.url === 'string' && /^[a-z]+$/i.test(item.service || '') && typeof item.embed === 'string';
    }).slice(0, 60) : [];
    var favs = readJson(FAV_KEY, []);
    state.favorites = Array.isArray(favs) ? favs.filter(function (x) { return typeof x === 'string'; }) : [];
    var history = readJson(HIST_KEY, []);
    state.history = Array.isArray(history) ? history.filter(function (x) { return x && typeof x.title === 'string'; }).slice(0, 30) : [];
  }

  function saveLinks() {
    if (!writeJson(KEY, state.links)) status('Przeglądarka nie pozwoliła zapamiętać playlisty.', 'error');
    writeJson(FAV_KEY, state.favorites);
  }

  function saveHistory() {
    writeJson(HIST_KEY, state.history);
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
    } else if (host === 'deezer.com') {
      var deezerKind = ['track', 'album', 'playlist'].indexOf(parts[0]) >= 0 ? parts[0] : '';
      var deezerId = parts[1];
      if (deezerKind && /^\d+$/.test(deezerId || '')) {
        out = {
          service: 'Deezer',
          title: 'Deezer · ' + ({ track: 'utwór', album: 'album', playlist: 'playlista' }[deezerKind]),
          embed: 'https://widget.deezer.com/widget/dark/' + deezerKind + '/' + deezerId,
          height: 220,
          url: 'https://www.deezer.com/' + deezerKind + '/' + deezerId
        };
      }
    }
    return out;
  }

  function rebuildOrder() {
    state.order = [];
    state.tracks.forEach(function (track) { state.order.push({ kind: 'file', ref: track }); });
    state.links.forEach(function (link) { state.order.push({ kind: 'link', ref: link }); });
  }

  function current() {
    return state.order[state.index] || null;
  }

  function isFavorite(link) {
    return state.favorites.indexOf(link.embed) >= 0;
  }

  function toggleFavorite(link) {
    var at = state.favorites.indexOf(link.embed);
    if (at >= 0) {
      state.favorites.splice(at, 1);
      status('Usunięto z ulubionych: ' + link.title + '.');
    } else {
      state.favorites.push(link.embed);
      status('Dodano do ulubionych: ' + link.title + '.');
    }
    saveLinks();
    paintCounts();
    renderList();
  }

  function pushHistory(entry) {
    var title, service;
    if (entry.kind === 'file') { title = entry.ref.name; service = 'Plik'; }
    else { title = entry.ref.title; service = entry.ref.service; }
    state.history = state.history.filter(function (item) { return !(item.title === title && item.service === service); });
    state.history.unshift({ title: title, service: service, at: Date.now() });
    state.history = state.history.slice(0, 30);
    saveHistory();
  }

  function paintCounts() {
    if (el.count) el.count.textContent = String(state.links.length);
    if (el.favCount) el.favCount.textContent = String(state.favorites.length);
  }

  function renderList() {
    if (!el.list) return;
    el.list.textContent = '';
    paintCounts();

    if (state.view === 'history') {
      if (!state.history.length) {
        el.list.appendChild(emptyRow('Historia jest pusta. Odtwórz cokolwiek, żeby ją zapełnić.'));
        return;
      }
      state.history.forEach(function (item) {
        var li = document.createElement('li');
        var row = document.createElement('div');
        row.className = 'music-row music-row--static';
        var name = document.createElement('span');
        name.textContent = item.title;
        var meta = document.createElement('small');
        meta.textContent = item.service.toUpperCase();
        row.append(name, meta);
        li.appendChild(row);
        el.list.appendChild(li);
      });
      return;
    }

    if (state.view === 'favorites') {
      var favs = state.links.filter(isFavorite);
      if (!favs.length) {
        el.list.appendChild(emptyRow('Brak ulubionych. Kliknij gwiazdkę przy utworze w playliście.'));
        return;
      }
      favs.forEach(function (link) {
        var index = state.order.findIndex(function (entry) { return entry.kind === 'link' && entry.ref === link; });
        el.list.appendChild(listRow(index, { kind: 'link', ref: link }));
      });
      return;
    }

    if (!state.order.length) {
      el.list.appendChild(emptyRow('Playlista jest pusta. Wyszukaj utwór, dodaj pliki z dysku albo wklej link.'));
      return;
    }
    state.order.forEach(function (entry, index) {
      el.list.appendChild(listRow(index, entry));
    });
  }

  function emptyRow(text) {
    var empty = document.createElement('li');
    empty.className = 'rjapp-empty';
    empty.textContent = text;
    return empty;
  }

  function listRow(index, entry) {
    var li = document.createElement('li');
    li.className = 'music-item';
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
    if (entry.kind === 'link') {
      var star = document.createElement('button');
      star.type = 'button';
      star.className = 'music-star' + (isFavorite(entry.ref) ? ' is-on' : '');
      star.setAttribute('data-fav', String(index));
      star.setAttribute('aria-pressed', isFavorite(entry.ref) ? 'true' : 'false');
      star.setAttribute('aria-label', isFavorite(entry.ref) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych');
      star.title = isFavorite(entry.ref) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych';
      star.textContent = isFavorite(entry.ref) ? '★' : '☆';
      li.appendChild(star);
    }
    return li;
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
    stopPreview();
    pushHistory(entry);
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
    return addParsedLink(parsed, true);
  }

  function addParsedLink(parsed, loud) {
    var duplicate = state.links.some(function (item) { return item.embed === parsed.embed; });
    if (duplicate) {
      if (loud) status('Ten utwór jest już na playliście.');
      return loud ? parsed : null;
    }
    state.links.push(parsed);
    saveLinks();
    rebuildOrder();
    if (el.link) el.link.value = '';
    if (loud) status('Dodano osadzony odtwarzacz ' + parsed.service + '.');
    renderList();
    if (state.index < 0) { state.index = state.order.length - 1; paintNow(); }
    return parsed;
  }

  /* ------------------------------------------------------------- szukanie */

  function jsonp(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var name = 'rjMusicCb' + (++jsonpSeq) + '_' + Math.floor(Math.random() * 1e6);
      var script = document.createElement('script');
      var done = false;
      var timer = window.setTimeout(function () { finish(new Error('timeout')); }, timeoutMs || 9000);
      function finish(error, data) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        try { delete window[name]; } catch (error2) { window[name] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
        if (error) reject(error); else resolve(data);
      }
      window[name] = function (data) { finish(null, data); };
      script.onerror = function () { finish(new Error('network')); };
      script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + name;
      document.head.appendChild(script);
    });
  }

  function deezerSearch(query, offset) {
    var url = 'https://api.deezer.com/search?q=' + encodeURIComponent(query) +
      '&limit=20&index=' + Math.max(0, offset) + '&output=jsonp';
    return jsonp(url).then(function (data) {
      var rows = (data && data.data) || [];
      return rows.map(function (row) {
        return {
          key: 'dz:' + row.id,
          service: 'Deezer',
          title: row.title || 'Utwór',
          artist: (row.artist && row.artist.name) || 'Nieznany wykonawca',
          cover: (row.album && (row.album.cover_medium || row.album.cover)) || '',
          preview: row.preview || '',
          link: row.link || '',
          embeddable: true
        };
      });
    });
  }

  function itunesSearch(query, offset) {
    var url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(query) +
      '&media=music&entity=song&limit=20&offset=' + Math.max(0, offset);
    return jsonp(url).then(function (data) {
      var rows = (data && data.results) || [];
      return rows.map(function (row) {
        return {
          key: 'it:' + row.trackId,
          service: 'Apple Music',
          title: row.trackName || 'Utwór',
          artist: row.artistName || 'Nieznany wykonawca',
          cover: (row.artworkUrl100 || '').replace('100x100', '240x240'),
          preview: row.previewUrl || '',
          link: row.trackViewUrl || '',
          embeddable: false
        };
      });
    });
  }

  function normalize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/gi, ' ').trim();
  }

  function dedupe(rows) {
    var seen = {};
    return rows.filter(function (row) {
      var key = normalize(row.title + ' ' + row.artist);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function updateOutlinks(query) {
    if (!el.outlinks) return;
    var q = String(query || '').trim();
    var enc = encodeURIComponent(q);
    var links = {
      spotify: 'https://open.spotify.com/search/' + enc,
      youtube: 'https://www.youtube.com/results?search_query=' + enc,
      soundcloud: 'https://soundcloud.com/search?q=' + enc,
      deezer: 'https://www.deezer.com/search/' + enc
    };
    Array.prototype.forEach.call(el.outlinks.querySelectorAll('[data-out]'), function (a) {
      var key = a.getAttribute('data-out');
      if (links[key]) a.href = links[key];
      a.setAttribute('aria-disabled', q ? 'false' : 'true');
    });
  }

  function resetResults() {
    state.results = [];
    state.offsets = { deezer: 0, itunes: 0 };
    if (el.results) el.results.textContent = '';
    if (el.more) el.more.hidden = true;
  }

  function runSearch(more) {
    if (!el.query) return Promise.resolve([]);
    var query = el.query.value.trim();
    if (query.length < 2) {
      searchStatus('Wpisz co najmniej 2 znaki.', 'error');
      return Promise.resolve([]);
    }
    if (!more) {
      resetResults();
      state.query = query;
    }
    updateOutlinks(query);

    var tasks = [];
    if (state.platform === 'all' || state.platform === 'deezer') {
      tasks.push(deezerSearch(query, state.offsets.deezer).then(function (rows) {
        state.offsets.deezer += 20;
        return rows;
      }).catch(function () { return []; }));
    }
    if (state.platform === 'all' || state.platform === 'itunes') {
      tasks.push(itunesSearch(query, state.offsets.itunes).then(function (rows) {
        state.offsets.itunes += 20;
        return rows;
      }).catch(function () { return []; }));
    }

    searchStatus(more ? 'Dociągam kolejne wyniki…' : 'Szukam „' + query + '”…');
    if (el.searchBtn) el.searchBtn.disabled = true;

    return Promise.all(tasks).then(function (groups) {
      if (el.searchBtn) el.searchBtn.disabled = false;
      var rows = dedupe([].concat.apply([], groups));
      if (!rows.length) {
        searchStatus(more
          ? 'To już wszystkie wyniki dla „' + query + '”.'
          : 'Brak wyników dla „' + query + '”. Spróbuj innej pisowni albo otwórz platformę z listy powyżej.');
        if (el.more) el.more.hidden = true;
        if (!more) renderResults();
        return [];
      }
      state.results = more ? state.results.concat(rows) : rows;
      renderResults();
      searchStatus('Znaleziono ' + state.results.length + ' ' + plural(state.results.length, 'utwór', 'utwory', 'utworów') + ' dla „' + query + '”.');
      if (el.more) el.more.hidden = state.results.length < 20;
      return rows;
    });
  }

  function plural(n, one, few, many) {
    if (n === 1) return one;
    var rest = n % 10, tens = n % 100;
    if (rest >= 2 && rest <= 4 && (tens < 10 || tens >= 20)) return few;
    return many;
  }

  function renderResults() {
    if (!el.results) return;
    el.results.textContent = '';
    state.results.forEach(function (row, index) {
      var li = document.createElement('li');
      li.className = 'music-result';

      var cover = document.createElement('div');
      cover.className = 'music-result-cover';
      if (row.cover) {
        var img = document.createElement('img');
        img.src = row.cover;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        cover.appendChild(img);
      } else {
        cover.textContent = '♪';
      }

      var copy = document.createElement('div');
      copy.className = 'music-result-copy';
      var title = document.createElement('strong');
      title.textContent = row.title;
      var artist = document.createElement('span');
      artist.textContent = row.artist;
      copy.append(title, artist);

      var badge = document.createElement('span');
      badge.className = 'music-result-src';
      badge.textContent = row.service;

      var actions = document.createElement('div');
      actions.className = 'music-result-actions';

      if (row.preview) {
        var play = document.createElement('button');
        play.type = 'button';
        play.className = 'rjapp-btn rjapp-btn--quiet music-result-play';
        play.setAttribute('data-preview', String(index));
        play.setAttribute('aria-pressed', state.previewUrl === row.preview ? 'true' : 'false');
        play.textContent = state.previewUrl === row.preview && state.previewAudio && !state.previewAudio.paused ? '❚❚ 30 s' : '▶ 30 s';
        play.title = 'Odsłuchaj oficjalną zapowiedź';
        actions.appendChild(play);
      }

      if (row.embeddable && row.link) {
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'rjapp-btn rjapp-btn--ghost music-result-add';
        add.setAttribute('data-add', String(index));
        add.textContent = 'Dodaj do playlisty';
        actions.appendChild(add);
      }

      if (row.link) {
        var open = document.createElement('a');
        open.className = 'music-result-open';
        open.href = row.link;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.textContent = 'Otwórz ↗';
        actions.appendChild(open);
      }

      li.append(cover, copy, badge, actions);
      el.results.appendChild(li);
    });
  }

  function stopPreview() {
    if (state.previewAudio) {
      state.previewAudio.pause();
      state.previewAudio.removeAttribute('src');
    }
    state.previewUrl = '';
    if (el.results) {
      Array.prototype.forEach.call(el.results.querySelectorAll('[data-preview]'), function (button) {
        button.textContent = '▶ 30 s';
        button.setAttribute('aria-pressed', 'false');
      });
    }
  }

  function togglePreview(index) {
    var row = state.results[index];
    if (!row || !row.preview) return;
    if (!state.previewAudio) {
      state.previewAudio = new window.Audio();
      state.previewAudio.preload = 'none';
      state.previewAudio.addEventListener('ended', function () {
        state.previewUrl = '';
        renderResults();
      });
      state.previewAudio.addEventListener('error', function () {
        searchStatus('Nie udało się odtworzyć zapowiedzi tego utworu.', 'error');
        stopPreview();
      });
    }
    if (state.previewUrl === row.preview && !state.previewAudio.paused) {
      stopPreview();
      renderResults();
      return;
    }
    if (audio) audio.pause();
    state.previewUrl = row.preview;
    state.previewAudio.src = row.preview;
    state.previewAudio.play().then(function () {
      renderResults();
    }).catch(function () {
      searchStatus('Przeglądarka zablokowała zapowiedź — kliknij ▶ jeszcze raz.', 'error');
    });
  }

  function setView(view) {
    state.view = view;
    if (el.tabs) {
      Array.prototype.forEach.call(el.tabs.querySelectorAll('[data-view]'), function (tab) {
        var on = tab.getAttribute('data-view') === view;
        tab.classList.toggle('is-on', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    renderList();
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
      repeat: $('music-repeat'),
      query: $('music-query'),
      searchForm: $('music-search-form'),
      searchBtn: $('music-search-btn'),
      searchStatus: $('music-search-status'),
      results: $('music-results'),
      platforms: $('music-platforms'),
      outlinks: $('music-outlinks'),
      more: $('music-more'),
      tabs: $('music-tabs'),
      count: $('music-count'),
      favCount: $('music-fav-count')
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
      var star = event.target.closest('[data-fav]');
      if (star) {
        var target = state.order[Number(star.getAttribute('data-fav'))];
        if (target && target.kind === 'link') toggleFavorite(target.ref);
        return;
      }
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
    if (el.searchForm) el.searchForm.addEventListener('submit', function (event) {
      event.preventDefault();
      runSearch(false);
    });
    if (el.platforms) el.platforms.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-platform]');
      if (!chip) return;
      state.platform = chip.getAttribute('data-platform');
      Array.prototype.forEach.call(el.platforms.querySelectorAll('[data-platform]'), function (button) {
        var on = button === chip;
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (el.query && el.query.value.trim().length >= 2) runSearch(false);
    });
    if (el.more) el.more.addEventListener('click', function () { runSearch(true); });
    if (el.results) el.results.addEventListener('click', function (event) {
      var play = event.target.closest('[data-preview]');
      if (play) { togglePreview(Number(play.getAttribute('data-preview'))); return; }
      var add = event.target.closest('[data-add]');
      if (add) {
        var row = state.results[Number(add.getAttribute('data-add'))];
        if (!row) return;
        var parsed = parseLink(row.link);
        if (!parsed) { searchStatus('Tego utworu nie da się osadzić — otwórz go na platformie.', 'error'); return; }
        if (addParsedLink(parsed, false)) searchStatus('Dodano do playlisty: ' + row.title + ' — ' + row.artist + '.');
      }
    });
    if (el.tabs) el.tabs.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-view]');
      if (tab) setView(tab.getAttribute('data-view'));
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

    updateOutlinks('');
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
    },
    parseLink: parseLink,
    search: function (query, platform) {
      state.platform = platform || 'all';
      if (el && el.query) el.query.value = query;
      return runSearch(false);
    },
    favorites: function () { return state.favorites.slice(); }
  };
})(window, document);

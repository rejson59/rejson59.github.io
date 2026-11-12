/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * RejMeme (v2) — galeria memów społeczności + kolejka moderacji.
 *
 * Zasady:
 *  - galeria pokazuje WYŁĄCZNIE memy zatwierdzone przez admina,
 *  - każdy wgrany plik trafia do kolejki `pending` i czeka na decyzję,
 *  - odrzucony mem nie jest publikowany, a autor widzi powód,
 *  - obrazy są pobierane przez funkcje RPC (bez publicznego Storage),
 *  - popularne formaty opisujemy i linkujemy do Know Your Meme, bo cudze
 *    obrazki mają swoich autorów — własną wersję można wgrać samodzielnie.
 */
(function (window, document) {
  'use strict';

  var MAX_BYTES = 2097152;
  var PAGE = 24;
  var SEEN_KEY = 'rj_meme_seen_v1';

  var state = {
    view: 'gallery',
    query: '',
    tag: '',
    sort: 'new',
    offset: 0,
    total: 0,
    items: [],
    galleryToken: 0,
    session: null,
    file: null,
    fileUrl: '',
    objectUrls: [],
    seen: {}
  };

  var el = {};

  function $(id) { return document.getElementById(id); }

  /* Klucz anon jest publiczny — chroni nas RLS i funkcje `security definer`.
     Własne wywołanie jest tylko siatką bezpieczeństwa, gdyby skrypt profili
     nie zdążył się wczytać; normalnie korzystamy z jednego klienta RJProfiles. */
  var SUPABASE_URL = 'https://hzbqzfimtroixnldzjeq.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';

  function directRpc(name, data) {
    return window.fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data || {})
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (body) {
        if (!response.ok) throw new Error(body && body.message ? body.message : 'Nie udało się połączyć z bazą memów.');
        return body;
      });
    });
  }

  function rpc() {
    var profiles = window.RJProfiles;
    if (profiles && typeof profiles.rpc === 'function') return profiles.rpc;
    return directRpc;
  }

  function session() {
    var profiles = window.RJProfiles;
    if (profiles && typeof profiles.session === 'function') {
      var current = profiles.session();
      if (current && current.token) return current;
    }
    try {
      var stored = JSON.parse(window.localStorage.getItem('rejson_community_session_v1') || 'null');
      return stored && typeof stored.token === 'string' && stored.token.length >= 16 ? stored : null;
    } catch (error) { return null; }
  }

  function setStatus(node, message, tone) {
    if (!node) return;
    node.textContent = message || '';
    if (tone) node.setAttribute('data-tone', tone);
    else node.removeAttribute('data-tone');
  }

  function call(name, params) {
    var fn = rpc();
    if (!fn) return Promise.reject(new Error('Nie udało się połączyć z bazą memów.'));
    return fn(name, params);
  }

  function errText(error) {
    var message = error && error.message ? error.message : String(error || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
      return 'Brak połączenia z internetem — spróbuj ponownie.';
    }
    if (/JWT|permission|administrator/i.test(message)) {
      return 'Ta sekcja wymaga uprawnień administratora.';
    }
    return message || 'Nie udało się wykonać operacji.';
  }

  function normalizeTags(value) {
    return String(value || '')
      .split(',')
      .map(function (tag) { return tag.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^#/, ''); })
      .filter(function (tag) { return tag.length >= 2 && tag.length <= 24; })
      .filter(function (tag, index, list) { return list.indexOf(tag) === index; })
      .slice(0, 6);
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    try {
      return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (error) { return date.toISOString().slice(0, 10); }
  }

  function dataToUrl(payload) {
    if (!payload || !payload.data) return '';
    var binary = window.atob(payload.data);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    var blob = new window.Blob([bytes], { type: payload.mime || 'image/png' });
    var url = window.URL.createObjectURL(blob);
    state.objectUrls.push(url);
    return url;
  }

  function revokeUrls() {
    state.objectUrls.forEach(function (url) {
      try { window.URL.revokeObjectURL(url); } catch (error) { /* ignorujemy */ }
    });
    state.objectUrls = [];
  }

  /* ------------------------------------------------------------- szablony */

  var TEMPLATES = [
    { id: 'drake', name: 'Drake — odrzuca / akceptuje', emoji: '🙅', heat: 98,
      desc: 'Dwie panele: górny to coś, czego nie chcesz, dolny — coś, co wybierasz bez wahania. Najczęstszy format na „wolę X niż Y”.',
      kym: 'https://knowyourmeme.com/memes/drakeposting' },
    { id: 'distracted', name: 'Rozkojarzony chłopak', emoji: '👀', heat: 94,
      desc: 'Chłopak ogląda się za inną dziewczyną, a jego partnerka patrzy z wyrzutem. Idealny na „nowa rzecz vs. obowiązek”.',
      kym: 'https://knowyourmeme.com/memes/distracted-boyfriend' },
    { id: 'fine', name: 'This Is Fine', emoji: '🔥', heat: 92,
      desc: 'Piesek w płonącym pokoju z kubkiem kawy. Mem na sytuacje, w których wszystko się wali, a ty udajesz spokój.',
      kym: 'https://knowyourmeme.com/memes/this-is-fine' },
    { id: 'cat', name: 'Krzycząca kobieta i kot', emoji: '🐈', heat: 89,
      desc: 'Dwie strony konfliktu: kobieta krzyczy, kot odpowiada. Dobry do sporów „ja vs. wszyscy”.',
      kym: 'https://knowyourmeme.com/memes/woman-yelling-at-cat' },
    { id: 'buttons', name: 'Dwa przyciski', emoji: '🟥', heat: 86,
      desc: 'Postać przed dwoma przyciskami, a nad nią spocona twarz. Klasyk dylematów, w których oba wybory są złe.',
      kym: 'https://knowyourmeme.com/memes/daily-struggle-two-buttons' },
    { id: 'brain', name: 'Rozszerzający się mózg', emoji: '🧠', heat: 84,
      desc: 'Cztery poziomy „genialności” rozwiązania — od oczywistego do absurdalnego. Świetny na złe pomysły.',
      kym: 'https://knowyourmeme.com/memes/expanding-brain' },
    { id: 'mind', name: 'Change My Mind', emoji: '☕', heat: 78,
      desc: 'Mężczyzna za stolikiem z tabliczką i kontrowersyjną tezą. Format na „niepopularna opinia”.',
      kym: 'https://knowyourmeme.com/memes/steven-crowders-change-my-mind-student-center' },
    { id: 'spongebob', name: 'Kpiący SpongeBob', emoji: '🧽', heat: 76,
      desc: 'Naprzemienne wielkie i małe litery naśladujące drwiący ton. Krótki tekst, duży efekt.',
      kym: 'https://knowyourmeme.com/memes/mocking-spongebob' },
    { id: 'gru', name: 'Plan Gru', emoji: '🦹', heat: 73,
      desc: 'Plan z trzema krokami, w którym trzeci jest zawsze katastrofą. Mem na „miało być prosto”.',
      kym: 'https://knowyourmeme.com/memes/grus-plan' },
    { id: 'pikachu', name: 'Zaskoczony Pikachu', emoji: '⚡', heat: 71,
      desc: 'Pikachu z otwartą buzią na coś zupełnie przewidywalnego. Krótka puenta, zero litości.',
      kym: 'https://knowyourmeme.com/memes/surprised-pikachu' },
    { id: 'nobody', name: 'Nobody:', emoji: '🫥', heat: 68,
      desc: '„Nikt: … Ja: …” — format na zachowania, których nikt nie prosił, a i tak się dzieją.',
      kym: 'https://knowyourmeme.com/memes/nobody' },
    { id: 'brain3am', name: 'Mój mózg o 3:00', emoji: '🌙', heat: 65,
      desc: 'Losowa myśl w środku nocy. Format na absurdalne rozkminy i wspomnienia sprzed lat.',
      kym: 'https://knowyourmeme.com/memes/midnight-thoughts' }
  ];

  function renderTemplates() {
    if (!el.templates) return;
    el.templates.textContent = '';
    TEMPLATES.slice().sort(function (a, b) { return b.heat - a.heat; }).forEach(function (item, index) {
      var li = document.createElement('li');
      li.className = 'meme-template';

      var tile = document.createElement('div');
      tile.className = 'meme-template-tile';
      tile.setAttribute('aria-hidden', 'true');
      tile.textContent = item.emoji;
      if (index < 3) {
        var hot = document.createElement('span');
        hot.className = 'meme-template-hot';
        hot.textContent = 'NA CZASIE';
        tile.appendChild(hot);
      }

      var copy = document.createElement('div');
      copy.className = 'meme-template-copy';
      var title = document.createElement('strong');
      title.textContent = item.name;
      var desc = document.createElement('span');
      desc.textContent = item.desc;

      var actions = document.createElement('div');
      actions.className = 'meme-template-actions';
      var kym = document.createElement('a');
      kym.href = item.kym;
      kym.target = '_blank';
      kym.rel = 'noopener noreferrer';
      kym.textContent = 'Opis formatu ↗';
      var upload = document.createElement('button');
      upload.type = 'button';
      upload.className = 'rjapp-btn rjapp-btn--ghost';
      upload.setAttribute('data-meme-template', item.id);
      upload.textContent = 'Wgraj własną wersję';
      actions.append(kym, upload);

      copy.append(title, desc, actions);
      li.append(tile, copy);
      el.templates.appendChild(li);
    });
  }

  /* -------------------------------------------------------------- galeria */

  function cardFor(item) {
    var li = document.createElement('li');
    li.className = 'meme-card';
    li.setAttribute('data-meme-id', item.id);

    var figure = document.createElement('button');
    figure.type = 'button';
    figure.className = 'meme-card-figure';
    figure.setAttribute('data-meme-open', item.id);
    figure.setAttribute('aria-label', 'Powiększ mem: ' + item.title);
    var placeholder = document.createElement('span');
    placeholder.className = 'meme-card-placeholder';
    placeholder.textContent = '◌';
    figure.appendChild(placeholder);

    var copy = document.createElement('div');
    copy.className = 'meme-card-copy';
    var title = document.createElement('strong');
    title.textContent = item.title;
    var meta = document.createElement('span');
    var bits = [];
    if (item.author) bits.push('@' + item.author);
    if (item.created_at) bits.push(formatDate(item.created_at));
    if (item.views) bits.push(item.views + ' wyświetleń');
    meta.textContent = bits.join(' · ');

    copy.append(title, meta);

    if (Array.isArray(item.tags) && item.tags.length) {
      var tags = document.createElement('div');
      tags.className = 'meme-card-tags';
      item.tags.slice(0, 6).forEach(function (tag) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'meme-tag';
        chip.setAttribute('data-meme-tag', tag);
        chip.textContent = '#' + tag;
        tags.appendChild(chip);
      });
      copy.appendChild(tags);
    }

    li.append(figure, copy);
    return li;
  }

  function loadCardImage(li, id, token) {
    call('rejmeme_image', { p_id: id }).then(function (payload) {
      if (token !== state.galleryToken) return;
      var url = dataToUrl(payload);
      if (!url) return;
      var button = li.querySelector('[data-meme-open]');
      if (!button) return;
      button.textContent = '';
      var img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      button.appendChild(img);
      button.setAttribute('data-meme-url', url);
    }).catch(function () {
      var placeholder = li.querySelector('.meme-card-placeholder');
      if (placeholder) placeholder.textContent = '×';
    });
  }

  function renderGallery() {
    if (!el.gallery) return;
    revokeUrls();
    el.gallery.textContent = '';
    if (!state.items.length) {
      var empty = document.createElement('li');
      empty.className = 'rjapp-empty meme-gallery-empty';
      empty.textContent = state.query || state.tag
        ? 'Nic nie pasuje do tego filtra. Spróbuj innej frazy.'
        : 'Galeria jest jeszcze pusta. Wgraj pierwszy mem — po zatwierdzeniu pojawi się tutaj.';
      el.gallery.appendChild(empty);
      if (el.more) el.more.hidden = true;
      return;
    }
    var token = state.galleryToken;
    state.items.forEach(function (item) {
      var li = cardFor(item);
      el.gallery.appendChild(li);
      loadCardImage(li, item.id, token);
    });
    if (el.more) el.more.hidden = state.items.length >= state.total;
  }

  function loadGallery(more) {
    if (!more) {
      state.offset = 0;
      state.items = [];
      state.galleryToken += 1;
    }
    setStatus(el.galleryStatus, more ? 'Dociągam kolejne memy…' : 'Wczytuję galerię…');
    return call('rejmeme_gallery', {
      p_query: state.query || null,
      p_tag: state.tag || null,
      p_sort: state.sort,
      p_limit: PAGE,
      p_offset: state.offset
    }).then(function (data) {
      var rows = (data && Array.isArray(data.items)) ? data.items : [];
      state.total = data && typeof data.total === 'number' ? data.total : rows.length;
      state.items = more ? state.items.concat(rows) : rows;
      state.offset = state.items.length;
      renderGallery();
      if (!state.items.length) {
        setStatus(el.galleryStatus, state.query || state.tag
          ? 'Brak memów dla tego filtra.'
          : 'Galeria jest pusta — bądź pierwszą osobą, która coś wgra.');
      } else {
        setStatus(el.galleryStatus, 'Zatwierdzone memy: ' + state.total + '. Pokazano ' + state.items.length + '.');
      }
      renderTagbar();
      return rows;
    }).catch(function (error) {
      setStatus(el.galleryStatus, errText(error), 'error');
      if (!state.items.length) {
        var empty = document.createElement('li');
        empty.className = 'rjapp-empty meme-gallery-empty';
        empty.textContent = 'Nie udało się wczytać galerii. Sprawdź połączenie i spróbuj ponownie.';
        if (el.gallery) el.gallery.appendChild(empty);
      }
      return [];
    });
  }

  function renderTagbar() {
    if (!el.tagbar) return;
    var counts = {};
    state.items.forEach(function (item) {
      (item.tags || []).forEach(function (tag) { counts[tag] = (counts[tag] || 0) + 1; });
    });
    var tags = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 10);
    el.tagbar.textContent = '';
    if (!tags.length && !state.tag) return;
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'meme-tag' + (state.tag ? '' : ' is-on');
    all.setAttribute('data-meme-tag', '');
    all.textContent = 'Wszystkie';
    el.tagbar.appendChild(all);
    if (state.tag && tags.indexOf(state.tag) < 0) tags.unshift(state.tag);
    tags.forEach(function (tag) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'meme-tag' + (state.tag === tag ? ' is-on' : '');
      chip.setAttribute('data-meme-tag', tag);
      chip.textContent = '#' + tag;
      el.tagbar.appendChild(chip);
    });
  }

  /* --------------------------------------------------------------- upload */

  function readFile(file) {
    var mime = file.type;
    if (!mime) {
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || '';
    }
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].indexOf(mime) < 0) {
      return Promise.reject(new Error('Dozwolone są memy JPG, PNG, GIF i WebP.'));
    }
    if (file.size > MAX_BYTES) {
      return Promise.reject(new Error('Mem jest za duży — maks. 2 MiB.'));
    }
    return new Promise(function (resolve, reject) {
      var reader = new window.FileReader();
      reader.onerror = function () { reject(new Error('Nie udało się odczytać pliku.')); };
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve({ mime: mime, base64: comma >= 0 ? result.slice(comma + 1) : result });
      };
      reader.readAsDataURL(file);
    });
  }

  function showPreview(file) {
    state.file = file;
    if (state.fileUrl) {
      try { window.URL.revokeObjectURL(state.fileUrl); } catch (error) { /* ignorujemy */ }
      state.fileUrl = '';
    }
    if (!file) {
      if (el.preview) el.preview.hidden = true;
      return;
    }
    state.fileUrl = window.URL.createObjectURL(file);
    if (el.previewImg) el.previewImg.src = state.fileUrl;
    if (el.preview) el.preview.hidden = false;
  }

  function submitUpload(event) {
    if (event) event.preventDefault();
    if (!el.form) return;
    var who = session();
    if (!who) {
      setStatus(el.uploadStatus, 'Zaloguj się, żeby wysłać mem do moderacji.', 'error');
      if (el.loginLink) el.loginLink.hidden = false;
      return;
    }
    var title = el.title ? el.title.value.trim() : '';
    var tags = normalizeTags(el.tags ? el.tags.value : '');
    if (title.length < 3) {
      setStatus(el.uploadStatus, 'Tytuł musi mieć co najmniej 3 znaki.', 'error');
      if (el.title) el.title.focus();
      return;
    }
    if (!state.file) {
      setStatus(el.uploadStatus, 'Najpierw wybierz plik z matem.', 'error');
      return;
    }
    if (el.ethics && !el.ethics.checked) {
      setStatus(el.uploadStatus, 'Potwierdź, że mem jest etyczny i masz do niego prawa.', 'error');
      return;
    }
    if (el.submit) el.submit.disabled = true;
    setStatus(el.uploadStatus, 'Wysyłam mem do kolejki moderacji…');

    readFile(state.file).then(function (file) {
      return call('rejmeme_submit', {
        p_token: who.token,
        p_title: title,
        p_tags: tags,
        p_mime: file.mime,
        p_data_base64: file.base64
      });
    }).then(function (result) {
      setStatus(el.uploadStatus, 'Dziękujemy! Mem „' + (result && result.title ? result.title : title) + '” czeka na decyzję admina. Nic nie jest jeszcze publiczne.', 'ok');
      if (el.form) el.form.reset();
      showPreview(null);
      setView('mine');
      loadMine();
    }).catch(function (error) {
      setStatus(el.uploadStatus, errText(error), 'error');
    }).then(function () {
      if (el.submit) el.submit.disabled = false;
    });
  }

  /* --------------------------------------------------------------- moje */

  function statusLabel(status) {
    if (status === 'approved') return 'Zatwierdzony';
    if (status === 'rejected') return 'Odrzucony';
    return 'Czeka na decyzję';
  }

  function loadMine() {
    if (!el.mine) return;
    var who = session();
    if (!who) {
      el.mine.textContent = '';
      setStatus(el.mineStatus, 'Zaloguj się, żeby zobaczyć swoje zgłoszenia.', 'error');
      return Promise.resolve();
    }
    setStatus(el.mineStatus, 'Wczytuję Twoje zgłoszenia…');
    return call('rejmeme_mine', { p_token: who.token }).then(function (data) {
      var rows = (data && Array.isArray(data.items)) ? data.items : [];
      el.mine.textContent = '';
      if (!rows.length) {
        var empty = document.createElement('li');
        empty.className = 'rjapp-empty';
        empty.textContent = 'Nie wysłałeś jeszcze żadnego mema.';
        el.mine.appendChild(empty);
        setStatus(el.mineStatus, '');
        return;
      }
      var fresh = 0;
      rows.forEach(function (item) {
        var li = document.createElement('li');
        li.className = 'meme-mine-row';

        var thumb = document.createElement('div');
        thumb.className = 'meme-mine-thumb';
        thumb.textContent = '◌';
        loadMineImage(thumb, item.id, who.token);

        var copy = document.createElement('div');
        copy.className = 'meme-mine-copy';
        var title = document.createElement('strong');
        title.textContent = item.title;
        var meta = document.createElement('span');
        meta.textContent = (item.created_at ? formatDate(item.created_at) + ' · ' : '') + statusLabel(item.status);

        var badge = document.createElement('span');
        badge.className = 'meme-status meme-status--' + (item.status || 'pending');
        badge.textContent = statusLabel(item.status);

        copy.append(title, meta, badge);

        if (item.status === 'rejected' && item.reason) {
          var reason = document.createElement('p');
          reason.className = 'meme-mine-reason';
          reason.textContent = 'Powód: ' + item.reason;
          copy.appendChild(reason);
        }

        if (item.status === 'pending') {
          var withdraw = document.createElement('button');
          withdraw.type = 'button';
          withdraw.className = 'rjapp-btn rjapp-btn--ghost meme-withdraw';
          withdraw.setAttribute('data-meme-withdraw', item.id);
          withdraw.textContent = 'Wycofaj';
          copy.appendChild(withdraw);
        }

        if (item.status === 'approved' && !state.seen[item.id]) fresh += 1;

        li.append(thumb, copy);
        el.mine.appendChild(li);
      });

      var pending = data && typeof data.pending === 'number' ? data.pending : 0;
      var approved = data && typeof data.approved === 'number' ? data.approved : 0;
      setStatus(el.mineStatus, 'Oczekuje: ' + pending + ' · zatwierdzone: ' + approved + '.' +
        (fresh ? ' Nowe decyzje: ' + fresh + '.' : ''));

      var ids = {};
      rows.forEach(function (item) { ids[item.id] = true; });
      rows.forEach(function (item) { if (item.status === 'approved') state.seen[item.id] = true; });
      try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(state.seen)); } catch (error) { /* tryb prywatny */ }
      return rows;
    }).catch(function (error) {
      setStatus(el.mineStatus, errText(error), 'error');
      return [];
    });
  }

  function loadMineImage(node, id, token) {
    call('rejmeme_own_image', { p_token: token, p_id: id }).then(function (payload) {
      var url = dataToUrl(payload);
      if (!url || !node.isConnected) return;
      node.textContent = '';
      var img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      node.appendChild(img);
    }).catch(function () { /* miniatura jest opcjonalna */ });
  }

  function withdraw(id, button) {
    var who = session();
    if (!who) return;
    if (button) button.disabled = true;
    call('rejmeme_withdraw', { p_token: who.token, p_id: id }).then(function () {
      setStatus(el.mineStatus, 'Mem wycofany z kolejki.', 'ok');
      loadMine();
    }).catch(function (error) {
      setStatus(el.mineStatus, errText(error), 'error');
      if (button) button.disabled = false;
    });
  }

  /* ------------------------------------------------------------ widoczność */

  function setView(view) {
    state.view = view;
    Array.prototype.forEach.call(document.querySelectorAll('[data-meme-view]'), function (tab) {
      var on = tab.getAttribute('data-meme-view') === view;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ['gallery', 'templates', 'upload', 'mine'].forEach(function (name) {
      var panel = $('meme-view-' + name);
      if (panel) panel.hidden = name !== view;
    });
    if (view === 'mine') loadMine();
  }

  function openLightbox(id, fallbackUrl) {
    var item = state.items.filter(function (row) { return row.id === id; })[0];
    if (!el.lightbox) return;
    el.lightbox.classList.add('is-open');
    el.lightbox.setAttribute('aria-hidden', 'false');
    if (el.lightboxTitle) el.lightboxTitle.textContent = item ? item.title : '';
    if (el.lightboxMeta) {
      var bits = [];
      if (item && item.author) bits.push('@' + item.author);
      if (item && item.created_at) bits.push(formatDate(item.created_at));
      el.lightboxMeta.textContent = bits.join(' · ');
    }
    if (el.lightboxImg) {
      el.lightboxImg.removeAttribute('src');
      if (fallbackUrl) el.lightboxImg.src = fallbackUrl;
      else {
        call('rejmeme_image', { p_id: id }).then(function (payload) {
          var url = dataToUrl(payload);
          if (url && el.lightboxImg) el.lightboxImg.src = url;
        }).catch(function () { /* podgląd zostaje pusty */ });
      }
    }
    if (el.lightboxClose) el.lightboxClose.focus();
  }

  function closeLightbox() {
    if (!el.lightbox) return;
    el.lightbox.classList.remove('is-open');
    el.lightbox.setAttribute('aria-hidden', 'true');
    if (el.lightboxImg) el.lightboxImg.removeAttribute('src');
  }

  /* ----------------------------------------------------------------- boot */

  function debounce(fn, wait) {
    var timer = 0;
    return function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, wait);
    };
  }

  function boot() {
    el = {
      tabs: $('meme-tabs'),
      gallery: $('meme-gallery'),
      galleryStatus: $('meme-gallery-status'),
      search: $('meme-search'),
      sort: $('meme-sort'),
      tagbar: $('meme-tagbar'),
      more: $('meme-more'),
      templates: $('meme-templates'),
      form: $('meme-form'),
      drop: $('meme-drop'),
      file: $('meme-file'),
      preview: $('meme-preview'),
      previewImg: $('meme-preview-img'),
      previewClear: $('meme-preview-clear'),
      title: $('meme-title'),
      tags: $('meme-tags'),
      ethics: $('meme-ethics'),
      submit: $('meme-submit'),
      loginLink: $('meme-login-link'),
      uploadStatus: $('meme-upload-status'),
      mine: $('meme-mine'),
      mineStatus: $('meme-mine-status'),
      lightbox: $('meme-lightbox'),
      lightboxImg: $('meme-lightbox-img'),
      lightboxTitle: $('meme-lightbox-title'),
      lightboxMeta: $('meme-lightbox-meta'),
      lightboxClose: $('meme-lightbox-close')
    };
    if (!el.gallery) return;

    try {
      state.seen = JSON.parse(window.localStorage.getItem(SEEN_KEY) || '{}') || {};
    } catch (error) { state.seen = {}; }

    state.session = session();
    if (el.loginLink) el.loginLink.hidden = Boolean(state.session);

    renderTemplates();

    if (el.tabs) el.tabs.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-meme-view]');
      if (tab) setView(tab.getAttribute('data-meme-view'));
    });

    if (el.search) {
      el.search.addEventListener('input', debounce(function () {
        state.query = el.search.value.trim();
        loadGallery(false);
      }, 320));
    }
    if (el.sort) {
      el.sort.addEventListener('change', function () {
        state.sort = el.sort.value === 'popular' ? 'popular' : 'new';
        loadGallery(false);
      });
    }
    if (el.tagbar) {
      el.tagbar.addEventListener('click', function (event) {
        var chip = event.target.closest('[data-meme-tag]');
        if (!chip) return;
        state.tag = chip.getAttribute('data-meme-tag') || '';
        loadGallery(false);
      });
    }
    if (el.more) el.more.addEventListener('click', function () { loadGallery(true); });

    if (el.gallery) {
      el.gallery.addEventListener('click', function (event) {
        var tag = event.target.closest('[data-meme-tag]');
        if (tag) {
          state.tag = tag.getAttribute('data-meme-tag') || '';
          setView('gallery');
          loadGallery(false);
          return;
        }
        var open = event.target.closest('[data-meme-open]');
        if (open) openLightbox(open.getAttribute('data-meme-open'), open.getAttribute('data-meme-url') || '');
      });
    }

    if (el.templates) {
      el.templates.addEventListener('click', function (event) {
        var pick = event.target.closest('[data-meme-template]');
        if (!pick) return;
        setView('upload');
        var found = TEMPLATES.filter(function (item) { return item.id === pick.getAttribute('data-meme-template'); })[0];
        if (found && el.title) {
          el.title.value = found.name;
          el.title.focus();
        }
        setStatus(el.uploadStatus, 'Wgraj własny obrazek — format: ' + (found ? found.name : 'mem') + '.');
      });
    }

    if (el.drop) {
      ['dragenter', 'dragover'].forEach(function (name) {
        el.drop.addEventListener(name, function (event) { event.preventDefault(); el.drop.classList.add('is-over'); });
      });
      ['dragleave', 'drop'].forEach(function (name) {
        el.drop.addEventListener(name, function (event) { event.preventDefault(); el.drop.classList.remove('is-over'); });
      });
      el.drop.addEventListener('click', function () { if (el.file) el.file.click(); });
      el.drop.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (el.file) el.file.click(); }
      });
      el.drop.addEventListener('drop', function (event) {
        var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file) return;
        if (file.size > MAX_BYTES) {
          setStatus(el.uploadStatus, 'Mem jest za duży — maks. 2 MiB.', 'error');
          return;
        }
        showPreview(file);
        setStatus(el.uploadStatus, 'Wybrano plik: ' + file.name + '.');
      });
    }
    if (el.file) {
      el.file.addEventListener('change', function () {
        var file = el.file.files && el.file.files[0];
        if (file) { showPreview(file); setStatus(el.uploadStatus, 'Wybrano plik: ' + file.name + '.'); }
        el.file.value = '';
      });
    }
    if (el.previewClear) {
      el.previewClear.addEventListener('click', function () { showPreview(null); setStatus(el.uploadStatus, 'Plik usunięty.'); });
    }
    if (el.form) el.form.addEventListener('submit', submitUpload);

    if (el.mine) {
      el.mine.addEventListener('click', function (event) {
        var button = event.target.closest('[data-meme-withdraw]');
        if (button) withdraw(button.getAttribute('data-meme-withdraw'), button);
      });
    }

    if (el.lightboxClose) el.lightboxClose.addEventListener('click', closeLightbox);
    if (el.lightbox) {
      el.lightbox.addEventListener('click', function (event) {
        if (event.target === el.lightbox) closeLightbox();
      });
    }
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeLightbox();
    });

    renderTemplates();
    loadGallery(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.RejMeme = {
    templates: function () { return TEMPLATES.slice(); },
    views: ['gallery', 'templates', 'upload', 'mine'],
    setView: setView,
    reload: function () { return loadGallery(false); }
  };
})(window, document);

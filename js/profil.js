/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja
   ----------------------------------------------------------------------------
   Profil 2.0 — „Szklane profile”.

   Widok i edytor są teraz jedną historią: podgląd na żywo pokazuje dokładnie
   to, co zobaczą inni (awatar, kolor nicka, ramka, tło nagłówka, bio), a zapis
   idzie jednym żądaniem `rejchat_update_profile`. Nazwa publiczna (nick) ma
   osobny formularz, bo serwer pilnuje dla niej limitu 5 minut.

   Zasady, których pilnujemy tutaj:
     • żadnych danych prywatnych w DOM — tylko to, co i tak jest publiczne,
     • każdy tekst wstawiamy przez textContent (bio i nick są od użytkownika),
     • stare id (#profile-name, #profile-avatar, #profile-report…) zostają,
       bo korzystają z nich RejChat, zgłoszenia i wyspa,
     • brak sieci nie wysypuje widoku — pokazujemy komunikat i zostawiamy
       to, co już było na ekranie.
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  var api = window.RJProfiles;
  if (!api) return;
  var $ = function (id) { return document.getElementById(id); };

  /* Katalog awatarów: API podaje pełną listę, a poniżej jest kopia awaryjna
     na wypadek starszej wersji `rejchat-profiles.js` (cache przeglądarki). */
  var CATALOG = api.avatarCatalog && api.avatarCatalog.length ? api.avatarCatalog : [
    {id:'comet',name:'Kometa',group:'kosmos'}, {id:'planet',name:'Planeta',group:'kosmos'},
    {id:'moon',name:'Księżyc',group:'kosmos'}, {id:'star',name:'Gwiazda',group:'kosmos'},
    {id:'rocket',name:'Rakieta',group:'kosmos'}, {id:'cat',name:'Kot',group:'zwierzeta'},
    {id:'fox',name:'Lis',group:'zwierzeta'}, {id:'bee',name:'Pszczoła',group:'zwierzeta'},
    {id:'panda',name:'Panda',group:'zwierzeta'}, {id:'owl',name:'Sowa',group:'zwierzeta'},
    {id:'whale',name:'Wieloryb',group:'zwierzeta'}, {id:'leaf',name:'Liść',group:'natura'},
    {id:'flower',name:'Kwiat',group:'natura'}, {id:'mushroom',name:'Grzyb',group:'natura'},
    {id:'cactus',name:'Kaktus',group:'natura'}, {id:'wave',name:'Fala',group:'natura'},
    {id:'snow',name:'Śnieżynka',group:'natura'}, {id:'cloud',name:'Chmurka',group:'klimat'},
    {id:'flame',name:'Płomień',group:'klimat'}, {id:'heart',name:'Serce',group:'klimat'},
    {id:'spark',name:'Iskra',group:'klimat'}, {id:'gem',name:'Klejnot',group:'klimat'},
    {id:'music',name:'Muzyka',group:'klimat'}, {id:'coffee',name:'Kawa',group:'klimat'}
  ];

  var COLORS = [
    {id:'mint', name:'Lodowy'},
    {id:'blue', name:'Błękit'},
    {id:'violet', name:'Fiolet'},
    {id:'rose', name:'Róż'},
    {id:'amber', name:'Bursztyn'},
    {id:'slate', name:'Grafit'}
  ];
  var FRAMES = [
    {id:'none', name:'Bez ramki'},
    {id:'ice', name:'Lód'},
    {id:'violet', name:'Fiolet'},
    {id:'rose', name:'Róż'},
    {id:'amber', name:'Bursztyn'},
    {id:'prism', name:'Pryzmat'}
  ];
  var BANNERS = [
    {id:'aurora', name:'Zorza'},
    {id:'ocean', name:'Ocean'},
    {id:'dusk', name:'Zmierzch'},
    {id:'ember', name:'Żar'},
    {id:'mono', name:'Grafit'},
    {id:'prism', name:'Pryzmat'}
  ];
  var GROUPS = [
    {id:'all', name:'Wszystkie'},
    {id:'kosmos', name:'Kosmos'},
    {id:'zwierzeta', name:'Zwierzęta'},
    {id:'natura', name:'Natura'},
    {id:'klimat', name:'Klimat'}
  ];
  var BIO_PROMPTS = [
    'Lubię ',
    'Uczę się ',
    'Pracuję nad ',
    'Najbardziej cenię ',
    'Po godzinach '
  ];

  var target = new URLSearchParams(location.search).get('u');
  var current = null, confirmed = null, seq = 0;
  var own = false, mode = 'view', saved = null, filter = 'all', query = '';

  /* ------------------------------------------------------------- narzędzia */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function avatarName(id) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i].name;
    return 'Awatar';
  }

  function status(text) {
    var node = $('profile-status');
    if (!node) return;
    node.hidden = !text;
    node.textContent = text || '';
  }

  function result(node, text, kind) {
    if (!node) return;
    node.textContent = text || '';
    node.dataset.kind = kind || '';
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    try {
      return date.toLocaleDateString('pl-PL', {day:'numeric', month:'long', year:'numeric'});
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  /* ------------------------------------------------------ budowa kontrolek */

  function buildColors() {
    var host = $('color-options');
    if (!host) return;
    host.textContent = '';
    COLORS.forEach(function (color) {
      var label = el('label', 'color-option');
      label.dataset.profileColor = color.id;
      var radio = el('input');
      radio.type = 'radio'; radio.name = 'color'; radio.value = color.id; radio.required = true;
      var dot = el('span', 'color-dot');
      var text = el('span', 'color-name', color.name);
      label.append(radio, dot, text);
      host.appendChild(label);
    });
  }

  function buildFrames() {
    var host = $('frame-options');
    if (!host) return;
    host.textContent = '';
    FRAMES.forEach(function (frame) {
      var label = el('label', 'frame-option');
      label.dataset.frame = frame.id;
      var radio = el('input');
      radio.type = 'radio'; radio.name = 'frame'; radio.value = frame.id;
      var ring = el('span', 'frame-swatch');
      ring.dataset.frame = frame.id;
      var name = el('span', 'frame-name', frame.name);
      label.append(radio, ring, name);
      host.appendChild(label);
    });
  }

  function buildBanners() {
    var host = $('banner-options');
    if (!host) return;
    host.textContent = '';
    BANNERS.forEach(function (banner) {
      var label = el('label', 'banner-option');
      label.dataset.banner = banner.id;
      var radio = el('input');
      radio.type = 'radio'; radio.name = 'banner'; radio.value = banner.id;
      var swatch = el('span', 'banner-swatch');
      swatch.dataset.banner = banner.id;
      var name = el('span', 'banner-name', banner.name);
      label.append(radio, swatch, name);
      host.appendChild(label);
    });
  }

  function buildFilters() {
    var host = $('avatar-filters');
    if (!host) return;
    host.textContent = '';
    GROUPS.forEach(function (group) {
      var button = el('button', 'avatar-filter', group.name);
      button.type = 'button';
      button.dataset.group = group.id;
      button.setAttribute('aria-pressed', group.id === filter ? 'true' : 'false');
      button.addEventListener('click', function () {
        filter = group.id;
        Array.prototype.forEach.call(host.children, function (child) {
          child.setAttribute('aria-pressed', child.dataset.group === filter ? 'true' : 'false');
        });
        renderAvatars();
      });
      host.appendChild(button);
    });
  }

  function renderAvatars() {
    var host = $('avatar-options');
    if (!host) return;
    host.textContent = '';
    var needle = query.trim().toLowerCase();
    var shown = 0;
    CATALOG.forEach(function (avatar) {
      var haystack = (avatar.name + ' ' + avatar.id).toLowerCase();
      if (filter !== 'all' && avatar.group !== filter) return;
      if (needle && haystack.indexOf(needle) < 0) return;
      shown++;
      var label = el('label', 'avatar-option');
      label.dataset.group = avatar.group;
      var radio = el('input');
      radio.type = 'radio'; radio.name = 'avatar'; radio.value = avatar.id; radio.required = true;
      var image = el('img');
      image.src = '/assets/avatars/' + avatar.id + '.svg';
      image.alt = '';
      image.loading = 'lazy';
      var name = el('span', 'avatar-name', avatar.name);
      label.append(radio, image, name);
      label.addEventListener('click', function () { schedulePreview(); });
      host.appendChild(label);
    });
    var empty = $('avatar-empty');
    if (empty) empty.hidden = shown > 0;
    var count = $('avatar-count');
    if (count) count.textContent = shown + ' z ' + CATALOG.length + ' wzorów';
    syncAvatarRadios();
  }

  function syncAvatarRadios() {
    var state = readForm();
    var radio = document.querySelector('input[name="avatar"][value="' + state.avatar + '"]');
    if (radio) radio.checked = true;
  }

  /* ------------------------------------------------------------- podglądy */

  function readForm() {
    var checked = function (name, fallback) {
      var node = document.querySelector('input[name="' + name + '"]:checked');
      return node ? node.value : fallback;
    };
    var bio = $('profile-bio-input');
    return {
      avatar: checked('avatar', 'comet'),
      color: checked('color', 'mint'),
      frame: checked('frame', 'none'),
      banner: checked('banner', 'aurora'),
      bio: bio ? bio.value.slice(0, 240) : '',
      nickname: $('nickname-input') ? $('nickname-input').value.trim().slice(0, 32) : ''
    };
  }

  function paintPreview(state) {
    var card = $('profile-preview-card');
    if (!card) return;
    var name = $('preview-name');
    var handle = $('preview-handle');
    var bio = $('preview-bio');
    var avatar = $('preview-avatar');
    var ring = $('preview-ring');
    var cover = $('preview-cover');
    if (cover) cover.dataset.banner = state.banner;
    if (ring) ring.dataset.frame = state.frame;
    if (avatar) {
      avatar.src = '/assets/avatars/' + state.avatar + '.svg';
      avatar.alt = '';
    }
    if (name) {
      name.textContent = state.nickname || (current ? current.username : 'Twoja nazwa');
      name.dataset.profileColor = state.color;
    }
    if (handle) handle.textContent = '@' + (current ? current.username : 'konto');
    if (bio) bio.textContent = state.bio || 'Tu pojawi się kilka słów o Tobie.';
    var counter = $('bio-count');
    if (counter) counter.textContent = String(state.bio.length);
  }

  function schedulePreview() {
    window.requestAnimationFrame(function () {
      paintPreview(readForm());
      markDirty();
      paintCompleteness();
    });
  }

  function snapshot(state) {
    return [state.avatar, state.color, state.frame, state.banner, state.bio, state.nickname].join('\u0001');
  }

  function isDirty() {
    return !!saved && snapshot(readForm()) !== saved;
  }

  function markDirty() {
    var dirty = isDirty();
    var pill = $('profile-dirty');
    if (pill) {
      pill.textContent = dirty ? 'Niezapisane zmiany' : 'Wszystko zapisane';
      pill.dataset.state = dirty ? 'dirty' : 'saved';
    }
    document.documentElement.classList.toggle('rj-profile-dirty', dirty);
  }

  function paintCompleteness() {
    var state = readForm();
    var score = 40; /* awatar i kolor są zawsze wybrane */
    if (state.bio) score += 30;
    if (state.nickname) score += 15;
    if (state.frame !== 'none') score += 7;
    if (state.banner !== 'aurora') score += 8;
    var value = Math.min(100, score);
    var label = $('profile-complete-value');
    var bar = $('profile-complete-bar');
    if (label) label.textContent = value + '%';
    if (bar) bar.style.width = value + '%';
  }

  /* -------------------------------------------------------- widok publiczny */

  function showProfile(p) {
    current = p;
    var view = $('profile-view');
    if (view) view.hidden = false;
    var name = $('profile-name');
    if (name) {
      name.textContent = p.nickname || p.username;
      name.dataset.profileColor = p.color;
    }
    var handle = $('profile-handle');
    if (handle) handle.textContent = p.username;
    var avatar = $('profile-avatar');
    if (avatar) {
      avatar.src = p.is_bot ? '/assets/agent-avatar.png' : '/assets/avatars/' + p.avatar + '.svg';
      avatar.alt = 'Awatar: ' + avatarName(p.avatar);
    }
    var ring = $('profile-avatar-ring');
    if (ring) ring.dataset.frame = p.frame;
    var cover = $('profile-cover');
    if (cover) cover.dataset.banner = p.banner;
    var bio = $('profile-bio');
    if (bio) bio.textContent = p.bio || 'Ta osoba nie napisała jeszcze nic o sobie.';
    var updated = $('profile-updated');
    if (updated) {
      var when = formatDate(p.updated_at);
      updated.textContent = when ? 'Profil zaktualizowany ' + when : '';
      updated.hidden = !when;
    }
    var badges = $('profile-badges');
    if (badges) {
      badges.textContent = '';
      if (p.is_owner) badges.appendChild(el('span', 'profile-badge profile-badge--owner', 'Właściciel'));
      if (p.is_bot) badges.appendChild(el('span', 'profile-badge profile-badge--bot', 'Bot'));
      if (own) badges.appendChild(el('span', 'profile-badge profile-badge--you', 'To Ty'));
    }
    document.title = (p.nickname || p.username) + ' — profil RejHub';
  }

  /* ------------------------------------------------------------- edytor */

  function fillForm(p) {
    ['avatar', 'color', 'frame', 'banner'].forEach(function (field) {
      var node = document.querySelector('input[name="' + field + '"][value="' + p[field] + '"]');
      if (node) node.checked = true;
    });
    if ($('profile-bio-input')) $('profile-bio-input').value = p.bio || '';
    if ($('nickname-input')) $('nickname-input').value = p.nickname || '';
    saved = snapshot(readForm());
    markDirty();
    paintCompleteness();
    paintPreview(readForm());
  }

  function setMode(next) {
    mode = next;
    var editor = $('profile-editor');
    var view = $('profile-view');
    var tabView = $('tab-view');
    var tabEdit = $('tab-edit');
    if (editor) editor.hidden = next !== 'edit';
    if (view) view.hidden = next === 'edit';
    if (tabView) tabView.setAttribute('aria-selected', next === 'view' ? 'true' : 'false');
    if (tabEdit) tabEdit.setAttribute('aria-selected', next === 'edit' ? 'true' : 'false');
    if (next === 'edit') {
      paintPreview(readForm());
      var first = $('avatar-search');
      if (first && window.matchMedia && window.matchMedia('(min-width: 900px)').matches) first.focus({preventScroll: true});
      try { history.replaceState(null, '', '/profil#edytuj'); } catch (error) { /* starsza przeglądarka */ }
    } else {
      try { history.replaceState(null, '', '/profil' + (target ? '?u=' + encodeURIComponent(target) : '')); } catch (error) { /* bez historii */ }
    }
  }

  /* --------------------------------------------------------------- wczytanie */

  async function load() {
    var turn = ++seq;
    var session = api.session();
    confirmed = null;
    current = null;
    var view = $('profile-view');
    var editor = $('profile-editor');
    if (view) view.hidden = true;
    if (editor) editor.hidden = true;
    if ($('profile-report')) $('profile-report').hidden = true;
    if ($('profile-block')) $('profile-block').hidden = true;
    if ($('profile-logout')) $('profile-logout').hidden = true;
    if ($('profile-edit')) $('profile-edit').hidden = true;
    if ($('profile-tabs')) $('profile-tabs').hidden = true;
    status('Ładowanie profilu…');

    if (target && !api.safeName(target)) { status('Nieprawidłowa nazwa profilu.'); return; }

    try {
      if (session) {
        try {
          var who = await api.rpc('community_whoami', {p_token: session.token});
          if (who && api.safeName(who.username)) confirmed = {username: who.username, token: session.token};
        } catch (error) { if (!target) throw error; }
      }
      if (turn !== seq) return;

      var wanted = target || (confirmed && confirmed.username);
      if (!wanted) {
        status('Zaloguj się, aby otworzyć swój profil.');
        var login = $('profile-login-link');
        if (login) login.hidden = false;
        var link = el('a', 'profile-status-link', ' Przejdź do logowania →');
        link.href = '/logowanie';
        if ($('profile-status')) $('profile-status').appendChild(link);
        return;
      }

      var rows = await api.getMany([wanted], true);
      if (turn !== seq) return;
      if (!rows.length) { status('Nie znaleziono takiego profilu.'); return; }

      status('');
      own = !!confirmed && confirmed.username.toLowerCase() === rows[0].username.toLowerCase();
      target = own ? null : rows[0].username;
      showProfile(rows[0]);
      fillForm(rows[0]);

      var loginLink = $('profile-login-link');
      if (loginLink) loginLink.hidden = !!confirmed;
      if ($('profile-logout')) $('profile-logout').hidden = !confirmed;
      if ($('profile-copy')) $('profile-copy').hidden = false;
      if ($('profile-tabs')) $('profile-tabs').hidden = !own;
      if ($('profile-edit')) $('profile-edit').hidden = !own;
      if (own) setMode(location.hash === '#edytuj' ? 'edit' : 'view');

      if (confirmed && !own) {
        var report = $('profile-report');
        if (report) { report.hidden = false; report.dataset.reportScope = 'profile'; report.dataset.reportUser = rows[0].username; }
        var block = $('profile-block');
        if (block) {
          block.hidden = false;
          block.disabled = true;
          try {
            var state = await api.rpc('rejchat_block_status', {p_token: confirmed.token, p_username: rows[0].username});
            if (turn !== seq) return;
            block.dataset.blocked = String(!!state.blocked);
            block.textContent = state.blocked ? 'Odblokuj wiadomości' : 'Blokuj wiadomości';
            block.disabled = false;
          } catch (error) {
            if (turn === seq) status('Nie udało się sprawdzić blokady. Odśwież stronę.');
          }
        }
      }
    } catch (error) {
      if (turn === seq) status('Nie udało się wczytać profilu. Sprawdź połączenie i spróbuj ponownie.');
    }
  }

  /* --------------------------------------------------------------- zapisywanie */

  async function saveProfile(event) {
    if (event) event.preventDefault();
    var session = api.session();
    var out = $('profile-result');
    if (!confirmed || !session || session.token !== confirmed.token || !current) {
      result(out, 'Sesja się zmieniła — odśwież stronę.', 'error');
      return;
    }
    var state = readForm();
    var button = $('profile-save');
    if (button) button.disabled = true;
    result(out, 'Zapisywanie…');
    try {
      var response = await api.rpc('rejchat_update_profile', {
        p_token: session.token,
        p_avatar: state.avatar,
        p_color: state.color,
        p_bio: state.bio,
        p_frame: state.frame,
        p_banner: state.banner
      });
      var latest = api.session();
      if (!latest || latest.token !== session.token) { load(); return; }
      api.invalidate(confirmed.username);
      var fresh = (await api.getMany([confirmed.username], true))[0];
      if (!fresh) throw new Error('Nie udało się odświeżyć profilu.');
      showProfile(fresh);
      fillForm(fresh);
      result(out, 'Zapisano. Twój profil wygląda już tak, jak w podglądzie.', 'ok');
      api.refreshHeader();
      void response;
    } catch (error) {
      result(out, error.message || 'Nie udało się zapisać profilu.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function saveNickname(event) {
    if (event) event.preventDefault();
    var session = api.session();
    var out = $('nickname-result');
    if (!confirmed || !session || session.token !== confirmed.token) {
      result(out, 'Sesja się zmieniła — odśwież stronę.', 'error');
      return;
    }
    var button = $('nickname-save');
    var nickname = $('nickname-input').value;
    var turn = seq;
    if (button) button.disabled = true;
    result(out, 'Zapisywanie…');
    try {
      await api.rpc('rejchat_set_nickname', {p_token: session.token, p_nickname: nickname});
      var latest = api.session();
      if (turn !== seq || !latest || latest.token !== session.token) { load(); return; }
      api.invalidate(confirmed.username);
      var fresh = (await api.getMany([confirmed.username], true))[0];
      if (!fresh) throw new Error('Nie udało się odświeżyć profilu.');
      if (turn !== seq) return;
      showProfile(fresh);
      if ($('nickname-input')) $('nickname-input').value = fresh.nickname || '';
      saved = snapshot(readForm());
      markDirty();
      paintPreview(readForm());
      result(out, 'Nick zapisany.', 'ok');
      api.refreshHeader();
    } catch (error) {
      if (turn === seq) result(out, error.message || 'Nie udało się zapisać nicka.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  /* ------------------------------------------------------------------- spięcie */

  function wire() {
    buildColors();
    buildFrames();
    buildBanners();
    buildFilters();
    renderAvatars();

    var search = $('avatar-search');
    if (search) {
      search.addEventListener('input', function () {
        query = search.value;
        renderAvatars();
      });
    }

    var bio = $('profile-bio-input');
    if (bio) {
      bio.addEventListener('input', function () {
        if (bio.value.length > 240) bio.value = bio.value.slice(0, 240);
        schedulePreview();
      });
    }

    var prompts = $('bio-prompts');
    if (prompts) {
      BIO_PROMPTS.forEach(function (prompt) {
        var chip = el('button', 'bio-prompt', prompt.trim());
        chip.type = 'button';
        chip.addEventListener('click', function () {
          if (!bio) return;
          var start = bio.selectionStart != null ? bio.selectionStart : bio.value.length;
          var end = bio.selectionEnd != null ? bio.selectionEnd : start;
          var next = (bio.value.slice(0, start) + prompt + bio.value.slice(end)).slice(0, 240);
          bio.value = next;
          bio.focus();
          var caret = Math.min(start + prompt.length, next.length);
          try { bio.setSelectionRange(caret, caret); } catch (error) { /* pole typu textarea */ }
          schedulePreview();
        });
        prompts.appendChild(chip);
      });
    }

    var form = $('profile-form');
    if (form) {
      form.addEventListener('submit', saveProfile);
      form.addEventListener('change', schedulePreview);
      form.addEventListener('input', schedulePreview);
      form.addEventListener('reset', function () { setTimeout(schedulePreview, 0); });
    }

    var nickname = $('nickname-form');
    if (nickname) {
      nickname.addEventListener('submit', saveNickname);
      var nickInput = $('nickname-input');
      if (nickInput) {
        nickInput.addEventListener('input', function () {
          paintPreview(readForm());
          paintCompleteness();
        });
      }
    }

    /* „Zaskocz mnie” — losowy, ale zawsze poprawny zestaw (awatar z pełnej
       listy, ramka i tło inne niż domyślne). Nic nie zapisuje samo z siebie;
       użytkownik dalej widzi podgląd i sam decyduje o zapisie. */
    var surprise = $('avatar-surprise');
    if (surprise) {
      surprise.addEventListener('click', function () {
        var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };
        var avatar = pick(CATALOG);
        var frame = pick(FRAMES.filter(function (item) { return item.id !== 'none'; }));
        var banner = pick(BANNERS);
        var color = pick(COLORS);
        var setChecked = function (name, value) {
          var node = document.querySelector('input[name="' + name + '"]:checked');
          if (node) node.checked = false;
          var next = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
          if (next) next.checked = true;
        };
        filter = 'all';
        query = '';
        if (search) search.value = '';
        Array.prototype.forEach.call(document.querySelectorAll('#avatar-filters .avatar-filter'), function (button) {
          button.setAttribute('aria-pressed', button.dataset.group === 'all' ? 'true' : 'false');
        });
        /* Najpierw odświeżamy galerię (nowe inputy), dopiero potem zaznaczamy
           wylosowany awatar — inaczej zaznaczenie ginęłoby przy re-renderze. */
        renderAvatars();
        setChecked('avatar', avatar.id);
        setChecked('color', color.id);
        setChecked('frame', frame.id);
        setChecked('banner', banner.id);
        schedulePreview();
        result($('profile-result'), 'Wylosowano: ' + avatar.name + ' · ' + frame.name + ' · ' + banner.name + '. Zapisz, jeśli Ci się podoba.', 'ok');
      });
    }

    var reset = $('profile-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        if (!current) return;
        fillForm(current);
        result($('profile-result'), 'Przywrócono ostatnio zapisaną wersję.', 'ok');
      });
    }

    var edit = $('profile-edit');
    if (edit) edit.addEventListener('click', function () { setMode('edit'); });
    var close = $('editor-close');
    if (close) close.addEventListener('click', function () { setMode('view'); });
    var tabView = $('tab-view');
    if (tabView) tabView.addEventListener('click', function () { setMode('view'); });
    var tabEdit = $('tab-edit');
    if (tabEdit) tabEdit.addEventListener('click', function () { setMode('edit'); });

    var copy = $('profile-copy');
    if (copy) {
      copy.addEventListener('click', function () {
        if (!current) return;
        var url = location.origin + '/profil?u=' + encodeURIComponent(current.username);
        var done = function () {
          copy.textContent = 'Skopiowano link';
          copy.dataset.state = 'done';
          setTimeout(function () {
            copy.textContent = 'Kopiuj link do profilu';
            delete copy.dataset.state;
          }, 2200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () { window.prompt('Skopiuj adres profilu:', url); });
        } else {
          window.prompt('Skopiuj adres profilu:', url);
        }
      });
    }

    var logout = $('profile-logout');
    if (logout) {
      logout.addEventListener('click', function () {
        var button = logout;
        button.disabled = true;
        try { localStorage.removeItem('rejson_community_session_v1'); } catch (error) { /* tryb prywatny */ }
        target = null; confirmed = null; own = false;
        try { history.replaceState(null, '', '/profil'); } catch (error) { /* bez historii */ }
        try { window.dispatchEvent(new Event('rj:session-change')); } catch (error) { /* starsza przeglądarka */ }
        load();
        setTimeout(function () { button.disabled = false; }, 400);
      });
    }

    var block = $('profile-block');
    if (block) {
      block.addEventListener('click', async function () {
        var button = block;
        var session = api.session();
        var turn = seq;
        if (!session || !confirmed || session.token !== confirmed.token || !current) return;
        var next = button.dataset.blocked !== 'true';
        if (!window.confirm(next
          ? 'Zablokować nowe wiadomości i reakcje prywatne w obu kierunkach? Dotychczasowa historia i wiadomości publiczne pozostaną widoczne.'
          : 'Odblokować wiadomości prywatne? Jeśli druga osoba też Cię zablokowała, nadal nie będzie można pisać.')) return;
        button.disabled = true;
        try {
          await api.rpc('rejchat_block_user', {p_token: session.token, p_username: current.username, p_block: next});
          if (turn !== seq || !api.session() || api.session().token !== session.token) return;
          button.dataset.blocked = String(next);
          button.textContent = next ? 'Odblokuj wiadomości' : 'Blokuj wiadomości';
          status(next ? 'Blokada aktywna. Historia i publiczne wiadomości pozostają widoczne.' : 'Blokada zdjęta.');
        } catch (error) {
          if (turn === seq) status(error.message || 'Nie udało się zmienić blokady.');
        } finally {
          if (turn === seq) button.disabled = false;
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.addEventListener('beforeunload', function (event) {
    if (!own || mode !== 'edit' || !isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('rj:session-change', load);
  window.addEventListener('storage', function (event) {
    if (event.key === 'rejson_community_session_v1' || event.key === null) load();
  });

  load();
})();

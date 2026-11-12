/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * RejGames — jedno miejsce ze wszystkimi grami (v1).
 *
 * Lista jest stała (a nie pobierana z GitHuba), bo tylko wtedy każdy link
 * prowadzi do działającej wersji gry, a nie do pustego repozytorium.
 * Filtry i wyszukiwanie działają lokalnie, bez sieci.
 */
(function (window, document) {
  'use strict';

  var GAMES = [
    {
      title: 'mconline',
      desc: 'Własna, przerobiona wersja Minecrafta w przeglądarce. Wersja beta — świat bywa kapryśny.',
      url: 'https://rejson59.github.io/mconline/',
      tags: ['sandbox', 'minecraft'],
      cat: 'sandbox',
      status: 'online',
      badge: 'Beta'
    },
    {
      title: 'mc-launcher',
      desc: 'Oryginalny Minecraft w przeglądarce, uruchamiany przez własny launcher i relay.',
      url: 'https://mc-launcher-relay.vercel.app',
      tags: ['sandbox', 'minecraft'],
      cat: 'sandbox',
      status: 'online',
      badge: 'Beta'
    },
    {
      title: 'RejPlay',
      desc: 'Zbiór mini gierek na krótką przerwę — od zręcznościówek po eksperymenty.',
      url: 'https://rejson59.github.io/RejPlay/',
      tags: ['arcade', 'mini gry'],
      cat: 'arcade',
      status: 'online',
      badge: 'Kolekcja'
    },
    {
      title: 'RealisticCarNight',
      desc: 'Nocna jazda po ogromnym, oświetlonym mieście. Najbardziej realistyczna gra samochodowa w przeglądarce.',
      url: 'https://rejson59.github.io/RealisticCarNight/',
      tags: ['jazda', '3D'],
      cat: 'jazda',
      status: 'online',
      badge: '3D'
    },
    {
      title: 'DreamKnight',
      desc: 'Realistyczna i nostalgiczna gra w rycerza — klimat starych platformówek.',
      url: 'https://rejson59.github.io/DreamKnight/',
      tags: ['przygoda', 'retro'],
      cat: 'przygoda',
      status: 'online',
      badge: 'Retro'
    },
    {
      title: 'DiffrentReality',
      desc: 'Świat, który wygląda prawdziwiej, niż powinien. Eksperyment z grafiką i atmosferą.',
      url: 'https://rejson59.github.io/DiffrentReality/',
      tags: ['przygoda', 'eksperyment'],
      cat: 'przygoda',
      status: 'online',
      badge: 'Eksperyment'
    },
    {
      title: 'AbsurdalneGry',
      desc: 'Kolekcja kilku absurdalnych mini gier. Na razie w repozytorium — wersja online w drodze.',
      url: 'https://github.com/rejson59/AbsurdalneGry',
      tags: ['arcade', 'mini gry'],
      cat: 'arcade',
      status: 'soon',
      badge: 'Wkrótce'
    },
    {
      title: 'roblox-online',
      desc: 'Roblox w przeglądarce. Projekt jest jeszcze w przygotowaniu — link pojawi się tutaj, gdy zadziała.',
      url: 'https://github.com/rejson59/roblox-online',
      tags: ['sandbox', 'eksperyment'],
      cat: 'sandbox',
      status: 'soon',
      badge: 'W przygotowaniu'
    },
    {
      title: 'GiftStream',
      desc: 'Gry na żywo na TikToku — widzowie wpływają na to, co dzieje się na ekranie.',
      url: 'https://rejson59.github.io/GiftStream/',
      tags: ['eksperyment', 'live'],
      cat: 'eksperyment',
      status: 'online',
      badge: 'Live'
    },
    {
      title: 'JoyPad',
      desc: 'Nie gra, ale niezbędnik: zamienia telefon i komputer w jedną, bezprzewodową konsolę.',
      url: 'https://rejson59.github.io/JoyPad/',
      tags: ['narzędzie', 'multiplayer'],
      cat: 'narzędzia',
      status: 'online',
      badge: 'Narzędzie'
    }
  ];

  var CATS = [
    ['all', 'Wszystkie'],
    ['sandbox', 'Sandbox'],
    ['arcade', 'Arcade'],
    ['przygoda', 'Przygoda'],
    ['jazda', 'Jazda'],
    ['eksperyment', 'Eksperymenty'],
    ['narzędzia', 'Narzędzia']
  ];

  var state = { cat: 'all', query: '' };
  var grid, empty, count, statusEl;

  function matches(game) {
    if (state.cat !== 'all' && game.cat !== state.cat) return false;
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    return (game.title + ' ' + game.desc + ' ' + game.tags.join(' ')).toLowerCase().indexOf(q) >= 0;
  }

  function card(game) {
    var article = document.createElement('article');
    article.className = 'rjapp-card game-card';

    var art = document.createElement('div');
    art.className = 'game-art';
    art.setAttribute('aria-hidden', 'true');
    var mark = document.createElement('b');
    mark.textContent = game.title;
    art.appendChild(mark);
    article.appendChild(art);

    var body = document.createElement('div');
    body.className = 'game-body';

    var title = document.createElement('h2');
    title.textContent = game.title;
    body.appendChild(title);

    var badge = document.createElement('span');
    badge.className = 'rjapp-badge' + (game.status === 'soon' ? ' rjapp-badge--soon' : '');
    badge.textContent = game.badge;
    body.appendChild(badge);

    var desc = document.createElement('p');
    desc.textContent = game.desc;
    body.appendChild(desc);

    var tags = document.createElement('div');
    tags.className = 'game-tags';
    game.tags.forEach(function (tag) {
      var span = document.createElement('span');
      span.textContent = tag;
      tags.appendChild(span);
    });
    body.appendChild(tags);

    var foot = document.createElement('div');
    foot.className = 'game-foot';
    var link = document.createElement('a');
    link.className = 'rjapp-btn' + (game.status === 'soon' ? ' rjapp-btn--ghost' : '');
    link.href = game.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = game.status === 'soon' ? 'Zobacz repozytorium' : 'Zagraj';
    if (game.status !== 'soon') link.setAttribute('aria-label', 'Zagraj w ' + game.title + ' (nowa karta)');
    foot.appendChild(link);
    body.appendChild(foot);

    article.appendChild(body);
    return article;
  }

  function render() {
    if (!grid) return;
    var list = GAMES.filter(matches);
    grid.textContent = '';
    list.forEach(function (game) { grid.appendChild(card(game)); });
    if (empty) empty.hidden = list.length > 0;
    if (count) count.textContent = list.length === 1 ? '1 gra' : list.length + ' gier';
    if (statusEl) statusEl.textContent = '';
  }

  function random() {
    var pool = GAMES.filter(function (game) { return game.status === 'online'; });
    var pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick || !statusEl) return;
    statusEl.textContent = 'Losowo: ' + pick.title + ' →';
    var link = document.createElement('a');
    link.href = pick.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = ' otwórz ' + pick.title;
    statusEl.appendChild(link);
  }

  function boot() {
    grid = document.getElementById('games-grid');
    if (!grid) return;
    empty = document.getElementById('games-empty');
    count = document.getElementById('games-count');
    statusEl = document.getElementById('games-status');

    var chips = document.getElementById('games-filters');
    if (chips) {
      CATS.forEach(function (row) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'rjapp-chip';
        button.setAttribute('data-cat', row[0]);
        button.setAttribute('aria-pressed', row[0] === state.cat ? 'true' : 'false');
        button.textContent = row[1];
        chips.appendChild(button);
      });
      chips.addEventListener('click', function (event) {
        var button = event.target.closest('[data-cat]');
        if (!button) return;
        state.cat = button.getAttribute('data-cat');
        chips.querySelectorAll('[data-cat]').forEach(function (el) {
          el.setAttribute('aria-pressed', el === button ? 'true' : 'false');
        });
        render();
      });
    }

    var search = document.getElementById('games-search');
    if (search) search.addEventListener('input', function () { state.query = search.value; render(); });

    var shuffle = document.getElementById('games-random');
    if (shuffle) shuffle.addEventListener('click', random);

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.RejGames = { list: function () { return GAMES.slice(); } };
})(window, document);

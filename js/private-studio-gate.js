/* Publiczna bramka. Treść przychodzi wyłącznie z RPC weryfikującego administratora. */
(function () {
  'use strict';
  var status = document.getElementById('private-status');
  var cloud = window.RejsonCloud;
  function message(text) { status.textContent = text; }
  if (!cloud || !cloud.getStoredSession || !cloud.getAccessToken) {
    message('Nie udało się sprawdzić dostępu. Spróbuj ponownie później.'); return;
  }
  var session = cloud.getStoredSession();
  if (!session || session.sandbox || !session.access_token) {
    message('Zaloguj się jako administrator w panelu, a następnie wróć tutaj.'); return;
  }
  var requestToken;
  cloud.getAccessToken().then(function (token) {
    if (!token) throw new Error('auth');
    requestToken = token;
    return fetch(cloud.url + '/rest/v1/rpc/admin_private_studio', {
      method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: {apikey: cloud.anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: '{}'
    });
  }).then(function (response) {
    if (response.status === 401 || response.status === 403) throw new Error('auth');
    if (!response.ok) throw new Error('network');
    return response.json();
  }).then(function (data) {
    var current = cloud.getStoredSession();
    if (!current || current.sandbox || current.access_token !== requestToken) throw new Error('auth');
    if (!data || typeof data.html !== 'string' || typeof data.css !== 'string' || typeof data.javascript !== 'string' || /<\/style/i.test(data.css) || /<\/script/i.test(data.javascript)) throw new Error('data');

    /* Styl i skrypt zawsze wstrzykujemy sami. Wcześniej brama wymagała, żeby
       HTML z bazy zawierał dokładnie te dwa znaczniki — po zmianie nazw plików
       (testy → szklane-studio) stara treść przestała przechodzić kontrolę
       i całe studio pokazywało „Nie udało się wczytać strony”. Teraz brak
       znaczników nie jest błędem: podmieniamy je, a gdy ich nie ma, dokładamy
       własne. Dzięki temu zmiana nazw plików nie może już zablokować galerii. */
    var styleLink = '<link rel="stylesheet" href="/css/szklane-studio.css?v=1">';
    var scriptLink = '<script defer src="/js/szklane-studio.js?v=1"></script>';
    var styleTag = '<style>' + data.css + '</style>';
    var html = data.html;
    html = html.indexOf(styleLink) !== -1
      ? html.replace(styleLink, styleTag)
      : html.replace('</head>', styleTag + '</head>');
    html = html.replace(scriptLink, '')
      .replace('</body>', '<script>' + data.javascript + '</script></body>');
    html = html.replace('<head>', '<head><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer">');
    /* Studio podmienia cały dokument (document.write), więc przycisk szybkiej
       autodestrukcji trzeba wstawić do treści z bazy — inaczej zniknąłby wraz
       z powłoką strony. */
    if (html.indexOf('/js/panic.js') === -1) {
      html = html.replace('</head>', '<link rel="stylesheet" href="/css/panic.css?v=2"><script defer src="/js/panic.js?v=2"></script></head>');
    }
    document.open(); document.write(html); document.close();
    // Zmiana sesji w innej karcie i powrót z bfcache wymagają ponownej kontroli.
    window.addEventListener('storage', function (event) {
      if (event.key === 'rejson_widgets_admin_session_v1' || event.key === null) location.reload();
    });
    window.addEventListener('pageshow', function (event) { if (event.persisted) location.reload(); });
  }).catch(function (error) {
    message(error && error.message === 'auth' ? 'Dostęp jest tylko dla zalogowanego administratora.' : 'Nie udało się wczytać strony. Spróbuj ponownie później.');
  });
})();

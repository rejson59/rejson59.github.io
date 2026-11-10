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
    var styleLink = '<link rel="stylesheet" href="/css/testy.css?v=14">';
    var scriptLink = '<script defer src="/js/testy.js?v=14"></script>';
    if (!data.html.includes(styleLink) || !data.html.includes(scriptLink)) throw new Error('data');
    var html = data.html.replace(styleLink, '<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><style>' + data.css + '</style>')
      .replace(scriptLink, '')
      .replace('</body>', '<script>' + data.javascript + '</script></body>');
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

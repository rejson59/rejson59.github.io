/* RejHub 2.0 — filtr tekstu, push na telefon, ukrywanie obrazów,
   panel serwera, wspólny limit danych i spis sekcji. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pages = fs.readdirSync(path.join(root, 'rejhub2')).filter((file) => file.endsWith('.html'));

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});
virtualConsole.on('error', () => {});

function check(name, run) {
  try {
    run();
    console.log('  ✔ ' + name);
  } catch (error) {
    console.error('  ✖ ' + name);
    throw error;
  }
}

console.log('=== FILTR TEKSTU W KAŻDYM POLU ===');
check('każda strona RejHuba ładuje filtr i jego styl', () => {
  pages.forEach((file) => {
    const html = read('rejhub2/' + file);
    assert.ok(html.includes('/js/text-filter.js?v=1'), 'brak filtra w ' + file);
    assert.ok(html.includes('/css/text-filter.css?v=1'), 'brak stylu filtra w ' + file);
  });
});

check('filtr pyta bazę o tę samą listę słów co RejChat', () => {
  const source = read('js/text-filter.js');
  assert.ok(source.includes('text_filter_check'), 'filtr ma korzystać z RPC text_filter_check');
  assert.ok(source.includes('data-rj-filter-off'), 'pola poufne muszą być pomijane');
  assert.ok(source.includes("addEventListener('submit'"), 'formularz ma być zatrzymywany');
  assert.ok(!source.includes('END POINT'), 'brak martwej stałej');
});

console.log('=== UKRYWANIE OBRAZÓW W REJCHACIE ===');
check('RejChat ma oko i arkusz trybu bez obrazów', () => {
  const html = read('rejhub2/rejchat.html');
  assert.ok(html.includes('/js/rejchat-media-toggle.js?v=1'));
  assert.ok(html.includes('/css/rejchat-media.css?v=1'));
  const css = read('css/rejchat-media.css');
  assert.ok(css.includes('html.rj-hide-media .rejchat-photo'), 'zdjęcia mają być ukrywane');
  assert.ok(css.includes('html.rj-hide-media .rc-link-image'), 'miniatury linków też');
});

check('przełącznik działa i pamięta wybór', () => {
  const dom = new JSDOM('<!doctype html><html><body><div class="rc-room-actions"></div></body></html>', {
    url: 'https://rejhub.vercel.app/rejchat',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  w.eval(read('js/rejchat-media-toggle.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const button = w.document.getElementById('rj-media-toggle');
  assert.ok(button, 'brak przycisku oka');
  button.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(w.document.documentElement.classList.contains('rj-hide-media'), true, 'tryb ma się włączyć');
  assert.equal(w.localStorage.getItem('rejhub_hide_media_v1'), '1', 'wybór ma być zapamiętany');
  button.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(w.document.documentElement.classList.contains('rj-hide-media'), false, 'tryb ma się wyłączyć');
});

console.log('=== POWIADOMIENIA NA TELEFON ===');
check('każda strona z dzwonkiem ma panel push', () => {
  pages.forEach((file) => {
    const html = read('rejhub2/' + file);
    if (!html.includes('rejchat-notifications.js')) return;
    assert.ok(html.includes('/js/push.js?v=1'), 'brak push.js w ' + file);
    assert.ok(html.includes('/css/push.css?v=1'), 'brak push.css w ' + file);
  });
});

check('service worker obsługuje push i kliknięcie', () => {
  const sw = read('rejhub2/push-sw.js');
  assert.ok(sw.includes("addEventListener('push'"), 'brak obsługi push');
  assert.ok(sw.includes("addEventListener('notificationclick'"), 'brak obsługi kliknięcia');
  assert.ok(sw.includes('showNotification'), 'brak wyświetlenia powiadomienia');
});

check('wysyłka chroniona sekretem i kluczami VAPID', () => {
  const api = read('rejhub2/api/push-send.js');
  assert.ok(api.includes('PUSH_SEND_SECRET'), 'brak sekretu');
  assert.ok(api.includes('VAPID_PRIVATE_KEY'), 'brak klucza VAPID');
  assert.ok(api.includes('timingSafeEqual'), 'porównanie sekretu ma być odporne na timing');
  assert.ok(api.includes('push_subscriptions'), 'wysyłka ma czytać urządzenia z bazy');
  assert.ok(api.includes('push_outbox'), 'wysyłka ma czytać kolejkę');
  const pkg = JSON.parse(read('rejhub2/package.json'));
  assert.ok(pkg.dependencies && pkg.dependencies['web-push'], 'brak biblioteki web-push');
});

check('powiadomienia nie pokazują własnej aktywności', () => {
  const sql = read('supabase/2026-11-14_accounts_quota_identity.sql');
  assert.ok(sql.includes('identity_aliases'), 'brak tabeli aliasów');
  assert.ok(read('js/rejchat-notifications.js').includes("n.actor_name||'').toLowerCase()!==me"), 'klient ma odsiewać własne wpisy');
});

console.log('=== JEDEN WSPÓLNY LIMIT DANYCH ===');
check('baza pilnuje jednej kwoty na wszystkich magazynach', () => {
  const sql = read('supabase/2026-11-14_accounts_quota_identity.sql');
  assert.ok(sql.includes('quota_bytes bigint not null default 262144000'), 'brak kwoty 250 MB');
  ['rejchat_photos', 'rejsejf_items', 'rejfile_transfers'].forEach((table) => {
    assert.ok(sql.includes(table + '_quota_guard'), 'brak triggera dla ' + table);
  });
  assert.ok(sql.includes('profile_usage_bytes'), 'brak wspólnego licznika');
});

check('konto pokazuje zajęte miejsce', () => {
  const html = read('rejhub2/logowanie.html');
  assert.ok(html.includes('id="quota-bar"'));
  assert.ok(html.includes('/js/account-quota.js?v=1'));
  assert.ok(read('js/account-quota.js').includes('profile_usage_breakdown'));
});

console.log('=== PANEL SERWERA I TOŻSAMOŚCI ===');
check('admin ma zakładkę Serwer', () => {
  const html = read('rejhub2/admin.html');
  assert.ok(html.includes('data-tab="server"'));
  assert.ok(html.includes('id="tab-server"'));
  assert.ok(html.includes('/js/admin-server.js?v=1'));
  const panel = read('js/admin-panel.js');
  assert.ok(panel.includes('server: "tab-server"'), 'brak mapy zakładki');
  assert.ok(panel.includes('RJAdminServer'), 'brak wywołania ładowania');
});

check('scalanie i zapominanie nazw jest w panelu', () => {
  const source = read('js/admin-server.js');
  assert.ok(source.includes('admin_server_stats'));
  assert.ok(source.includes('admin_identity_issues'));
  assert.ok(source.includes('admin_identity_merge'));
  assert.ok(source.includes('admin_identity_forget'));
});

console.log('=== DŁUGIE PODSTRONY ===');
check('długie strony mają spis sekcji', () => {
  ['rejfile', 'rejsejf', 'rejtools', 'rejclass', 'uslugi', 'partnerstwo', 'widzety', 'licencja'].forEach((name) => {
    const html = read('rejhub2/' + name + '.html');
    assert.ok(html.includes('/js/page-index.js?v=1'), 'brak spisu w ' + name);
  });
});

check('spis buduje się z nagłówków', () => {
  const dom = new JSDOM('<!doctype html><html><body><main>' +
    '<h1>Start</h1><section><h2>Pierwsza</h2><p>a</p></section>' +
    '<section><h2>Druga</h2><p>b</p></section><section><h2>Trzecia</h2><p>c</p></section>' +
    '</main></body></html>', { url: 'https://rejhub.vercel.app/rejfile', runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.eval(read('js/page-index.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const nav = w.document.querySelector('.rj-page-index');
  assert.ok(nav, 'brak spisu sekcji');
  assert.equal(nav.querySelectorAll('a').length, 3, 'każdy nagłówek ma link');
  assert.ok(w.document.querySelector('h2').id, 'nagłówki dostają identyfikatory');
});

check('narzędzia nie są jedną długą kolumną', () => {
  const css = read('css/rejtools.css');
  assert.ok(/\.tools-grid \{ display:grid; grid-template-columns:repeat\(auto-fill,minmax\(320px,1fr\)\)/.test(css),
    'siatka narzędzi ma się układać w kolumny');
});

console.log('\nWYNIK: wszystkie sprawdzenia RejHub 2.0 przeszły ✔');

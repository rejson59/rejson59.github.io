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


console.log('=== TOPBAR „DWIE TAFLĘ” ===');
check('każda strona ze wspólnym topbarem ma nowy wariant', () => {
  pages.forEach((file) => {
    const html = read('rejhub2/' + file);
    if (!html.includes('rj-shared-header')) return;
    assert.ok(html.includes('/css/topbar-split.css?v=3'), 'brak topbar-split.css w ' + file);
    assert.ok(html.includes('/js/topbar-split.js?v=2'), 'brak topbar-split.js w ' + file);
  });
});

check('taflę są dwie, a po przewinięciu jedna', () => {
  const css = read('css/topbar-split.css');
  /* Jak w studiu: jedna szeroka kapsuła + mniejsza tafla z logo w środku. */
  assert.ok(/\.rj-shared-header::before\s*\{[^}]*border-radius: inherit/s.test(css), 'kapsuła topbaru ma szkło');
  assert.ok(css.includes('.rj-shared-header .brand::before'), 'logo ma własną mniejszą taflę');
  assert.ok(css.includes('.is-merged .brand::before'), 'mniejsza tafla rozpływa się po scaleniu');
  assert.ok(!css.includes('.header-right::before'), 'prawa strona nie jest osobną taflą — to był błąd');
  assert.ok(css.includes('order: 1'), 'nawigacja wraca na środek kapsuły');
});

check('scalanie reaguje na przewijanie', () => {
  const dom = new JSDOM('<!doctype html><html><body><header class="rj-shared-header"></header></body></html>', {
    url: 'https://rejhub.vercel.app/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole
  });
  const w = dom.window;
  w.eval(read('js/topbar-split.js'));
  const header = w.document.querySelector('.rj-shared-header');
  assert.equal(header.classList.contains('is-merged'), false, 'na starcie dwie taflę');
  Object.defineProperty(w, 'pageYOffset', { value: 120, configurable: true });
  w.RejTopbar.refresh();
  assert.equal(header.classList.contains('is-merged'), true, 'po przewinięciu jedna tafla');
  Object.defineProperty(w, 'pageYOffset', { value: 0, configurable: true });
  w.RejTopbar.refresh();
  assert.equal(header.classList.contains('is-merged'), false, 'po powrocie na górę znów dwie');
});

console.log('=== WEJŚCIE STRONY ===');
check('każda strona z loaderem ma falę wejścia', () => {
  pages.forEach((file) => {
    const html = read('rejhub2/' + file);
    if (!html.includes('rj-page-loader')) return;
    assert.ok(html.includes('/js/page-reveal.js?v=3'), 'brak page-reveal.js w ' + file);
    assert.ok(html.includes('/css/page-reveal.css?v=2'), 'brak page-reveal.css w ' + file);
  });
});

check('fala idzie od prawego górnego do lewego dolnego rogu i dzieli tekst na litery', () => {
  const html = '<!doctype html><html><body>' +
    '<main><h2 id="head">Szkło i światło</h2>' +
    '<button id="a" class="rj-cta">A</button>' +
    '<button id="b" class="rj-cta">B</button>' +
    '<button id="c" class="rj-cta">C</button></main></body></html>';
  const dom = new JSDOM(html, { url: 'https://rejhub.vercel.app/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  const places = {
    a: { top: 100, left: 40 },
    b: { top: 20, left: 900 },
    c: { top: 400, left: 120 },
    head: { top: 10, left: 400 }
  };
  w.Element.prototype.getBoundingClientRect = function () {
    const spot = places[this.id] || { top: 200, left: 200 };
    return { top: spot.top, left: spot.left, width: 160, height: 44, bottom: spot.top + 44, right: spot.left + 160, x: spot.left, y: spot.top };
  };
  const played = [];
  w.Element.prototype.animate = function (frames, options) {
    played.push({ el: this, options: options, frames: frames });
    return { onfinish: null, oncancel: null, cancel: function () {} };
  };
  w.eval(read('js/page-reveal.js'));
  w.RejReveal.start();

  const order = played.filter((entry) => entry.el.tagName === 'BUTTON').map((entry) => entry.el.id);
  assert.deepEqual(order, ['b', 'a', 'c'], 'kolejność: prawy górny → lewy dolny');
  assert.ok(played.some((entry) => entry.el.classList && entry.el.classList.contains('rj-letter')), 'litery mają własną animację');
  assert.ok(w.document.querySelectorAll('.rj-letter').length >= 10, 'nagłówek rozbity na litery');
  assert.equal(w.document.getElementById('head').textContent, 'Szkło i światło', 'treść nagłówka bez zmian');
});

check('studio używa tego samego logo, bez własnej płytki', () => {
  const html = read('rejhub2/studio-source/propozycje.html');
  assert.ok(!/<i>R<\/i>/.test(html), 'brak wymyślonej płytki „R”');
  assert.ok(html.includes('/hub/brand-mark.svg'), 'to samo logo co w topbarze');
  assert.ok(!/sx-brand i \{/.test(read('rejhub2/studio-source/propozycje.css')), 'brak stylu starej płytki');
});


console.log('=== JEDNO LOGO W CAŁYM REJHUBIE ===');
check('nigdzie nie ma własnej płytki ani litery „R” zamiast logo', () => {
  pages.forEach((file) => {
    const html = read('rejhub2/' + file);
    assert.ok(!/<span class="brand-mark">R<\/span>/.test(html), 'stara płytka w ' + file);
    assert.ok(!/<span class="mark">R<\/span>/.test(html), 'stara płytka w ' + file);
  });
});

check('każde widoczne logo to ten sam plik marki', () => {
  pages.forEach((file) => {
    const html = read('rejhub2/' + file);
    const marks = html.match(/class="(?:brand-mark|mark)"/g) || [];
    if (!marks.length) return;
    const sources = html.match(/src="[^"]*brand-mark\.svg[^"]*"/g) || [];
    assert.ok(sources.length, 'brak pliku marki w ' + file);
    assert.ok(!/src="\/?rejson-widgets\/favicon\.svg"/.test(html), 'obca ikona w ' + file);
  });
});

check('favicon to ten sam znak co logo', () => {
  assert.equal(read('rejhub2/favicon.svg').trim(), read('rejhub2/hub/brand-mark.svg').trim(),
    'favicon musi być tym samym znakiem');
});

console.log('=== NIC NIE PRZEŚWITUJE PRZEZ LOADER ===');
check('każda strona z loaderem chowa treść przed pierwszym malowaniem', () => {
  pages.forEach((file) => {
    const html = read('rejhub2/' + file);
    if (!html.includes('rj-page-loader')) return;
    assert.ok(html.includes("classList.add('rj-booting')"), 'brak schowania treści w ' + file);
  });
});

check('arkusz chowa treść pod nakładką i ma bezpiecznik', () => {
  const css = read('css/page-reveal.css');
  assert.ok(css.includes('html.rj-booting body >'), 'brak reguły chowającej treść');
  assert.ok(css.includes('rj-boot-failsafe'), 'brak bezpiecznika na wypadek błędu skryptu');
  assert.ok(read('rejhub2/hub/loader.js').includes('remove("rj-booting")'), 'loader musi zdejmować schowanie');
  assert.ok(read('js/loader.js').includes('remove("rj-booting")'), 'stary loader też musi zdejmować schowanie');
});

check('topbar zjeżdża z góry, reklamy z prawej, mobilne z dołu', () => {
  const js = read('js/page-reveal.js');
  assert.ok(js.includes('translate3d(0,-110%,0)'), 'topbar ma się wysuwać z góry');
  assert.ok(js.includes('translate3d(120%,0,0)'), 'mini reklamy mają wchodzić z prawej');
  assert.ok(js.includes('translate3d(0,120%,0)'), 'mobilne reklamy mają wchodzić z dołu');
  assert.ok(/duration: 9\d\d/.test(js), 'wejście ma być dłuższe niż wcześniej');
});


check('po zakończeniu animacji nic nie znika (regresja)', () => {
  const html = '<!doctype html><html><body>' +
    '<header class="rj-shared-header"><a class="brand" href="/">RejHub</a></header>' +
    '<main><h2 id="head">Szkło i światło</h2>' +
    '<button id="a" class="rj-cta">A</button>' +
    '<button id="b" class="rj-cta">B</button>' +
    '<div id="c" class="card">Karta</div></main></body></html>';
  const dom = new JSDOM(html, { url: 'https://rejhub.vercel.app/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  w.Element.prototype.getBoundingClientRect = function () {
    return { top: 100, left: 100, width: 160, height: 44, bottom: 144, right: 260, x: 100, y: 100 };
  };
  const created = [];
  w.Element.prototype.animate = function () {
    const animation = {
      onfinish: null, oncancel: null, playState: 'running',
      cancel: function () { this.playState = 'idle'; if (this.oncancel) this.oncancel(); }
    };
    created.push(animation);
    return animation;
  };
  w.eval(read('js/page-reveal.js'));
  w.RejReveal.start();

  /* Animacja trzyma opacity przez `fill: both`, ale styl inline nie może
     zostawić zera — po `cancel()` to on decydowałby o widoczności. */
  const tracked = w.document.querySelectorAll('.rj-shared-header, main .rj-cta, main .card, main h2, .rj-letter');
  assert.ok(tracked.length > 6, 'animacja ma objąć taflę, przyciski i litery');
  tracked.forEach((el) => {
    assert.notEqual(el.style.opacity, '0', 'element nie może zostać na opacity:0 — ' + el.tagName);
  });

  /* Koniec animacji = `cancel()`: element musi zostać widoczny. */
  created.forEach((animation) => { if (animation.onfinish) animation.onfinish(); });
  tracked.forEach((el) => {
    assert.notEqual(el.style.opacity, '0', 'po końcu animacji element zniknął — ' + el.tagName);
    assert.equal(el.style.willChange, '', 'po końcu animacji nie zostaje will-change');
  });
});

console.log('\nWYNIK: wszystkie sprawdzenia RejHub 2.0 przeszły ✔');

/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Poprawki z tej tury:
 *   1) przełącznik plakatów stoi nad WYRÓŻNIONYMI projektami,
 *   2) wyspa zawsze dostaje właściwą wersję arkusza,
 *   3) hero podstron to zaokrąglona tafla, nie prostokąt z blurem,
 *   4) RejChat przebudowany od zera: okno aplikacji, dok pokoi, dymki,
 *   5) wyspa: mini czat zamiast wyszukiwania, koło zębate w topbarze,
 *      „Teraz gra” widzi inne karty,
 *   6) panel admina: szyna sekcji, zapamiętana zakładka, skróty Alt+1…8.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log('  ✔ ' + name); }
  catch (error) { failures.push(name + ' — ' + error.message); console.log('  ✘ ' + name + '  [' + error.message + ']'); }
}

const HOME = read('rejhub2/index.html');
const ISLAND = read('rejhub2/hub/island.js');
const ISLAND_CSS = read('rejhub2/hub/island.css');
const GLASS = read('rejhub2/hub/glass2.css');
const CHAT_HTML = read('rejhub2/rejchat.html');
const CHAT_CSS = read('css/rejchat-messenger.css');
const ADMIN_HTML = read('rejhub2/admin.html');
const ADMIN_CSS = read('css/admin-rebuild.css');
const ADMIN_JS = read('js/admin-panel.js');
const TOPBAR_JS = read('js/shared-topbar.js');

console.log('\n=== A. PRZEŁĄCZNIK NAD WYRÓŻNIONYMI ===');
{
  const toggle = HOME.indexOf('data-preview-toggle');
  const featured = HOME.indexOf('class="origins container"');
  const others = HOME.indexOf('class="projects container"');

  check('przełącznik jest wyżej niż sekcja wyróżnionych', () =>
    assert.ok(toggle !== -1 && featured !== -1 && toggle < featured));
  check('„Pozostałe projekty” zostały niżej', () => assert.ok(featured < others));
  check('przełącznik ma własny kontener (nie rozciąga się na ekran)', () =>
    assert.match(HOME, /<div class="container preview-mode-slot">[\s\S]{0,400}data-preview-toggle/));
  check('kontener dostaje marginesy w arkuszu', () =>
    assert.match(GLASS, /\.preview-mode-slot \{[^}]*margin: 26px auto 6px/));
  check('ostrzeżenie o lagach nadal jest w treści', () => {
    const note = HOME.slice(HOME.indexOf('data-preview-note'), HOME.indexOf('data-preview-note') + 700);
    assert.match(note, /lagi/i);
    assert.match(note, /zacinanie/i);
  });
}

console.log('\n=== B. HERO PODSTRON: ZAOKRĄGLONA TAFLA ===');
{
  const block = GLASS.slice(
    GLASS.indexOf('hero podstron: zaokrąglona tafla'),
    GLASS.indexOf('/* Największe taflę')
  );

  check('hero dostaje promień, krawędź i błysk', () => {
    assert.match(block, /border-radius: 26px/);
    assert.match(block, /border: 1px solid var\(--hub-line\)/);
    assert.match(block, /linear-gradient\(158deg/);
  });
  check('hero nie rozmywa już tła (to dawało prostokątną plamę)', () => {
    assert.match(block, /backdrop-filter: none !important;/);
    assert.match(block, /-webkit-backdrop-filter: none !important;/);
  });
  check('hero ma oddech po bokach', () =>
    assert.match(block, /padding-inline: clamp\(16px, 2\.4vw, 30px\)/));
  check('jasny motyw ma własną wersję tej tafli', () =>
    assert.match(block, /html\[data-theme="light"\] body:is\(\.rj-file/));
  check('małe elementy w kartach nie rozmywają tła', () => {
    const small = GLASS.slice(GLASS.indexOf('Małe elementy wewnątrz kart'));
    assert.match(small, /\.file-item/);
    assert.match(small, /backdrop-filter: none !important/);
  });
}

console.log('\n=== C. WYSPA: CZAT, KOŁO ZĘBATE, INNE KARTY ===');
{
  check('wyszukiwanie zniknęło z docku i ze stanów', () => {
    assert.ok(!/data-open="search"/.test(ISLAND));
    assert.ok(!/rj-island-search/.test(ISLAND), 'zostało pole wyszukiwania');
    assert.ok(!/"search": 1/.test(ISLAND), 'stan search nadal w VIEWS');
  });
  check('dock ma mini RejChat z prawdziwym RPC', () => {
    assert.match(ISLAND, /data-open="chat"/);
    assert.match(ISLAND, /rejchat_room_list_v3/);
    assert.match(ISLAND, /rejchat_room_send_v2/);
  });
  check('czat ma listę, pole i przycisk wysyłania', () => {
    ['rj-island-chat', 'rj-island-chat-form', 'rj-island-chat-input']
      .forEach((id) => assert.ok(ISLAND.includes(id), 'brak #' + id));
    assert.match(ISLAND_CSS, /\.rj-chat-send \{/);
  });
  check('czat nie odświeża się po zamknięciu panelu', () => {
    assert.match(ISLAND, /if \(name !== "chat"\) stopChatPoll\(\);/);
    assert.match(ISLAND, /function stopChatPoll\(\)/);
  });
  check('stan czatu ma własny rozmiar wyspy', () => assert.match(ISLAND, /chat: \{ w: 396/));
  check('ikona ustawień to koło zębate', () =>
    assert.match(ISLAND, /theme: '<svg[^']*circle cx="12" cy="12" r="3\.1"/));
  check('panel ustawień opisany po ludzku', () => {
    assert.match(ISLAND, /data-open="theme" title="Ustawienia"/);
    assert.match(ISLAND, /Animacje omijają systemowe blokady ruchu/);
  });
  check('„Teraz gra” czyta stan z innych kart', () => {
    assert.match(ISLAND, /rj_now_playing_v1/);
    assert.match(ISLAND, /BroadcastChannel/);
    assert.match(ISLAND, /readRemoteNow/);
    assert.match(ISLAND, /data-remote-media/);
  });
  check('każda strona publikuje i odbiera stan odtwarzania', () => {
    assert.match(ISLAND, /watchLocalMedia/);
    assert.match(ISLAND, /window\.RejNowPlaying/);
  });
  check('wersja arkusza wyspy dziedziczy z adresu skryptu', () => {
    assert.match(ISLAND, /function scriptVersion\(/);
    assert.ok(!/var CSS_VERSION = "3"/.test(ISLAND));
  });
  check('wszystkie strony mają spójną wersję wyspy', () => {
    const pages = fs.readdirSync(path.join(root, 'rejhub2'))
      .filter((file) => file.endsWith('.html'))
      .map((file) => read('rejhub2/' + file))
      .filter((html) => /hub\/island\.js\?v=\d+/.test(html));
    assert.ok(pages.length >= 15, 'za mało stron z wyspą');
    pages.forEach((html) => {
      const js = /hub\/island\.js\?v=(\d+)/.exec(html);
      const css = /hub\/island\.css\?v=(\d+)/.exec(html);
      if (css) assert.equal(css[1], js[1], 'wersje wyspy się rozjechały');
    });
  });
}

console.log('\n=== D. TOPBAR: BEZ USTAWIEŃ, PEŁNE MENU NA TELEFONIE ===');
{
  const pages = fs.readdirSync(path.join(root, 'rejhub2'))
    .filter((file) => file.endsWith('.html'))
    .map((file) => ({ file, html: read('rejhub2/' + file) }));

  check('żadna strona nie ma już przycisku ustawień w topbarze', () => {
    assert.ok(pages.length >= 15, 'za mało stron');
    pages.forEach(({ file, html }) => {
      const header = (/<header class="site-header[\s\S]*?<\/header>/.exec(html) || [''])[0];
      assert.ok(!header.includes('theme-toggle'), file + ': został przycisk ustawień');
      assert.ok(!header.includes('icon-gear'), file + ': zostało koło zębate');
      assert.ok(!header.includes('Ustawienia'), file + ': został opis ustawień');
    });
  });

  check('ustawienia są już tylko w wyspie', () => {
    const island = read('rejhub2/hub/island.js');
    assert.ok(island.includes('data-switch="theme"'), 'wyspa bez przełącznika motywu');
    assert.ok(island.includes('Jasny motyw'), 'wyspa bez opisu motywu');
    assert.ok(island.includes('data-switch="motion"'), 'wyspa bez przełącznika animacji');
  });

  check('wspólny skrypt nie buduje panelu ustawień', () => {
    assert.ok(!/rj-settings-panel/.test(TOPBAR_JS), 'został kod panelu ustawień');
    assert.ok(!/theme-toggle/.test(TOPBAR_JS), 'skrypt nadal szuka koła zębatego');
    assert.ok(/position: static/.test(read('css/topbar-split.css')), 'brak poprawki szerokości menu');
  });

  check('menu na telefonie liczy szerokość od całego topbaru', () => {
    const css = read('css/topbar-split.css');
    const mobile = css.slice(css.indexOf('@media (max-width: 1200px) {'));
    assert.match(mobile, /body \.rj-shared-header \.header-right \{ position: static; \}/,
      'menu nadal liczy szerokość od grupki ikon');
    assert.match(mobile, /max-height: calc\(100dvh - 236px\)/, 'menu nie ma limitu wysokości nad wyspą');
    assert.match(mobile, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'menu nie ma dwóch kolumn');
    assert.match(mobile, /border: 0 !important/, 'podmenu nadal rysuje drugą taflę');
    assert.match(mobile, /min-height: 46px/, 'wiersze menu za niskie do dotknięcia');
  });

  check('wersje skryptu i arkusza topbaru podbite na wszystkich stronach', () => {
    pages.forEach(({ file, html }) => {
      if (!html.includes('shared-topbar.js')) return;
      assert.match(html, /shared-topbar\.js\?v=10/, file + ': stary skrypt topbaru');
      assert.match(html, /topbar-split\.css\?v=6/, file + ': stary arkusz topbaru');
    });
  });
}

console.log('\n=== E. REJCHAT: OKNO, DOK I DYMKI ===');
{
  check('arkusz „Messenger” jest podpięty, a szkło zamyka kaskadę', () => {
    const links = Array.from(CHAT_HTML.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)).map((m) => m[1]);
    assert.match(links[links.length - 1], /glass-last\.css\?v=4/);
    assert.ok(links.some((l) => l.includes('rejchat-messenger.css?v=13')), 'brak arkusza Messengera');
    assert.ok(!CHAT_HTML.includes('rejchat-rebuild.css'), 'stara warstwa nadal podpięta');
    assert.ok(!fs.existsSync(path.join(root, 'css/rejchat-rebuild.css')), 'stary arkusz nadal leży w repo');
  });
  check('pasek aplikacji to typografia, nie karta', () => {
    const hero = CHAT_CSS.slice(CHAT_CSS.indexOf('body.rj-community .comm-hero {'), CHAT_CSS.indexOf('body.rj-community .rc-kicker'));
    assert.match(hero, /background: none !important;/);
    assert.match(hero, /border: 0 !important;/);
    assert.match(hero, /box-shadow: none !important;/);
    assert.match(hero, /backdrop-filter: none !important;/);
  });
  check('przełącznik Czat/Wpisy siedzi w pasku, nie w szynie', () => {
    const hero = CHAT_HTML.slice(CHAT_HTML.indexOf('class="comm-hero"'), CHAT_HTML.indexOf('class="comm-layout"'));
    assert.match(hero, /id="chat-tab"/);
    assert.match(hero, /id="posts-tab"/);
    assert.ok(!CHAT_HTML.includes('chat-navigation'), 'został stary blok „Co dziś wybierasz?”');
  });
  check('okno aplikacji: dok pokoi, rozmowa, panel informacji', () => {
    assert.match(CHAT_CSS, /grid-template-columns: 92px minmax\(0, 1fr\) 248px !important;/);
    assert.match(CHAT_CSS, /height: clamp\(520px, calc\(100dvh - 190px\), 860px\) !important;/);
    assert.match(CHAT_CSS, /body\.rj-community \.comm-layout \{[\s\S]{0,900}border-radius: var\(--rm-radius\) !important;/);
    assert.match(CHAT_CSS, /\.chat-channel \{[\s\S]{0,700}flex-direction: column !important;/);
    assert.match(CHAT_CSS, /\.chat-channel\.is-active::before \{/);
  });
  check('wiadomości to dymki: nazwa nad, treść w środku, własne po prawej', () => {
    assert.match(CHAT_CSS, /\.chat-bubble \{[\s\S]{0,400}border-radius: 16px 16px 16px 5px !important;/);
    assert.match(CHAT_CSS, /\.chat-msg\.is-mine \.chat-bubble \{[\s\S]{0,400}justify-self: end !important;/);
    assert.match(CHAT_CSS, /\.chat-msg\.is-mine \.chat-bubble \{[\s\S]{0,400}border-radius: 16px 16px 5px 16px !important;/);
    assert.match(CHAT_CSS, /\.chat-meta \{\n  display: contents !important;/);
    assert.match(CHAT_CSS, /\.chat-author,[\s\S]{0,120}top: -17px !important;/);
  });
  check('grupowanie: kolejne wiadomości tej samej osoby bez nazwy i awatara', () => {
    assert.match(CHAT_CSS, /\.chat-msg\.is-grouped \.chat-author,[\s\S]{0,200}display: none !important;/);
    assert.match(CHAT_CSS, /\.chat-msg\.is-grouped \.comm-avatar \{[\s\S]{0,60}visibility: hidden !important;/);
    assert.match(CHAT_CSS, /\.chat-msg\.is-grouped \.chat-bubble \{[\s\S]{0,80}margin-top: 5px !important;/);
  });
  check('pole pisania to pigułka z okrągłym przyciskiem wysyłania', () => {
    assert.match(CHAT_CSS, /\.comm-chat-form \{[\s\S]{0,600}border-radius: 24px !important;/);
    assert.match(CHAT_CSS, /\.comm-chat-form:focus-within \{/);
    assert.match(CHAT_CSS, /#chat-send::after \{\n  content: "↑";/);
  });
  check('lista wiadomości nie rozmywa tła i nie skacze przy scrollu', () => {
    const list = CHAT_CSS.slice(CHAT_CSS.indexOf('body.rj-community .comm-chat-list {'), CHAT_CSS.indexOf('body.rj-community .comm-chat-list::-webkit-scrollbar'));
    assert.ok(!/backdrop-filter:\s*blur/.test(list), 'lista rozmywa tło');
    assert.match(list, /overflow-anchor: none !important;/);
    assert.match(list, /flex: 1 1 0 !important;/);
  });
  check('paleta: błękit na granacie, zero fioletu i zieleni', () => {
    assert.match(CHAT_CSS, /--rm-accent: #5a95ff;/);
    assert.match(CHAT_CSS, /--rm-accent-2: #4f8cff;/);
    assert.match(CHAT_CSS, /--rm-page: #070b15;/);
    ['#c8b8ff', '#a6efd6', '#675fbd', '#34d399', '#46c98a', 'magenta', 'fuchsia'].forEach((color) => {
      assert.ok(!CHAT_CSS.includes(color), 'został kolor ' + color);
    });
  });
  check('na telefonie dok jest poziomy, a rama niższa', () => {
    assert.match(CHAT_CSS, /@media \(max-width: 860px\)[\s\S]{0,1400}flex-direction: row !important;/);
    assert.match(CHAT_CSS, /@media \(max-width: 860px\)[\s\S]{0,1600}grid-template-rows: auto minmax\(0, 1fr\) !important;/);
    assert.match(CHAT_CSS, /@media \(max-width: 560px\)[\s\S]{0,2400}max-width: 90% !important;/);
  });
  check('reklamy boczne nie ściskają rozmowy', () => {
    assert.match(CHAT_CSS, /\.rj-side-ads-enabled \.rejchat-info \{[\s\S]{0,80}display: none !important;/);
  });
  check('wszystkie zaczepy JS nadal są w HTML-u', () => {
    ['chat-list', 'chat-form', 'chat-input', 'chat-send', 'chat-public-view', 'chat-private-view',
      'dm-input', 'dm-messages', 'dm-send', 'post-content', 'post-submit', 'logout-btn',
      'chat-tab', 'posts-tab', 'channel-general', 'channel-links', 'channel-private',
      'composer-card', 'panel-chat', 'panel-posts']
      .forEach((id) => assert.ok(CHAT_HTML.includes('id="' + id + '"'), 'brak #' + id));
  });
}

console.log('\n=== F. PANEL ADMINA: SZYNA I SKRÓTY ===');
{
  check('panel kończy się wspólną warstwą szkła', () => {
    const links = Array.from(ADMIN_HTML.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)).map((m) => m[1]);
    assert.match(links[links.length - 1], /glass-last\.css\?v=4/);
    assert.ok(links.some((l) => l.includes('admin-rebuild.css?v=2')), 'brak warstwy panelu');
  });
  check('sekcje są w pionowej szynie po lewej', () => {
    assert.match(ADMIN_HTML, /<aside class="adm-rail"/);
    assert.match(ADMIN_HTML, /<div class="adm-shell">/);
    assert.match(ADMIN_HTML, /<div class="adm-body">/);
    const aside = ADMIN_HTML.slice(ADMIN_HTML.indexOf('adm-rail'), ADMIN_HTML.indexOf('adm-body'));
    assert.match(aside, /class="adm-tabs"/, 'nawigacja nie trafiła do szyny');
  });
  check('wszystkie osiem sekcji nadal istnieje', () => {
    ['overview', 'activity', 'partnership', 'submissions', 'community', 'visitors', 'server', 'errors']
      .forEach((tab) => assert.ok(ADMIN_HTML.includes('data-tab="' + tab + '"'), 'brak zakładki ' + tab));
  });
  check('szyna jest przyklejona i zwija się na telefonie', () => {
    assert.match(ADMIN_CSS, /\.adm-rail \{[\s\S]{0,200}position: sticky/);
    assert.match(ADMIN_CSS, /@media \(max-width: 1100px\)[\s\S]{0,600}flex-direction: row/);
  });
  check('karty mają jeden wspólny rytm', () => {
    assert.match(ADMIN_CSS, /body\.rj-admin \.adm-card,[\s\S]{0,180}border-radius: var\(--adm-radius\)/);
    assert.match(ADMIN_CSS, /\.adm-card-head \{[\s\S]{0,220}border-bottom: 1px solid var\(--adm-line\)/);
    assert.match(ADMIN_CSS, /\.adm-kpis \{[\s\S]{0,120}repeat\(auto-fit/);
  });
  check('panel pamięta ostatnią sekcję', () => {
    assert.match(ADMIN_JS, /rj_admin_tab_v1/);
    assert.match(ADMIN_JS, /function restoreTab\(/);
    assert.match(ADMIN_JS, /RJAdminTabs/);
  });
  check('sekcje da się wybierać z klawiatury (Alt+1…8)', () => {
    assert.match(ADMIN_JS, /event\.altKey/);
    assert.match(ADMIN_JS, /number >= 1 && number <= btns\.length/);
  });
  check('panel nie przechwytuje skrótu podczas pisania w polu', () =>
    assert.match(ADMIN_JS, /\^\(INPUT\|TEXTAREA\|SELECT\)\$/));
}

console.log('\n=== G. MENU, SZKŁO I PANEL BEZ ZBĘDNYCH PRZEŁĄCZNIKÓW ===');
{
  const WIDGET_ADMIN_JS = read('rejson-widgets/js/admin.js');
  /* Tylko strony ze wspólnym topbarem — logowanie i plansza „w budowie”
     są celowo bez nawigacji. */
  const PAGES2 = fs.readdirSync(path.join(root, 'rejhub2')).filter((file) =>
    file.endsWith('.html') && read('rejhub2/' + file).includes('rj-shared-header'));

  check('menu „Więcej” prowadzi do RejClass, a Widżety zniknęły z serwisu', () => {
    PAGES2.forEach((file) => {
      const html = read('rejhub2/' + file);
      assert.ok(html.includes('href="/rejclass"'), file + ': brak RejClass w menu');
      assert.ok(!html.includes('/widzety'), file + ': został odnośnik do Widżetów');
    });
    assert.ok(!fs.existsSync(path.join(root, 'widzety.html')), 'została strona /widzety');
    assert.ok(!fs.existsSync(path.join(root, 'rejhub2/widzety.html')), 'została kopia /widzety');
    assert.match(read('vercel.json'), /"source": "\/widzety"/, 'brak przekierowania starego adresu');
  });

  check('„Szklane studio” widzi tylko administrator', () => {
    PAGES2.forEach((file) => {
      const html = read('rejhub2/' + file);
      assert.match(html, /data-admin-only[^>]*href="\/szklane-studio"|href="\/szklane-studio"[^>]*data-admin-only/,
        file + ': link do studia nie jest oznaczony jako administratorski');
    });
    assert.match(TOPBAR_JS, /rejhub_admin_hint=1/, 'topbar nie sprawdza sesji administratora');
    assert.match(read('css/shared-topbar.css'), /\[data-admin-only\]/, 'brak reguły ukrywającej link');
    assert.match(read('rejhub2/api/session.js'), /HINT_COOKIE_NAME/, 'logowanie nie ustawia podpowiedzi sesji');
  });

  check('panel nie pokazuje polubień zgłoszeń ani przełączników tablicy', () => {
    [read('rejhub2/admin.html'), read('admin.html')].forEach((html) => {
      ['kpi-votes', 'Najwięcej polubień', 'chk-is-public', 'chk-is-pinned', 'publicznej tablicy']
        .forEach((needle) => assert.ok(!html.includes(needle), 'zostało: ' + needle));
    });
    ['upvotes_count', 'is_pinned', 'chk-is-public', 'sortBy === "votes"']
      .forEach((needle) => assert.ok(!WIDGET_ADMIN_JS.includes(needle), 'admin.js nadal ma: ' + needle));
  });

  check('szkło jest bardziej przezroczyste, a tapeta mniej przyciemniona', () => {
    assert.match(read('css/glass-last.css'), /--gl-tint: rgba\(11, 17, 29, 0\.5\)/, 'tinta szkła została za gęsta');
    assert.match(GLASS, /--g-lens: blur\(26px\) saturate\(175%\)/, 'obiektyw szkła bez zmian');
    assert.ok(!GLASS.includes('brightness(0.92)'), 'tapeta nadal przyciemniona o 8%');
    assert.ok(!/rgba\(5, 8, 16, 0\.86\)/.test(GLASS), 'zasłona nadal mocno przyciemnia dół');
  });

  check('telefon: zakładki panelu mają 46 px i przyciąganie do krawędzi', () => {
    assert.match(ADMIN_CSS, /min-height: 46px/, 'za małe cele dotyku');
    assert.match(ADMIN_CSS, /scroll-snap-type: x proximity/, 'brak przyciągania zakładek');
    assert.match(ADMIN_CSS, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'kafelki przeglądu nadal ściśnięte');
  });
}

console.log('\n=== H. PANEL NA TELEFONIE, PASEK REKLAM I PRZEWIJANIE ===');
{
  const GLASS_LAST = read('css/glass-last.css');
  const MOBILE_ADS_CSS = read('css/mobile-ads.css');
  const MOBILE_ADS_JS = read('js/mobile-ads.js');
  const SCROLLBAR_CSS = read('css/scrollbar.css');
  const SCROLLBAR_JS = read('js/scrollbar.js');

  check('panel admina na telefonie ma poziomą szynę, nie kolumnę pigułek', () => {
    /* Reguła grid + width:100% wolno działać tylko na szerokim ekranie. */
    assert.match(GLASS_LAST, /@media \(min-width: 1101px\) \{\s*body\.rj-admin \.adm-tabs \{\s*display: grid;/,
      'pionowa lista zakładek nie jest ograniczona do desktopu');
    const mobile = GLASS_LAST.slice(GLASS_LAST.indexOf('Panel admina na telefonie'));
    assert.match(mobile, /@media \(max-width: 1100px\)/);
    assert.match(mobile, /body\.rj-admin \.adm-tabs \{\s*position: static !important;\s*display: flex !important;\s*flex-direction: row !important;/);
    assert.match(mobile, /body\.rj-admin \.adm-tab \{\s*flex: 0 0 auto;\s*width: auto !important;\s*min-height: 46px;/);
    assert.match(mobile, /scroll-snap-type: x proximity/);
    assert.match(mobile, /body\.rj-admin \.adm-rail \{\s*position: sticky;/);
  });

  check('mini reklamy stoją pod topbarem i przewijają się same', () => {
    assert.match(MOBILE_ADS_CSS, /position:sticky/);
    assert.match(MOBILE_ADS_CSS, /top:var\(--rj-ads-top, 60px\)/);
    assert.ok(!MOBILE_ADS_CSS.includes('inset:auto 0 0'), 'pasek nadal przyklejony do dołu');
    assert.match(MOBILE_ADS_CSS, /rj-mobile-ads-hint \{ display:none; \}/, 'podpis „przesuń” ma być ukryty');
    assert.match(MOBILE_ADS_JS, /STEP_MS = 2000/, 'brak przesuwania co 2 s');
    assert.match(MOBILE_ADS_JS, /header\.nextSibling/, 'pasek nie trafia pod topbar');
    assert.match(MOBILE_ADS_JS, /mini reklamy<\/span>/);
    assert.ok(!MOBILE_ADS_JS.includes('rj-mobile-ads-hint'), 'został napis „przesuń”');
    assert.ok(!MOBILE_ADS_JS.includes('rj-mobile-ads-spacer'), 'został pusty odstęp na dole');
    assert.match(MOBILE_ADS_JS, /classList\.add\('rj-mobile-ads-active'\)/);
  });

  check('przewijanie ma własny, cienki suwak na każdej stronie', () => {
    assert.match(SCROLLBAR_CSS, /::-webkit-scrollbar-thumb/);
    assert.match(SCROLLBAR_CSS, /html\.rj-scrolling ::-webkit-scrollbar-thumb/);
    assert.match(SCROLLBAR_JS, /rj-scrolling/);
    fs.readdirSync(path.join(root, 'rejhub2')).filter((file) => file.endsWith('.html')).forEach((file) => {
      const html = read('rejhub2/' + file);
      assert.match(html, /scrollbar\.css\?v=1/, file + ': brak arkusza suwaka');
      assert.match(html, /scrollbar\.js\?v=1/, file + ': brak skryptu suwaka');
    });
  });

  check('RejChat odejmuje wysokość górnego paska od okna rozmowy', () => {
    assert.match(read('css/rejchat-messenger.css'), /100dvh - 76px - var\(--rj-top-ads-height, 0px\)/);
    assert.match(read('css/rejchat-messenger.css'), /var\(--rj-mobile-ads-height, 0px\)/);
  });
}

console.log('\n========================================================');
if (failures.length) {
  console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
  failures.forEach((failure) => console.log(' - ' + failure));
  process.exit(1);
}
console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
console.log('PASS: przełącznik nad wyróżnionymi, hero bez blur-kwadratów, wyspa z czatem, topbar z ustawieniami, RejChat i panel admina po przebudowie');
process.exit(0);

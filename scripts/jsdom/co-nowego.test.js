/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * „Co nowego” + koniec wpisów w RejChat.
 *
 * Pilnuje trzech rzeczy naraz:
 *   1) strona zmian istnieje, jest datowana i podpięta w menu każdej podstrony,
 *   2) z RejChatu nie wróciła zakładka „Wpisy” (ani kompozytor, ani feed),
 *   3) publiczny czat nie ciągnie już z bazy wpisów — nie ma martwych RPC.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log('  ✔ ' + name); }
  catch (error) { failures.push(name + ' — ' + error.message); console.log('  ✘ ' + name + '  [' + error.message + ']'); }
}

const REJHUB = path.join(root, 'rejhub2');
const PAGES = fs.readdirSync(REJHUB)
  .filter((file) => file.endsWith('.html'))
  .concat(['rejchat/regulamin.html'])
  .filter((file) => /<header class="site-header/.test(read('rejhub2/' + file)));

console.log('\n=== A. STRONA „CO NOWEGO” ===');

check('strona istnieje i ma własny arkusz', () => {
  assert.ok(exists('rejhub2/co-nowego.html'), 'brak rejhub2/co-nowego.html');
  const html = read('rejhub2/co-nowego.html');
  assert.match(html, /<link rel="stylesheet" href="\/css\/co-nowego\.css\?v=\d+"/);
  assert.ok(exists('css/co-nowego.css'), 'brak css/co-nowego.css');
});

check('tytuł, opis i adres kanoniczny są ustawione', () => {
  const html = read('rejhub2/co-nowego.html');
  assert.match(html, /<title>Co nowego w RejHubie/);
  assert.match(html, /<link rel="canonical" href="https:\/\/rejhub\.vercel\.app\/co-nowego">/);
  assert.match(html, /<meta name="description" content="Co nowego w RejHubie/);
});

check('zmiany są datowane i ułożone od najnowszej', () => {
  const html = read('rejhub2/co-nowego.html');
  assert.match(html, /<h1>Co nowego\?<\/h1>/);
  const dates = Array.from(html.matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})"/g)).map((m) => m[1]);
  assert.ok(dates.length >= 5, 'za mało wpisów: ' + dates.length);
  const sorted = dates.slice().sort().reverse();
  assert.deepEqual(dates, sorted, 'wpisy nie są od najnowszego');
  assert.ok(dates.every((date) => /^2026-11-\d{2}$/.test(date)), 'data spoza listopada 2026');
});

check('strona nie ma inline event handlerów (CSP: script-src-attr none)', () => {
  const html = read('rejhub2/co-nowego.html');
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html), 'znalazł się atrybut on…');
});

console.log('\n=== B. MENU NA KAŻDEJ PODSTRONIE ===');

check('każda podstrona z topbarem prowadzi do /co-nowego', () => {
  PAGES.forEach((file) => {
    const html = read('rejhub2/' + file);
    const panel = html.slice(html.indexOf('class="nav-more-panel"'), html.indexOf('</details>', html.indexOf('class="nav-more-panel"')));
    assert.ok(panel.includes('href="/co-nowego"'), file + ': brak „Co nowego” w menu');
    assert.match(panel, /<span class="nav-label">Co nowego<\/span>/, file + ': link bez etykiety');
  });
});

check('menu jest identyczne na wszystkich stronach (jeden topbar)', () => {
  const panels = new Set(PAGES.map((file) => {
    const html = read('rejhub2/' + file);
    return html.slice(html.indexOf('class="nav-more-panel"'), html.indexOf('</details>', html.indexOf('class="nav-more-panel"')));
  }));
  assert.equal(panels.size, 1, 'różne panele „Więcej”');
});

check('adres strony jest w sitemapie', () => {
  assert.match(read('rejhub2/sitemap.xml'), /<loc>https:\/\/rejhub\.vercel\.app\/co-nowego<\/loc>/);
});

console.log('\n=== C. WPISY USUNIĘTE Z REJCHATU ===');

check('w RejChacie nie ma zakładki, kompozytora ani feedu', () => {
  const html = read('rejhub2/rejchat.html');
  ['posts-tab', 'panel-posts', 'posts-feed', 'composer-card', 'post-content', 'post-submit', 'post-media-input']
    .forEach((id) => assert.ok(!html.includes('id="' + id + '"'), 'został #' + id));
  assert.ok(!/id="chat-tab"/.test(html), 'został przełącznik zakładek');
  assert.match(html, /href="\/co-nowego"/, 'brak skrótu do strony zmian');
});

check('strona RejChatu nie zapowiada już wpisów', () => {
  const html = read('rejhub2/rejchat.html');
  assert.ok(!/<title>[^<]*wpisy/i.test(html), 'tytuł nadal mówi o wpisach');
  assert.ok(!/wpisy i rozmowy/i.test(html), 'opis nadal mówi o wpisach');
  assert.ok(!/Wpisy RejChat/.test(html), 'został nagłówek feedu');
});

check('skrypt czatu nie pyta bazy o wpisy', () => {
  const js = read('js/community.js');
  ['community_list_posts', 'community_create_post', 'community_toggle_post_like', 'community_delete_post',
    'community_add_comment', 'community_list_comments', 'loadPosts', 'posts-feed', 'post-content']
    .forEach((needle) => assert.ok(!js.includes(needle), 'zostało: ' + needle));
  assert.match(js, /setupChat\(\)/, 'brak startu czatu');
  assert.match(js, /function renderAuthZone\(/, 'brak strefy logowania');
});

check('przełączanie pokoi nie szuka usuniętej zakładki', () => {
  assert.ok(!read('js/rejchat.js').includes('#wpisy'), 'zostało #wpisy');
  assert.ok(!read('js/rejchat-private.js').includes("getElementById('chat-tab')"), 'prywatne rozmowy klikają w usuniętą zakładkę');
  assert.ok(!read('js/community.js').includes('post-content'), 'został odnośnik do kompozytora wpisów');
});

check('wyspa nie proponuje „Nowego wpisu”', () => {
  const island = read('rejhub2/hub/island.js');
  assert.ok(!island.includes('#post-content'), 'została akcja #post-content');
  assert.match(island, /Napisz na czacie/);
});

console.log('\n=== D. ŚLAD W BAZIE ===');

check('plik SQL opisuje usunięcie wpisów i nie rusza DM', () => {
  const file = 'supabase/2026-11-17_posts_removal.sql';
  assert.ok(exists(file), 'brak ' + file);
  const sql = read(file);
  assert.match(sql, /delete from public\.community_posts/i);
  assert.match(sql, /rejchat_dm_messages/i, 'brak informacji o zostawionych DM');
  assert.match(sql, /community_comments/i, 'brak informacji o komentarzach');
});

console.log('\n========================================================');
if (failures.length) {
  console.log('WYNIK: ' + passed + ' ✔ / ' + failures.length + ' ✘');
  failures.forEach((failure) => console.log(' - ' + failure));
  process.exit(1);
}
console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✔ — wpisy usunięte, „Co nowego” podpięte');

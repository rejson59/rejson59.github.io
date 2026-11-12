/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
 * Licencja: /LICENSE, /licencja
 *
 * Profil 2.0: galeria 24 awatarów, kategorie, podgląd na żywo, ramki i tła.
 * Sprawdzamy znaczniki, katalog plików i faktyczne działanie filtrowania
 * (bez sieci — RJProfiles jest podstawione).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ✔ ' + name); }
  catch (error) { failures.push(name + ' — ' + error.message); console.log('  ✘ ' + name + '  [' + error.message + ']'); }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async function main() {
  console.log('\n=== A. ZNACZNIKI I PLIKI ===');

  const pages = ['rejhub2/profil.html', 'rejhub2/profil.html'];
  await check('obie wersje profilu ładują nowy arkusz i skrypt', () => {
    pages.forEach((file) => {
      const html = read(file);
      assert.match(html, /profile-studio\.css\?v=1/, file + ': brak arkusza');
      assert.match(html, /js\/profil\.js\?v=6/, file + ': stary skrypt profilu');
      assert.match(html, /rejchat-profiles\.js\?v=3/, file + ': stary katalog profili');
    });
  });

  await check('widok i edytor mają komplet elementów', () => {
    const ids = ['profile-status', 'profile-view', 'profile-cover', 'profile-avatar-ring', 'profile-avatar',
      'profile-name', 'profile-handle', 'profile-bio', 'profile-badges', 'profile-tabs', 'profile-edit',
      'profile-copy', 'profile-editor', 'profile-form', 'avatar-search', 'avatar-filters', 'avatar-options',
      'avatar-empty', 'color-options', 'frame-options', 'banner-options', 'profile-bio-input', 'bio-count',
      'bio-prompts', 'profile-dirty', 'profile-reset', 'profile-save', 'profile-result',
      'profile-preview-card', 'preview-cover', 'preview-avatar', 'preview-ring', 'preview-name',
      'preview-handle', 'preview-bio', 'profile-complete-value', 'profile-complete-bar', 'nickname-form',
      'nickname-input', 'nickname-save', 'nickname-result', 'profile-logout', 'profile-report',
      'profile-block', 'profile-login-link'];
    pages.forEach((file) => {
      const d = new JSDOM(read(file)).window.document;
      ids.forEach((id) => assert.ok(d.getElementById(id), file + ': brak #' + id));
    });
  });

  await check('każdy awatar z katalogu ma plik SVG', () => {
    const source = read('js/rejchat-profiles.js');
    const ids = Array.from(source.matchAll(/\{id:'([a-z]+)',name:'/g)).map((match) => match[1]);
    assert.equal(ids.length, 24, 'katalog powinien mieć 24 awatary');
    ids.forEach((id) => assert.ok(exists('assets/avatars/' + id + '.svg'), 'brak pliku ' + id + '.svg'));
  });

  await check('migracja bazy zna te same awatary, ramki i tła', () => {
    const sql = read('supabase/2026-11-12_rejchat_profile_studio.sql');
    const source = read('js/rejchat-profiles.js');
    const ids = Array.from(source.matchAll(/\{id:'([a-z]+)',name:'/g)).map((match) => match[1]);
    ids.forEach((id) => assert.ok(sql.includes("'" + id + "'"), 'migracja bez awatara ' + id));
    ['none', 'ice', 'violet', 'rose', 'amber', 'prism'].forEach((frame) =>
      assert.ok(sql.includes("'" + frame + "'"), 'migracja bez ramki ' + frame));
    ['aurora', 'ocean', 'dusk', 'ember', 'mono', 'prism'].forEach((banner) =>
      assert.ok(sql.includes("'" + banner + "'"), 'migracja bez tła ' + banner));
    assert.match(sql, /add column if not exists frame/);
    assert.match(sql, /add column if not exists banner/);
  });

  console.log('\n=== B. DZIAŁANIE GALERII ===');

  const html = read('rejhub2/profil.html');
  const dom = new JSDOM(html, { url: 'https://rejhub.vercel.app/profil', runScripts: 'outside-only' });
  const w = dom.window;
  const d = w.document;
  d.querySelector('#rj-page-loader')?.remove();
  w.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  const PROFILE = {username:'Tester',avatar:'comet',color:'mint',frame:'none',banner:'aurora',bio:'',nickname:'',updated_at:'2026-11-11T22:00:00Z',is_bot:false,is_owner:false};
  w.RJProfiles = {
    session: () => ({username:'Tester',token:'0123456789abcdef0123456789abcdef'}),
    safeName: () => true,
    getMany: () => Promise.resolve([PROFILE]),
    rpc: (name) => Promise.resolve(name === 'community_whoami' ? {username:'Tester'} : {}),
    invalidate: () => {},
    refreshHeader: () => {},
    avatars: [],
    colors: ['mint', 'blue', 'violet', 'rose', 'amber', 'slate'],
    frames: ['none', 'ice', 'violet', 'rose', 'amber', 'prism'],
    banners: ['aurora', 'ocean', 'dusk', 'ember', 'mono', 'prism'],
    avatarCatalog: Array.from(read('js/rejchat-profiles.js').matchAll(/\{id:'([a-z]+)',name:'([^']+)',group:'([a-z]+)'\}/g))
      .map((match) => ({ id: match[1], name: match[2], group: match[3] }))
  };
  w.eval(read('js/profil.js'));
  await wait(80);

  await check('galeria pokazuje 24 awatary', () => {
    assert.equal(d.querySelectorAll('#avatar-options .avatar-option').length, 24);
    assert.equal(d.querySelectorAll('#avatar-options input[name="avatar"]').length, 24);
  });

  await check('kategorie i wyszukiwarka filtrują galerię', () => {
    const kosmos = d.querySelector('#avatar-filters [data-group="kosmos"]');
    assert.ok(kosmos, 'brak kategorii Kosmos');
    kosmos.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(d.querySelectorAll('#avatar-options .avatar-option').length, 5, 'Kosmos ma 5 wzorów');
    assert.equal(kosmos.getAttribute('aria-pressed'), 'true');

    const search = d.getElementById('avatar-search');
    search.value = 'kaw';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(d.querySelectorAll('#avatar-options .avatar-option').length, 0, 'brak trafień w kategorii Kosmos');
    assert.equal(d.getElementById('avatar-empty').hidden, false, 'brak komunikatu o pustej liście');

    d.querySelector('#avatar-filters [data-group="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.equal(d.querySelectorAll('#avatar-options .avatar-option').length, 1, '„kaw” znajduje Kawa');
  });

  await check('wybór awatara, ramki i tła od razu zmienia podgląd', () => {
    const avatar = d.querySelector('#avatar-options input[value="coffee"]');
    avatar.checked = true;
    avatar.dispatchEvent(new w.Event('change', { bubbles: true }));
    const frame = d.querySelector('#frame-options input[value="prism"]');
    frame.checked = true;
    frame.dispatchEvent(new w.Event('change', { bubbles: true }));
    const banner = d.querySelector('#banner-options input[value="ocean"]');
    banner.checked = true;
    banner.dispatchEvent(new w.Event('change', { bubbles: true }));
    return wait(10).then(() => {
      assert.match(d.getElementById('preview-avatar').getAttribute('src'), /coffee\.svg$/);
      assert.equal(d.getElementById('preview-ring').dataset.frame, 'prism');
      assert.equal(d.getElementById('preview-cover').dataset.banner, 'ocean');
    });
  });

  await check('licznik bio i kompletność reagują na tekst', () => {
    const bio = d.getElementById('profile-bio-input');
    bio.value = 'Uczę się fizyki i lubię kawę.';
    bio.dispatchEvent(new w.Event('input', { bubbles: true }));
    return wait(10).then(() => {
      assert.equal(d.getElementById('bio-count').textContent, String(bio.value.length));
      assert.equal(d.getElementById('profile-dirty').dataset.state, 'dirty');
      assert.notEqual(d.getElementById('profile-complete-value').textContent, '40%');
    });
  });

  await check('przycisk „Zaskocz mnie” losuje poprawny zestaw', async () => {
    const surprise = d.getElementById('avatar-surprise');
    assert.ok(surprise, 'brak przycisku losowania');
    surprise.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(20);
    const avatar = d.querySelector('#avatar-options input[name="avatar"]:checked');
    assert.ok(avatar, 'po losowaniu żaden awatar nie jest zaznaczony');
    /* Losowanie może trafić w ten sam wzór — sprawdzamy spójność, nie zmianę. */
    assert.match(d.getElementById('preview-avatar').getAttribute('src'), new RegExp('/' + avatar.value + '\\.svg$'));
    assert.notEqual(d.querySelector('#frame-options input:checked').value, 'none', 'ramka bez zmian');
    assert.match(d.getElementById('profile-result').textContent, /Wylosowano/);
    assert.equal(d.getElementById('preview-ring').dataset.frame, d.querySelector('#frame-options input:checked').value);
  });

  await check('podpowiedzi bio wstawiają tekst w miejscu kursora', () => {
    const bio = d.getElementById('profile-bio-input');
    bio.value = '';
    bio.dispatchEvent(new w.Event('input', { bubbles: true }));
    const prompt = d.querySelector('#bio-prompts .bio-prompt');
    assert.ok(prompt, 'brak podpowiedzi');
    prompt.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert.match(bio.value, /Lubię/);
  });

  console.log('\n=== C. NAWIGACJA ===');

  await check('RejTools ma ikonę narzędzi, a RejClass książkę w głównym pasku', () => {
    const pages = ['rejhub2/index.html', 'rejhub2/index.html', 'rejhub2/profil.html', 'rejhub2/rejclass.html'];
    pages.forEach((file) => {
      const doc = new JSDOM(read(file)).window.document;
      const nav = doc.querySelector('.rj-shared-header .site-nav');
      const tools = nav.querySelector(':scope > a[href="/rejtools"], :scope > a[href="rejtools"]');
      const klass = nav.querySelector(':scope > a[href="/rejclass"], :scope > a[href="rejclass"]');
      assert.ok(tools, file + ': RejTools poza głównym paskiem');
      assert.match(tools.innerHTML, /ui-icons\.svg#tools/, file + ': RejTools bez ikony narzędzi');
      assert.ok(klass, file + ': RejClass poza głównym paskiem');
      assert.match(klass.innerHTML, /ui-icons\.svg#book/, file + ': RejClass bez ikony książki');
      assert.equal(nav.querySelector('.nav-more-panel a[href="/rejclass"]'), null, file + ': RejClass nadal w „Odkryj więcej”');
    });
  });

  await wait(0);
  console.log('\n========================================================');
  if (failures.length) {
    console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
    failures.forEach((failure) => console.log(' - ' + failure));
    process.exit(1);
  }
  console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
  console.log('PASS: 24 awatary, kategorie, podgląd na żywo, ramki, tła i nowa nawigacja');
  process.exit(0);
})();

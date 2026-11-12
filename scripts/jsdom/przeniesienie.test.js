/* Przeniesienie RejHub 2.0 na rejhub.vercel.app.
 *
 * Pilnuje trzech rzeczy, których nie widać w zwykłym teście HTML:
 *  1. stara domena nie serwuje już treści — każda strona jest przekierowaniem,
 *  2. przekierowanie zachowuje ścieżkę, parametry i kotwicę (link do czatu
 *     albo profilu prowadzi dokładnie tam, gdzie prowadził),
 *  3. nowa strona jest otwarta: brama serwerowa chroni tylko panel, a nie
 *     zwykłe podstrony.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/* Stare adresy → ścieżki na nowej stronie. */
const MAPA = {
  'index.html': '/',
  'admin.html': '/admin',
  'konto-demo.html': '/konto-demo',
  'licencja.html': '/licencja',
  'logowanie.html': '/logowanie',
  'partnerstwo.html': '/partnerstwo',
  'profil.html': '/profil',
  'rejchat.html': '/rejchat',
  'rejclass.html': '/rejclass',
  'rejfile.html': '/rejfile',
  'rejsejf.html': '/rejsejf',
  'rejtools.html': '/rejtools',
  'spolecznosc.html': '/rejchat',
  'uslugi.html': '/uslugi',
  'podroz/index.html': '/podroz',
  'portal/index.html': '/portal'
};

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  ✔ ' + name);
    pass++;
  } catch (error) {
    console.log('  ✘ ' + name + '  [' + error.message + ']');
    fail++;
  }
}

console.log('\n=== A. STARE ADRESY PRZEKIEROWUJĄ ===');
for (const [file, target] of Object.entries(MAPA)) {
  check(file + ' → ' + target, () => {
    const html = read(file);
    assert.ok(html.includes('data-przeniesienie="' + target + '"'), 'brak znacznika docelowej ścieżki');
    assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/rejhub\.vercel\.app/,
      'przekierowanie musi działać też bez JavaScriptu');
    assert.match(html, /<link rel="canonical" href="https:\/\/rejhub\.vercel\.app/);
    assert.match(html, /name="robots" content="noindex, follow"/, 'stare adresy nie mają być indeksowane');
    assert.match(html, /\/js\/przeniesienie\.js\?v=1/, 'brak wspólnego skryptu przeniesienia');
    assert.ok(html.includes('Wszystkie prawa zastrzeżone') || html.includes('wszystkie prawa zastrzeżone'),
      'stopka licencji');
  });
}

console.log('\n=== B. STARA TREŚĆ ZNIKNĘŁA ===');
check('strona główna nie ma już starego katalogu projektów', () => {
  const html = read('index.html');
  for (const marker of ['showcase-grid', 'projects-data.js', 'card-preview', 'data-repo']) {
    assert.ok(!html.includes(marker), 'zostało: ' + marker);
  }
});
check('stare podstrony nie mają własnych skryptów', () => {
  for (const file of Object.keys(MAPA)) {
    const html = read(file);
    assert.ok(!/\/js\/(?:app|rejchat|rejfile|admin-panel|liquid-nav)\.js/.test(html), file + ': został stary skrypt');
  }
});
check('404 przenosi na nową stronę i zna ścieżkę', () => {
  const html = read('404.html');
  assert.match(html, /data-przeniesienie="\/"/);
  assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/rejhub\.vercel\.app\//);
});

console.log('\n=== C. PRZEKIEROWANIE ZACHOWUJE ADRES ===');
function przeniesienie(pathname, search, hash, explicit) {
  const replaced = [];
  const body = { getAttribute: (name) => (name === 'data-przeniesienie' ? explicit : null) };
  const sandbox = {
    window: {
      location: {
        pathname: pathname,
        search: search || '',
        hash: hash || '',
        replace: (url) => replaced.push(url)
      }
    },
    document: { body: body, getElementById: () => null },
    console: console
  };
  vm.runInNewContext(read('js/przeniesienie.js'), sandbox);
  return replaced[0];
}
check('katalog bez końcówki zostaje bez zmian', () => {
  assert.equal(przeniesienie('/rejchat', '?pokoj=3', '#dol'), 'https://rejhub.vercel.app/rejchat?pokoj=3#dol');
});
check('końcówka .html znika', () => {
  assert.equal(przeniesienie('/rejfile.html', '', ''), 'https://rejhub.vercel.app/rejfile');
});
check('index.html prowadzi do katalogu głównego', () => {
  assert.equal(przeniesienie('/podroz/index.html', '', ''), 'https://rejhub.vercel.app/podroz');
});
check('parametry i kotwica nie giną', () => {
  assert.equal(przeniesienie('/profil', '?id=7', '#postep'), 'https://rejhub.vercel.app/profil?id=7#postep');
});
check('znacznik z HTML ma pierwszeństwo nad adresem', () => {
  assert.equal(przeniesienie('/cokolwiek.html', '', '', '/uslugi'), 'https://rejhub.vercel.app/uslugi');
});
check('adres nie prowadzi w pętlę (nowa domena, replace)', () => {
  const source = read('js/przeniesienie.js');
  assert.match(source, /NEW_ORIGIN = "https:\/\/rejhub\.vercel\.app"/);
  assert.match(source, /window\.location\.replace\(target\)/);
  assert.ok(!/location\.href\s*=/.test(source), 'href zostawiałby starą stronę w historii');
});

console.log('\n=== D. NOWA STRONA JEST OTWARTA ===');
const middleware = read('rejhub2/middleware.js');
check('brama nie blokuje zwykłych podstron', () => {
  assert.match(middleware, /const PRIVATE_PREFIXES = \["\/admin", "\/panel", "\/studio-source", "\/szklane-studio"\]/);
  for (const page of ['/rejchat', '/aplikacje', '/pobierz', '/uslugi', '/profil']) {
    assert.ok(!middleware.includes('"' + page + '"'), 'brama nadal wymienia ' + page);
  }
});
check('panel dalej wymaga sesji i wraca po zalogowaniu', () => {
  assert.match(middleware, /Response\.redirect\(login, 302\)/);
  assert.match(middleware, /searchParams\.set\("next", pathname\)/);
  assert.match(read('rejhub2/login.html'), /next = new URLSearchParams\(location\.search\)\.get\("next"\)/, 'logowanie musi wracać pod `next`');
});
check('strona „w budowie” zniknęła', () => {
  assert.ok(!fs.existsSync(path.join(root, 'rejhub2/w-budowie.html')), 'plik nadal istnieje');
  const vercel = JSON.parse(read('rejhub2/vercel.json'));
  const redirect = vercel.redirects.find((rule) => rule.source === '/w-budowie');
  assert.ok(redirect && redirect.destination === '/', 'stary adres musi prowadzić na stronę główną');
});
check('manifest i zasoby nowej strony istnieją', () => {
  for (const file of ['rejhub2/index.html', 'rejhub2/manifest.webmanifest', 'rejhub2/pobierz.html', 'rejhub2/assetlinks.json']) {
    assert.ok(fs.existsSync(path.join(root, file)), 'brakuje ' + file);
  }
});
check('nowa strona nie odsyła do starej domeny jako siebie', () => {
  const html = read('rejhub2/index.html');
  assert.ok(!html.includes('<link rel="canonical" href="https://rejson59.github.io/'), 'canonical wskazuje starą domenę');
  assert.ok(html.includes('<link rel="canonical" href="https://rejhub.vercel.app/">'));
});

console.log('\n=== E. WYSZUKIWARKI WIEDZĄ O NOWYM ADRESIE ===');
check('robots.txt starej domeny wskazuje nowy sitemap', () => {
  const robots = read('robots.txt');
  assert.match(robots, /Sitemap: https:\/\/rejhub\.vercel\.app\/sitemap\.xml/);
  /* Blokada `Disallow: /` wolno dotyczyć tylko botów trenujących AI —
     zwykłe roboty muszą zobaczyć przekierowanie 301. */
  const grupy = robots.split(/\n\s*\n/).map((grupa) => grupa.trim()).filter(Boolean);
  const ogolna = grupy.find((grupa) => /^User-agent: \*$/m.test(grupa));
  assert.ok(ogolna, 'brak grupy dla wszystkich robotów');
  assert.ok(!/^Disallow: \/$/m.test(ogolna), 'grupa ogólna nie może blokować całej domeny');
});
check('sitemap starej domeny nie reklamuje usuniętych stron', () => {
  const sitemap = read('sitemap.xml');
  for (const page of ['/rejchat', '/profil', '/admin', '/licencja']) {
    assert.ok(!sitemap.includes('<loc>https://rejson59.github.io' + page + '</loc>'), 'zostało: ' + page);
  }
  assert.ok(sitemap.includes('https://rejson59.github.io/OffChat/'), 'samodzielne projekty zostają');
});
check('nowa strona ma własny sitemap z podstronami', () => {
  const sitemap = read('rejhub2/sitemap.xml');
  for (const page of ['/aplikacje', '/rejchat', '/pobierz', '/licencja']) {
    assert.ok(sitemap.includes('https://rejhub.vercel.app' + page + '</loc>'), 'brakuje ' + page);
  }
  assert.match(read('rejhub2/robots.txt'), /Sitemap: https:\/\/rejhub\.vercel\.app\/sitemap\.xml/);
});

console.log('\n' + (fail ? 'WYNIK: ' + pass + '/' + (pass + fail) + ' ✘' : 'WYNIK: ' + pass + '/' + pass + ' ✔'));
if (fail) process.exit(1);
console.log('PASS: stare adresy przekierowują, nowa strona jest otwarta, wyszukiwarki znają nowy adres');

/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Jeden topbar w całym RejHubie 2.0.
 *
 * Sprawdza dwie rzeczy naraz:
 *   1) znaczniki są identyczne na każdej podstronie (jeden topbar, nie piętnaście),
 *   2) zachowanie jest wspólne — motyw, menu, Escape, klik poza, bieżąca strona —
 *      i nie podwaja się, gdy strona ma własną obsługę.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const PAGES = [
  '404.html', 'admin.html', 'aplikacje.html', 'index.html', 'konto-demo.html',
  'licencja.html', 'logowanie.html', 'panel.html', 'partnerstwo.html', 'profil.html',
  'rejasystent.html', 'rejchat.html', 'rejclass.html', 'rejfile.html', 'rejgames.html',
  'rejmeme.html', 'rejmusic.html', 'rejplanner.html', 'rejsejf.html', 'rejtools.html',
  'uslugi.html', 'rejchat/regulamin.html'
];

const HEADER_CSS = [
  '/css/shared-topbar.css',
  '/css/shared-topbar-nojs.css',
  '/css/rejchat-notifications.css',
  '/css/glass-update.css',
  '/hub/glass2.css',
  '/css/topbar-split.css'
];

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log('  ✔ ' + name); }
  catch (error) { failures.push(name + ' — ' + error.message); console.log('  ✘ ' + name + '  [' + error.message + ']'); }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function headerOf(html) {
  const match = /<header class="site-header[^"]*"[\s\S]*?<\/header>/.exec(html);
  return match ? match[0] : null;
}

(async function main() {
  console.log('\n=== A. JEDEN TOPBAR NA KAŻDEJ STRONIE ===');
  const headers = PAGES.map((file) => ({ file, header: headerOf(read('rejhub2/' + file)) }));

  check('każda podstrona ma topbar', () => {
    headers.forEach(({ file, header }) => assert.ok(header, file + ': brak topbara'));
  });

  check('wszystkie topbary są identyczne co do znaku', () => {
    const unique = new Set(headers.map((entry) => entry.header));
    assert.equal(unique.size, 1, 'różne topbary w: ' + headers
      .filter((entry, index, list) => list.findIndex((other) => other.header === entry.header) !== index)
      .map((entry) => entry.file).join(', '));
  });

  check('topbar nie ma już ustawień — są tylko w wyspie', () => {
    headers.forEach(({ file, header }) => {
      assert.ok(!header.includes('theme-toggle'), file + ': został przycisk ustawień');
      assert.ok(!header.includes('Ustawienia'), file + ': został opis ustawień');
      assert.ok(!/icon-gear/.test(header), file + ': zostało koło zębate');
    });
  });

  check('strona główna nie zwęża topbaru klasą .container', () => {
    headers.forEach(({ file, header }) => {
      assert.ok(!/class="container[^"]*rj-shared-inner/.test(header), file + ': topbar w węższym kontenerze');
    });
  });

  check('adresy w topbarze są bezwzględne (działają z każdej podstrony)', () => {
    const header = headers[0].header;
    assert.ok(header.includes('href="/rejfile"'));
    assert.ok(header.includes('href="/rejchat"'));
    assert.ok(!/href="rejfile"/.test(header), 'znalazł się adres względny');
  });

  check('topbar ma zawsze ten sam zestaw elementów', () => {
    const header = headers[0].header;
    ['brand', 'rj-home-link', 'mobile-account', 'site-nav', 'nav-more', 'menu-toggle']
      .forEach((name) => assert.ok(header.includes(name), 'brak: ' + name));
    assert.ok(header.includes('data-shared-menu'), 'menu bez wspólnego znacznika');
  });

  check('nie ma resztek starych id topbaru', () => {
    PAGES.forEach((file) => {
      const header = headerOf(read('rejhub2/' + file));
      ['shared-nav', 'services-nav', 'partner-nav', 'account-nav', 'liquid-menu-toggle', 'shared-menu', 'shared-theme']
        .forEach((id) => assert.ok(!header.includes('id="' + id + '"'), file + ': stary id ' + id));
    });
  });

  check('każda strona ładuje ten sam arkusz i skrypt topbaru', () => {
    PAGES.forEach((file) => {
      const html = read('rejhub2/' + file);
      HEADER_CSS.forEach((href) => {
        assert.ok(html.includes('href="' + href), file + ': brak ' + href);
      });
      assert.match(html, /src="\/js\/shared-topbar\.js\?v=\d+"/, file + ': brak wspólnego skryptu');
      assert.match(html, /src="\/js\/topbar-split\.js\?v=\d+"/, file + ': brak scalania po przewinięciu');
    });
  });

  check('strona główna też ma wspólny skrypt topbaru', () => {
    assert.match(read('rejhub2/index.html'), /shared-topbar\.js\?v=\d+/);
  });

  check('stary topbar z /panel zniknął (nie ma dwóch różnych pasków)', () => {
    const panel = read('rejhub2/panel.html');
    assert.ok(!/<header class="topbar"/.test(panel), 'został stary pasek');
    assert.ok(!/class="logout"/.test(panel), 'został martwy przycisk wylogowania');
  });

  console.log('\n=== B. JEDNO ZACHOWANIE ===');
  const HEADER = headers[0].header;
  let AJS = read('js/shared-topbar.js');

  check('wspólny skrypt nie buduje panelu ustawień', () => {
    assert.ok(!/rj-settings-panel/.test(AJS), 'został kod panelu ustawień');
    assert.ok(!/data-rj-setting/.test(AJS), 'zostały wiersze ustawień');
    assert.ok(!/theme-toggle/.test(AJS), 'skrypt nadal szuka koła zębatego');
    assert.match(AJS, /ustawień wyglądu NIE ma już w topbarze/i, 'brak wyjaśnienia w komentarzu');
  });

  async function makePage(html, url) {
    const dom = new JSDOM(html, { url: url || 'https://rejhub.vercel.app/rejchat', runScripts: 'outside-only' });
    dom.window.eval(AJS);
    await new Promise((resolve) => {
      if (dom.window.document.readyState === 'complete') resolve();
      else dom.window.document.addEventListener('DOMContentLoaded', resolve);
    });
    await wait(10);
    return dom;
  }

  const SHELL = '<!doctype html><html lang="pl" data-theme="dark"><body>' + HEADER + '<main>test</main></body></html>';

  {
    const dom = await makePage(SHELL);
    const w = dom.window;
    const d = w.document;

    const menu = d.getElementById('menu-toggle');
    const nav = d.getElementById('site-nav');
    menu.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('menu otwiera się jednym kliknięciem', () => {
      assert.ok(nav.classList.contains('is-open'));
      assert.equal(menu.getAttribute('aria-expanded'), 'true');
      assert.equal(menu.getAttribute('aria-label'), 'Zamknij menu');
    });
    menu.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('to samo kliknięcie zamyka menu', () => {
      assert.ok(!nav.classList.contains('is-open'));
      assert.equal(menu.getAttribute('aria-expanded'), 'false');
    });

    menu.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    check('Escape zamyka menu', () => assert.ok(!nav.classList.contains('is-open')));

    menu.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    d.querySelector('main').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('klik poza menu je zamyka', () => assert.ok(!nav.classList.contains('is-open')));

    check('bieżąca podstrona jest zaznaczona', () => {
      const active = d.querySelector('.site-nav a[aria-current="page"]');
      assert.ok(active, 'brak aria-current');
      assert.match(active.getAttribute('href'), /\/rejchat$/);
    });

    const home = await makePage(SHELL, 'https://rejhub.vercel.app/');
    check('strona główna podświetla ikonę domu', () => {
      const marked = home.window.document.querySelector('.rj-home-link[aria-current="page"]');
      assert.ok(marked, 'brak podświetlenia strony głównej');
    });

    const guest = await makePage(SHELL, 'https://rejhub.vercel.app/rejfile');
    check('gość nie widzi „Szklanego studia” w topbarze', () => {
      const link = guest.window.document.querySelector('[data-admin-only]');
      assert.ok(link, 'brak oznaczonego linku studia');
      assert.equal(link.getAttribute('aria-hidden'), 'true');
      assert.ok(!guest.window.document.documentElement.classList.contains('rj-admin-session'));
    });

    const admin = await makePage(SHELL, 'https://rejhub.vercel.app/rejfile');
    admin.window.document.cookie = 'rejhub_admin_hint=1; path=/';
    admin.window.RejTopbarPaint();
    check('administrator widzi „Szklane studio” w topbarze', () => {
      const link = admin.window.document.querySelector('[data-admin-only]');
      assert.ok(admin.window.document.documentElement.classList.contains('rj-admin-session'));
      assert.equal(link.hasAttribute('aria-hidden'), false);
    });

    check('panel „Więcej” da się zamknąć kliknięciem poza', () => {
      const more = d.querySelector('.nav-more');
      more.open = true;
      d.querySelector('main').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      assert.equal(more.open, false);
    });
  }

  console.log('\n=== C. SPRZĄTANIE ===');
  check('wspólny skrypt nie kasuje API scalania topbaru', () => {
    assert.ok(!/window\.RejTopbar\s*=\s*\{/.test(AJS), 'nadpisuje RejTopbar z topbar-split.js');
  });
  check('wszystkie strony mają tę samą wersję arkusza szkła', () => {
    const versions = new Set(PAGES.map((file) => (/glass2\.css\?v=(\d+)/.exec(read('rejhub2/' + file)) || [])[1]));
    assert.equal(versions.size, 1, 'różne wersje: ' + Array.from(versions).join(', '));
  });
  check('arkusz topbaru jest ładowany przed arkuszem szkła', () => {
    PAGES.forEach((file) => {
      const html = read('rejhub2/' + file);
      assert.ok(html.indexOf('/css/shared-topbar.css') < html.indexOf('/hub/glass2.css'), file + ': zła kolejność arkuszy');
    });
  });

  /* Sam HTML to za mało: pasek wygląda tak samo tylko wtedy, gdy każda strona
     ładuje ten sam zestaw arkuszy w tej samej kolejności. Wcześniej sześć stron
     aplikacji nie miało glass-update.css (brak --rju-vessel = pasek bez tła)
     i liquid.css (brak wspólnej warstwy szkła). */
  const SHELL_CSS = [
    '/css/style.css',
    '/css/liquid.css',
    '/css/responsive.css',
    '/css/side-ads.css',
    '/css/mobile-ads.css',
    '/css/shared-topbar.css',
    '/css/shared-topbar-nojs.css',
    '/css/rejchat-notifications.css',
    '/css/glass-update.css',
    '/hub/glass2.css',
    '/hub/loader.css',
    '/css/text-filter.css',
    '/css/push.css',
    '/css/topbar-split.css',
    '/css/page-reveal.css',
    '/hub/island.css',
    '/css/scrollbar.css',
    '/css/glass-last.css'
  ];

  check('każda strona ładuje komplet arkuszy paska (w tej samej kolejności)', () => {
    const sequences = PAGES.map((file) => {
      const html = read('rejhub2/' + file);
      const hrefs = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)]
        .map((match) => /href="([^"]+)"/.exec(match[0])[1].split('?')[0]);
      const shell = hrefs.filter((href) => SHELL_CSS.indexOf(href) >= 0);
      const missing = SHELL_CSS.filter((href) => shell.indexOf(href) < 0);
      assert.deepEqual(missing, [], file + ': brak arkuszy ' + missing.join(', '));
      const duplicated = shell.filter((href, index) => shell.indexOf(href) !== index);
      assert.deepEqual(duplicated, [], file + ': zdublowane arkusze ' + duplicated.join(', '));
      return shell.join('|');
    });
    const unique = new Set(sequences);
    assert.equal(unique.size, 1, 'różne zestawy arkuszy paska na podstronach');
  });

  await wait(0);
  console.log('\n========================================================');
  if (failures.length) {
    console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
    failures.forEach((failure) => console.log(' - ' + failure));
    process.exit(1);
  }
  console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
  console.log('PASS: jeden identyczny topbar na 22 podstronach, jedno wspólne zachowanie');
  process.exit(0);
})();

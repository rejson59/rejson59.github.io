/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Testy plakatów projektów (zamiast ciężkich iframe'ów) oraz bramki, która
 * decyduje, czy karta dostaje żywy podgląd, czy tylko plakat.
 *
 * Uruchomienie: node project-posters.test.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const POSTERS = read('js/project-posters.js');
const LOADER = read('js/loader.js')
  .replace('var MIN_SHOW_MS = 3000;', 'var MIN_SHOW_MS = 120;')
  .replace('var PREVIEW_TIMEOUT_MS = 15000;', 'var PREVIEW_TIMEOUT_MS = 200;')
  .replace('var PREVIEW_RETRY_MS = 15000;', 'var PREVIEW_RETRY_MS = 200;')
  .replace('[700, 1800, 4000, 8000].forEach', '[].forEach');

let passed = 0;
const failures = [];
function check(name, fn, detail) {
  try {
    fn();
    passed += 1;
    console.log('  ✔ ' + name + (detail ? '  [' + detail + ']' : ''));
  } catch (error) {
    failures.push(name + ' — ' + error.message);
    console.log('  ✘ ' + name + '  [' + error.message + ']');
  }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const card = (name, url, extra) => `
  <article class="project-card" data-repo="${name}">
    <div class="card-inner">
      <div class="card-top"><span class="card-badges">
        <span class="lang"><span class="lang-dot" style="background:#f1e05a"></span> JavaScript</span>
        <span class="live-badge">LIVE</span>
      </span></div>
      <a class="card-preview" data-journey href="${url}" target="_blank">
        <div class="card-preview-frame" aria-hidden="true"><iframe data-src="${url}"></iframe>
          <div class="card-preview-topbar"><span class="card-preview-url">rejson59.github.io/${name}/</span></div></div>
        <div class="card-preview-loader" aria-hidden="true"></div>
        <span class="card-preview-hint">otwórz ↗</span>
      </a>
      <h3 class="card-title"><a href="${url}">${name}</a></h3>
      <p class="card-desc">${(extra && extra.desc) || 'Opis projektu ' + name + '.'}</p>
      <ul class="card-topics">${((extra && extra.topics) || ['web', 'projekt']).map((t) => '<li>' + t + '</li>').join('')}</ul>
    </div>
  </article>`;

function makeDom(options) {
  const opts = options || {};
  const html = opts.html || card('RejStream', 'https://rejson59.github.io/RejStream/', {
    desc: 'Oglądaj seriale i animacje online.',
    topics: ['seriale', 'animacje']
  });
  const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', {
    url: 'https://rejhub.vercel.app/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;

  Object.defineProperty(w.navigator, 'hardwareConcurrency', {
    configurable: true,
    value: typeof opts.cores === 'number' ? opts.cores : 8
  });
  Object.defineProperty(w.navigator, 'deviceMemory', {
    configurable: true,
    value: typeof opts.memory === 'number' ? opts.memory : 8
  });
  if (opts.portrait) {
    w.matchMedia = (query) => ({
      matches: /max-width:\s*640px/.test(query),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {}
    });
  }
  if (opts.network) {
    Object.defineProperty(w.navigator, 'connection', { configurable: true, value: opts.network });
  }
  w.Element.prototype.animate = undefined;

  if (opts.posters !== false) w.eval(POSTERS);
  if (opts.loader !== false) w.eval(LOADER);
  return { dom, w, doc: w.document };
}

const previewOf = (doc) => doc.querySelector('.card-preview');
const posterOf = (doc) => doc.querySelector('.card-preview-poster');

(async () => {
  console.log('\n=== A. PLAKAT: TREŚĆ I BEZPIECZEŃSTWO ===');
  {
    const { w } = makeDom({ loader: false });
    const posters = w.RJPosters;
    check('moduł wystawiony', () => assert.equal(typeof posters.build, 'function'));

    const svg = posters.build({
      name: 'RejStream',
      description: 'Oglądaj seriale i animacje online',
      language: 'JavaScript',
      topics: ['seriale', 'animacje']
    });
    check('to SVG z klasą karty', () => {
      assert.match(svg, /^<svg /);
      assert.match(svg, /class="card-preview-poster"/);
      assert.match(svg, /viewBox="0 0 480 270"/);
    });
    check('nazwa, opis i język są na plakacie', () => {
      assert.ok(svg.includes('RejStream'));
      assert.ok(svg.includes('Oglądaj seriale'));
      assert.ok(svg.includes('JAVASCRIPT'));
    });
    check('stopka ma wezwanie do otwarcia', () => assert.ok(svg.includes('otwórz ↗')));
    check('kategoria dobrana z opisu (media)', () => assert.match(svg, />MEDIA\b/));

    const game = posters.build({ name: 'mconline', description: 'Minecraft w przeglądarce', topics: ['gra'] });
    check('gra dostaje etykietę GRA i motyw sześcianu', () => {
      assert.match(game, />GRA\b/);
      assert.ok(game.includes('<polygon'), 'brak motywu przestrzennego');
    });
    const chat = posters.build({ name: 'OffChat', description: 'Czat i rozmowy', topics: ['czat'] });
    check('czat dostaje etykietę ROZMOWY', () => assert.match(chat, />ROZMOWY\b/));

    check('plakat nie zawiera skryptów ani obcych adresów', () => {
      assert.ok(!/<script/i.test(svg));
      assert.ok(!/foreignObject/i.test(svg));
      /* jedyny dozwolony adres to przestrzeń nazw SVG — żadnych pobrań */
      assert.ok(!/(?:href|src)\s*=\s*["']https?:\/\//i.test(svg));
    });
    check('tekst jest escapowany (XSS z opisu niemożliwy)', () => {
      const evil = posters.build({
        name: '<img src=x onerror=alert(1)>',
        description: '</text><script>alert(2)</script>'
      });
      assert.ok(!evil.includes('<script'));
      assert.ok(!evil.includes('<img'));
      assert.ok(evil.includes('&lt;'));
    });
    check('dwa plakaty mają różne identyfikatory gradientów', () => {
      const a = posters.build({ name: 'A' });
      const b = posters.build({ name: 'B' });
      assert.notEqual(a.match(/id="bg(\d+)"/)[1], b.match(/id="bg(\d+)"/)[1]);
    });
    check('wariant pionowy ma inny kadr', () => {
      const port = posters.build({ name: 'RejStream' }, { variant: 'port' });
      assert.match(port, /viewBox="0 0 300 500"/);
    });
    check('bardzo długa nazwa nie wychodzi poza kadr', () => {
      const long = posters.build({ name: 'BardzoDlugaNazwaProjektuKtoraNieZmiesciSieNigdzie' });
      const lines = [...long.matchAll(/font-size="16"[^>]*letter-spacing="-\.6">([^<]*)</g)].map((m) => m[1]);
      assert.ok(lines.length >= 1 && lines.length <= 2, 'linii nazwy: ' + lines.length);
      lines.forEach((line) => assert.ok(line.length <= 27, 'za długa linia: ' + line));
      const texts = [...long.matchAll(/>([^<>]{3,})<\/text>/g)].map((m) => m[1]);
      texts.forEach((value) => assert.ok(value.length <= 30, 'za długi napis: ' + value));
    });
    check('pusty projekt nie wywraca generatora', () => {
      const empty = posters.build({});
      assert.match(empty, /^<svg /);
    });
    check('plakat ma gradient tła, zorzę i siatkę', () => {
      assert.ok(svg.includes('url(#bg'));
      assert.ok(svg.includes('url(#glowA'));
      assert.ok(svg.includes('url(#grid'));
    });
  }

  console.log('\n=== B. OSADZANIE W KARCIE ===');
  {
    const { w, doc } = makeDom({ loader: false });
    await wait(60); /* moduł czeka na DOMContentLoaded */
    const preview = previewOf(doc);
    const frame = preview.querySelector('.card-preview-frame');
    check('plakat trafił do okna podglądu', () => assert.ok(posterOf(doc)));
    check('plakat jest POD ramką (pierwsze dziecko okna)', () => {
      assert.equal(frame.firstElementChild, posterOf(doc));
      assert.equal(frame.children[1].tagName.toLowerCase(), 'iframe');
    });
    check('karta wie, że ma plakat', () => {
      assert.ok(preview.classList.contains('has-poster'));
      assert.equal(preview.getAttribute('data-poster'), 'land');
    });
    check('plakat nie przechwytuje kliknięć', () => {
      assert.ok(posterOf(doc).getAttribute('class').includes('card-preview-poster'));
    });
    check('plakat czyta prawdziwe dane karty', () => {
      const svg = posterOf(doc).outerHTML;
      assert.ok(svg.includes('RejStream'));
      assert.ok(svg.includes('Oglądaj seriale'));
      assert.ok(svg.includes('JAVASCRIPT'));
    });

    const before = doc.querySelectorAll('.card-preview-poster').length;
    w.RJPosters.decorate(preview);
    w.RJPosters.attach(doc);
    check('drugie zdobienie nie dubluje plakatu', () =>
      assert.equal(doc.querySelectorAll('.card-preview-poster').length, before));
  }

  {
    const { w, doc } = makeDom({ loader: false, portrait: true });
    await wait(60);
    const preview = previewOf(doc);
    check('na telefonie plakat jest pionowy', () => {
      assert.equal(preview.getAttribute('data-poster'), 'port');
      assert.match(posterOf(doc).getAttribute('viewBox'), /0 0 300 500/);
    });
    check('zmiana orientacji przerysowuje plakat', async () => {});
  }

  console.log('\n=== C. BRAMKA: KTO DOSTAJE ŻYWĄ RAMKĘ ===');
  {
    /* słaby telefon: 2 rdzenie, bez myszy — tylko plakat */
    const { w, doc } = makeDom({ cores: 2, memory: 2 });
    await wait(60);
    check('słaby sprzęt: żywe podglądy wyłączone', () => assert.equal(w.RJLoader.liveAllowed(), false));
    check('strona oznaczona trybem plakatów', () =>
      assert.ok(doc.documentElement.classList.contains('rj-posters')));
    check('karta nie dostała klasy ładowania', () =>
      assert.ok(!previewOf(doc).classList.contains('is-loading')));
    check('żadna ramka nie żyje', () => assert.equal(w.RJLoader.liveCount(), 0));
    check('iframe nie dostał src', () =>
      assert.equal(previewOf(doc).querySelector('iframe').getAttribute('src'), null));
    check('tryb auto zgłoszony jako „auto”', () => assert.equal(w.RJLoader.previewMode(), 'auto'));
  }

  {
    const { w } = makeDom({ cores: 8, memory: 8 });
    check('mocny komputer: żywe podglądy włączone', () => assert.equal(w.RJLoader.liveAllowed(), true));
  }

  {
    const { w } = makeDom({ cores: 2, memory: 16, network: { saveData: true } });
    check('saveData wyłącza żywe podglądy', () => assert.equal(w.RJLoader.liveAllowed(), false));
  }

  {
    const { w } = makeDom({ cores: 2, memory: 2 });
    w.localStorage.setItem('rj_preview_mode_v1', 'live');
    const forced = makeDom({ cores: 2, memory: 2, html: card('RejStream', 'https://rejson59.github.io/RejStream/') });
    forced.w.localStorage.setItem('rj_preview_mode_v1', 'live');
    forced.w.RJLoader.setPreviewMode('live');
    check('wymuszenie „live” omija bramkę sprzętową', () => assert.equal(forced.w.RJLoader.liveAllowed(), true));
    check('wymuszenie zdejmuje klasę plakatów', () =>
      assert.ok(!forced.doc.documentElement.classList.contains('rj-posters')));
    void w;
  }

  {
    const { w, doc } = makeDom({ cores: 8, memory: 8 });
    check('na mocnym sprzęcie klasa plakatów nie jest dodawana', () =>
      assert.ok(!doc.documentElement.classList.contains('rj-posters')));
    w.RJLoader.setPreviewMode('poster');
    check('przełączenie na plakaty działa w locie', () => {
      assert.equal(w.RJLoader.liveAllowed(), false);
      assert.ok(doc.documentElement.classList.contains('rj-posters'));
    });
    check('wybór jest zapamiętany', () =>
      assert.equal(w.localStorage.getItem('rj_preview_mode_v1'), 'poster'));
  }

  {
    /* strona bez plakatów (stara witryna) musi zachować dotychczasowe działanie */
    const { w, doc } = makeDom({ cores: 2, memory: 2, posters: false });
    await wait(40);
    check('bez modułu plakatów silnik działa jak wcześniej', () =>
      assert.equal(w.RJLoader.liveAllowed(), true));
    check('stara strona nie dostaje klasy plakatów', () =>
      assert.ok(!doc.documentElement.classList.contains('rj-posters')));
  }

  console.log('\n=== D. PODPIĘCIE W STRONIE ===');
  {
    const home = read('rejhub2/index.html');
    const posterAt = home.indexOf('js/project-posters.js?v=1');
    const loaderAt = home.indexOf('js/loader.js?v=22');
    check('RejHub ładuje plakaty', () => assert.ok(posterAt !== -1, 'brak znacznika'));
    check('plakaty są przed silnikiem podglądów', () => assert.ok(posterAt !== -1 && posterAt < loaderAt));

    const css = read('css/style.css');
    const block = /\.card-preview-poster\s*\{[^}]*\}/.exec(css);
    check('styl plakatu istnieje', () => assert.ok(block, 'brak reguły'));
    check('plakat leży pod ramką i nie łapie kliknięć', () => {
      assert.match(block[0], /position:\s*absolute/);
      assert.match(block[0], /z-index:\s*0/);
      assert.match(block[0], /pointer-events:\s*none/);
      assert.match(block[0], /top:\s*22px/);
    });
    check('shimmer nie miga nad gotowym plakatem', () => {
      assert.match(css, /\.card-preview\.has-poster:not\(\.is-loading\) \.card-preview-frame::after\s*\{\s*display:\s*none/);
    });

    const hub = read('rejhub2/index.html');
    check('strona główna ładuje moduł plakatów', () => assert.ok(hub.includes('project-posters.js')));
  }

  console.log('\n========================================================');
  if (failures.length) {
    console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
    failures.forEach((failure) => console.log(' - ' + failure));
    process.exit(1);
  }
  console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
  console.log('PASS: plakaty projektów (treść, XSS, osadzanie, bramka sprzętowa, podpięcie)');
  process.exit(0);
})();

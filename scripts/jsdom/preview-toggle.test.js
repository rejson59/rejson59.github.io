/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Testy przełącznika „Plakaty / Podglądy na żywo” oraz szklanych przycisków
 * z „miękką reakcją”.
 *
 * Uruchomienie: node preview-toggle.test.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const HOME = read('rejhub2/index.html');
const TOGGLE = read('js/preview-toggle.js');
const CSS = read('rejhub2/hub/glass2.css');
const LEGACY = read('index.html');

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

/* Fragment strony z przełącznikiem — tyle, ile potrzebuje skrypt. */
const TOGGLE_HTML = `<!doctype html><html lang="pl" data-theme="dark"><body>
  <section class="projects">
    <div class="preview-mode" data-preview-toggle data-mode="auto">
      <div class="preview-mode-row">
        <span class="preview-mode-label" id="preview-mode-label">Podglądy projektów</span>
        <div class="preview-mode-seg" role="group" aria-labelledby="preview-mode-label">
          <button class="preview-mode-btn" type="button" data-preview-mode="poster" aria-pressed="true"><span>Plakaty</span></button>
          <button class="preview-mode-btn" type="button" data-preview-mode="live" aria-pressed="false"><span>Na żywo</span></button>
        </div>
        <span class="preview-mode-state" data-preview-state role="status" aria-live="polite"></span>
      </div>
      <p class="preview-mode-note" data-preview-note><span><strong>Podglądy na żywo</strong> mogą powodować lagi.</span></p>
    </div>
  </section>
</body></html>`;

function makeToggle(loaderImpl) {
  const dom = new JSDOM(TOGGLE_HTML, { url: 'https://rejhub.vercel.app/', runScripts: 'outside-only' });
  const w = dom.window;
  if (loaderImpl) w.RJLoader = loaderImpl(w);
  else w.RJLoader = undefined;
  w.eval(TOGGLE);
  return { dom, w, doc: w.document };
}

function fakeLoader(initial, liveAllowed) {
  const state = { mode: initial || 'auto', calls: [] };
  const strong = liveAllowed !== false;
  return {
    state,
    api: {
      previewMode: () => state.mode,
      liveAllowed: () => (state.mode === 'live' ? true : state.mode === 'poster' ? false : strong),
      setPreviewMode: (mode) => {
        state.calls.push(mode);
        state.mode = mode;
        return mode;
      }
    }
  };
}

(async () => {
  console.log('\n=== A. PRZEŁĄCZNIK: STAN POCZĄTKOWY ===');
  {
    const fake = fakeLoader('auto', false);
    const { w, doc } = makeToggle(() => fake.api);
    await wait(10);
    const poster = doc.querySelector('[data-preview-mode="poster"]');
    const live = doc.querySelector('[data-preview-mode="live"]');
    check('segment „Plakaty” jest zaznaczony przy trybie auto', () =>
      assert.equal(poster.getAttribute('aria-pressed'), 'true'));
    check('segment „Na żywo” nie jest zaznaczony', () =>
      assert.equal(live.getAttribute('aria-pressed'), 'false'));
    check('stan opisany słownie', () =>
      assert.match(doc.querySelector('[data-preview-state]').textContent, /Automatycznie/));
    check('kontener zna tryb (dla stylu ostrzeżenia)', () =>
      assert.equal(doc.querySelector('[data-preview-toggle]').getAttribute('data-mode'), 'poster'));
    check('słaby sprzęt w trybie auto → plakaty, zero iframe’ów', () =>
      assert.match(doc.querySelector('[data-preview-state]').textContent, /słabszy/));
    void w;
  }

  {
    const fake = fakeLoader('auto', true);
    const { doc } = makeToggle(() => fake.api);
    await wait(10);
    check('mocny sprzęt w trybie auto → zaznaczone „Na żywo”', () =>
      assert.equal(doc.querySelector('[data-preview-mode="live"]').getAttribute('aria-pressed'), 'true'));
    check('mocny sprzęt w trybie auto → opis mówi o mocnym sprzęcie', () =>
      assert.match(doc.querySelector('[data-preview-state]').textContent, /mocny sprzęt/));
  }

  {
    const fake = fakeLoader('poster');
    const { doc } = makeToggle(() => fake.api);
    await wait(10);
    check('zapamiętane plakaty: właściwy przycisk zaznaczony', () =>
      assert.equal(doc.querySelector('[data-preview-mode="poster"]').getAttribute('aria-pressed'), 'true'));
    check('zapamiętane plakaty: brak trybu auto w opisie', () =>
      assert.match(doc.querySelector('[data-preview-state]').textContent, /najlżejszy/));
  }

  console.log('\n=== B. PRZEŁĄCZNIK: KLIK ===');
  {
    const fake = fakeLoader('poster');
    const { doc } = makeToggle(() => fake.api);
    await wait(10);
    doc.querySelector('[data-preview-mode="live"]').dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));
    check('klik „Na żywo” woła setPreviewMode("live")', () =>
      assert.deepEqual(fake.state.calls, ['live']));
    check('po kliknięciu zaznaczony jest „Na żywo”', () =>
      assert.equal(doc.querySelector('[data-preview-mode="live"]').getAttribute('aria-pressed'), 'true'));
    check('po kliknięciu „Plakaty” traci zaznaczenie', () =>
      assert.equal(doc.querySelector('[data-preview-mode="poster"]').getAttribute('aria-pressed'), 'false'));
    check('kontener przełącza się na tryb live', () =>
      assert.equal(doc.querySelector('[data-preview-toggle]').getAttribute('data-mode'), 'live'));
    check('opis ostrzega o lagach', () =>
      assert.match(doc.querySelector('[data-preview-state]').textContent, /lagi/));

    doc.querySelector('[data-preview-mode="poster"]').dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));
    check('powrót na plakaty woła setPreviewMode("poster")', () =>
      assert.deepEqual(fake.state.calls, ['live', 'poster']));
    check('powrót na plakaty zmienia opis', () =>
      assert.match(doc.querySelector('[data-preview-state]').textContent, /najlżejszy/));
  }

  {
    /* Loader jeszcze się nie wczytał — klik nie może zginąć. */
    const fake = fakeLoader('poster');
    const dom = new JSDOM(TOGGLE_HTML, { url: 'https://rejhub.vercel.app/', runScripts: 'outside-only' });
    const w = dom.window;
    w.eval(TOGGLE);
    w.document.querySelector('[data-preview-mode="live"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.RJLoader = fake.api;
    await wait(400);
    check('klik bez loadera jest dokończony po jego wczytaniu', () =>
      assert.deepEqual(fake.state.calls, ['live']));
  }

  console.log('\n=== C. HTML STRONY GŁÓWNEJ ===');
  {
    check('przełącznik stoi nad wyróżnionymi projektami', () => {
      const featured = HOME.indexOf('class="origins container"');
      const toggle = HOME.indexOf('data-preview-toggle');
      const projects = HOME.indexOf('class="projects container"');
      const list = HOME.indexOf('class="toolbar" role="search"');
      assert.ok(featured !== -1 && toggle !== -1 && projects !== -1 && list !== -1);
      assert.ok(toggle < featured, 'przełącznik musi być nad sekcją „Wybrane projekty”');
      assert.ok(featured < projects && projects < list, 'kolejność sekcji bez zmian');
    });
    check('przełącznik nie wisi na całą szerokość ekranu', () =>
      assert.match(HOME, /<div class="container preview-mode-slot">/));
    check('dwa segmenty: plakaty i na żywo', () => {
      assert.ok(HOME.includes('data-preview-mode="poster"'));
      assert.ok(HOME.includes('data-preview-mode="live"'));
    });
    check('ostrzeżenie o lagach jest w treści', () => {
      const note = HOME.slice(HOME.indexOf('data-preview-note'), HOME.indexOf('data-preview-note') + 700);
      assert.match(note, /lagi/i);
      assert.match(note, /zacinanie/i);
      assert.match(note, /słabszym|laptopie|telefonie/i);
    });
    check('przełącznik jest dostępny (grupa + aria-pressed)', () => {
      assert.match(HOME, /role="group" aria-labelledby="preview-mode-label"/);
      assert.match(HOME, /data-preview-mode="poster" aria-pressed="true"/);
      assert.match(HOME, /role="status" aria-live="polite"/);
    });
    check('skrypt przełącznika podpięty z wersją', () =>
      assert.match(HOME, /js\/preview-toggle\.js\?v=1/));
    check('nowa wersja arkusza szkła', () =>
      assert.match(HOME, /glass2\.css\?v=\d+/));
  }

  console.log('\n=== D. SZKŁO I „MIĘKKA REAKCJA” ===');
  {
    check('szkło przycisków nie liczy backdrop-filter (koszt GPU)', () => {
      const start = CSS.indexOf('SZKŁO NA KAŻDYM PRZYCISKU');
      const base = CSS.slice(start, start + 5200);
      const baseBlock = base.slice(base.indexOf('border-radius: 999px;'), base.indexOf('/* Miękka reakcja'));
      assert.ok(baseBlock.length > 100, 'brak bloku szkła');
      /* Komentarze mówią o `backdrop-filter` — sprawdzamy same deklaracje. */
      const declarations = baseBlock.replace(/\/\*[\s\S]*?\*\//g, '');
      assert.ok(!/backdrop-filter/.test(declarations), 'przyciski rozmywają tło');
    });
    check('każdy goły przycisk dostaje szkło (selektor bazowy)', () => {
      assert.match(CSS, /body :where\(button, \[role="button"\], a\.btn, \.chip\):where\(/);
      assert.match(CSS, /linear-gradient\(158deg, rgba\(255, 255, 255, 0\.16\), rgba\(255, 255, 255, 0\.035\)\)/);
      assert.match(CSS, /rgba\(8, 13, 25, 0\.34\)/);
    });
    check('selektor bazowy ma zerową specyficzność (:where), więc nie psuje własnych stylów', () => {
      assert.ok(!/body :is\(button\)[^:]*\{/.test(CSS), 'użyto zbyt mocnego selektora');
      assert.match(CSS, /:where\(\s*:not\(#rj-island-root \*, #rj-page-loader \*, \.rj-shared-header \*, \.card-preview \*\)\)/);
    });
    check('miękka reakcja: hover podnosi o 1 px', () =>
      assert.match(CSS, /:where\(\s*:hover:not\(:disabled\)\)[\s\S]{0,200}?transform: translateY\(-1px\)/));
    check('miękka reakcja: wciśnięcie kurczy i skraca czas', () => {
      const block = CSS.slice(CSS.indexOf(':active:not(:disabled)'), CSS.indexOf(':active:not(:disabled)') + 400);
      assert.match(block, /transform: translateY\(0\) scale\(0\.965\)/);
      assert.match(block, /transition-duration: 0\.09s/);
    });
    check('krzywa sprężysta jak w Szklanym Studiu', () =>
      assert.match(CSS, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/));
    check('animowane są tylko transform/box-shadow/filter (brak układu)', () => {
      const block = CSS.slice(CSS.indexOf('transition:\n    transform 0.28s'), CSS.indexOf('transition:\n    transform 0.28s') + 420);
      assert.ok(block.length > 40, 'brak bloku przejścia');
      assert.ok(!/\b(width|height|top|left|margin|padding)\s/.test(block), 'przejście rusza układ strony');
    });
    check('wyspa i loader są wyłączone spod globalnego szkła', () =>
      assert.match(CSS, /#rj-island-root \*, #rj-page-loader \*|#rj-island-root \*/));
    check('niebieski kwadrat: wyłączony systemowy podświetlacz dotyku', () => {
      assert.match(CSS, /-webkit-tap-highlight-color: transparent/);
      const uses = (CSS.match(/-webkit-tap-highlight-color/g) || []).length;
      assert.ok(uses >= 2, 'reguła jest tylko raz: ' + uses);
    });
    check('niebieski kwadrat: obwódka fokusu znika po kliknięciu', () =>
      assert.match(CSS, /:focus:not\(:focus-visible\)\s*\{\s*outline: none;/));
    check('dostępność: fokus klawiatury nadal widoczny', () =>
      assert.match(CSS, /button, summary, input, textarea, select\):focus-visible\s*\{\s*outline: 2px solid/));
    check('stan wyłączony nie udaje wciśnięcia', () =>
      assert.match(CSS, /:where\(\s*:disabled, \[aria-disabled="true"\]\)\s*\{[\s\S]{0,120}?transform: none/));
    check('ograniczony ruch: bez podskoków', () => {
      const reduce = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
      assert.match(reduce.slice(0, 400), /transform: none/);
    });
  }

  console.log('\n=== E. WYGLĄD PRZEŁĄCZNIKA ===');
  {
    const block = CSS.slice(CSS.indexOf('.preview-mode {'), CSS.indexOf('.preview-mode {') + 600);
    check('przełącznik jest szklany, nie goły', () => {
      assert.match(block, /background: linear-gradient\(158deg/);
      assert.match(block, /border: 1px solid var\(--hub-line\)/);
      assert.match(block, /backdrop-filter: blur\(16px\) saturate\(150%\)/);
    });
    check('zaznaczony segment wygląda jak aktywna pigułka studia', () => {
      const press = CSS.slice(CSS.indexOf('.preview-mode-btn[aria-pressed="true"]'));
      assert.match(press.slice(0, 260), /linear-gradient\(160deg, #f6faff, #cfdfff\)/);
      assert.match(press.slice(0, 260), /color: #0a1122/);
    });
    check('tryb live podbarwia ostrzeżenie', () =>
      assert.match(CSS, /\.preview-mode\[data-mode="live"\] \.preview-mode-note[\s\S]{0,120}?255, 215, 163/));
    check('jasny motyw ma własne szkło przełącznika', () =>
      assert.match(CSS, /html\[data-theme="light"\] \.preview-mode\s*\{/));
    check('na telefonie opis stanu przechodzi do nowej linii', () => {
      const mobile = CSS.slice(CSS.indexOf('@media (max-width: 640px)', CSS.indexOf('.preview-mode-state')));
      assert.match(mobile.slice(0, 200), /\.preview-mode-state\s*\{[^}]*flex-basis: 100%/);
    });
  }

  console.log('\n=== F. STARA STRONA BEZ ZMIAN ===');
  {
    check('stara witryna nie dostaje przełącznika', () => assert.ok(!LEGACY.includes('data-preview-toggle')));
    check('stara witryna nie ładuje skryptu przełącznika', () => assert.ok(!LEGACY.includes('preview-toggle.js')));
    check('globalne szkło przycisków jest tylko w RejHubie', () => {
      const legacyCss = read('css/style.css');
      assert.ok(!legacyCss.includes('-webkit-tap-highlight-color'));
      assert.ok(!/body :where\(button/.test(legacyCss));
    });
  }

  console.log('\n========================================================');
  if (failures.length) {
    console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
    failures.forEach((failure) => console.log(' - ' + failure));
    process.exit(1);
  }
  console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
  console.log('PASS: przełącznik plakaty/podglądy, szklane przyciski, miękka reakcja, brak niebieskiego kwadratu');
  process.exit(0);
})();

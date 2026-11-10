/* Prototyp Dynamicznej wyspy (czarna): sprężyna, stany, wyszukiwanie, skróty. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'rejhub2/studio-source/wyspa.html');
const html = fs.readFileSync(file, 'utf8');

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  if (!/Could not (load|parse) img|Not implemented/.test(String(error && error.message))) {
    console.error(error);
  }
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async function main() {
  const dom = new JSDOM(html, {
    url: 'https://rejhub.vercel.app/studio-source/wyspa.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  const d = w.document;
  const island = d.getElementById('island');
  const click = (selector) => {
    const el = d.querySelector(selector);
    assert.ok(el, 'brak elementu: ' + selector);
    el.click();
    return el;
  };

  /* 0. Wyspa jest czarna i nie używa szkła. */
  assert.ok(island, 'brak wyspy');
  assert.equal(island.dataset.state, 'idle', 'startuje zwinięta');
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.ok(/background:\s*#000/.test(css), 'tło to lita czerń');
  assert.ok(!/\.island[^{]*\{[^}]*backdrop-filter/.test(css), 'wyspa nie rozmywa tła (płynność)');

  /* 1. Sprężyna: animuje liczby w rAF, nie przejściami CSS na szerokości. */
  assert.ok(/requestAnimationFrame\(tick\)/.test(html), 'sprężyna w rAF');
  assert.ok(/SPRING/.test(html) && /DAMP/.test(html), 'stałe sprężyny istnieją');
  const islandRule = css.slice(css.indexOf('.island {'), css.indexOf('.island::before'));
  assert.ok(!/transition:[^;]*width/.test(islandRule), 'brak transition na width (to robi sprężyna)');

  /* 2. Propozycja funkcji: dziewięć kart, każda otwiera swój stan. */
  const cards = Array.prototype.slice.call(d.querySelectorAll('.feature'));
  assert.equal(cards.length, 9, 'dziewięć zaproponowanych funkcji');
  const states = cards.map((card) => card.dataset.preview);
  ['report', 'search', 'alerts', 'now', 'quick', 'profile', 'theme', 'upload', 'panic'].forEach((name) => {
    assert.ok(states.includes(name), 'brak funkcji: ' + name);
  });
  assert.ok(/NIEZBĘDNE/.test(d.querySelector('.feature').textContent), 'karty mają poziomy ważności');

  click('[data-preview="alerts"]');
  await wait(30);
  assert.equal(island.dataset.state, 'alerts', 'karta funkcji otwiera stan');
  assert.ok(d.querySelector('.feature[data-preview="alerts"]').classList.contains('is-live'), 'karta podświetla się');

  /* 3. Zwinięta wyspa rozwija dock, dock otwiera panele. */
  click('[data-close]');
  await wait(30);
  assert.equal(island.dataset.state, 'idle');
  island.click();
  await wait(30);
  assert.equal(island.dataset.state, 'dock', 'klik w zwiniętą wyspę rozwija dock');
  assert.equal(d.querySelectorAll('.dock-btn').length, 8, 'osiem skrótów w docku');
  click('.dock-btn[data-open="now"]');
  await wait(30);
  assert.equal(island.dataset.state, 'now', 'dock otwiera panel');
  click('[data-player="play"]');
  assert.equal(d.querySelector('[data-player="play"]').getAttribute('aria-label'), 'Odtwórz', 'pauza/odtwarzanie działa');

  /* 4. Wyszukiwanie filtruje i otwiera akcję. */
  click('[data-preview="search"]');
  await wait(30);
  assert.equal(island.dataset.state, 'search');
  assert.ok(d.querySelectorAll('#island-results [data-item]').length >= 5, 'lista startowa');
  const input = d.getElementById('island-search');
  input.value = 'chat';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(d.querySelectorAll('#island-results [data-item]').length, 1, 'filtr zawęża listę');
  assert.ok(/RejChat/.test(d.querySelector('#island-results [data-item]').textContent));

  /* 5. Zgłoszenie: walidacja i wysłanie. */
  click('[data-preview="report"]');
  await wait(30);
  click('[data-send]');
  assert.ok(/Napisz/.test(d.getElementById('toast').textContent), 'puste zgłoszenie nie przechodzi');
  d.getElementById('report-text').value = 'Nie działa podgląd na telefonie';
  click('[data-send]');
  await wait(30);
  assert.equal(island.dataset.state, 'idle', 'po wysłaniu wyspa wraca do spoczynku');
  assert.ok(/Zgłoszenie zapisane/.test(d.getElementById('toast').textContent));

  /* 6. Powiadomienia i licznik. */
  click('[data-preview="alerts"]');
  await wait(30);
  assert.equal(d.querySelectorAll('.alert').length, 4);
  click('.alert');
  assert.equal(d.querySelectorAll('.alert.is-read').length, 2, 'klik oznacza jako przeczytane');

  /* 7. Profil: zmiana statusu. */
  click('[data-preview="profile"]');
  await wait(30);
  click('[data-status="busy"]');
  assert.ok(/Zajęty/.test(d.querySelector('.profile__meta small').textContent), 'status się zmienia');
  assert.ok(d.querySelector('[data-status="busy"]').classList.contains('is-on'));

  /* 8. Motyw i przełącznik animacji. */
  click('[data-preview="theme"]');
  await wait(30);
  const themeSwitch = d.querySelector('[data-switch="theme"]');
  const before = d.documentElement.dataset.theme;
  themeSwitch.click();
  assert.notEqual(d.documentElement.dataset.theme, before, 'motyw się przełącza');
  const motionSwitch = d.querySelector('[data-switch="motion"]');
  motionSwitch.click();
  assert.equal(w.localStorage.getItem('rj-motion'), 'off', 'przełącznik animacji zapisuje wybór');

  /* 9. Autodestrukcja zawsze za potwierdzeniem. */
  click('[data-preview="panic"]');
  await wait(30);
  assert.equal(island.dataset.state, 'panic');
  assert.ok(d.querySelector('.panic-actions [data-close]'), 'jest wyjście bez zamykania');
  assert.ok(d.querySelector('[data-panic]'), 'jest potwierdzenie');

  /* 10. Klawiatura. */
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(30);
  assert.equal(island.dataset.state, 'idle', 'Esc zwija wyspę');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }));
  await wait(30);
  assert.equal(island.dataset.state, 'search', '⌘K otwiera wyszukiwanie');

  /* 11. Studio linkuje prototyp i używa tego samego logo. */
  const studio = fs.readFileSync(path.join(root, 'rejhub2/studio-source/propozycje.html'), 'utf8');
  assert.ok(studio.includes('id="wyspa"'), 'brak sekcji w studiu');
  assert.ok(studio.includes('/studio-source/wyspa.html'), 'studio linkuje prototyp');
  assert.ok(studio.includes('autodestrukcja'), 'studio wymienia funkcje');
  assert.ok(fs.readFileSync(path.join(root, 'rejhub2/studio-source/propozycje.css'), 'utf8').includes('.sx-island-card'));
  assert.ok(html.includes('/hub/brand-mark.svg'), 'to samo logo co w topbarze');
  assert.ok(/class="island__orb"[^>]*><img src="\/hub\/brand-mark.svg"/.test(html), 'wyspa używa znaku marki, nie litery');
  assert.ok(!/brand-mark[^>]*>R</.test(html), 'logo bez płytki „R”');

  console.log('wyspa: wszystkie sprawdzenia przeszły');
  dom.window.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

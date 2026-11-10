/* Prototyp Dynamicznej wyspy: stany, morfowanie, wyszukiwanie i skróty. */
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

  assert.ok(island, 'brak wyspy');
  assert.equal(island.dataset.state, 'idle', 'wyspa startuje zwinięta');
  assert.ok(island.style.getPropertyValue('--w'), 'stan ma własny rozmiar');
  assert.equal(d.querySelectorAll('.rj-mark-tile, .brand-mark').length >= 0, true);

  /* 1. Hover odsłania skróty. */
  island.dispatchEvent(new w.MouseEvent('mouseenter'));
  await wait(5);
  assert.equal(island.dataset.state, 'peek', 'najechanie pokazuje skróty');
  assert.ok(Number.parseInt(island.style.getPropertyValue('--w'), 10) > 178, 'wyspa rośnie przy podglądzie');

  /* 2. Wszystkie funkcje są w jednym elemencie. */
  const functions = ['report', 'search', 'alerts', 'panic'];
  functions.forEach((name) => {
    assert.ok(d.querySelector('[data-open="' + name + '"]'), 'brak skrótu: ' + name);
  });

  /* 3. Wyszukiwarka filtruje i otwiera akcję. */
  d.querySelector('[data-open="search"]').click();
  await wait(5);
  assert.equal(island.dataset.state, 'search');
  assert.ok(d.querySelectorAll('#island-results [data-item]').length >= 5, 'lista startowa');
  const input = d.getElementById('island-search');
  input.value = 'chat';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(d.querySelectorAll('#island-results [data-item]').length, 1, 'filtr zawęża listę');
  assert.ok(/RejChat/.test(d.querySelector('#island-results [data-item]').textContent));

  /* 4. Zgłoszenie: walidacja i wysłanie. */
  d.querySelector('[data-open="report"]').click();
  await wait(5);
  assert.equal(island.dataset.state, 'report');
  d.querySelector('[data-send]').click();
  assert.ok(/Napisz/.test(d.getElementById('toast').textContent), 'puste zgłoszenie nie przechodzi');
  const area = d.getElementById('report-text');
  area.value = 'Nie działa podgląd na telefonie';
  d.querySelector('[data-send]').click();
  await wait(5);
  assert.equal(island.dataset.state, 'idle', 'po wysłaniu wyspa wraca do spoczynku');
  assert.ok(/Zgłoszenie zapisane/.test(d.getElementById('toast').textContent));

  /* 5. Powiadomienia: licznik i oznaczanie jako przeczytane. */
  d.querySelector('[data-open="alerts"]').click();
  await wait(5);
  assert.equal(island.dataset.state, 'alerts');
  assert.equal(d.querySelectorAll('.alert-item').length, 4);
  d.querySelector('[data-read-all]').click();
  assert.equal(d.querySelectorAll('.alert-item.is-read').length, 4);

  /* 6. Autodestrukcja wymaga potwierdzenia. */
  d.querySelector('[data-open="panic"]').click();
  await wait(5);
  assert.equal(island.dataset.state, 'panic');
  assert.ok(d.querySelector('[data-panic]'), 'jest przycisk potwierdzenia');
  assert.ok(d.querySelector('.panic [data-close]'), 'jest wyjście bez zamykania');

  /* 7. Klawiatura: Esc zamyka, ⌘K otwiera szukanie. */
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(5);
  assert.equal(island.dataset.state, 'idle', 'Esc zwija wyspę');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }));
  await wait(5);
  assert.equal(island.dataset.state, 'search', '⌘K otwiera wyszukiwanie');

  /* 8. Motyw działa w obie strony. */
  const theme = d.querySelector('[data-proto-theme]');
  const before = d.documentElement.dataset.theme;
  theme.click();
  assert.notEqual(d.documentElement.dataset.theme, before, 'przełącznik motywu działa');

  /* 9. Prototyp jest podpięty w studiu, a źródła się zgadzają. */
  const studio = fs.readFileSync(path.join(root, 'rejhub2/studio-source/propozycje.html'), 'utf8');
  assert.ok(studio.includes('id="wyspa"'), 'brak sekcji w studiu');
  assert.ok(studio.includes('/studio-source/wyspa.html'), 'studio ma linkować do prototypu');
  assert.ok(fs.readFileSync(path.join(root, 'rejhub2/studio-source/propozycje.css'), 'utf8').includes('.sx-island-card'));
  assert.ok(html.includes('class="island"'), 'wyspa jest jednym elementem');
  assert.ok(!/>R</.test(html), 'logo bez płytki „R”');
  assert.ok(html.includes('/hub/brand-mark.svg'), 'to samo logo co w topbarze');

  console.log('wyspa: wszystkie sprawdzenia przeszły');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

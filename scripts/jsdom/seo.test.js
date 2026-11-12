/* Test prawdziwego HTML oraz zastąpienia statycznych kart przez js/app.js. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const names = ['RejSearch', 'ProStudent', 'kompi', 'ClassQuest'];
const html = read('rejhub2/index.html');

const staticDom = new JSDOM(html, { url: 'https://rejhub.vercel.app/' });
const sd = staticDom.window.document;
const offchat = sd.querySelector('.showcase-grid [data-repo="OffChat"]');
assert(offchat && offchat.querySelector('.card-preview iframe[data-card-preview]'), 'OffChat jest wyróżniony z podglądem');
assert(offchat.querySelector('[data-featured-meta="OffChat"]'));
assert(offchat.querySelector('[data-feedback-project="OffChat"]'));
assert.equal(offchat.querySelector('.card-online-num').textContent.trim(), '—', 'brak danych obecności nie jest zerem');
assert(offchat.querySelector('[data-project-views="OffChat"]'));
assert(offchat.querySelector('[data-project-unique="OffChat"]'));
assert(!offchat.querySelector('[data-project-online]'));
assert.equal(offchat.querySelector('.card-preview iframe').dataset.src, 'https://rejson59.github.io/OffChat/');
assert.equal(sd.querySelectorAll('[data-repo="OffChat"]').length, 1);
const staticCards = [...sd.querySelectorAll('#grid > article')];
assert.equal(staticCards.length, names.length);
for (const [i, name] of names.entries()) {
  const card = staticCards[i];
  assert(!card.hasAttribute('data-repo'));
  assert(!card.classList.contains('reveal'));
  assert.equal(card.querySelector('.card-title a').href, `https://rejson59.github.io/${name}/`);
  assert(card.querySelector('.card-desc').textContent.trim());
  assert.match(card.querySelector('.card-meta').textContent, /Utworzono: \d{4}-\d{2}-\d{2}Aktualizacja: \d{4}-\d{2}-\d{2}/);
}
assert.match(sd.querySelector('.noscript-note').textContent, /wybrane projekty/i);
const jsonld = JSON.parse(sd.querySelector('script[type="application/ld+json"]').textContent);
assert.equal(jsonld['@type'], 'WebSite');
assert.equal(jsonld.url, 'https://rejhub.vercel.app/');
staticDom.window.close();

const dom = new JSDOM(html, { url: 'https://rejhub.vercel.app/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.fetch = () => Promise.reject(new Error('offline'));
w.eval(read('js/projects-data.js'));
w.eval(read('js/app.js'));
const cards = [...w.document.querySelectorAll('#grid > article')];
assert(cards.length > names.length, 'dynamiczny fallback powinien wyświetlić całą listę');
assert(cards.every(c => c.hasAttribute('data-repo')), 'statyczne karty muszą zostać usunięte');
for (const name of names) assert.equal(cards.filter(c => c.getAttribute('data-repo') === name).length, 1, `${name} nie może się duplikować`);
assert.equal(w.document.querySelectorAll('.showcase-grid [data-repo="OffChat"]').length, 1);
assert.equal(w.document.querySelectorAll('#grid [data-repo="OffChat"]').length, 0, 'brak duplikatu OffChat w dynamicznej siatce');
const search = w.document.querySelector('#search');
search.value = 'RejSearch';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
setTimeout(() => {
  try {
    assert.equal(w.document.querySelectorAll('#grid > article').length, 1, 'filtr działa po zastąpieniu kart');
    assert.equal(w.document.querySelector('#grid > article').getAttribute('data-repo'), 'RejSearch');
    console.log('SEO: statyczne linki, dane, dynamiczne karty i filtr — OK');
  } finally { w.close(); }
}, 250);

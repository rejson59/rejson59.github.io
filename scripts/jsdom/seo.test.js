/* Test prawdziwego HTML oraz zastąpienia statycznych kart przez js/app.js. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const names = ['RejSearch', 'ProStudent', 'kompi', 'OffChat', 'ClassQuest'];
const html = read('index.html');

const staticDom = new JSDOM(html, { url: 'https://rejson59.github.io/' });
const sd = staticDom.window.document;
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
assert.equal(jsonld.url, 'https://rejson59.github.io/');
staticDom.window.close();

const dom = new JSDOM(html, { url: 'https://rejson59.github.io/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.fetch = () => Promise.reject(new Error('offline'));
w.eval(read('js/projects-data.js'));
w.eval(read('js/app.js'));
const cards = [...w.document.querySelectorAll('#grid > article')];
assert(cards.length > names.length, 'dynamiczny fallback powinien wyświetlić całą listę');
assert(cards.every(c => c.hasAttribute('data-repo')), 'statyczne karty muszą zostać usunięte');
for (const name of names) assert.equal(cards.filter(c => c.getAttribute('data-repo') === name).length, 1, `${name} nie może się duplikować`);
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

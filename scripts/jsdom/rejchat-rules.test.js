/* Zasady RejChat: koniec panelu „O prywatności" w prywatnych rozmowach,
   jedna karta prowadząca do osobnej strony regulaminu i kompletny dokument. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

console.log('\n=== A. PANEL „O PRYWATNOŚCI" ZNIKA ===');

for (const file of ['rejhub2/rejchat.html', 'rejchat.html']) {
  const html = read(file);
  assert.ok(!/rc-dm-privacy/.test(html), file + ': panel „O prywatności" nie może wracać');
  assert.ok(!/O prywatności/.test(html), file + ': brak nagłówka „O prywatności"');
  console.log('  ✔ ' + file + ' nie zawiera panelu prywatności');
}

const hub = read('rejhub2/rejchat.html');
const hubDom = new JSDOM(hub, { url: 'https://rejhub.vercel.app/rejchat' });
const hubDoc = hubDom.window.document;
assert.equal(hubDoc.querySelectorAll('#chat-private-view details').length, 0,
  'widok prywatnych rozmów nie ma już rozwijanych informacji');
assert.equal(hubDoc.querySelectorAll('#chat-private-view .dm-privacy').length, 0);
hubDom.window.close();
console.log('  ✔ prywatne rozmowy bez dodatkowej rozwijanej informacji');

console.log('\n=== B. KARTA ZASAD PROWADZI DO REGULAMINU ===');

const cardDom = new JSDOM(hub, { url: 'https://rejhub.vercel.app/rejchat' });
const card = cardDom.window.document.querySelector('#rejchat-rules');
assert.ok(card, 'karta zasad istnieje');
assert.equal(card.tagName, 'A', 'karta zasad jest linkiem, nie rozwijanym blokiem');
assert.equal(card.getAttribute('href'), '/rejchat/regulamin');
assert.match(card.textContent, /Zasady RejChat/);
assert.match(card.textContent, /Regulamin/);
assert.equal(card.closest('.rejchat-info') !== null, true, 'karta zostaje w kolumnie „Społeczność"');
cardDom.window.close();
console.log('  ✔ link „Zasady RejChat" → /rejchat/regulamin');

console.log('\n=== C. STRONA REGULAMINU ===');

const REG = 'rejhub2/rejchat/regulamin.html';
assert.ok(fs.existsSync(path.join(root, REG)), 'strona regulaminu istnieje');
const html = read(REG);
const dom = new JSDOM(html, { url: 'https://rejhub.vercel.app/rejchat/regulamin' });
const d = dom.window.document;

assert.equal(d.querySelectorAll('h1').length, 1, 'dokładnie jeden nagłówek h1');
assert.match(d.querySelector('h1').textContent, /Regulamin RejChat/);
assert.equal(d.querySelector('link[rel="canonical"]').getAttribute('href'),
  'https://rejhub.vercel.app/rejchat/regulamin');
assert.match(html, /css\/rejchat-regulamin\.css\?v=1/, 'arkusz regulaminu jest podpięty z wersją');
assert.ok(d.body.classList.contains('rr-page'), 'strona używa klasy .rr-page');
console.log('  ✔ nagłówek, canonical i arkusz stylów');

const toc = [...d.querySelectorAll('.rr-toc a[href^="#"]')].map((a) => a.getAttribute('href').slice(1));
assert.equal(toc.length, 16, 'spis treści ma 16 pozycji');
for (const id of toc) assert.ok(d.getElementById(id), 'brak sekcji #' + id + ' wskazanej w spisie treści');
const cards = [...d.querySelectorAll('.rr-card')];
assert.equal(cards.length, 16, 'każda pozycja spisu ma własną kartę');
assert.ok(cards.every((c) => c.querySelector('.rr-num') && c.textContent.trim().length > 80),
  'każda karta ma numer i treść');
assert.ok(d.querySelector('.rr-card--key'), 'sekcja o odpowiedzialności jest wyróżniona');
console.log('  ✔ 16 sekcji, spis treści zgodny z kotwicami');

const text = d.body.textContent;
const required = [
  ['odpowiedzialność autora', /odpowiedzialno[śs][ćc][\s\S]{0,120}autor/i],
  ['art. 14 uŚUDE', /art\.\s*14/],
  ['akt o usługach cyfrowych (DSA)', /DSA/],
  ['licencja na treści użytkownika', /niewy[łl][ąa]czn/i],
  ['retencja wiadomości', /14 dni/],
  ['wiek użytkowników', /13/],
  ['sąd polski', /s[ąa]d/i],
  ['zgłaszanie treści', /zg[łl]oszeni/i],
  ['brak szyfrowania end-to-end', /end-to-end/i]
];
for (const [name, re] of required) assert.match(text, re, 'regulamin pomija: ' + name);
console.log('  ✔ kluczowe zabezpieczenia prawne i informacje o danych');

assert.ok(!/O prywatności/.test(html), 'regulamin nie powtarza starego panelu');
assert.equal(d.querySelectorAll('header.site-header').length, 1, 'jeden wspólny topbar');
assert.ok(d.querySelector('footer.site-footer'), 'stopka obecna');
dom.window.close();

console.log('\nPASS: brak panelu prywatności, link do regulaminu i kompletny dokument');

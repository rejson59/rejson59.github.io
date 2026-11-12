/* Logowanie administratora: karta musi być w całości osiągalna na telefonie
   (scroll), a przycisk — klikalny. Strona „w budowie” zniknęła wraz
   z otwarciem serwisu, więc test dotyczy już tylko /login. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

for (const [file, label] of [['rejhub2/login.html', 'logowanie administratora']]) {
  console.log('\n=== ' + file + ' ===');
  const html = read(file);
  const raw = (/<style>([\s\S]*?)<\/style>/.exec(html) || [, ''])[1];
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, ''); /* komentarze nie są regułami */
  const bodyRule = (/body\s*\{([\s\S]*?)\}/.exec(css) || [, ''])[1];
  const dom = new JSDOM(html, { url: 'https://rejhub.vercel.app/' + label });
  const d = dom.window.document;

  assert.ok(!/overflow\s*:\s*hidden/.test(bodyRule), 'strona nie może blokować przewijania');
  assert.ok(!/display\s*:\s*grid/.test(bodyRule), 'body nie może wymuszać wyśrodkowania siatką');
  assert.ok(/min-height:\s*100dvh/.test(css), 'wysokość liczona od viewportu, nie 100%');
  assert.ok(/flex-direction:\s*column/.test(bodyRule), 'kolumna zamiast wyśrodkowania siatką');
  assert.match(css, /(\.card|\.wrap)\s*\{[^}]*margin:\s*auto/s,
    'karta centruje się przez margin:auto i może urosnąć ponad ekran');

  const license = d.querySelector('.license-line');
  assert.ok(license, label + ': stopka licencji istnieje');
  assert.ok(!/position\s*:\s*fixed/.test(license.getAttribute('style') || ''), label + ': stopka nie jest przyklejona na sztywno');
  assert.match(css, /\.license-line\s*\{[^}]*position:\s*relative/s, label + ': stopka w normalnym przepływie');

  {
    assert.ok(d.querySelector('#login-form input[type="email"]'), 'pole e-mail');
    assert.ok(/font-size:\s*16px/.test(css), 'pola mają 16 px, żeby Safari nie przybliżał');
    assert.ok(d.querySelector('.license-line a[href="/licencja"]'));
  }
  dom.window.close();
}

/* Logowanie musi dać się przewinąć do samego dołu na małym ekranie. */
const loginHtml = read('rejhub2/login.html');
assert.ok(!/body\s*\{[^}]*overflow\s*:\s*hidden/s.test(loginHtml), 'login: brak blokady scrolla');
assert.match(loginHtml, /@media[^{]*max-width:\s*560px[\s\S]*?button\s*\{[^}]*min-height:\s*(?:4[6-9]|[5-9]\d)px/s,
  'login: na telefonie przycisk ma co najmniej 46 px');
console.log('\nPASS: logowanie administratora przewija się na telefonie');

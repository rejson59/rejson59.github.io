/* Bramka „w budowie” i logowanie administratora: karta musi być w całości
   osiągalna na telefonie (scroll), a przycisk do logowania — klikalny. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

for (const [file, label] of [['rejhub2/w-budowie.html', 'w budowie'], ['rejhub2/login.html', 'logowanie administratora']]) {
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

  if (file.includes('w-budowie')) {
    const admin = d.querySelector('.actions .btn-ghost');
    assert.ok(admin, 'przycisk „Mam dostęp administratora” istnieje');
    assert.equal(admin.getAttribute('href'), '/login');
    assert.ok(/@media\s*\(max-width:\s*560px\)[\s\S]*min-height:\s*46px/.test(css),
      'na telefonie przyciski mają co najmniej 46 px wysokości');
  } else {
    assert.ok(d.querySelector('#login-form input[type="email"]'), 'pole e-mail');
    assert.ok(/font-size:\s*16px/.test(css), 'pola mają 16 px, żeby Safari nie przybliżał');
    assert.ok(d.querySelector('.license-line a[href="/licencja"]'));
  }
  dom.window.close();
}

/* Oba pliki muszą mieć wspólny układ, żeby powrót z logowania nie skakał. */
const a = read('rejhub2/w-budowie.html'), b = read('rejhub2/login.html');
for (const [name, html] of [['w-budowie', a], ['login', b]]) {
  assert.ok(!/body\s*\{[^}]*overflow\s*:\s*hidden/s.test(html), name + ': brak blokady scrolla');
}
console.log('\nPASS: bramka „w budowie” i logowanie przewijają się na telefonie');

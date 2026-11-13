/* Struktura wspólnego widoku i dostępna nawigacja. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['rejhub2/index.html','rejhub2/rejchat.html','rejhub2/profil.html','rejhub2/logowanie.html','rejhub2/partnerstwo.html','rejhub2/rejfile.html','rejhub2/admin.html','rejhub2/404.html','rejhub2/licencja.html','rejson-widgets/index.html'];
for (const page of pages) {
  const document = new JSDOM(read(page)).window.document;
  assert.ok(document.querySelector('link[href^="/css/liquid.css?v="]'), `${page}: wspólny arkusz`);
  assert.ok(document.body.className.includes('rj-'), `${page}: izolacja styli`);
  assert.ok(document.querySelector('main'), `${page}: treść główna`);
}
const svg = new JSDOM(read('assets/ui-icons.svg'), {contentType:'image/svg+xml'}).window.document;
for (const page of pages.filter(p => p !== 'rejhub2/404.html')) {
  const document = new JSDOM(read(page)).window.document;
  for (const link of document.querySelectorAll('header a.nav-icon-link')) {
    assert.ok(link.getAttribute('aria-label') && link.getAttribute('title'), `${page}: dostępna nazwa ikony`);
    const use = link.querySelector('use');
    /* Ikona może pochodzić ze wspólnego sprite'a (`<use>`) albo być rysowana
       bezpośrednio w linku — tak robią RejSejf, Aplikacje i Pobieranie. */
    const inlineIcon = link.querySelector('svg path, svg rect, svg circle, svg line, svg polygon');
    assert.ok((use && svg.getElementById(use.getAttribute('href').split('#')[1])) || inlineIcon,
      `${page}: istniejący symbol lub bezpośrednia ikona`);
  }
}
const home = new JSDOM(read('rejhub2/index.html')).window.document;
/* Wszystko, co zaczyna się na „Rej”, jest aplikacją RejHuba — dlatego
   osobny pasek „W twoim zasięgu” zniknął, a jego pozycje żyją w jednej
   siatce aplikacji. */
assert.equal(home.querySelector('.universe-nav'), null, 'stary pasek „w twoim zasięgu” nadal istnieje');
assert.ok(home.querySelector('.rjapps-more[href="#projekty"]'), 'brak skrótu do projektów');
for (const app of ['rejchat','rejfile','rejsejf','rejtools','rejclass','rejplanner','rejgames','rejmusic','rejmeme']) {
  assert.ok(home.querySelector(`.rjapp-grid--apps a[href="/${app}"]`), `brak kafelka ${app}`);
  assert.ok(home.querySelector(`header .site-nav a[href="/${app}"]`), `brak ${app} w topbarze`);
}
assert.ok(home.querySelector('header .site-nav [data-island="assistant"]'), 'brak asystenta w topbarze');
assert.ok(home.querySelector('[data-tilt]'), 'zachowany efekt 3D');
const comm = new JSDOM(read('rejhub2/rejchat.html')).window.document;
for (const id of ['login-card','composer-card','posts-feed','comm-online','chat-list','chat-form']) assert.equal(comm.querySelectorAll(`#${id}`).length, 1, id);
assert.ok(comm.querySelector('.comm-primary #posts-feed'));
assert.ok(comm.querySelector('.comm-primary #chat-list'));
assert.ok(comm.querySelector('#panel-posts[hidden] #posts-feed'));
assert.ok(comm.querySelector('#chat-tab[aria-selected="true"]'));
assert.match(read('rejhub2/spolecznosc.html'), /location.replace\('\/rejchat'/);
/* Menu nowego paska obsługuje js/shared-topbar.js — jego zachowanie pilnuje
   topbar.test.js. Tutaj zostaje sama warstwa szkła. */
assert.match(read('css/liquid.css'), /\[hidden\]:not\(\[hidden="until-found"\]\)/);
console.log('PASS: wspólny styl stron, struktura społeczności, nawigacja i ukrywanie elementów');

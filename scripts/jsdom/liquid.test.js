/* Struktura wspólnego widoku i dostępna nawigacja. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html','rejchat.html','profil.html','logowanie.html','partnerstwo.html','rejfile.html','tablica-pomyslow.html','widzety.html','admin.html','404.html','rejson-widgets/index.html'];
for (const page of pages) {
  const document = new JSDOM(read(page)).window.document;
  assert.ok(document.querySelector('link[href^="/css/liquid.css?v="]'), `${page}: wspólny arkusz`);
  assert.ok(document.body.className.includes('rj-'), `${page}: izolacja styli`);
  assert.ok(document.querySelector('main'), `${page}: treść główna`);
}
const svg = new JSDOM(read('assets/ui-icons.svg'), {contentType:'image/svg+xml'}).window.document;
for (const page of pages.filter(p => p !== '404.html')) {
  const document = new JSDOM(read(page)).window.document;
  for (const link of document.querySelectorAll('header a.nav-icon-link')) {
    assert.ok(link.getAttribute('aria-label') && link.getAttribute('title'), `${page}: dostępna nazwa ikony`);
    const use = link.querySelector('use');
    assert.ok(use && svg.getElementById(use.getAttribute('href').split('#')[1]), `${page}: istniejący symbol`);
  }
}
const home = new JSDOM(read('index.html')).window.document;
for (const href of ['#projekty','rejchat','rejfile']) assert.ok(home.querySelector(`.universe-nav a[href="${href}"]`));
assert.ok(home.querySelector('[data-tilt]'), 'zachowany efekt 3D');
const comm = new JSDOM(read('rejchat.html')).window.document;
for (const id of ['login-card','composer-card','posts-feed','comm-online','chat-list','chat-form']) assert.equal(comm.querySelectorAll(`#${id}`).length, 1, id);
assert.ok(comm.querySelector('.comm-primary #posts-feed'));
assert.ok(comm.querySelector('.comm-primary #chat-list'));
assert.ok(comm.querySelector('#panel-posts[hidden] #posts-feed'));
assert.ok(comm.querySelector('#chat-tab[aria-selected="true"]'));
assert.match(read('spolecznosc.html'), /location.replace\('\/rejchat'/);
for (const page of ['rejchat.html','widzety.html']) {
  const dom = new JSDOM(read(page), {url:'https://rejson59.github.io/',runScripts:'outside-only'});
  const {document, KeyboardEvent, MouseEvent} = dom.window;
  dom.window.eval(read('js/liquid-nav.js'));
  const button = document.querySelector('#liquid-menu-toggle');
  const nav = document.querySelector('#site-nav');
  assert.equal(button.getAttribute('aria-controls'), nav.id);
  button.click(); assert.equal(button.getAttribute('aria-expanded'),'true'); assert.ok(nav.classList.contains('is-open'));
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal(button.getAttribute('aria-expanded'),'false'); assert.equal(document.activeElement,button);
  button.click(); document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  assert.equal(button.getAttribute('aria-expanded'),'false');
  dom.window.close();
}
assert.match(read('css/liquid.css'), /\[hidden\]:not\(\[hidden="until-found"\]\)/);
console.log('PASS: wspólny styl stron, struktura społeczności, nawigacja i ukrywanie elementów');

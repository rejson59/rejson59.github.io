/* Test rzeczywistego panelu zgłoszeń: cd scripts/jsdom && node admin-project-prompt.test.js */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const page = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'rejson-widgets/js/admin.js'), 'utf8');
const wait = () => new Promise(resolve => setTimeout(resolve, 15));
const make = (id, project, type, status, title, extra = {}) => ({
  id: String(id), project_slug: project, type, status, title, created_at: '2026-10-01T00:00:00Z',
  is_public: true, ...extra
});
const entries = [
  make(1, 'alpha', 'bug', 'new', 'Błąd A', {description: 'Opis błędu', severity: 'high', page_url: 'https://example.com/page', diagnostics: {browser: 'Firefox', consoleErrors: ['TypeError: oops']}, author_contact: 'sekretny-kontakt'}),
  make(2, 'alpha', 'idea', 'completed', 'Pomysł B', {description: 'Opis pomysłu', is_public: false}),
  make(3, 'beta', 'bug', 'new', 'Inny projekt'),
  ...Array.from({length: 97}, (_, i) => make(i + 4, 'beta', 'idea', 'new', 'wpis ' + i)),
  make(101, 'alpha', 'idea', 'planned', 'Starszy pomysł'),
  make(102, 'alpha', 'bug', 'closed', 'Zamknięty błąd')
];
(async () => {
  const dom = new JSDOM(page, { url: 'https://rejson59.github.io/admin', runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  let copied = '', failFetch = false, failClipboard = false;
  const calls = [];
  w.RejsonCloud = {
    rpc: async () => ({is_admin: true, admin_email: 'admin@example.com'}),
    restTable: async (url) => {
      calls.push(url);
      const offset = Number(new URLSearchParams(url.split('?')[1]).get('offset'));
      if (failFetch && offset === 100) throw new Error('błąd połączenia');
      return entries.slice(offset, offset + 100);
    }
  };
  Object.defineProperty(w.navigator, 'clipboard', {value: {writeText: async text => {
    if (failClipboard) throw new Error('blocked');
    copied = text;
  }}});
  w.eval(script);
  await wait();
  assert.equal(calls.length, 2, 'paginacja pobiera starsze zgłoszenia');
  const button = () => d.getElementById('btn-copy-project-prompt');
  assert.match(button().textContent, /\(4\)/);
  assert.match(d.getElementById('inspector-panel').textContent, /niezależnie od filtrów/);
  button().click(); await wait();
  for (const expected of ['rejson59/alpha', 'Błąd A', 'Opis błędu', 'Pomysł B', 'Starszy pomysł', 'Zamknięty błąd', 'Wdrożone', 'Zamknięte', 'Firefox', 'TypeError: oops']) assert.ok(copied.includes(expected), expected);
  assert.ok(!copied.includes('Inny projekt'));
  assert.ok(!copied.includes('sekretny-kontakt'));
  assert.match(d.getElementById('admin-toast').textContent, /Skopiowano 4/);
  d.querySelector('[data-type-filter="bug"]').click();
  d.getElementById('admin-search').value = 'Błąd A';
  d.getElementById('admin-search').dispatchEvent(new w.Event('input', {bubbles:true}));
  button().click(); await wait();
  assert.ok(copied.includes('Starszy pomysł'), 'filtry listy nie zmieniają zakresu projektu');
  const active = d.getElementById('ai-project-active-only');
  active.checked = true;
  active.dispatchEvent(new w.Event('change', {bubbles:true}));
  assert.match(button().textContent, /\(2\)/);
  button().click(); await wait();
  assert.ok(copied.includes('Błąd A') && copied.includes('Starszy pomysł'));
  assert.ok(!copied.includes('Pomysł B') && !copied.includes('Zamknięty błąd'));
  failClipboard = true;
  button().click(); await wait();
  const fallback = d.getElementById('ai-project-fallback');
  assert.equal(fallback.hidden, false);
  assert.ok(fallback.value.includes('Starszy pomysł'));
  assert.equal(fallback.selectionEnd, fallback.value.length);
  failClipboard = false;
  d.querySelector('[data-type-filter="all"]').click();
  d.getElementById('admin-search').value = '';
  d.getElementById('admin-search').dispatchEvent(new w.Event('input', {bubbles:true}));
  d.querySelector('[data-select-id="3"]').click();
  assert.match(button().textContent, /\(98\)/);
  button().click(); await wait();
  assert.ok(copied.includes('rejson59/beta') && copied.includes('Inny projekt'));
  assert.ok(!copied.includes('Błąd A'), 'po zmianie projektu brak zgłoszeń z poprzedniego');
  failFetch = true;
  d.getElementById('btn-refresh').click(); await wait();
  assert.equal(button().disabled, true, 'nie kopiujemy niekompletnej listy');
  assert.match(d.getElementById('inspector-panel').textContent, /Nie udało się pobrać wszystkich/);
  assert.match(d.getElementById('admin-toast').textContent, /Błąd odczytu chmury/);
  assert.match(page, /rejson-widgets\/js\/admin\.js\?v=2/);
  dom.window.close();
  console.log('Test promptu projektowego: wszystkie asercje OK');
})().catch(err => { console.error(err); process.exitCode = 1; });

/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Test ochrony przed multikontami: limity serwerowe, lista ryzyka w panelu. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

(async () => {
  /* ------------------------------------------------- A. pliki i migracja --- */
  const sql = read('supabase/2026-11-19_multikonto_guard.sql');

  assert.match(sql, /create extension if not exists pg_trgm/, 'podobne nazwy wymagają pg_trgm');
  assert.match(sql, /community_guard_salt/, 'adresy IP muszą być solone');
  assert.match(sql, /community_ip_hash/, 'brak funkcji hashowania adresu');
  assert.match(sql, /cf-connecting-ip/, 'adres klienta musi pochodzić z nagłówków bramy');
  assert.match(sql, /interval '24 hours'/, 'brak limitu dobowego');
  assert.match(sql, /interval '60 seconds'/, 'brak odstępu między kontami z jednej sieci');
  assert.match(sql, /community_register\(p_username text, p_pin text, p_fp text default null\)/);
  assert.doesNotMatch(sql, /delete from public\.community_users/i, 'automat nie może kasować kont');
  assert.doesNotMatch(sql, /insert into public\.rejchat_write_blocks/i, 'automat nie może zakładać blokad');
  assert.match(sql, /admin_account_risk/, 'brak listy ryzyka dla właściciela');
  assert.match(sql, /levenshtein/, 'klony typu Pjoterz/Pioterz wymagają odległości edycyjnej');

  const server = read('js/admin-server.js');
  assert.ok(server.includes('admin_account_risk'), 'panel musi pobierać listę ryzyka');
  assert.ok(server.includes('data-risk-name'), 'nazwy z listy ryzyka muszą dać się wybrać do scalenia');
  assert.doesNotMatch(server, /admin_identity_forget\(/, 'panel nie może zapominać nazw bez decyzji człowieka');
  assert.doesNotMatch(server, /admin_user_ban|rejchat_write_blocks/, 'panel nie może banować automatycznie');

  const html = read('rejhub2/admin.html');
  assert.ok(html.includes('id="srv-risk"'), 'brak sekcji multikont w panelu');
  assert.ok(html.includes('id="srv-risk-status"'), 'brak opisu stanu listy ryzyka');
  assert.ok(html.includes('/js/admin-server.js?v=2'), 'skrypt panelu musi mieć nowy numer wersji');
  assert.ok(html.includes('/css/admin-server.css?v=2'), 'arkusz panelu musi mieć nowy numer wersji');

  const css = read('css/admin-server.css');
  assert.match(css, /\.srv-risk-item/, 'brak stylu pozycji listy ryzyka');
  assert.match(css, /\.srv-chip/, 'brak stylu klikalnych nazw');

  /* --------------------------------------------- B. zachowanie w przeglądarce --- */
  const dom = new JSDOM(
    '<!doctype html><html lang="pl"><body>' +
      '<div id="srv-kpis"></div><div id="srv-tables"></div><div id="srv-accounts"></div>' +
      '<div id="srv-identities"></div><div id="srv-risk"></div><p id="srv-risk-status"></p>' +
      '<input id="srv-merge-from"><input id="srv-merge-into">' +
      '<p id="srv-merge-status"></p>' +
      '<button id="srv-merge-btn">Scal</button><button id="srv-forget-btn">Zapomnij</button>' +
      '<button id="srv-refresh">Odśwież</button>' +
      '</body></html>',
    { url: 'https://rejhub.vercel.app/admin', runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const w = dom.window;
  const calls = [];
  w.confirm = () => true;
  w.RejsonCloud = {
    rpc(name, args) {
      calls.push(name);
      if (name === 'admin_server_stats') {
        return Promise.resolve({
          database: { pretty: '12 MB', bytes: 12582912, version: '15.8' },
          counts: { accounts: 22 },
          storage: { used_total: 1024, accounts: [] },
          tables: []
        });
      }
      if (name === 'admin_identity_issues') {
        return Promise.resolve({ names: [{ name: 'ghost', has_account: false, links: 2, visits: 3 }], aliases: [] });
      }
      if (name === 'admin_account_risk') {
        return Promise.resolve({
          generated_at: '2026-11-13T10:08:34Z',
          new_24h: 11,
          networks: [{ net: 'b6da0887', count: 2, accounts: ['Ala', 'Ola'], first_at: '2026-11-13T09:00:00Z', last_at: '2026-11-13T09:20:00Z' }],
          devices: [],
          similar: [{ name: 'Pioterz', similar_to: 'Pjoterz', score: 0.9 }],
          bursts: [{ hour: '2026-11-13T09:00:00Z', count: 5, accounts: ['A', 'B', 'C', 'D', 'E'] }],
          echoes: [{ excerpt: 'chat bez cenzury', accounts: ['cobaltuwka', 'StarGhost'], count: 2, last_at: '2026-11-13T09:58:00Z' }]
        });
      }
      return Promise.reject(new Error('nieznane rpc ' + name));
    }
  };

  w.eval(server);
  await w.RJAdminServer.refresh();

  const risk = w.document.getElementById('srv-risk');
  const markup = risk.innerHTML;
  assert.ok(markup.includes('Wspólna sieć'), 'brak sekcji wspólnej sieci');
  assert.ok(markup.includes('Łudząco podobne nazwy'), 'brak sekcji podobnych nazw');
  assert.ok(markup.includes('Fale rejestracji'), 'brak sekcji fal rejestracji');
  assert.ok(markup.includes('Ta sama wiadomość z różnych kont'), 'brak sekcji powtórzonych wiadomości');
  assert.ok(markup.includes('@Pioterz') && markup.includes('@Pjoterz'), 'klony muszą być widoczne');
  assert.ok(markup.includes('@cobaltuwka') && markup.includes('@StarGhost'), 'powtórzona wiadomość musi pokazać konta');
  assert.ok(!markup.includes('Wspólne urządzenie'), 'pusta sekcja nie może zaśmiecać panelu');

  const status = w.document.getElementById('srv-risk-status').textContent;
  assert.match(status, /Nowych kont w 24 h: 11/);

  /* Kliknięcie nazwy tylko wypełnia formularz — nic nie scala i nie kasuje. */
  const before = calls.length;
  const chip = risk.querySelector('[data-risk-name="Pioterz"]');
  assert.ok(chip, 'nazwa musi być klikalna');
  chip.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(w.document.getElementById('srv-merge-from').value, 'Pioterz');
  assert.equal(calls.length, before, 'kliknięcie nie może niczego wysyłać');
  assert.match(w.document.getElementById('srv-merge-status').textContent, /Wybrano „Pioterz”/);

  /* Awaria listy ryzyka nie może wyłożyć całego panelu. */
  w.RejsonCloud.rpc = (name) => {
    if (name === 'admin_account_risk') return Promise.reject(new Error('boom'));
    if (name === 'admin_server_stats') return Promise.resolve({});
    return Promise.resolve({ names: [], aliases: [] });
  };
  await w.RJAdminServer.refresh();
  assert.match(w.document.getElementById('srv-risk').innerHTML, /Nie udało się wczytać listy ryzyka/);

  /* Pusta lista = jasny komunikat, bez fałszywych alarmów. */
  w.RejsonCloud.rpc = (name) => {
    if (name === 'admin_account_risk') {
      return Promise.resolve({ generated_at: null, new_24h: 0, networks: [], devices: [], similar: [], bursts: [], echoes: [] });
    }
    if (name === 'admin_server_stats') return Promise.resolve({});
    return Promise.resolve({ names: [], aliases: [] });
  };
  await w.RJAdminServer.refresh();
  assert.match(w.document.getElementById('srv-risk').innerHTML, /Brak podejrzanych układów/);

  console.log('✔ multikonta: limity serwerowe i lista ryzyka działają');
})().catch((error) => {
  console.error('✘ multikonta:', error && error.message);
  process.exitCode = 1;
});

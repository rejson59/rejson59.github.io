/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*
 * Zgłoszenie w dwóch krokach + wylogowanie w wyspie i w profilu.
 *
 * 1) Klik „Zgłoś” otwiera najpierw pytanie „błąd czy pomysł?”. Pole tekstowe
 *    pojawia się dopiero po świadomym wyborze.
 * 2) Wylogowanie jest dostępne w wyspie (profil) i na stronie profilu.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const islandJs = path.join(root, 'rejhub2/hub/island.js');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log('  ✔ ' + name); }
  catch (error) { failures.push(name + ' — ' + error.message); console.log('  ✘ ' + name + '  [' + error.message + ']'); }
}

const PAGE = '<!doctype html><html lang="pl" data-theme="dark"><head><meta charset="utf-8">' +
  '<script src="/hub/island.js?v=9" data-project="rejhub" data-project-name="RejHub"></script>' +
  '</head><body><header class="rj-shared-header"></header><main><h1>Test</h1>' +
  '<button type="button" data-feedback-project="RejStream">Zgłoś</button></main></body></html>';

async function makeIsland() {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (error) => {
    if (!/Could not (load|parse) img|Not implemented/.test(String(error && error.message))) errors.push(error.message);
  });
  const dom = new JSDOM(PAGE, {
    url: 'https://rejhub.vercel.app/licencja',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  const d = w.document;
  const calls = [];
  const KEY = 'rejson_community_session_v1';

  w.fetch = (url, options) => {
    const body = options && options.body ? JSON.parse(options.body) : {};
    calls.push({ url: String(url), body });
    let payload = [];
    if (/submit_feedback/.test(url)) payload = { id: 'sub-1' };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
  };
  /* Jak w prawdziwym RJProfiles: sesja żyje w localStorage. */
  w.RJProfiles = {
    session: () => {
      try { return JSON.parse(w.localStorage.getItem(KEY) || 'null'); } catch (error) { return null; }
    },
    rpc: (name, body) => w.fetch('https://x/rpc/' + name, { body: JSON.stringify(body) }).then((response) => response.json()),
    getMany: () => Promise.resolve([{ username: 'rejson59', avatar: 'comet' }]),
    refreshHeader: () => { refreshed += 1; }
  };
  let refreshed = 0;
  w.RejPush = { status: () => ({ supported: true, subscribed: false }), enable: () => Promise.resolve(), refresh: () => Promise.resolve() };
  w.RejPanic = { run: () => {}, mount: () => {} };
  w.RejMotion = { on: () => true, off: () => false, status: () => 'on' };

  w.eval(fs.readFileSync(islandJs, 'utf8'));
  await wait(180);

  const host = d.getElementById('rj-island-root');
  const ui = (selector) => host.shadowRoot.querySelector(selector);
  const uiAll = (selector) => Array.from(host.shadowRoot.querySelectorAll(selector));

  return { dom, w, d, calls, ui, uiAll, host, refreshed: () => refreshed, KEY };
}

(async function main() {
  console.log('\n=== A. ZNACZNIKI I STYLE ===');
  const source = read('rejhub2/hub/island.js');
  const css = read('rejhub2/hub/island.css');

  check('widok zgłoszenia ma dwa etapy', () => {
    assert.match(source, /data-stage="choose"/);
    assert.match(source, /class="rj-choose"/);
    assert.match(source, /class="rj-report-form" hidden/);
  });
  check('kafelki wyboru to błąd i pomysł', () => {
    assert.match(source, /data-kind="bug"/);
    assert.match(source, /data-kind="idea"/);
    assert.match(source, /Błąd<\/b><small>Coś nie działa/);
    assert.match(source, /Pomysł<\/b><small>Coś, co warto dodać/);
  });
  check('stary przełącznik zakładek zniknął', () => assert.ok(!/class="rj-seg"/.test(source)));
  check('jest droga powrotu do wyboru rodzaju', () => assert.match(source, /data-choose-back/));
  check('style kafelków i formularza są w arkuszu wyspy', () => {
    ['.rj-choose-btn', '.rj-choose-icon', '.rj-report-form', '.rj-back'].forEach((selector) => {
      assert.ok(css.includes(selector), 'brak stylu ' + selector);
    });
  });
  check('kafelki nie są gołe — mają szkło wyspy', () => {
    const block = css.slice(css.indexOf('#rj-island-root .rj-choose-btn {'), css.indexOf('#rj-island-root .rj-choose-btn:hover'));
    assert.match(block, /linear-gradient/);
    assert.match(block, /border-radius: 14px/);
  });

  console.log('\n=== B. NAJPIERW PYTANIE, POTEM POLE ===');
  {
    const page = await makeIsland();
    const { ui, calls } = page;

    ui('.rj-island').click();
    await wait(20);
    ui('.rj-dock-btn[data-open="report"]').click();
    await wait(30);

    check('dock pyta o rodzaj zamiast pokazywać pole', () => {
      assert.equal(ui('.rj-view--report').dataset.stage, 'choose');
      assert.equal(ui('.rj-island').dataset.state, 'report');
    });
    check('pole tekstowe jest ukryte, dopóki nie ma wyboru', () => {
      const form = ui('.rj-report-form');
      assert.ok(form.hidden, 'formularz widoczny przed wyborem');
      assert.equal(ui('.rj-choose').hidden, false);
    });
    check('oba kafelki są widoczne i klikalne', () => {
      const cards = page.uiAll('.rj-choose-btn');
      assert.equal(cards.length, 2);
      cards.forEach((card) => assert.ok(card.tagName === 'BUTTON' && card.type === 'button'));
    });
    check('tytuł pyta wprost o rodzaj', () =>
      assert.equal(ui('[data-report-title]').textContent, 'Co zgłaszasz?'));

    ui('[data-send]').click();
    await wait(30);
    check('wysyłka bez wyboru tylko tłumaczy, co zrobić', () => {
      assert.match(ui('.rj-toast').textContent, /wybierz/i);
      assert.equal(calls.filter((call) => /submit_feedback/.test(call.url)).length, 0);
    });

    ui('.rj-choose-btn[data-kind="idea"]').click();
    await wait(140);
    check('wybór pomysłu otwiera pole tekstowe', () => {
      assert.equal(ui('.rj-view--report').dataset.stage, 'form');
      assert.equal(ui('.rj-report-form').hidden, false);
      assert.equal(ui('.rj-choose').hidden, true);
    });
    check('tytuł i podpowiedź mówią o pomyśle', () => {
      assert.equal(ui('[data-report-title]').textContent, 'Pomysł');
      assert.match(ui('#rj-island-text').getAttribute('placeholder'), /dodać albo zmienić/);
    });
    check('po wyborze fokus jest w polu tekstowym', () => {
      const active = page.host.shadowRoot.activeElement;
      assert.ok(active && active.id === 'rj-island-text', 'fokus nie trafił w pole');
    });
    check('wrócić można jednym przyciskiem', () => {
      assert.equal(ui('[data-choose-back]').hidden, false);
    });

    ui('#rj-island-text').value = 'Dodać tryb nocny do podglądów';
    ui('[data-send]').click();
    await wait(80);
    const sent = calls.find((call) => /submit_feedback/.test(call.url));
    check('pomysł leci do bazy jako p_type=idea', () => {
      assert.ok(sent, 'brak zgłoszenia');
      assert.equal(sent.body.p_type, 'idea');
      assert.equal(sent.body.p_category, 'feature');
      assert.equal(sent.body.p_description, 'Dodać tryb nocny do podglądów');
    });
    check('po wysłaniu wyspa wraca do spoczynku', () =>
      assert.equal(ui('.rj-island').dataset.state, 'idle'));
  }

  {
    const page = await makeIsland();
    const { ui, calls } = page;
    await wait(20);

    /* Przycisk przy projekcie: nazwa projektu zostaje, ale pytanie też się pojawia. */
    page.d.querySelector('[data-feedback-project="RejStream"]').click();
    await wait(40);
    check('przycisk projektu najpierw pyta o rodzaj', () =>
      assert.equal(ui('.rj-view--report').dataset.stage, 'choose'));
    check('nazwa projektu jest widoczna', () => {
      const label = ui('[data-report-project]');
      assert.equal(label.hidden, false);
      assert.match(label.textContent, /RejStream/);
    });

    ui('.rj-choose-btn[data-kind="bug"]').click();
    await wait(40);
    ui('#rj-island-text').value = 'Podgląd nie wstaje na telefonie';
    ui('[data-send]').click();
    await wait(80);
    const sent = calls.find((call) => /submit_feedback/.test(call.url));
    check('błąd leci jako p_type=bug', () => {
      assert.equal(sent.body.p_type, 'bug');
      assert.equal(sent.body.p_project_name, 'RejStream');
    });

    /* Powrót do wyboru czyści treść poprzedniego typu. */
    page.d.querySelector('[data-feedback-project="RejStream"]').click();
    await wait(40);
    ui('.rj-choose-btn[data-kind="idea"]').click();
    await wait(30);
    ui('#rj-island-text').value = 'coś';
    ui('[data-choose-back]').click();
    await wait(140);
    check('powrót do pytania czyści pole', () => {
      assert.equal(ui('.rj-view--report').dataset.stage, 'choose');
      assert.equal(ui('#rj-island-text').value, '');
    });
    check('po powrocie fokus wraca na kafelek', () => {
      const active = page.host.shadowRoot.activeElement;
      assert.ok(active && active.getAttribute('data-kind') === 'idea', 'fokus nie wrócił na kafelek');
    });
  }

  console.log('\n=== C. WYLOGOWANIE ===');
  {
    const page = await makeIsland();
    const { w, ui, KEY } = page;
    w.localStorage.setItem(KEY, JSON.stringify({ token: 't'.repeat(24), username: 'rejson59' }));
    w.RejIsland.open('profile');
    await wait(120);

    check('profil w wyspie ma przycisk wylogowania', () => {
      const button = ui('[data-logout]');
      assert.ok(button, 'brak przycisku');
      assert.match(button.textContent, /Wyloguj/);
    });
    check('profil i wylogowanie stoją obok siebie', () => {
      const links = ui('.rj-profile-links');
      assert.ok(links, 'brak wspólnego rzędu linków');
      assert.ok(links.querySelector('a[href="/profil"]'), 'brak skrótu do profilu');
      assert.ok(links.querySelector('[data-logout]'), 'brak wylogowania');
    });

    ui('[data-logout]').click();
    await wait(80);
    check('wylogowanie czyści sesję', () => assert.equal(w.localStorage.getItem(KEY), null));
    check('wylogowanie potwierdza się komunikatem', () =>
      assert.match(ui('.rj-toast').textContent, /Wylogowano/));
    check('wyspa od razu pokazuje widok gościa', () => {
      assert.ok(/Nie jesteś zalogowany/.test(ui('#rj-island-profile').textContent));
      assert.equal(ui('[data-logout]'), null);
    });
    check('topbar dostaje sygnał odświeżenia', () => assert.ok(page.refreshed() >= 1));
  }

  {
    const html = read('rejhub2/profil.html');
    const js = read('js/profil.js');
    check('strona profilu ma przycisk wylogowania', () => {
      assert.match(html, /id="profile-logout"[^>]*>Wyloguj się</);
    });
    check('przycisk jest ukryty, dopóki nie ma potwierdzonej sesji', () => {
      assert.match(js, /\$\('profile-logout'\)\.hidden=!confirmed/);
      assert.match(js, /\$\('profile-logout'\)\.hidden=true/);
    });
    check('wylogowanie w profilu czyści tę samą sesję co wyspa', () => {
      const block = js.slice(js.indexOf("$('profile-logout').addEventListener"), js.indexOf("$('profile-logout').addEventListener") + 900);
      assert.match(block, /rejson_community_session_v1/);
      assert.match(block, /rj:session-change/);
      assert.match(block, /load\(\)/);
    });
  }

  console.log('\n=== D. STARA STRONA BEZ ZMIAN ===');
  check('stara witryna nie dostaje nowego przycisku wylogowania', () =>
    assert.ok(!read('profil.html').includes('profile-logout')));

  console.log('\n========================================================');
  if (failures.length) {
    console.log('WYNIK: ' + passed + '/' + (passed + failures.length) + ' ✘');
    failures.forEach((failure) => console.log(' - ' + failure));
    process.exit(1);
  }
  console.log('WYNIK: ' + passed + '/' + passed + ' ✔');
  console.log('PASS: zgłoszenie pyta najpierw o rodzaj, wylogowanie w wyspie i profilu');
  process.exit(0);
})();

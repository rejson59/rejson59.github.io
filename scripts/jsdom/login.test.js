/* Osobny ekran konta używa istniejącej sesji społeczności. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'logowanie.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/logowanie.js'), 'utf8');
const key = 'rejson_community_session_v1';
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
function create(initial, handler, opts = {}) {
  const dom = new JSDOM(html, {runScripts: 'outside-only', url:'https://rejson59.github.io/logowanie' + (opts.search || '')});
  const w = dom.window, d = w.document;
  w.TextEncoder = TextEncoder;
  if (initial) w.localStorage.setItem(key, JSON.stringify(initial));
  if (opts.returnValue) w.sessionStorage.setItem('rejson_account_return_v1', JSON.stringify(opts.returnValue));
  const calls = [];
  w.fetch = async (url, options) => {
    const name = url.split('/').pop();
    const payload = JSON.parse(options.body);
    calls.push({name, payload});
    const response = await handler(name, payload);
    if (response instanceof Error) throw response;
    return {ok: response.ok !== false, json: async () => response.data};
  };
  w.eval(js);
  return {w,d,calls,close:()=>dom.window.close()};
}
(async () => {
  const token = 'a'.repeat(48);
  const t = create(null, async (fn) => fn === 'community_register' || fn === 'community_login' ? {data:{token,username:'Alice'}} : {data:{username:'Alice'}});
  assert.equal(t.d.getElementById('account-guest').hidden, false);
  t.d.getElementById('account-menu').click();
  assert.equal(t.d.getElementById('account-menu').getAttribute('aria-expanded'), 'true');
  assert.ok(t.d.getElementById('account-nav').classList.contains('is-open'));
  t.d.getElementById('account-menu').click();
  assert.equal(t.d.getElementById('account-menu').getAttribute('aria-expanded'), 'false');
  const name = t.d.getElementById('account-name'), pin = t.d.getElementById('account-pin');
  name.value='Alice'; pin.value='1234';
  t.d.getElementById('account-form').dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true})); await tick();
  assert.equal(t.calls[0].name, 'community_login');
  assert.deepEqual(t.calls[0].payload, {p_username:'Alice',p_pin:'1234'});
  assert.equal(JSON.parse(t.w.localStorage.getItem(key)).token, token);
  assert.equal(pin.value, '');
  assert.equal(t.d.getElementById('account-user').hidden, false);
  t.d.getElementById('account-logout').click();
  assert.equal(t.w.localStorage.getItem(key), null);
  t.d.getElementById('mode-register').click();
  assert.equal(t.d.getElementById('mode-register').getAttribute('aria-pressed'), 'true');
  pin.value='MojeBezpieczneHaslo';
  t.d.getElementById('account-form').dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true})); await tick();
  assert.equal(t.calls.find(c => c.name === 'community_register').name, 'community_register');
  assert.equal(t.calls.find(c => c.name === 'community_register').payload.p_pin, 'MojeBezpieczneHaslo');
  t.close();
  const update = create({token,username:'Alice'}, async (fn) => fn === 'community_whoami' ? {data:{username:'Alice'}} : fn === 'community_password_status' ? {data:{has_password:false}} : {data:{ok:true}});
  await tick();
  assert.match(update.d.getElementById('password-status').textContent,/PIN/);
  update.d.getElementById('current-secret').value = '1234';
  update.d.getElementById('new-password').value = 'nowe bezpieczne hasło';
  update.d.getElementById('confirm-password').value = 'inne hasło';
  update.d.getElementById('password-form').dispatchEvent(new update.w.Event('submit',{bubbles:true,cancelable:true}));
  assert.match(update.d.getElementById('password-result').textContent,/nie są takie same/);
  assert.equal(update.calls.some(c => c.name === 'community_set_password'),false);
  update.d.getElementById('confirm-password').value = 'nowe bezpieczne hasło';
  update.d.getElementById('password-form').dispatchEvent(new update.w.Event('submit',{bubbles:true,cancelable:true})); await tick();
  assert.deepEqual(update.calls.find(c => c.name === 'community_set_password').payload,{p_token:token,p_current_secret:'1234',p_new_password:'nowe bezpieczne hasło'});
  assert.equal(update.d.getElementById('new-password').value,'');
  assert.match(update.d.getElementById('password-result').textContent,/Hasło zapisane/);
  update.w.confirm = () => true;
  update.d.getElementById('revoke-other-sessions').click(); await tick();
  assert.deepEqual(update.calls.find(c => c.name === 'community_revoke_other_sessions').payload,{p_token:token});
  assert.match(update.d.getElementById('revoke-status').textContent,/pozostaje zalogowane/);
  update.close();
  for (const value of [
    {path:'//evil.example/',at:Date.now()},
    {path:'/\\evil.example/',at:Date.now()},
    {path:'https://evil.example/',at:Date.now()},
    {path:'/Test/',at:Date.now()-31*60*1000},
    {path:'/portal/Other',at:Date.now()},
    {path:'/podroz/?projekt=Other',at:Date.now()},
    {path:'/logowanie',at:Date.now()},
  ]) {
    const x = create(null, async () => ({data:{username:null}}), {search:'?powrot=1',returnValue:value});
    assert.equal(x.d.getElementById('account-return').hidden, true); x.close();
  }
  const validReturn = create(null, async () => ({data:{username:null}}), {search:'?powrot=1',returnValue:{path:'/Project/?mode=1#here',at:Date.now()}});
  assert.equal(validReturn.d.getElementById('account-return').href, 'https://rejson59.github.io/Project/?mode=1#here'); validReturn.close();
  const saved = {token,username:'Alice'};
  const ok = create(saved, async () => ({data:{username:'Canonical'}})); await tick();
  assert.equal(ok.d.getElementById('account-username').textContent, 'Canonical');
  assert.equal(JSON.parse(ok.w.localStorage.getItem(key)).username, 'Canonical'); ok.close();
  const offline = create(saved, async () => new Error('offline')); await tick();
  assert.equal(offline.d.getElementById('account-unavailable').hidden, false);
  assert.equal(JSON.parse(offline.w.localStorage.getItem(key)).token, token); offline.close();
  const malformed = create(saved, async () => ({data:null})); await tick();
  assert.equal(malformed.d.getElementById('account-unavailable').hidden, false);
  assert.notEqual(malformed.w.localStorage.getItem(key), null); malformed.close();
  const expired = create(saved, async () => ({data:{username:null}})); await tick();
  assert.equal(expired.d.getElementById('account-guest').hidden, false);
  assert.equal(expired.w.localStorage.getItem(key), null);
  assert.match(expired.d.getElementById('account-error').textContent,/wygasła/); expired.close();
  const rejected = create(null, async () => ({ok:false,data:{message:'Nieprawidłowy PIN'}}));
  rejected.d.getElementById('account-name').value='Alice'; rejected.d.getElementById('account-pin').value='1111';
  rejected.d.getElementById('account-form').dispatchEvent(new rejected.w.Event('submit',{bubbles:true,cancelable:true})); await tick();
  assert.match(rejected.d.getElementById('account-error').textContent,/Nieprawidłowy PIN/);
  assert.equal(rejected.w.localStorage.getItem(key), null); rejected.close();
  // Stary globalny worker wstrzykuje skrypty do projektów. Strona konta
  // musi być wyłączona, również w wariancie z .html.
  const handlers = {};
  const self = { location: {origin: 'https://rejson59.github.io'}, addEventListener: (name, cb) => { handlers[name] = cb; } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), {self, URL, Promise, fetch: () => { throw Error('unexpected fetch'); }});
  for (const route of ['/logowanie', '/logowanie.html', '/partnerstwo', '/partnerstwo.html', '/rejchat', '/rejchat.html', '/profil', '/profil.html']) {
    let touched = false;
    handlers.fetch({request:{method:'GET', mode:'navigate', destination:'document', url:'https://rejson59.github.io' + route}, waitUntil:() => {touched = true;}, respondWith:() => {touched = true;}});
    assert.equal(touched, false, route + ' bez wstrzykiwania ani wejścia projektu');
  }
  assert.ok(!html.includes('view-tracker.js'));
  assert.match(fs.readFileSync(path.join(root, 'index.html'),'utf8'), /href="logowanie"/);
  assert.match(fs.readFileSync(path.join(root, 'rejchat.html'),'utf8'), /href="logowanie"/);
  console.log('Ekran konta: wszystkie testy OK');
})().catch(err => {console.error(err); process.exitCode=1;});

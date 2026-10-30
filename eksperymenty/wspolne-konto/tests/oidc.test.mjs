/* Mock IdP jest używany wyłącznie w teście; nie przechowuje kont i akceptuje dowolne hasło. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { Provider } from 'oidc-provider';
import { chromium } from 'playwright-core';

const origin = 'http://localhost:4173';
const clients = ['projekt-a','projekt-b'].map(client_id => ({
  client_id, token_endpoint_auth_method:'none', grant_types:['authorization_code'], response_types:['code'],
  redirect_uris:[`${origin}/${client_id}/callback.html`],
}));

test('OIDC: PKCE, nonce, state, powrót, dwa projekty i odrzucenie nieznanej odpowiedzi', { timeout: 60000 }, async () => {
  const provider = new Provider('http://localhost:8080/realms/rejson-demo', {
    clients,
    features:{ devInteractions:{ enabled:true } },
    pkce:{ required:() => true, methods:['S256'] },
    cookies:{ keys:['test-only-key-not-a-production-secret-12345678'] },
    findAccount: async (_ctx, id) => ({accountId:id, claims:async () => ({sub:id, preferred_username:'Demo'})}),
    claims:{ openid:['sub'], profile:['preferred_username'] },
  });
  const idp = await new Promise((resolve, reject) => { const s = http.createServer((req,res) => { req.url = req.url.replace(/^\/realms\/rejson-demo(?=\/|$)/, '') || '/'; provider.callback()(req,res); }).listen(8080, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  const web = spawn(process.execPath, ['server.mjs'], { cwd:process.cwd(), stdio:'pipe' });
  let browser;
  try {
    await new Promise((resolve, reject) => { web.stdout.once('data', resolve); web.once('exit', code => reject(new Error('demo server exited ' + code))); });
    const chrome = process.env.CHROME_BIN || (await import('@sparticuz/chromium')).default && await (await import('@sparticuz/chromium')).default.executablePath();
    browser = await chromium.launch({ executablePath:chrome, headless:true, args:['--no-sandbox','--disable-webgl'] });
    const page = await browser.newPage();
    const auth = [];
    page.on('request', req => { if (req.url().includes('/auth?')) auth.push(new URL(req.url())); });
    await page.goto(origin + '/projekt-a/');
    await page.getByRole('button', { name:'Zaloguj się przez Rejson' }).click();
    await page.locator('input[name=login]').fill('demo-user');
    await page.locator('input[name=password]').fill('this-is-only-a-test');
    await page.locator('button[type=submit]').click();
    if (await page.locator('input[name=prompt][value=consent]').count()) await page.locator('button[type=submit]').click();
    await page.waitForURL(origin + '/projekt-a/');
    await page.getByText('Zalogowano jako: Demo').waitFor();
    assert.equal(auth.length, 1);
    assert.equal(auth[0].searchParams.get('response_type'), 'code');
    assert.equal(auth[0].searchParams.get('code_challenge_method'), 'S256');
    assert.ok(auth[0].searchParams.get('code_challenge').length >= 43);
    assert.ok(auth[0].searchParams.get('state').length >= 20);
    assert.ok(auth[0].searchParams.get('nonce').length >= 20);
    assert.equal(auth[0].searchParams.get('redirect_uri'), origin + '/projekt-a/callback.html');
    assert.equal(new URL(page.url()).search, '');
    await page.goto(origin + '/projekt-b/');
    await page.getByRole('button', { name:'Zaloguj się przez Rejson' }).click();
    await page.waitForURL('**/interaction/**');
    await page.locator('input[name=prompt][value=consent]').waitFor({state:'attached'});
    await page.locator('button[type=submit]').click();
    await page.waitForURL(origin + '/projekt-b/');
    await page.getByText('Zalogowano jako: Demo').waitFor();
    assert.equal(auth[1].searchParams.get('client_id'), 'projekt-b');
    assert.notEqual(auth[0].searchParams.get('state'), auth[1].searchParams.get('state'));
    assert.notEqual(auth[0].searchParams.get('nonce'), auth[1].searchParams.get('nonce'));
    const badRedirect = new URL(auth[0]);
    badRedirect.searchParams.set('redirect_uri', 'http://localhost:4173/obcy/callback.html');
    const denial = await page.request.get(badRedirect.toString(), { maxRedirects:0 });
    assert.equal(denial.status(), 400); // niezarejestrowany adres nie otrzymuje kodu
    await page.getByRole('button',{name:'Usuń sesję tego projektu'}).click();
    await page.getByText(/Sesja u dostawcy logowania może nadal być aktywna/).waitFor();
    // Testowy atak: zły nonce w odpowiedzi tokenowej musi być odrzucony.
    await page.route('**/token', async route => {
      const response = await route.fetch();
      const body = await response.json();
      const parts = body.id_token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      payload.nonce = 'wrong-nonce';
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
      body.id_token = parts.join('.');
      await route.fulfill({response, json:body});
    });
    await page.getByRole('button', { name:'Zaloguj się przez Rejson' }).click();
    await page.getByText(/Nie udało się potwierdzić logowania/).waitFor();
    await page.unroute('**/token');
    await page.goto(origin + '/projekt-b/callback.html?code=invalid&state=not-a-real-state');
    await page.getByText(/Nie udało się potwierdzić logowania/).waitFor();
    assert.equal(new URL(page.url()).search, '');
    assert.equal(await page.getByText('Zalogowano jako: Demo').count(), 0);
  } finally {
    if (browser) await browser.close();
    web.kill(); await new Promise(resolve => idp.close(resolve));
  }
});

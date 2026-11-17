/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Test tarczy bezpieczeństwa: blokada skanerów, egzekwowany CSP,
   odchudzone uprawnienia bazy i mocniejsze hashowanie PIN-ów.
   Każdy wpis odpowiada realnemu wektorowi ataku, nie „na wszelki wypadek”. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log('  ✔ ' + name);
  } catch (error) {
    failures++;
    console.log('  ✘ ' + name + '  [' + error.message + ']');
  }
};

(async () => {
  const shield = await import(pathToFileURL(path.join(root, 'rejhub2/middleware.js')).href);

  console.log('\n=== A. TARCZA PRZED SKANERAMI (middleware) ===');

  await check('blokuje pliki konfiguracyjne i panele obce', async () => {
    const probes = [
      '/.env',
      '/.git/config',
      '/.git/HEAD',
      '/wp-admin/',
      '/wp-login.php',
      '/phpmyadmin/index.php',
      '/xmlrpc.php',
      '/config.php',
      '/backup.zip',
      '/db.sql',
      '/cgi-bin/test.cgi'
    ];
    for (const probe of probes) {
      assert.ok(shield.blockedRequest('GET', probe, ''), 'przepuszczono ' + probe);
    }
  });

  await check('nie rusza prawdziwych adresów serwisu', async () => {
    const allowed = [
      '/',
      '/rejchat',
      '/rejchat.html',
      '/admin',
      '/logowanie',
      '/api/session',
      '/api/push-send',
      '/js/view-tracker.js',
      '/.well-known/assetlinks.json',
      '/.well-known/security.txt',
      '/hub/island.js',
      '/rejsejf.html',
      '/app/RejHub.apk',
      '/profil?u=rejson59'
    ];
    for (const url of allowed) {
      assert.equal(shield.blockedRequest('GET', url, ''), null, 'zablokowano ' + url);
    }
  });

  await check('łapie przejście katalogów, SQLi i XSS w adresie', async () => {
    assert.equal(shield.blockedRequest('GET', '/js/../../etc/passwd', ''), 'traversal');
    assert.equal(shield.blockedRequest('GET', '/', '?x=union+select+password+from+community_users'), 'sqli');
    assert.equal(shield.blockedRequest('GET', '/', '?q=%3Cscript%3Ealert(1)%3C/script%3E'), 'xss');
    assert.equal(shield.blockedRequest('GET', '/', '?file=../../etc/passwd'), 'traversal');
  });

  await check('odbija metody i absurdalnie długie adresy', async () => {
    assert.equal(shield.blockedRequest('TRACE', '/', ''), 'method');
    assert.equal(shield.blockedRequest('PROPFIND', '/', ''), 'method');
    assert.equal(shield.blockedRequest('GET', '/' + 'a'.repeat(3000), ''), 'too-long');
    assert.equal(shield.blockedRequest('GET', '/', '?' + 'a'.repeat(5000)), 'too-long');
  });

  await check('publiczna ścieżka przechodzi przez middleware bez odpowiedzi', async () => {
    const response = await shield.default(new Request('https://rejhub.vercel.app/rejchat'));
    assert.equal(response, undefined, 'middleware zatrzymał publiczną stronę');
  });

  await check('panel bez ciasteczka dalej przekierowuje na /login', async () => {
    const response = await shield.default(new Request('https://rejhub.vercel.app/admin'));
    assert.ok(response, 'brak odpowiedzi dla /admin');
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /\/login\?next=%2Fadmin$/);
  });

  await check('skaner dostaje 404 bez dotykania originu', async () => {
    const response = await shield.default(new Request('https://rejhub.vercel.app/.env'));
    assert.ok(response, 'brak odpowiedzi');
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  });

  console.log('\n=== B. NAGŁÓWKI PRZEGLĄDARKI (vercel.json) ===');

  await check('CSP jest egzekwowany, a nie tylko raportowany', async () => {
    const config = JSON.parse(read('rejhub2/vercel.json'));
    const global = config.headers.find((entry) => entry.source === '/(.*)');
    const headers = Object.fromEntries(global.headers.map((entry) => [entry.key, entry.value]));
    assert.ok(headers['Content-Security-Policy'], 'brak egzekwowanego CSP');
    assert.match(headers['Content-Security-Policy'], /default-src 'self'/);
    assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'self'/);
    assert.match(headers['Content-Security-Policy'], /upgrade-insecure-requests/);
    assert.ok(headers['Content-Security-Policy-Report-Only'], 'brak trybu raportowego dla twardszych reguł');
  });

  await check('CSP dopuszcza realnie używane API (tłumacz i GitHub)', async () => {
    const config = JSON.parse(read('rejhub2/vercel.json'));
    const csp = config.headers
      .find((entry) => entry.source === '/(.*)')
      .headers.find((entry) => entry.key === 'Content-Security-Policy').value;
    assert.match(csp, /https:\/\/api\.github\.com/);
    assert.match(csp, /https:\/\/api\.mymemory\.translated\.net/);
    assert.match(csp, /hzbqzfimtroixnldzjeq\.supabase\.co/);
  });

  await check('panel nie da się wcisnąć w obcą ramkę i nie jest indeksowany', async () => {
    const config = JSON.parse(read('rejhub2/vercel.json'));
    const admin = config.headers.find((entry) => /^\/\(admin\|panel/.test(entry.source));
    assert.ok(admin, 'brak reguły dla panelu');
    const headers = Object.fromEntries(admin.headers.map((entry) => [entry.key, entry.value]));
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.match(headers['X-Robots-Tag'], /noindex/);
    assert.equal(headers['Cache-Control'], 'private, no-store');
  });

  await check('CSP blokuje atrybuty on* (script-src-attr none)', async () => {
    const config = JSON.parse(read('rejhub2/vercel.json'));
    const csp = config.headers
      .find((entry) => entry.source === '/(.*)')
      .headers.find((entry) => entry.key === 'Content-Security-Policy').value;
    assert.match(csp, /script-src-attr 'none'/);
    const pages = fs.readdirSync(path.join(root, 'rejhub2')).filter((name) => name.endsWith('.html'));
    assert.ok(pages.length > 10, 'nie znaleziono podstron');
    for (const page of pages) {
      assert.doesNotMatch(
        read('rejhub2/' + page),
        /\son(click|error|load|change|input|submit|focus|blur|keydown|keyup|mouseenter|touchstart)=/i,
        'inline atrybut on* w ' + page
      );
    }
  });

  await check('powrót po logowaniu nie wychodzi poza domenę', async () => {
    const login = read('rejhub2/login.html');
    assert.match(login, /candidate\.origin === location\.origin/);
    assert.doesNotMatch(login, /location\.replace\(next\)/);
  });

  await check('dochodzą nagłówki utrudniające podszycie i wyciek', async () => {
    const config = JSON.parse(read('rejhub2/vercel.json'));
    const keys = config.headers
      .find((entry) => entry.source === '/(.*)')
      .headers.map((entry) => entry.key);
    for (const key of ['Cross-Origin-Resource-Policy', 'X-DNS-Prefetch-Control', 'Origin-Agent-Cluster']) {
      assert.ok(keys.includes(key), 'brak ' + key);
    }
  });

  console.log('\n=== C. BAZA: MNIEJ UPRAWNIEŃ, WIĘCEJ PRACY PRZY HASŁACH ===');

  const sql = read('supabase/2026-11-17_security_hardening.sql');

  await check('anon traci TRUNCATE i zapisy, których nie używa', async () => {
    assert.match(sql, /revoke truncate, references, trigger on all tables in schema public from anon/i);
    assert.match(sql, /revoke insert on public\.%I from anon/i);
    assert.match(sql, /revoke update on public\.%I from anon/i);
    assert.match(sql, /revoke delete on public\.%I from anon/i);
  });

  await check('dane prywatne nie są nawet czytelne dla anon', async () => {
    assert.match(sql, /revoke select on public\.%I from anon/i);
    assert.match(sql, /'community_users'/);
    assert.match(sql, /'rejsejf_items'/);
    assert.match(sql, /'rejchat_dm_messages'/);
  });

  await check('funkcje administracyjne znikają z roli anon', async () => {
    assert.match(sql, /revoke execute on function %s from public, anon/i);
    assert.match(sql, /grant execute on function %s to authenticated, service_role/i);
    assert.match(sql, /revoke execute on function public\.claim_initial_admin\(\) from public, anon/i);
    assert.match(sql, /'community_ip_hash', 'community_request_ip'/);
  });

  await check('wewnętrzne funkcje (m.in. push_enqueue) są tylko dla backendu', async () => {
    assert.match(sql, /'push_enqueue'/);
    assert.match(sql, /'push_enqueue_tg'/);
    assert.match(sql, /'page_presence_throttle'/);
    assert.match(sql, /'get_admin_daily_views'/);
    assert.match(sql, /revoke execute on function %s from public, anon[\s\S]{0,300}grant execute on function %s to service_role/);
  });

  await check('obecność na stronie nie jest publicznie czytelna', async () => {
    assert.match(sql, /drop policy if exists page_presence_select_public/i);
    assert.match(sql, /revoke select on public\.page_presence from anon, authenticated/i);
  });

  await check('logowanie ma limit per konto i per sieć', async () => {
    assert.match(sql, /create table if not exists public\.community_login_ip_attempts/i);
    assert.match(sql, /community_auth_ip_attempt/);
    assert.match(sql, /attempts <= 30/);
    assert.match(sql, /interval '15 minutes'/);
  });

  await check('4-cyfrowe PIN-y idą na bcrypt, stare migrują przy logowaniu', async () => {
    assert.match(sql, /extensions\.crypt\(v_secret, extensions\.gen_salt\('bf', 12\)\)/);
    assert.match(sql, /set pin_hash = extensions\.crypt\(v_secret, extensions\.gen_salt\('bf', 12\)\)/);
    assert.doesNotMatch(sql, /v_hash := encode\(extensions\.digest\('rejson_pin_v1:'/);
  });

  await check('nieistniejące konto kosztuje tyle samo czasu co istniejące', async () => {
    assert.match(sql, /perform extensions\.crypt\(v_secret, extensions\.gen_salt\('bf', 8\)\)/);
  });

  console.log('\n=== D. KONTAKT DLA BADACZY ===');

  await check('security.txt jest kompletny', async () => {
    const txt = read('rejhub2/security.txt');
    assert.match(txt, /^Contact: https:\/\//m);
    assert.match(txt, /^Expires: \d{4}-\d{2}-\d{2}T/m);
    assert.match(txt, /^Canonical: https:\/\//m);
    const config = JSON.parse(read('rejhub2/vercel.json'));
    assert.ok(
      config.rewrites.some((entry) => entry.source === '/.well-known/security.txt'),
      'brak przepisania /.well-known/security.txt'
    );
  });

  console.log(failures ? '\nWYNIK: ' + failures + ' błędów ✘' : '\nWYNIK: wszystko ✔');
  process.exit(failures ? 1 : 0);
})();

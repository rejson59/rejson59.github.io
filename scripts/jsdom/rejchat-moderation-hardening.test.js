/* Regresje po fali kont z 12.11.2026: filtr nicków przy rejestracji, limit
   zakładania kont z jednej przeglądarki, symbole nienawiści, komunikat po
   zablokowanym zdjęciu, wylogowanie wszystkich urządzeń i ważność sesji. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/* 1. Zdjęcie zatrzymane przez moderację nie znika po cichu. */
{
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://rejhub.vercel.app/', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(read('js/rejchat-photos.js'));
  const photos = w.RJChatPhotos;
  assert.ok(photos && typeof photos.button === 'function', 'brak modułu zdjęć');
  const blocked = photos.button({ id: '11111111-1111-1111-1111-111111111111', status: 'blocked', expires_at: '2026-12-01T00:00:00Z' });
  assert.match(blocked, /usunięte przez moderację/, 'zablokowane zdjęcie nie ma komunikatu');
  assert.doesNotMatch(blocked, /data-photo-id/, 'zablokowanego zdjęcia nie wolno dać do pobrania');
  const ok = photos.button({ id: '22222222-2222-2222-2222-222222222222', status: 'ok', expires_at: '2026-12-01T00:00:00Z' });
  assert.match(ok, /data-photo-id/, 'zdjęcie „ok” ma się dać otworzyć');
  const expired = photos.button({ id: '33333333-3333-3333-3333-333333333333', status: 'ok', expires_at: '2026-01-01T00:00:00Z' });
  assert.match(expired, /wygasło/, 'wygasłe zdjęcie bez komunikatu');
}

/* 2. Rejestracja wysyła identyfikator przeglądarki, logowanie nie. */
{
  const login = read('js/logowanie.js');
  assert.match(login, /p_fp/, 'logowanie.js nie wysyła p_fp');
  assert.match(login, /rejson_device_id_v1/, 'brak trwałego identyfikatora przeglądarki');
  assert.match(login, /randomUUID/, 'identyfikator bez losowego źródła');
  assert.match(login, /mode !== "login"/, 'p_fp nie jest ograniczone do rejestracji');
  assert.match(login, /Nie można zapisać sesji/, 'brak obsługi trybu prywatnego');

  const chat = read('js/community.js');
  assert.match(chat, /p_fp/, 'community.js nie wysyła p_fp przy rejestracji');
  assert.match(chat, /rejson_device_id_v1/, 'czat ma używać tego samego identyfikatora');
  assert.match(chat, /!nameStatus\.taken/, 'p_fp nie jest ograniczone do rejestracji w czacie');
}

/* 3. „Wyloguj wszystkie urządzenia” na profilu. */
{
  const html = read('rejhub2/profil.html');
  assert.match(html, /id="profile-logout-all"/, 'brak przycisku wylogowania urządzeń');
  assert.match(html, /profil\.js\?v=7/, 'profil.js bez nowej wersji');
  assert.match(html, /rejchat-safety\.js/, 'profil bez modułu zgłaszania');

  const js = read('js/profil.js');
  assert.match(js, /rejchat_logout_all/, 'profil nie woła rejchat_logout_all');
  assert.match(js, /localStorage\.removeItem\('rejson_community_session_v1'\)/, 'po wylogowaniu sesja zostaje w przeglądarce');
}

/* 4. Wersje plików, które się zmieniły. */
{
  const chat = read('rejhub2/rejchat.html');
  assert.match(chat, /rejchat-photos\.js\?v=3/, 'rejchat-photos.js bez nowej wersji');
  assert.match(chat, /rejchat-messenger\.css\?v=14/, 'arkusz czatu bez nowej wersji');
  assert.match(chat, /community\.js\?v=2026-11-12-moderacja/, 'community.js bez nowej wersji');
  assert.match(chat, /rejchat-private\.js\?v=13/, 'rejchat-private.js bez nowej wersji');
  assert.match(read('rejhub2/logowanie.html'), /logowanie\.js\?v=10/, 'logowanie.js bez nowej wersji');
}

/* 5. Migracja bazy robi to, co opisuje raport. */
{
  const sql = read('supabase/2026-11-18_rejchat_moderation_hardening.sql');
  assert.match(sql, /perform public\.rejchat_validate_nickname\(v_name\)/, 'rejestracja nie sprawdza nicku');
  assert.match(sql, /community_register_limits/, 'brak limitu nowych kont');
  assert.match(sql, /v_attempts > 2/, 'limit nowych kont nie egzekwuje progu');
  assert.match(sql, /drop function if exists public\.community_register\(text, text\)/, 'stara rejestracja bez limitu nadal istnieje');
  assert.match(sql, /interval '90 days'/, 'sesja nadal nie wygasa');
  assert.match(sql, /rejchat_logout_all/, 'brak wylogowania wszystkich urządzeń');
  assert.match(sql, /'photo'.*'status',f\.status/s, 'lista czatu nie zna statusu zdjęcia');
  assert.match(sql, /rejchat_private_enrich/, 'prywatne rozmowy bez statusu zdjęcia');
  for (const phrase of ['kkk', 'ku klux klan', 'hitler', '1488', 'swastyka']) {
    assert.ok(sql.includes(`('${phrase}')`), `brak frazy ${phrase} w migracji`);
  }
  /* Frazy nienawiści muszą być dopasowywane do całych słów, inaczej blokują
     niewinne wyrazy. */
  assert.match(sql, /select v\.phrase,'word'/, 'symbole nienawiści nie są dopasowywane do słów');
}

/* 6. Test SQL towarzyszący migracji istnieje i jest transakcyjny. */
{
  const test = read('supabase/tests/rejchat_moderation_hardening.sql');
  assert.match(test, /\nbegin;/, 'test SQL bez transakcji');
  assert.match(test, /rollback;/, 'test SQL bez wycofania zmian');
  assert.match(test, /community_register/, 'test nie sprawdza rejestracji');
  assert.match(test, /rejchat_logout_all/, 'test nie sprawdza wylogowania urządzeń');
}

console.log('PASS: filtr nicków, limit rejestracji, symbole nienawiści, komunikat zdjęcia, wylogowanie urządzeń, ważność sesji');

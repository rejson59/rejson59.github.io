/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Pilnuje, żeby wykonane porządki moderacyjne (17.11.2026) miały ślad w repo
   i żeby nikt przypadkiem nie cofnął decyzji właściciela. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const sql = read('supabase/2026-11-17_moderation_cleanup.sql');

/* A. Konta objęte decyzją */
for (const name of ['rejson.59', 'janexz602', 'cobaltuwka', 'tom_dert', 'nigerz']) {
  assert.ok(sql.includes(`'${name}'`), `brak decyzji o koncie ${name}`);
}
assert.match(sql, /username_lower in \(/, 'kasowanie musi iść po nazwach, nie po id');
assert.match(sql, /not coalesce\(is_owner, false\)/, 'konto właściciela musi być chronione');
assert.match(sql, /not coalesce\(is_bot, false\)/, 'konto bota musi być chronione');

/* B. Zdjęcia i bio */
assert.match(sql, /delete from public\.rejchat_photos[\s\S]*status = 'blocked'/, 'brak usuwania zablokowanych zdjęć');
assert.match(sql, /update public\.rejchat_profiles[\s\S]*set bio = ''/, 'brak czyszczenia opisu profilu');

/* C. Cykliczne sprzątanie limitów rejestracji */
assert.match(sql, /cron\.schedule\(\s*'community_register_limits_prune'/, 'brak wpisu w cronie');
assert.match(sql, /community_register_limits_prune\(\);/, 'cron musi wołać funkcję sprzątającą');
assert.equal(sql.match(/cron\.schedule/g).length, 1, 'cron.schedule ma być wołany raz — ponowne wywołanie nadpisuje zadanie');

/* D. Nie zapisujemy treści usuniętych wiadomości w repo (prywatność) */
assert.doesNotMatch(sql, /chat bez cenzury|epstain|Spierdalaj/i, 'treść usuniętych wiadomości nie może trafić do repo');

console.log('WYNIK: everything ✔ — porządki moderacyjne mają ślad i nie ruszają kont specjalnych');

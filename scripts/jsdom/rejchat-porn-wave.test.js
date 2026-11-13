const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const sql = read('supabase/2026-11-19_rejchat_porn_wave.sql');

/* Reguły dodane po fali 19.11 — filtr musi łapać warianty, które ją przepuściły. */
['porn', 'porm', 'onlyfans', 'rule34', 'johnny sin', 'xvideos', 'xnxx', 'hentai'].forEach((phrase) => {
  assert.ok(sql.includes("('" + phrase + "'"), 'brak frazy filtra: ' + phrase);
});

assert.match(sql, /where not exists[\s\S]{0,120}lower\(b\.phrase\)/i, 'dodawanie fraz musi być idempotentne');
assert.match(sql, /interval '15 minutes'/, 'automatyczne wyciszenie ma trwać 15 minut, nie godzinę');
assert.match(sql, /insert into public\.rejchat_warnings/, 'automat musi wystawić ostrzeżenie, a nie tylko blokadę');
assert.match(sql, /like 'Automatyczna moderacja%'/, 'ostrzeżenia z automatu nie mogą się mnożyć');
assert.doesNotMatch(sql, /delete from public\.community_users/i, 'automat nigdy nie usuwa konta');
assert.doesNotMatch(sql, /interval '7 days'|interval '30 days'/i, 'automat nie może nadawać długich blokad');

const moderation = read('supabase/2026-11-17_rejchat_auto_moderation.sql');
assert.match(moderation, /rejchat_auto_moderate/, 'migracja automatu musi istnieć w repozytorium');

/* Wyciszenie musi działać przy zapisie — inaczej filtr tylko chowa wpisy po fakcie. */
assert.match(sql, /rejchat_text_blocked\(m\.content\)/, 'automat musi korzystać z tego samego filtra co zapis wiadomości');
assert.match(sql, /insert into public\.rejchat_write_blocks/, 'blokada pisania musi być zakładana w bazie');

console.log('PASS: fala pornograficzna — nowe frazy, 15-minutowy mute, ostrzeżenie z automatu, bez banów');

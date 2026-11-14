/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Test trwałych blokad sieci (IP): egzekwowanie po stronie bazy i narzędzia
   w panelu właściciela. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const sql = read('supabase/2026-11-14_ip_bans.sql');

/* --------------------------------------------------- A. baza ----------- */

assert.match(sql, /create table if not exists public\.community_ip_bans/, 'brak tabeli blokad');
assert.match(sql, /ip_hash text primary key/, 'blokada musi być liczona po hashu adresu');
assert.match(sql, /constraint community_ip_bans_hash check \(ip_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/,
  'hash musi mieć 64 znaki hex');
assert.doesNotMatch(sql, /insert into public\.community_ip_bans[\s\S]{0,400}\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  'adres IP nie może być zapisany jawnie');
assert.match(sql, /enable row level security/, 'tabela blokad musi mieć RLS');
assert.match(sql, /revoke all on public\.community_ip_bans from public, anon, authenticated/,
  'zwykli użytkownicy nie mogą czytać blokad');

/* Egzekwowanie: logowanie/rejestracja (sesja) i każda akcja z tokenem. */
assert.match(sql, /create trigger community_sessions_ip_guard/, 'brak triggera na sesjach');
assert.match(sql, /before insert on public\.community_sessions/, 'trigger musi łapać każdą nową sesję');
assert.match(sql, /create or replace function public\.community_session_user/, 'brak strażnika akcji z tokenem');
assert.ok(
  sql.indexOf('community_ban_active(v_ip)') < sql.indexOf('update public.community_sessions'),
  'sprawdzenie blokady musi być przed jakąkolwiek akcją'
);
assert.match(sql, /Ten adres sieci został trwale zablokowany/, 'brak czytelnego komunikatu');
assert.match(sql, /using errcode = '42501'/, 'odmowa musi mieć kod 42501');

/* Panel: blokada, lista, zdjęcie blokady. */
assert.match(sql, /create or replace function public\.admin_ip_ban_user/, 'brak blokady z panelu');
assert.match(sql, /create or replace function public\.admin_ip_bans_list/, 'brak listy blokad');
assert.match(sql, /create or replace function public\.admin_ip_ban_remove/, 'brak zdejmowania blokady');
assert.match(sql, /if not coalesce\(public\.is_widget_admin\(\), false\)/,
  'funkcje panelu muszą sprawdzać uprawnienia');
assert.match(sql, /delete from public\.community_sessions where user_id = target\.id/,
  'blokada musi od razu wylogować konto');

/* Decyzja właściciela z 14.11.2026 — jedna, bezterminowa blokada. */
const hash = '202b518863d52cac65155dbcb8e5e9331271352c5a3b560192e80f06bf6157e5';
assert.ok(sql.includes(hash), 'brak decyzji o blokadzie sieci @rejson.59');
assert.match(sql, /on conflict \(ip_hash\) do update[\s\S]{0,200}expires_at = null/,
  'powtórne nałożenie blokady musi ją przedłużać bezterminowo');
assert.match(sql, /'@rejson\.59 \+ janeXz602'/, 'brak opisu, których kont dotyczy blokada');
assert.match(sql, /delete from public\.community_sessions[\s\S]{0,400}cd2024bf-cfb7-4391-a48b-0ef4cb2803c8/,
  'sesje @rejson.59 muszą zostać unieważnione');
assert.match(sql, /4f191511-2a2e-4915-9f3a-72a4215efc75/, 'sesje janeXz602 muszą zostać unieważnione');

/* --------------------------------------------------- B. panel ---------- */

const html = read('rejhub2/admin.html');
assert.ok(html.includes('id="rcmod-ipbans"'), 'brak listy blokad sieci w panelu');
assert.ok(html.includes('id="rcmod-ipban-form"'), 'brak formularza blokady sieci');
assert.ok(html.includes('id="rcmod-ipban-user"'), 'brak pola nazwy konta');
assert.ok(html.includes('js/admin-rejchat-moderation.js?v=9'), 'skrypt panelu musi mieć nowy numer wersji');
assert.match(html, /Blokada sieci · IP/, 'brak nagłówka sekcji');

const js = read('js/admin-rejchat-moderation.js');
assert.ok(js.includes("rpc('admin_ip_bans_list'"), 'panel nie pobiera listy blokad');
assert.ok(js.includes("action('admin_ip_ban_user'"), 'panel nie umie nałożyć blokady');
assert.ok(js.includes("action('admin_ip_ban_remove'"), 'panel nie umie zdjąć blokady');
assert.match(js, /Zablokować bezterminowo całą sieć konta/, 'brak potwierdzenia przed blokadą');
assert.match(js, /bezterminowo/i, 'panel musi pokazywać, że blokada jest bezterminowa');
assert.ok(js.includes("['phrases','blocks','messages','photos','actions','ipbans']"),
  'czyszczenie panelu musi obejmować listę blokad');

/* --------------------------------------------------- C. brak wycieku --- */

const leak = /202b518863d52cac65155dbcb8e5e9331271352c5a3b560192e80f06bf6157e5/;
['rejhub2/admin.html', 'js/admin-rejchat-moderation.js', 'js/admin-panel.js'].forEach((file) => {
  assert.doesNotMatch(read(file), leak, file + ': hash sieci nie może trafić do przeglądarki');
});
assert.doesNotMatch(js, /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  'panel nie może operować jawnym adresem IP');

console.log('WYNIK: 1/1 ✔');
console.log('PASS: trwałe blokady sieci — baza, egzekwowanie i panel właściciela');

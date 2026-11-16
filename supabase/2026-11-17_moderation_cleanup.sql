-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- Porządki moderacyjne po fali trollingu — RejHub / RejChat, wykonane 17.11.2026.
--
-- Decyzja właściciela (17.11.2026): „na to wszystko się zgadzam” — kontynuacja
-- zgody z 13.11 (sprzątanie czatu i kont). Poniższe kroki zostały wykonane
-- ręcznie na projekcie produkcyjnym; plik jest śladem decyzji i pozwala
-- powtórzyć operację na kopii bazy.
--
-- Zakres (stan przed operacją):
--   * @rejson.59 — 8 wiadomości, 5 zdjęć; podszywanie się pod właściciela,
--     sieć 202b5188… objęta już bezterminowym banem IP (2026-11-14_ip_bans.sql).
--   * janeXz602 — 2 wiadomości, 1 zdjęcie; to samo urządzenie i sieć.
--   * cobaltuwka — 9 wiadomości; nawoływanie do czatu bez moderacji, spam reklamowy.
--   * Tom_Dert — 6 wiadomości; spam w tym samym wątku.
--   * nigerz — 0 wiadomości; nazwa konta łamie regulamin (słowo obraźliwe).
--
-- Dodatkowo:
--   * 5 zdjęć @JasiekJodlowski ze statusem 'blocked' (moderacja ich nie
--     przepuściła) — usunięte z bazy razem z bajtami: 1 786 015 B.
--     Zdjęcie ze statusem 'ok' zostaje.
--   * bio @StarGhost z wulgarnym opisem — wyczyszczone; konto i treści zostają.
--   * wpis w cronie dla community_register_limits_prune() — dotąd funkcja
--     istniała, ale nikt jej nie wołał, więc tabela limitów rosła.
--
-- Czego NIE robimy: nie ruszamy identity_links (ślad urządzeń i sesji
-- zostaje, żeby ewentualny powrót tej samej sieci był widoczny w panelu),
-- nie zdejmujemy bana IP i nie ruszamy kont is_owner/is_bot.

/* ------------------------------------------------------------------ */
/* 1. Konta i wszystko, co do nich należało (klucze obce = CASCADE)    */
/* ------------------------------------------------------------------ */

with targets as (
  select id
    from public.community_users
   where username_lower in ('rejson.59', 'janexz602', 'cobaltuwka', 'tom_dert', 'nigerz')
     and not coalesce(is_owner, false)
     and not coalesce(is_bot, false)
)
delete from public.community_users u
 using targets t
 where u.id = t.id;
-- Efekt: 5 kont, 25 wiadomości w czacie publicznym, 6 zdjęć, 3 sesje.

/* ------------------------------------------------------------------ */
/* 2. Zdjęcia zablokowane przez moderację (JasiekJodlowski)            */
/* ------------------------------------------------------------------ */

delete from public.rejchat_photos
 where status = 'blocked'
   and owner_id = (select id from public.community_users where username_lower = 'jasiekjodlowski');
-- Efekt: 5 zdjęć, 1 786 015 B zwolnione.

/* ------------------------------------------------------------------ */
/* 3. Opis profilu z wulgaryzmem (StarGhost)                           */
/* ------------------------------------------------------------------ */

update public.rejchat_profiles p
   set bio = '', updated_at = now()
 where p.user_id = (select id from public.community_users where username_lower = 'starghost')
   and coalesce(p.bio, '') <> '';

/* ------------------------------------------------------------------ */
/* 4. Sprzątanie tabeli limitów rejestracji                             */
/* ------------------------------------------------------------------ */

select cron.schedule(
  'community_register_limits_prune',
  '23 3 * * *',
  'select public.community_register_limits_prune();'
);
-- Codziennie o 03:23 UTC; funkcja kasuje okna starsze niż doba.

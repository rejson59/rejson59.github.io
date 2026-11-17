-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- Usunięcie wpisów RejChatu — 17.11.2026.
--
-- Decyzja właściciela (17.11.2026): „Usuń całkowicie te wpisy, możesz zamiast
-- tego dodać zakładkę co nowego do menu jakby ktoś chciał zajrzeć”.
--
-- Wykonane na produkcji po wyczyszczeniu czatu (2026-11-17_chat_wipe.sql).
-- Plik jest śladem decyzji i pozwala powtórzyć operację na kopii bazy.
--
-- Zakres (stan przed operacją):
--   * public.community_posts — 3 wpisy (dwie informacje Agenta AI
--     i jeden wpis użytkownika),
--   * public.community_comments — 0 wierszy,
--   * public.community_likes — 0 wierszy,
--   * public.community_media z post_id — 0 wierszy,
--   * public.rejchat_notifications z post_id — 0 wierszy.
--
-- Czego NIE ruszamy:
--   * rejchat_dm_messages / rejchat_dm_threads — prywatne rozmowy (10 wiadomości
--     w 3 wątkach),
--   * rejchat_warnings / rejchat_write_blocks / rejchat_auto_log — historia
--     moderacji,
--   * kont użytkowników, profili, nicków i pozostałych aplikacji.
--
-- Interfejs: zakładka „Wpisy” i kompozytor zniknęły z /rejchat. Informacje
-- o zmianach strony są teraz na /co-nowego (menu → Więcej → Co nowego).
-- Tabela community_posts zostaje w bazie (pusta) — panel administratora nadal
-- potrafi ją odczytać, a ewentualne stare odwołania nie wywalą się błędem.

begin;

/* 1. Wpisy — komentarze, polubienia, media i powiadomienia znikają kaskadowo. */
delete from public.community_posts;

/* 2. Zabezpieczenie na wypadek braku CASCADE: sieroty po usuniętych wpisach. */
delete from public.community_comments
 where post_id is null;
delete from public.community_likes
 where post_id is null;
delete from public.community_media
 where post_id is null;

commit;

/* Weryfikacja po operacji (oczekiwane zera w pierwszych czterech kolumnach):
select (select count(*) from public.community_posts)      as wpisy,
       (select count(*) from public.community_comments)   as komentarze,
       (select count(*) from public.community_likes)      as polubienia,
       (select count(*) from public.community_media
         where post_id is not null)                       as media_wpisow,
       (select count(*) from public.rejchat_dm_messages)  as dm_zostawione,
       (select count(*) from public.community_users)      as konta_zostawione;
*/

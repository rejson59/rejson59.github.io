-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- Wyczyszczenie publicznego czatu RejHub — 17.11.2026.
--
-- Decyzja właściciela (17.11.2026): „Wyczyścisz cały czat? I tak tam są same
-- głupoty a to tylko zaśmieca mój serwer na supabase”. Operacja wykonana
-- ręcznie na projekcie produkcyjnym; plik jest śladem decyzji i pozwala
-- powtórzyć sprzątanie na kopii bazy.
--
-- Zakres (stan przed operacją):
--   * public.community_chat — 67 wiadomości w pokojach „general” i „links”,
--   * public.rejchat_chat_reactions — 14 reakcji (CASCADE od wiadomości),
--   * public.rejchat_room_reads — 360 znaczników odczytu (CASCADE),
--   * public.rejchat_photos — 2 zdjęcia przypięte do wiadomości czatu
--     (CASCADE), razem z bajtami; zostaje 1 zdjęcie z prywatnej rozmowy.
--
-- Czego NIE ruszamy:
--   * rejchat_dm_messages / rejchat_dm_threads — prywatne rozmowy użytkowników
--     (10 wiadomości w 3 wątkach) nie są publicznym czatem,
--   * community_posts — wpisy RejChatu (3) to osobna zakładka, nie czat,
--   * rejchat_warnings / rejchat_write_blocks / rejchat_auto_log — historia
--     moderacji; bez niej panel nie pokaże, kto i za co dostał ostrzeżenie,
--   * konta, profile, nicki, RejSejf, RejFile i inne dane użytkowników.
--
-- Kolejność ma znaczenie tylko dla czytelności: klucze obce mają CASCADE,
-- więc usunięcie wiersza z community_chat zabiera reakcje, odczyty, przypięcia
-- i zdjęcia powiązane z tą wiadomością.
--
-- Po operacji czat pokazuje stan pusty („Pusto tu… bądź pierwszą osobą na
-- czacie! 👋”). Osobne czyszczenie nie jest potrzebne w kodzie strony.

begin;

/* 1. Publiczny czat — wszystko naraz. */
delete from public.community_chat;

/* 2. Zabezpieczenie na wypadek, gdyby kiedyś zniknęło CASCADE: usuń sieroty
      po zdjęciach czatu (te z private_message_id należą do DM i zostają). */
delete from public.rejchat_photos
 where public_message_id is not null;

commit;

/* Weryfikacja po operacji (oczekiwane zera w pierwszych trzech kolumnach):
select (select count(*) from public.community_chat)              as wiadomosci,
       (select count(*) from public.rejchat_chat_reactions)      as reakcje,
       (select count(*) from public.rejchat_room_reads)          as odczyty,
       (select count(*) from public.rejchat_photos
         where public_message_id is not null)                    as zdjecia_czatu,
       (select count(*) from public.rejchat_dm_messages)         as dm_zostawione,
       (select count(*) from public.community_posts)             as wpisy_zostawione;
*/

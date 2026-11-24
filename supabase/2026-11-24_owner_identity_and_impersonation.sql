-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- Runda 23 — tożsamość właściciela i blokada podszywania się.
--
-- Co się zmienia i dlaczego:
--
-- 1. `community_login` zwraca teraz `is_owner` z bazy. Klient (`js/community.js`,
--    `js/premium.js`, `js/admin-panel.js`) rozpoznawał właściciela PO NAZWIE:
--    `String(name).toLowerCase() === "rejson59"`. Konto `rejson-59` (19.11)
--    dostawało więc koronę „👑 Właściciel”, przyciski przypinania i usuwania
--    cudzych wiadomości — mimo że w bazie nie miało żadnych uprawnień.
--    Od teraz o odznace decyduje wyłącznie flaga `community_users.is_owner`.
--
--    UWAGA: definicja `community_login` żyje w bazie (bcrypt, limity IP,
--    kontrola nagłówka `Prefer`). Zamiast przepisywać ją z pamięci — co
--    zgubiłoby te zabezpieczenia — podmieniamy w istniejącej definicji
--    dokładnie dwa fragmenty i wykonujemy ją ponownie.
--
-- 2. `rejchat_validate_nickname` rezerwuje nazwy podszywające się pod
--    właściciela i markę (`rejson`, `rejhub` w dowolnej pisowni). Działa dla
--    rejestracji, zmiany nicku w RejChacie i zmiany nazwy przez panel admina.
--
-- 3. Usuwa konto-impostora `rejson-59` i puste konta-śmieci, czyści sesje
--    starsze niż 90 dni.
--
-- Wszystko jest idempotentne — można uruchomić ponownie bez szkody.

/* ------------------------------------------------------------------ */
/* 1. Logowanie zwraca flagę właściciela                               */
/* ------------------------------------------------------------------ */

do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'community_login' and p.pronargs = 2;

  if def is null then
    raise exception 'Brak funkcji public.community_login(text, text) — uruchom wcześniejsze migracje.';
  end if;

  if def like '%''is_owner''%' then
    raise notice 'community_login już zwraca is_owner — pomijam.';
    return;
  end if;

  def := replace(def,
    'select id, username, pin_hash into v_user',
    'select id, username, pin_hash, is_owner into v_user');

  def := replace(def,
    'return jsonb_build_object(''token'', v_token, ''username'', v_user.username);',
    'return jsonb_build_object(''token'', v_token, ''username'', v_user.username, ''is_owner'', coalesce(v_user.is_owner, false));');

  if def not like '%is_owner%' then
    raise exception 'Nie udało się wstawić is_owner do community_login — definicja funkcji się zmieniła. Sprawdź ją ręcznie.';
  end if;

  execute def;
  raise notice 'community_login zwraca teraz is_owner.';
end $$;

/* ------------------------------------------------------------------ */
/* 2. Nazwy zarezerwowane: właściciel i marka                          */
/* ------------------------------------------------------------------ */

/* Sprawdzamy formę znormalizowaną: bez wielkości liter, spacji, myślników,
   podkreśleń, kropek i „leetspeaku”. `R E J S O N 5 9`, `rejson-59`,
   `rejson_59` i `r3json59` to ta sama nazwa.
   `is_widget_admin()` jest prawdziwe tylko dla prawdziwego panelu właściciela,
   nigdy dla zalogowanego konta społeczności — dlatego zwykły użytkownik
   zawsze dostaje `true` przy nazwie zawierającej „rejson” lub „rejhub”. */
create or replace function public.rejchat_nickname_reserved(p_nickname text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  compact text;
begin
  compact := regexp_replace(
    translate(
      lower(coalesce(public.rejchat_filter_normalize(p_nickname), '')),
      '0134578@$!', 'oieastbasi'
    ),
    '[^a-z0-9]', '', 'g'
  );
  if compact = '' then return false; end if;
  if coalesce(public.is_widget_admin(), false) then return false; end if;

  return position('rejson' in compact) > 0 or position('rejhub' in compact) > 0;
end $$;

revoke all on function public.rejchat_nickname_reserved(text) from public, anon, authenticated;

create or replace function public.rejchat_validate_nickname(p_nickname text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  n text := btrim(coalesce(p_nickname, ''));
begin
  if n = '' then return n; end if;
  if char_length(n) < 2 or char_length(n) > 32 or n ~ '[[:cntrl:]]' or n ~ '(.)\1{11,}' or n ~* '(https?://|www[.])' or
     n ~ ('[' || chr(173) || chr(8203) || chr(8204) || chr(8205) || chr(8234) || chr(8235) || chr(8236) ||
           chr(8237) || chr(8238) || chr(8294) || chr(8295) || chr(8296) || chr(8297) || chr(65279) || ']') then
    raise exception 'Nick musi mieć 2–32 znaki i nie może zawierać linków ani ukrytych znaków.';
  end if;
  if public.rejchat_nickname_blocked(n) then
    raise exception 'Nick zawiera niedozwoloną frazę.';
  end if;
  /* Konto `rejson-59` z 19.11 przeszło właśnie tędy i podszywało się
     pod właściciela. */
  if public.rejchat_nickname_reserved(n) then
    raise exception 'Ta nazwa jest zarezerwowana dla właściciela RejHuba. Wybierz inną.'
      using errcode = 'check_violation';
  end if;
  return n;
end $$;

revoke all on function public.rejchat_validate_nickname(text) from public, anon, authenticated;

/* ------------------------------------------------------------------ */
/* 2b. Wpisy i komentarze: domknięcie pozostałości po rundzie 22        */
/* ------------------------------------------------------------------ */

/* W rundzie 22 zniknęły wpisy, ale funkcje je tworzące nadal były nadane
   anonimowi. Każdy ze ważnym tokenem mógł więc przywrócić wpis przez POST —
   treść wracałaby do `community_posts`, choć UI jej już nie pokazuje.
   Zamykamy całą rodzinę funkcji wpisów i komentarzy; `admin_delete_post`
   zostaje wyłączone tymczasowo razem z nimi (panel ma własne RPC). */
revoke all on function public.community_create_post(text, text, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.community_delete_post(text, uuid) from public, anon, authenticated;
revoke all on function public.community_toggle_post_like(text, uuid) from public, anon, authenticated;
revoke all on function public.community_list_posts(integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_delete_post(uuid) from public, anon, authenticated;
revoke all on function public.community_add_comment(text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.community_delete_comment(text, uuid) from public, anon, authenticated;
revoke all on function public.community_list_comments(uuid) from public, anon, authenticated;

/* ------------------------------------------------------------------ */
/* 3. Sprzątanie: konto-impostor i puste konta                         */
/* ------------------------------------------------------------------ */

do $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.community_users
   where username_lower = 'rejson-59' and is_owner is not true
   limit 1;

  if v_id is not null then
    delete from public.community_sessions where user_id = v_id;
    delete from public.community_users where id = v_id;
    raise notice 'Usunięto konto podszywające się pod właściciela (rejson-59).';
  else
    raise notice 'Konta rejson-59 już nie ma.';
  end if;
end $$;

/* Puste konta założone w dniach 17–18.11 (losowe ciągi znaków, jedno
   logowanie, zero treści). Warunki sprawdzane ponownie przy usuwaniu —
   jeśli konto zdążyło coś opublikować, zostaje. */
do $$
declare
  r record;
  v_usuniete integer := 0;
begin
  for r in
    select u.id, u.username
      from public.community_users u
     where u.username_lower in ('dhshshsh', 'ddkkdkdkd', 'czarniutki_chlebek12')
       and u.is_owner is not true and u.is_bot is not true
       and not exists (select 1 from public.community_chat c where c.author_name = u.username)
       and not exists (select 1 from public.community_posts po where po.author_id = u.id)
       and not exists (select 1 from public.rejchat_profiles pr where pr.user_id = u.id)
       and not exists (select 1 from public.rejsejf_items s where s.owner_id = u.id)
  loop
    delete from public.community_sessions where user_id = r.id;
    delete from public.community_users where id = r.id;
    v_usuniete := v_usuniete + 1;
    raise notice 'Usunięto puste konto: %', r.username;
  end loop;
  raise notice 'Pustych kont usunięto: %', v_usuniete;
end $$;

/* Sesje starsze niż 90 dni — `community_session_user` i tak je odrzuca,
   a trzymają miejsce w tabeli. */
delete from public.community_sessions
 where coalesce(last_seen_at, created_at) < now() - interval '90 days';

analyze public.community_users;
analyze public.community_sessions;

/* ------------------------------------------------------------------ */
/* 4. Odzyskanie miejsca po zdjęciach czatu z rundy 22                 */
/* ------------------------------------------------------------------ */

/* `VACUUM FULL` nie działa w bloku transakcji — w panelu Supabase ten plik
   trzeba uruchomić z zaznaczonym „Run without transaction” (albo puścić oba
   polecenia osobno). `rejchat_photos` miała 4,2 MB przy jednym żywym
   wierszu; po wyczyszczeniu czatu zostało 20 martwych wersji. */
vacuum full public.rejchat_photos;
vacuum full public.page_trail;

-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- 1. Filtr: warianty, które przeszły 13.11.2026 („blackn1gger”, „negroid”).
-- 2. Wymuszona zmiana nazwy konta przez administratora — bez bana, z
--    ostrzeżeniem i kopiowaniem nazwy do treści (czat, wpisy, komentarze,
--    zgłoszenia). Nazwa przechodzi ten sam filtr co przy rejestracji.
--
-- Zastosowane na produkcji (projekt hzbqzfimtroixnldzjeq) 13.11.2026.

insert into public.rejchat_blocked_phrases (phrase, match_mode) values
  ('nigger', 'prefix'),
  ('nigga', 'prefix'),
  ('negroid', 'prefix'),
  ('negr', 'word'),
  ('negry', 'word'),
  ('negrzy', 'word'),
  ('нэгроид', 'substring'),
  ('dildo', 'word'),
  -- Warianty z cyfrą: walidacja nicku sprawdza fragmenty surowego tekstu,
  -- więc „blackn1gger” musi mieć osobną regułę.
  ('n1gger', 'substring'),
  ('n1gga', 'substring'),
  ('n199er', 'substring'),
  ('negro1d', 'substring')
on conflict do nothing;

create or replace function public.admin_rejchat_rename_user(
  p_username text,
  p_new_username text,
  p_reason text default ''
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  target record;
  clean text;
  reason_text text := btrim(coalesce(p_reason, ''));
  note text;
begin
  if not coalesce(public.is_widget_admin(), false) then
    raise exception 'Brak uprawnień administratora.';
  end if;
  clean := public.rejchat_validate_nickname(p_new_username);
  if clean = '' then
    raise exception 'Podaj nową nazwę konta.';
  end if;
  if char_length(reason_text) > 200 then
    raise exception 'Powód może mieć maksymalnie 200 znaków.';
  end if;
  select id, username, is_owner, is_bot into target
    from public.community_users
    where username_lower = lower(btrim(coalesce(p_username, '')));
  if target.id is null then
    raise exception 'Nie znaleziono konta.';
  end if;
  if target.is_owner or target.is_bot then
    raise exception 'Nie można zmienić nazwy tego konta.';
  end if;
  if lower(clean) = lower(target.username) then
    return target.username;
  end if;
  if exists (
    select 1 from public.community_users
    where username_lower = lower(clean) and id <> target.id
  ) then
    raise exception 'Ta nazwa jest już zajęta.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rejchat-rename:' || target.id::text, 0));

  update public.community_users set username = clean where id = target.id;
  update public.community_chat set author_name = clean where author_id = target.id;
  update public.community_posts set author_name = clean where author_id = target.id;
  update public.community_comments set author_name = clean where author_id = target.id;
  update public.rejchat_reports set target_name = clean where target_id = target.id;

  note := coalesce(nullif(reason_text, ''),
    'Nazwa konta została zmieniona, bo naruszała regulamin.');
  insert into public.rejchat_warnings (user_id, reason, issued_by)
    values (
      target.id,
      left(note || ' Nowa nazwa: ' || clean || '.', 300),
      coalesce(auth.uid(), (select id from public.community_users where is_owner limit 1))
    );

  return clean;
end
$function$;

revoke all on function public.admin_rejchat_rename_user(text, text, text) from public;
grant execute on function public.admin_rejchat_rename_user(text, text, text) to authenticated, service_role;

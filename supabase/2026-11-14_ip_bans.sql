-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- Trwałe blokady sieci (IP) — RejHub / RejChat, wdrożone 14.11.2026.
--
-- Decyzja właściciela: konta @rejson.59 i janeXz602 powstały z jednej sieci
-- i jednego urządzenia (ten sam hash IP i fingerprint), podszywały się pod
-- właściciela i kpiły z jego wyznania na czacie. Blokada jest bezterminowa.
--
-- Zasady:
--   1. Adres nigdy nie jest zapisywany jawnie — tylko hash z solą
--      (community_ip_hash), ten sam, który liczy limity rejestracji.
--   2. Blokada działa na całej ścieżce: trigger przy tworzeniu sesji
--      (logowanie i rejestracja) oraz community_session_user — jedno miejsce,
--      przez które przechodzi każda akcja zalogowanego użytkownika.
--   3. Panel właściciela umie nałożyć blokadę na konto (admin_ip_ban_user),
--      pokazać listę (admin_ip_bans_list) i ją zdjąć (admin_ip_ban_remove).
--   4. Blokada jest odwracalna — wiersz zostaje w tabeli z revoked_at,
--      więc decyzja ma ślad.

/* ------------------------------------------------------------------ */
/* 1. Tabela blokad                                                    */
/* ------------------------------------------------------------------ */

create table if not exists public.community_ip_bans (
  ip_hash text primary key,
  label text,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  created_by text not null default 'owner',
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint community_ip_bans_hash check (ip_hash ~ '^[0-9a-f]{64}$')
);

alter table public.community_ip_bans enable row level security;
revoke all on public.community_ip_bans from public, anon, authenticated;
grant select, insert, update, delete on public.community_ip_bans to service_role;

create index if not exists community_ip_bans_active_idx
  on public.community_ip_bans (ip_hash)
  where revoked_at is null;

comment on table public.community_ip_bans is
  'Trwałe blokady sieci. Tylko hash adresu (z solą), powód i ślad decyzji.';

/* ------------------------------------------------------------------ */
/* 2. Sprawdzenie blokady                                              */
/* ------------------------------------------------------------------ */

create or replace function public.community_ban_active(p_hash text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p_hash is not null and exists (
    select 1 from public.community_ip_bans b
     where b.ip_hash = p_hash
       and b.revoked_at is null
       and (b.expires_at is null or b.expires_at > now())
  );
$fn$;
revoke all on function public.community_ban_active(text) from public, anon, authenticated;
grant execute on function public.community_ban_active(text) to service_role;

/* ------------------------------------------------------------------ */
/* 3. Logowanie i rejestracja                                          */
/* ------------------------------------------------------------------ */

/* Obie ścieżki kończą się wstawieniem wiersza do community_sessions.
   Trigger łapie je w jednym miejscu, więc nie da się założyć konta
   ani zalogować z zablokowanej sieci — także przez API z pominięciem UI. */
create or replace function public.community_sessions_ip_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_ip text;
begin
  v_ip := public.community_ip_hash(public.community_request_ip());
  if public.community_ban_active(v_ip) then
    raise exception 'Ten adres sieci został trwale zablokowany przez właściciela RejHuba.'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

revoke all on function public.community_sessions_ip_guard() from public, anon, authenticated;

drop trigger if exists community_sessions_ip_guard on public.community_sessions;
create trigger community_sessions_ip_guard
  before insert on public.community_sessions
  for each row execute function public.community_sessions_ip_guard();

/* ------------------------------------------------------------------ */
/* 4. Każda akcja zalogowanego użytkownika                             */
/* ------------------------------------------------------------------ */

/* community_session_user jest wołane przez wszystkie RPC czatu, wpisów,
   komentarzy, reakcji, profilu i prywatnych rozmów. Sprawdzenie tutaj
   odcina zablokowaną sieć nawet wtedy, gdy ma ważny token sesji. */
create or replace function public.community_session_user(p_token text)
returns table(user_id uuid, username text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare v_ip text;
begin
  if p_token is null or char_length(trim(p_token)) < 16 then
    raise exception 'Musisz być zalogowany, aby to zrobić.';
  end if;

  v_ip := public.community_ip_hash(public.community_request_ip());
  if public.community_ban_active(v_ip) then
    raise exception 'Ten adres sieci został trwale zablokowany przez właściciela RejHuba.'
      using errcode = '42501';
  end if;

  update public.community_sessions
     set last_seen_at = now()
   where token_hash = encode(extensions.digest('rejson_comm_sess_v1:' || trim(p_token), 'sha256'), 'hex')
     and coalesce(last_seen_at, created_at) > now() - interval '90 days';
  return query
    select cu.id, cu.username
      from public.community_sessions cs
      join public.community_users cu on cu.id = cs.user_id
     where cs.token_hash = encode(extensions.digest('rejson_comm_sess_v1:' || trim(p_token), 'sha256'), 'hex')
       and coalesce(cs.last_seen_at, cs.created_at) > now() - interval '90 days';
  if not found then
    raise exception 'Sesja wygasła — zaloguj się ponownie.';
  end if;
end;
$fn$;

/* ------------------------------------------------------------------ */
/* 5. Panel właściciela                                                */
/* ------------------------------------------------------------------ */

create or replace function public.admin_ip_bans_list()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not coalesce(public.is_widget_admin(), false) then
    raise exception 'Brak uprawnień administratora.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'hash', left(b.ip_hash, 12),
      'label', b.label,
      'reason', b.reason,
      'created_at', b.created_at,
      'expires_at', b.expires_at,
      'accounts', (
        select count(*) from public.community_users u where u.signup_ip_hash = b.ip_hash
      ),
      'usernames', (
        select coalesce(jsonb_agg(u.username order by u.created_at), '[]'::jsonb)
          from public.community_users u where u.signup_ip_hash = b.ip_hash
      )
    ) order by b.created_at desc)
    from public.community_ip_bans b
    where b.revoked_at is null
  ), '[]'::jsonb);
end;
$fn$;

create or replace function public.admin_ip_ban_user(p_username text, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  target record;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_accounts integer;
begin
  if not coalesce(public.is_widget_admin(), false) then
    raise exception 'Brak uprawnień administratora.';
  end if;
  select id, username, signup_ip_hash, is_owner, is_bot into target
    from public.community_users
   where username_lower = lower(btrim(coalesce(p_username, '')));
  if target.id is null then raise exception 'Nie znaleziono konta.'; end if;
  if target.is_owner or target.is_bot then raise exception 'Nie można zablokować tego konta.'; end if;
  if target.signup_ip_hash is null then
    raise exception 'To konto nie ma zapisanego adresu sieci (powstało przed włączeniem ochrony).';
  end if;

  insert into public.community_ip_bans (ip_hash, label, reason, created_by)
  values (target.signup_ip_hash, target.username, v_reason, 'panel')
  on conflict (ip_hash) do update
    set label = excluded.label,
        reason = excluded.reason,
        expires_at = null,
        revoked_at = null;

  delete from public.community_sessions where user_id = target.id;

  select count(*) into v_accounts
    from public.community_users where signup_ip_hash = target.signup_ip_hash;

  return jsonb_build_object(
    'hash', left(target.signup_ip_hash, 12),
    'username', target.username,
    'accounts', v_accounts
  );
end;
$fn$;

create or replace function public.admin_ip_ban_remove(p_hash text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not coalesce(public.is_widget_admin(), false) then
    raise exception 'Brak uprawnień administratora.';
  end if;
  update public.community_ip_bans
     set revoked_at = now()
   where revoked_at is null
     and (ip_hash = lower(btrim(coalesce(p_hash, '')))
          or left(ip_hash, 12) = lower(btrim(coalesce(p_hash, ''))));
  return found;
end;
$fn$;

revoke all on function public.admin_ip_bans_list() from public, anon;
revoke all on function public.admin_ip_ban_user(text, text) from public, anon;
revoke all on function public.admin_ip_ban_remove(text) from public, anon;
grant execute on function public.admin_ip_bans_list() to authenticated, service_role;
grant execute on function public.admin_ip_ban_user(text, text) to authenticated, service_role;
grant execute on function public.admin_ip_ban_remove(text) to authenticated, service_role;

/* ------------------------------------------------------------------ */
/* 6. Decyzja 14.11.2026                                               */
/* ------------------------------------------------------------------ */

-- Konta @rejson.59 (21:42) i janeXz602 (21:34): ta sama sieć i urządzenie.
-- Podszywanie się pod właściciela („dostajesz bana za to”), kpiny z jego
-- wyznania i zdjęcia publikowane w czacie. Blokada bezterminowa.
insert into public.community_ip_bans (ip_hash, label, reason, created_by)
values (
  '202b518863d52cac65155dbcb8e5e9331271352c5a3b560192e80f06bf6157e5',
  '@rejson.59 + janeXz602',
  'Podszywanie się pod właściciela i kpiny z jego wyznania na czacie; decyzja właściciela, blokada bezterminowa.',
  'rejson59'
)
on conflict (ip_hash) do update
  set label = excluded.label,
      reason = excluded.reason,
      expires_at = null,
      revoked_at = null;

-- Natychmiastowe wylogowanie obu kont.
delete from public.community_sessions
 where user_id in (
   'cd2024bf-cfb7-4391-a48b-0ef4cb2803c8',
   '4f191511-2a2e-4915-9f3a-72a4215efc75'
 );

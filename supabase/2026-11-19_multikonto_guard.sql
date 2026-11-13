-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- Ochrona przed multikontami (RejHub 2.0 / RejChat) — wdrożone 13.11.2026.
--
-- Problem: jedynym hamulcem był losowy identyfikator z localStorage
-- („fingerprint”). Wystarczyło wyczyścić dane przeglądarki albo wysłać p_fp = null
-- i limit znikał — 13.11 powstało 8 kont w 1,5 godziny, 5 z nich w jednej godzinie.
--
-- Co robi ta migracja:
--   1. Liczy konta na PRAWDZIWY adres sieci klienta (nagłówki bramy), zapisany
--      wyłącznie jako hash z solą — z bazy nie da się odczytać adresu.
--   2. Twarde limity rejestracji: 4 konta / 24 h i 10 / 7 dni na sieć, 60 s
--      odstępu między kontami z tej samej sieci, 2 konta / 24 h na przeglądarkę.
--   3. Daje właścicielowi listę ryzyka (admin_account_risk): wspólne sieci,
--      wspólne urządzenia, łudząco podobne nazwy, fale rejestracji i te same
--      wiadomości wysłane z różnych kont.
--
-- Zasada: NIC nie jest blokowane ani kasowane automatycznie. Limity dotyczą
-- tylko zakładania nowych kont — istniejące konta zostają nietknięte, a decyzję
-- o ostrzeżeniu / zmianie nazwy / mute / banie podejmuje właściciel.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

/* ------------------------------------------------------------------ */
/* 1. Sól i hash sieci                                                 */
/* ------------------------------------------------------------------ */

create table if not exists public.community_guard_salt (
  id boolean primary key default true,
  salt text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint community_guard_salt_single check (id)
);

insert into public.community_guard_salt (id, salt)
select true, encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.community_guard_salt);

alter table public.community_guard_salt enable row level security;
revoke all on public.community_guard_salt from public, anon, authenticated;

comment on table public.community_guard_salt is
  'Sól do hashowania adresów IP przy rejestracji. Dostęp tylko przez funkcje security definer.';

create or replace function public.community_ip_hash(p_ip text)
returns text
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $fn$
  select case
    when nullif(btrim(coalesce(p_ip, '')), '') is null then null
    else encode(extensions.digest(
      'rejson_ip_v1:' || (select salt from public.community_guard_salt) || ':' || btrim(p_ip),
      'sha256'), 'hex')
  end;
$fn$;
revoke all on function public.community_ip_hash(text) from public, anon, authenticated;
grant execute on function public.community_ip_hash(text) to service_role;

create or replace function public.community_request_ip()
returns text
language plpgsql
stable
as $fn$
declare h jsonb; v text;
begin
  begin
    h := current_setting('request.headers', true)::jsonb;
  exception when others then
    h := null;
  end;
  if h is null then return null; end if;
  v := nullif(btrim(coalesce(h ->> 'cf-connecting-ip', '')), '');
  if v is null then
    v := nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), '');
  end if;
  return v;
end;
$fn$;
revoke all on function public.community_request_ip() from public, anon, authenticated;

create or replace function public.community_request_ua()
returns text
language plpgsql
stable
as $fn$
declare h jsonb;
begin
  begin
    h := current_setting('request.headers', true)::jsonb;
  exception when others then
    h := null;
  end;
  if h is null then return null; end if;
  return left(nullif(btrim(coalesce(h ->> 'user-agent', '')), ''), 160);
end;
$fn$;
revoke all on function public.community_request_ua() from public, anon, authenticated;

/* ------------------------------------------------------------------ */
/* 2. Ślad rejestracji na koncie                                       */
/* ------------------------------------------------------------------ */

alter table public.community_users
  add column if not exists signup_ip_hash text,
  add column if not exists signup_fp text,
  add column if not exists signup_ua text;

create index if not exists community_users_signup_ip_idx
  on public.community_users (signup_ip_hash, created_at desc)
  where signup_ip_hash is not null;

/* ------------------------------------------------------------------ */
/* 3. Rejestracja z limitami                                           */
/* ------------------------------------------------------------------ */

create or replace function public.community_register(p_username text, p_pin text, p_fp text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_name text := trim(coalesce(p_username, ''));
  v_secret text := coalesce(p_pin, '');
  v_fp text := nullif(btrim(coalesce(p_fp, '')), '');
  v_hash text;
  v_user_id uuid;
  v_canonical text;
  v_token text;
  v_attempts integer;
  v_ip text := public.community_ip_hash(public.community_request_ip());
  v_ua text := public.community_request_ua();
  v_recent integer;
begin
  if not public.community_username_valid(v_name) then
    raise exception 'Nieprawidłowa nazwa użytkownika (3–24 znaki: litery, cyfry, _ . -).';
  end if;
  perform public.rejchat_validate_nickname(v_name);
  if v_secret ~ '^[0-9]{4}$' then
    v_hash := encode(extensions.digest('rejson_pin_v1:' || lower(v_name) || ':' || v_secret, 'sha256'), 'hex');
  elsif char_length(v_secret) >= 10 and octet_length(v_secret) <= 72 then
    v_hash := extensions.crypt(v_secret, extensions.gen_salt('bf', 12));
  else
    raise exception 'Hasło powinno mieć co najmniej 10 znaków i maksymalnie 72 bajty.';
  end if;
  if exists (select 1 from public.community_users where username_lower = lower(v_name)) then
    raise exception 'Ta nazwa jest już zajęta — zaloguj się nią zamiast zakładać konto.';
  end if;

  /* Zapora sieciowa — liczona po stronie serwera, nie da się jej wyczyścić
     w przeglądarce. Adres trafia do bazy tylko jako hash z solą. */
  if v_ip is not null then
    select count(*) into v_recent
      from public.community_users
     where signup_ip_hash = v_ip and created_at > now() - interval '24 hours';
    if v_recent >= 4 then
      raise exception 'Z tej sieci powstały już dziś 4 konta. Nowe konto z tego miejsca będzie możliwe później — jeśli to pomyłka, napisz do właściciela.';
    end if;
    select count(*) into v_recent
      from public.community_users
     where signup_ip_hash = v_ip and created_at > now() - interval '7 days';
    if v_recent >= 10 then
      raise exception 'Z tej sieci powstało w tym tygodniu zbyt wiele kont. Spróbuj ponownie za kilka dni.';
    end if;
    if exists (select 1 from public.community_users
                where signup_ip_hash = v_ip and created_at > now() - interval '60 seconds') then
      raise exception 'Odczekaj chwilę przed kolejnym kontem.';
    end if;
  end if;

  /* Druga zapora: identyfikator przeglądarki. Tańsza i łatwiejsza do obejścia,
     ale łapie zwykłe zakładanie kont jedno po drugim. */
  if v_fp is not null and char_length(v_fp) between 8 and 64 then
    insert into public.community_register_limits(fingerprint, window_started, attempts)
    values (v_fp, now(), 1)
    on conflict (fingerprint) do update set
      attempts = case when community_register_limits.window_started <= now() - interval '24 hours'
                      then 1 else community_register_limits.attempts + 1 end,
      window_started = case when community_register_limits.window_started <= now() - interval '24 hours'
                      then now() else community_register_limits.window_started end
    returning attempts into v_attempts;
    if v_attempts > 2 then
      raise exception 'Ta przeglądarka założyła już dziś 2 konta — odczekaj dobę.';
    end if;
  end if;

  insert into public.community_users (username, pin_hash, last_login_at, signup_ip_hash, signup_fp, signup_ua)
    values (v_name, v_hash, now(), v_ip, v_fp, v_ua)
    returning id, username into v_user_id, v_canonical;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.community_sessions (token_hash, user_id)
    values (encode(extensions.digest('rejson_comm_sess_v1:' || v_token, 'sha256'), 'hex'), v_user_id);
  return jsonb_build_object('token', v_token, 'username', v_canonical);
end $function$;

/* ------------------------------------------------------------------ */
/* 4. Lista ryzyka dla właściciela                                     */
/* ------------------------------------------------------------------ */

create or replace function public.admin_account_risk()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_networks jsonb;
  v_devices jsonb;
  v_similar jsonb;
  v_bursts jsonb;
  v_echoes jsonb;
  v_new integer;
begin
  if not coalesce(public.is_widget_admin(), false) then
    raise exception 'Brak uprawnień administratora.';
  end if;

  select count(*) into v_new
    from public.community_users
   where created_at > now() - interval '24 hours' and not is_bot;

  -- Konta założone z tej samej sieci (działa dla rejestracji po 13.11).
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_networks
    from (
      select jsonb_build_object(
        'net', left(signup_ip_hash, 8),
        'count', count(*),
        'accounts', jsonb_agg(username order by created_at),
        'first_at', min(created_at),
        'last_at', max(created_at)
      ) as row
        from public.community_users
       where signup_ip_hash is not null and not is_bot
       group by signup_ip_hash
      having count(*) > 1
       order by max(created_at) desc
       limit 20
    ) q;

  -- Konta założone z tej samej przeglądarki.
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_devices
    from (
      select jsonb_build_object(
        'fp', left(signup_fp, 8),
        'count', count(*),
        'accounts', jsonb_agg(username order by created_at),
        'last_at', max(created_at)
      ) as row
        from public.community_users
       where signup_fp is not null and not is_bot
       group by signup_fp
      having count(*) > 1
       order by max(created_at) desc
       limit 20
    ) q;

  -- Nazwy łudząco podobne (Pioterz / Pjoterz, Sadik / Sadik_pl, Konto_2b7e / 2b7f).
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_similar
    from (
      select jsonb_build_object(
        'name', name_a,
        'similar_to', name_b,
        'score', round(score::numeric, 2)
      ) as row
        from (
          select a.username as name_a,
                 b.username as name_b,
                 greatest(
                   similarity(lower(a.username), lower(b.username)),
                   case when char_length(a.username) >= 5
                         and extensions.levenshtein(lower(a.username), lower(b.username)) <= 1
                        then 0.9 else 0 end
                 ) as score
            from public.community_users a
            join public.community_users b
              on a.id <> b.id
             and a.username_lower < b.username_lower
           where not a.is_bot and not a.is_owner and not b.is_bot and not b.is_owner
        ) s
       where score >= 0.62
       order by score desc
       limit 20
    ) q;

  -- Fale rejestracji: 4+ kont w jednej godzinie (łapie też dane sprzed pieczęci).
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_bursts
    from (
      select jsonb_build_object(
        'hour', date_trunc('hour', created_at),
        'count', count(*),
        'accounts', jsonb_agg(username order by created_at)
      ) as row
        from public.community_users
       where not is_bot and created_at > now() - interval '30 days'
       group by date_trunc('hour', created_at)
      having count(*) >= 4
       order by date_trunc('hour', created_at) desc
       limit 10
    ) q;

  -- Ta sama wiadomość z różnych kont w ciągu doby.
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_echoes
    from (
      select jsonb_build_object(
        'excerpt', left(min(content), 90),
        'accounts', jsonb_agg(distinct author_name),
        'count', count(distinct author_id),
        'last_at', max(created_at)
      ) as row
        from public.community_chat c
       where created_at > now() - interval '24 hours'
         and char_length(btrim(content)) >= 12
         and author_id is not null
       group by lower(btrim(regexp_replace(content, '[[:space:]]+', ' ', 'g')))
      having count(distinct author_id) > 1
       order by max(created_at) desc
       limit 10
    ) q;

  return jsonb_build_object(
    'generated_at', now(),
    'new_24h', v_new,
    'networks', v_networks,
    'devices', v_devices,
    'similar', v_similar,
    'bursts', v_bursts,
    'echoes', v_echoes
  );
end $function$;

revoke all on function public.admin_account_risk() from public;
grant execute on function public.admin_account_risk() to anon, authenticated;

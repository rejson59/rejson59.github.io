-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- Twardnienie bazy pod publiczny klucz anon — 17.11.2026.
--
-- Kontekst: strona i aplikacje rozmawiają z Supabase wyłącznie kluczem `anon`,
-- który jest publiczny z założenia. Bezpieczeństwo opiera się więc na RLS
-- i na tym, co wolno wywołać. Audyt pokazał trzy rzeczy do poprawy:
--
--   1. `anon` miał pełne prawa tabel (INSERT/UPDATE/DELETE/TRUNCATE) na
--      16 tabelach. RLS blokował zapisy, ale TRUNCATE omija RLS, a każdy
--      przyszły błąd w polityce od razu otwierałby zapis. Odbieramy prawa,
--      których strona nigdy nie używa — zero zmian w działaniu.
--   2. Funkcje `admin_*` były wykonywalne dla `anon`. Każda ma wewnątrz
--      `is_widget_admin()`, więc nie dało się ich nadużyć, ale to zbyt cienka
--      warstwa: jedna zapomniana kontrola i panel stoi otworem. Panel i tak
--      woła je jako zalogowany administrator (rola `authenticated`).
--   3. Czterocyfrowe PIN-y były hashowane szybkim SHA-256 z jawną solą.
--      Wyciek tabeli = złamanie wszystkich PIN-ów w sekundę. Przechodzimy
--      na bcrypt (koszt 12) z automatyczną migracją przy pierwszym logowaniu.
--
-- Dodatkowo: limit prób logowania per konto (5 / 15 min) uzupełniamy limitem
-- per sieć (30 / 15 min), żeby atakujący nie mógł rozłożyć zgadywania na
-- wiele kont z jednego adresu.

/* ------------------------------------------------------------------ */
/* 1. Prawa tabel — tylko to, czego strona naprawdę potrzebuje          */
/* ------------------------------------------------------------------ */

revoke truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

do $$
declare
  r record;
begin
  for r in
    select c.relname,
           not exists (
             select 1 from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname
                and p.cmd in ('ALL', 'INSERT')
                and (p.roles::text like '%anon%' or p.roles::text like '%public%')
           ) as bez_insert,
           not exists (
             select 1 from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname
                and p.cmd in ('ALL', 'UPDATE')
                and (p.roles::text like '%anon%' or p.roles::text like '%public%')
           ) as bez_update,
           not exists (
             select 1 from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname
                and p.cmd in ('ALL', 'DELETE')
                and (p.roles::text like '%anon%' or p.roles::text like '%public%')
           ) as bez_delete
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    if r.bez_insert then
      execute format('revoke insert on public.%I from anon', r.relname);
    end if;
    if r.bez_update then
      execute format('revoke update on public.%I from anon', r.relname);
    end if;
    if r.bez_delete then
      execute format('revoke delete on public.%I from anon', r.relname);
    end if;
  end loop;
end $$;

/* Tabele, których przeglądarka nie czyta nigdy — dane osobowe, sesje,
   sekrety, treści prywatne. RLS już je ukrywał; teraz anon nie ma nawet
   prawa SELECT, więc błąd w polityce nie wystarczy do wycieku.
   Lista jest sprawdzana względem katalogu, żeby migracja była odporna
   na tabele, które w tej instancji nie istnieją. */
do $$
declare
  r record;
  v_names text[] := array[
    'community_users', 'community_sessions', 'community_login_attempts',
    'community_register_limits', 'community_ip_bans', 'community_guard_salt',
    'community_media', 'identity_links', 'identity_aliases', 'visitor_days',
    'page_trail', 'page_views_daily', 'page_view_cooldowns', 'activity_events',
    'error_reports', 'feedback_media', 'partnership_inquiries', 'push_config',
    'push_outbox', 'push_subscriptions', 'rejchat_dm_messages',
    'rejchat_dm_threads', 'rejchat_dm_reads', 'rejchat_dm_reactions',
    'rejchat_dm_pins', 'rejchat_photos', 'rejchat_photo_usage',
    'rejchat_profiles', 'rejchat_reports', 'rejchat_warnings',
    'rejchat_notifications', 'rejchat_nicknames', 'rejchat_antispam_state',
    'rejchat_auto_log', 'rejchat_blocked_phrases', 'rejchat_search_usage',
    'rejchat_user_blocks', 'rejchat_write_blocks', 'rejsejf_items',
    'rejfile_transfers', 'rejfile_notifications', 'rejfile_downloads',
    'rejfile_rate', 'rejfile_maintenance', 'widget_admins'
  ];
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname = any(v_names)
  loop
    execute format('revoke select on public.%I from anon', r.relname);
  end loop;
end $$;

/* ------------------------------------------------------------------ */
/* 2. Funkcje administracyjne — tylko zalogowany administrator          */
/* ------------------------------------------------------------------ */

/* Domyślnie PostgreSQL daje EXECUTE każdemu (PUBLIC). Odbieramy to
   wszystkim i przyznajemy wyłącznie roli `authenticated` — panel i tak
   loguje się przez Supabase Auth, a każda funkcja `admin_*` ma w środku
   `is_widget_admin()` jako drugą zaporę. `anon` nie widzi więc nawet
   nazw tych funkcji w PostgREST. */
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

revoke execute on function public.claim_initial_admin() from public, anon;
grant execute on function public.claim_initial_admin() to authenticated, service_role;

/* Funkcje pomocnicze: wołają je inne funkcje SECURITY DEFINER, nigdy klient. */
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'community_ip_hash', 'community_request_ip', 'community_request_ua',
         'community_auth_attempt', 'community_auth_ip_attempt', 'identity_canonical'
       )
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

/* ------------------------------------------------------------------ */
/* 2b. Funkcje wewnętrzne — nie dla przeglądarki                       */
/* ------------------------------------------------------------------ */

/* Te funkcje nie mają tokenu ani sprawdzenia administratora, bo nigdy nie
   miały być wołane przez klienta. Są SECURITY DEFINER, więc anon mógł nimi
   sięgnąć poza RLS. Najgroźniejsza: `push_enqueue` pozwalała wysłać dowolne
   powiadomienie do dowolnego konta (spam/phishing) — teraz tylko backend. */
do $$
declare
  r record;
  v_admin text[] := array['clear_demo_submissions', 'get_admin_activity',
                          'get_admin_community', 'get_admin_daily_views'];
  v_internal text[] := array['push_enqueue', 'push_enqueue_tg', 'profile_usage_bytes',
                             'profile_quota_guard', 'presence_is_real',
                             'page_presence_throttle', 'page_views_daily_bump',
                             'community_register_limits_prune', 'nz_gc'];
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname = any(v_admin) or p.proname = any(v_internal))
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname = any(v_admin) then
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
    else
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

/* Obecność na stronie zawiera `session_key`, `client_hash` i `fingerprint_id`
   — to nie są dane do publicznego odczytu. Liczniki i listy „kto online”
   liczą się w funkcjach SECURITY DEFINER, więc polityka SELECT była zbędna. */
drop policy if exists page_presence_select_public on public.page_presence;
revoke select on public.page_presence from anon, authenticated;

/* ------------------------------------------------------------------ */
/* 3. Limit prób logowania per sieć                                    */
/* ------------------------------------------------------------------ */

create table if not exists public.community_login_ip_attempts (
  ip_hash text primary key,
  window_started timestamptz not null default now(),
  attempts integer not null default 0
);

alter table public.community_login_ip_attempts enable row level security;
revoke all on public.community_login_ip_attempts from anon, authenticated;

create or replace function public.community_auth_ip_attempt(p_ip text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_attempts integer;
begin
  if p_ip is null then return true; end if;

  insert into public.community_login_ip_attempts(ip_hash, window_started, attempts)
    values (p_ip, now(), 0)
    on conflict (ip_hash) do nothing;

  update public.community_login_ip_attempts
     set attempts = case when window_started <= now() - interval '15 minutes' then 1 else attempts + 1 end,
         window_started = case when window_started <= now() - interval '15 minutes' then now() else window_started end
   where ip_hash = p_ip
   returning attempts into v_attempts;

  return v_attempts <= 30;
end $$;

revoke execute on function public.community_auth_ip_attempt(text) from public, anon;
grant execute on function public.community_auth_ip_attempt(text) to service_role;

/* ------------------------------------------------------------------ */
/* 4. Logowanie: bcrypt, limit per sieć, stały czas odpowiedzi         */
/* ------------------------------------------------------------------ */

create or replace function public.community_login(p_username text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_name text := trim(coalesce(p_username, ''));
  v_secret text := coalesce(p_pin, '');
  v_user record;
  v_valid boolean := false;
  v_token text;
  v_ip text := public.community_ip_hash(public.community_request_ip());
begin
  if coalesce(current_setting('request.headers', true), '{}')::jsonb->>'prefer' ~* 'tx[[:space:]]*=[[:space:]]*rollback' then
    raise exception 'Niedozwolona preferencja transakcji.';
  end if;

  /* Limit per sieć działa także dla nieistniejących kont — inaczej atakujący
     poznawałby nazwy po tym, że nagle przestaje być liczony. */
  if not public.community_auth_ip_attempt(v_ip) then
    perform set_config('response.status', '429', true);
    return jsonb_build_object('message', 'Zbyt wiele prób z tej sieci. Spróbuj ponownie za 15 minut.');
  end if;

  select id, username, pin_hash into v_user from public.community_users
    where username_lower = lower(v_name) for update;

  if v_user.id is null then
    /* Wyrównanie czasu: nieistniejące konto też kosztuje jeden bcrypt,
       więc odpowiedź nie zdradza, czy nazwa istnieje. */
    perform extensions.crypt(v_secret, extensions.gen_salt('bf', 8));
    perform set_config('response.status', '401', true);
    return jsonb_build_object('message', 'Nieprawidłowa nazwa lub hasło / PIN.');
  end if;

  if not public.community_auth_attempt(v_user.id) then
    perform set_config('response.status', '429', true);
    return jsonb_build_object('message', 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.');
  end if;

  if left(v_user.pin_hash, 4) = '$2a$' and octet_length(v_secret) between 1 and 72 then
    v_valid := extensions.crypt(v_secret, v_user.pin_hash) = v_user.pin_hash;
  elsif v_user.pin_hash ~ '^[0-9a-f]{64}$' and v_secret ~ '^[0-9]{4}$' then
    /* Stary format — sprawdzamy, a przy sukcesie natychmiast przepisujemy
       na bcrypt. Dzięki temu migracja dzieje się sama, przy logowaniu. */
    v_valid := v_user.pin_hash = encode(extensions.digest('rejson_pin_v1:' || lower(v_name) || ':' || v_secret, 'sha256'), 'hex');
    if v_valid then
      update public.community_users
         set pin_hash = extensions.crypt(v_secret, extensions.gen_salt('bf', 12))
       where id = v_user.id;
    end if;
  end if;

  if not v_valid then
    perform set_config('response.status', '401', true);
    return jsonb_build_object('message', 'Nieprawidłowa nazwa lub hasło / PIN.');
  end if;

  delete from public.community_login_attempts where user_id = v_user.id;
  delete from public.community_login_ip_attempts where ip_hash = v_ip;
  update public.community_users set last_login_at = now() where id = v_user.id;
  delete from public.community_sessions where last_seen_at < now() - interval '30 days';
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.community_sessions (token_hash, user_id)
    values (encode(extensions.digest('rejson_comm_sess_v1:' || v_token, 'sha256'), 'hex'), v_user.id);
  return jsonb_build_object('token', v_token, 'username', v_user.username);
end $$;

/* ------------------------------------------------------------------ */
/* 5. Rejestracja: nowe PIN-y od razu na bcrypt                        */
/* ------------------------------------------------------------------ */

create or replace function public.community_register(p_username text, p_pin text, p_fp text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
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

  /* Najpierw wszystkie tanie kontrole — bcrypt kosztuje ~0,3 s CPU i nie
     może być wywoływany przez kogoś, kogo i tak odrzuci limit IP. */
  if v_secret ~ '^[0-9]{4}$' then
    null;
  elsif char_length(v_secret) >= 10 and octet_length(v_secret) <= 72 then
    null;
  else
    raise exception 'Hasło powinno mieć co najmniej 10 znaków i maksymalnie 72 bajty.';
  end if;

  if exists (select 1 from public.community_users where username_lower = lower(v_name)) then
    raise exception 'Ta nazwa jest już zajęta — zaloguj się nią zamiast zakładać konto.';
  end if;

  if v_ip is not null then
    select count(*) into v_recent from public.community_users where signup_ip_hash = v_ip and created_at > now() - interval '24 hours';
    if v_recent >= 4 then
      raise exception 'Z tej sieci powstały już dziś 4 konta. Nowe konto z tego miejsca będzie możliwe później — jeśli to pomyłka, napisz do właściciela.';
    end if;
    select count(*) into v_recent from public.community_users where signup_ip_hash = v_ip and created_at > now() - interval '7 days';
    if v_recent >= 10 then
      raise exception 'Z tej sieci powstało w tym tygodniu zbyt wiele kont. Spróbuj ponownie za kilka dni.';
    end if;
    if exists (select 1 from public.community_users where signup_ip_hash = v_ip and created_at > now() - interval '60 seconds') then
      raise exception 'Odczekaj chwilę przed kolejnym kontem.';
    end if;
  end if;

  if v_fp is not null and char_length(v_fp) between 8 and 64 then
    insert into public.community_register_limits(fingerprint, window_started, attempts)
      values (v_fp, now(), 1)
      on conflict (fingerprint) do update
        set attempts = case when community_register_limits.window_started <= now() - interval '24 hours' then 1 else community_register_limits.attempts + 1 end,
            window_started = case when community_register_limits.window_started <= now() - interval '24 hours' then now() else community_register_limits.window_started end
      returning attempts into v_attempts;
    if v_attempts > 2 then
      raise exception 'Ta przeglądarka założyła już dziś 2 konta — odczekaj dobę.';
    end if;
  end if;

  /* Dopiero teraz płacimy za bcrypt. 4-cyfrowy PIN ma 10 000 możliwości,
     dlatego koszt 12, nie szybki SHA-256. */
  v_hash := extensions.crypt(v_secret, extensions.gen_salt('bf', 12));

  insert into public.community_users (username, pin_hash, last_login_at, signup_ip_hash, signup_fp, signup_ua)
    values (v_name, v_hash, now(), v_ip, v_fp, v_ua)
    returning id, username into v_user_id, v_canonical;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.community_sessions (token_hash, user_id)
    values (encode(extensions.digest('rejson_comm_sess_v1:' || v_token, 'sha256'), 'hex'), v_user_id);

  return jsonb_build_object('token', v_token, 'username', v_canonical);
end $$;

/* ------------------------------------------------------------------ */
/* 6. Sprzątanie starego limitu per sieć                               */
/* ------------------------------------------------------------------ */

/* Idempotentnie: powtórne uruchomienie migracji nie wywala się na duplikacie. */
do $$
begin
  if exists (select 1 from cron.job where jobname = 'community_login_ip_attempts_prune') then
    perform cron.unschedule('community_login_ip_attempts_prune');
  end if;
end $$;

select cron.schedule(
  'community_login_ip_attempts_prune',
  '41 3 * * *',
  'delete from public.community_login_ip_attempts where window_started < now() - interval ''1 day'';'
);

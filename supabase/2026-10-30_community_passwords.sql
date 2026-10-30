-- Hasła i ograniczenie prób bez zmiany identyfikatorów użytkowników i sesji.
-- Pomyłka zwraca HTTP przez response.status zamiast RAISE: inaczej Postgres
-- wycofałby zapis licznika. Nagłówek Prefer: tx=rollback jest odrzucany,
-- aby klient nie mógł próbować unieważnić zapisu limitu.
create table if not exists public.community_login_attempts (
  user_id uuid primary key references public.community_users(id) on delete cascade,
  window_started timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.community_login_attempts enable row level security;
revoke all on public.community_login_attempts from public, anon, authenticated;

-- Bez zmian w sygnaturze RPC: stare klienty wciąż mogą rejestrować PIN.
-- Nowe formularze wysyłają w tym samym parametrze mocniejsze hasło.
create or replace function public.community_register(p_username text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text := trim(coalesce(p_username, ''));
  v_secret text := coalesce(p_pin, '');
  v_hash text;
  v_user_id uuid;
  v_canonical text;
  v_token text;
begin
  if not public.community_username_valid(v_name) then
    raise exception 'Nieprawidłowa nazwa użytkownika (3–24 znaki: litery, cyfry, _ . -).';
  end if;
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
  insert into public.community_users (username, pin_hash, last_login_at)
    values (v_name, v_hash, now()) returning id, username into v_user_id, v_canonical;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.community_sessions (token_hash, user_id)
    values (encode(extensions.digest('rejson_comm_sess_v1:' || v_token, 'sha256'), 'hex'), v_user_id);
  return jsonb_build_object('token', v_token, 'username', v_canonical);
end $$;

-- Licznik przypisany do konta; blokada do końca 15-minutowego okna.
-- Funkcja pomocnicza jest niedostępna bezpośrednio przez publiczne API.
create or replace function public.community_auth_attempt(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_attempts integer;
begin
  insert into public.community_login_attempts(user_id, window_started, attempts)
    values (p_user_id, now(), 0) on conflict (user_id) do nothing;
  update public.community_login_attempts
     set attempts = case when window_started <= now() - interval '15 minutes' then 1 else attempts + 1 end,
         window_started = case when window_started <= now() - interval '15 minutes' then now() else window_started end
   where user_id = p_user_id
   returning attempts into v_attempts;
  return v_attempts <= 5;
end $$;
revoke all on function public.community_auth_attempt(uuid) from public, anon, authenticated;

create or replace function public.community_login(p_username text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text := trim(coalesce(p_username, ''));
  v_secret text := coalesce(p_pin, '');
  v_user record;
  v_valid boolean := false;
  v_token text;
begin
  if coalesce(current_setting('request.headers', true), '{}')::jsonb->>'prefer' ~* 'tx[[:space:]]*=[[:space:]]*rollback' then
    raise exception 'Niedozwolona preferencja transakcji.';
  end if;
  select id, username, pin_hash into v_user from public.community_users
    where username_lower = lower(v_name) for update;
  if v_user.id is null then
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
    v_valid := v_user.pin_hash = encode(extensions.digest('rejson_pin_v1:' || lower(v_name) || ':' || v_secret, 'sha256'), 'hex');
  end if;
  if not v_valid then
    perform set_config('response.status', '401', true);
    return jsonb_build_object('message', 'Nieprawidłowa nazwa lub hasło / PIN.');
  end if;
  delete from public.community_login_attempts where user_id = v_user.id;
  update public.community_users set last_login_at = now() where id = v_user.id;
  delete from public.community_sessions where last_seen_at < now() - interval '30 days';
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.community_sessions (token_hash, user_id)
    values (encode(extensions.digest('rejson_comm_sess_v1:' || v_token, 'sha256'), 'hex'), v_user.id);
  return jsonb_build_object('token', v_token, 'username', v_user.username);
end $$;

create or replace function public.community_password_status(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user record;
begin
  select * into v_user from public.community_session_user(p_token);
  return jsonb_build_object('has_password', (select left(pin_hash,4) = '$2a$' from public.community_users where id = v_user.user_id));
end $$;

-- Stara sesja + aktualny PIN lub hasło; nie usuwa innych sesji ani danych.
create or replace function public.community_set_password(p_token text, p_current_secret text, p_new_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_session record;
  v_user record;
  v_secret text := coalesce(p_current_secret, '');
  v_new text := coalesce(p_new_password, '');
  v_valid boolean := false;
begin
  if coalesce(current_setting('request.headers', true), '{}')::jsonb->>'prefer' ~* 'tx[[:space:]]*=[[:space:]]*rollback' then
    raise exception 'Niedozwolona preferencja transakcji.';
  end if;
  if char_length(v_new) < 10 or octet_length(v_new) > 72 then
    raise exception 'Hasło powinno mieć co najmniej 10 znaków i maksymalnie 72 bajty.';
  end if;
  select * into v_session from public.community_session_user(p_token);
  select id, username, pin_hash into v_user from public.community_users where id = v_session.user_id for update;
  if not public.community_auth_attempt(v_user.id) then
    perform set_config('response.status', '429', true);
    return jsonb_build_object('message', 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.');
  end if;
  if left(v_user.pin_hash, 4) = '$2a$' and octet_length(v_secret) between 1 and 72 then
    v_valid := extensions.crypt(v_secret, v_user.pin_hash) = v_user.pin_hash;
  elsif v_user.pin_hash ~ '^[0-9a-f]{64}$' and v_secret ~ '^[0-9]{4}$' then
    v_valid := v_user.pin_hash = encode(extensions.digest('rejson_pin_v1:' || lower(v_user.username) || ':' || v_secret, 'sha256'), 'hex');
  end if;
  if not v_valid then
    perform set_config('response.status', '401', true);
    return jsonb_build_object('message', 'Nieprawidłowy obecny PIN lub hasło.');
  end if;
  update public.community_users set pin_hash = extensions.crypt(v_new, extensions.gen_salt('bf', 12)) where id = v_user.id;
  delete from public.community_login_attempts where user_id = v_user.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.community_password_status(text) from public;
revoke all on function public.community_set_password(text,text,text) from public;
grant execute on function public.community_password_status(text) to anon, authenticated;
grant execute on function public.community_set_password(text,text,text) to anon, authenticated;

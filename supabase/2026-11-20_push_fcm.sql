-- © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
-- RejHub 2.0 — powiadomienia w aplikacji Android (Firebase Cloud Messaging).
--
-- Do tej pory `push_subscriptions` trzymało wyłącznie subskrypcje Web Push
-- (endpoint https://…, klucze p256dh/auth). Aplikacja na Androida nie ma
-- Push API w WebView, więc rejestruje token FCM — a token nie jest adresem
-- HTTPS i nie ma kluczy szyfrujących. Ten plik:
--
--   1. dodaje kolumnę `kind` ('web' | 'fcm'), domyślnie 'web' (stare wiersze
--      zostają bez zmian),
--   2. zdejmuje NOT NULL z p256dh/auth — token FCM ich nie używa,
--   3. dodaje RPC `push_subscribe_native` i `push_unsubscribe_native`,
--   4. dopisuje `kind` do `push_devices`, żeby panel wiedział, co odłączać.
--
-- Kolejka `push_outbox` i triggery zostają bez zmian: FCM i Web Push wysyła
-- z niej ten sam `api/push-send.js`.

/* ------------------------------------------------------------------ */
/* 1. Rodzaj urządzenia                                               */
/* ------------------------------------------------------------------ */

alter table public.push_subscriptions
  add column if not exists kind text not null default 'web';

alter table public.push_subscriptions alter column p256dh drop not null;
alter table public.push_subscriptions alter column auth drop not null;

create index if not exists push_subscriptions_kind_idx
  on public.push_subscriptions(kind);

/* ------------------------------------------------------------------ */
/* 2. Rejestracja tokenu FCM z aplikacji                              */
/* ------------------------------------------------------------------ */

create or replace function public.push_subscribe_native(p_token text, p_endpoint text, p_agent text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare me record;
begin
  select * into me from public.community_session_user(p_token);
  if me.user_id is null then
    raise exception 'Sesja wygasła — zaloguj się ponownie.';
  end if;
  -- Token FCM bywa długi (ok. 150–200 znaków) i składa się z liter, cyfr,
  -- dwukropków, podkreśleń i myślników. Odrzucamy wszystko inne.
  if p_endpoint is null
     or p_endpoint !~ '^fcm:[A-Za-z0-9_:.-]{20,400}$' then
    raise exception 'Nieprawidłowy token powiadomień.';
  end if;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent, kind)
  values (me.user_id, p_endpoint, '', '', left(coalesce(p_agent, ''), 300), 'fcm')
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    user_agent = excluded.user_agent,
    kind = 'fcm',
    last_seen_at = now();

  return jsonb_build_object('ok', true,
    'devices', (select count(*) from public.push_subscriptions where user_id = me.user_id));
end; $fn$;

create or replace function public.push_unsubscribe_native(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare me record; n int;
begin
  select * into me from public.community_session_user(p_token);
  if me.user_id is null then
    raise exception 'Sesja wygasła — zaloguj się ponownie.';
  end if;
  delete from public.push_subscriptions
    where user_id = me.user_id and kind = 'fcm';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'removed', n);
end; $fn$;

/* ------------------------------------------------------------------ */
/* 3. Stara droga (Web Push) jawnie oznaczona jako 'web'              */
/* ------------------------------------------------------------------ */

create or replace function public.push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_agent text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare me record;
begin
  select * into me from public.community_session_user(p_token);
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'Nieprawidłowy adres subskrypcji.';
  end if;
  if p_p256dh is null or length(p_p256dh) < 40 or p_auth is null or length(p_auth) < 8 then
    raise exception 'Nieprawidłowy klucz powiadomień.';
  end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent, kind)
  values (me.user_id, p_endpoint, p_p256dh, p_auth, left(coalesce(p_agent, ''), 300), 'web')
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth = excluded.auth, user_agent = excluded.user_agent, kind = 'web', last_seen_at = now();
  return jsonb_build_object('ok', true,
    'devices', (select count(*) from public.push_subscriptions where user_id = me.user_id));
end; $fn$;

/* ------------------------------------------------------------------ */
/* 4. Lista urządzeń dla panelu                                       */
/* ------------------------------------------------------------------ */

create or replace function public.push_devices(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare me record;
begin
  select * into me from public.community_session_user(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'agent', user_agent, 'kind', kind, 'created_at', created_at, 'last_seen_at', last_seen_at)
      order by created_at desc)
    from public.push_subscriptions where user_id = me.user_id), '[]'::jsonb);
end; $fn$;

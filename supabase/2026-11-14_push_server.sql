-- © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
-- RejHub 2.0 — powiadomienia push na telefon + statystyki serwera.
--
-- Kolejka `push_outbox` jest zasilana triggerami przy prawdziwych zdarzeniach
-- (polubienie, komentarz, prywatna wiadomość, gotowy plik). Wysyłką zajmuje
-- się funkcja Vercel `rejhub2/api/push-send.js`, wołana co minutę przez pg_cron.

/* ------------------------------------------------------------------ */
/* 1. Urządzenia i kolejka                                            */
/* ------------------------------------------------------------------ */

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.community_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;

create table if not exists public.push_outbox (
  id bigserial primary key,
  user_id uuid not null references public.community_users(id) on delete cascade,
  title text not null,
  body text,
  url text,
  tag text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index if not exists push_outbox_pending_idx on public.push_outbox(created_at) where sent_at is null;
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from public, anon, authenticated;

create table if not exists public.push_config (
  id int primary key default 1,
  public_key text not null,
  send_secret text, -- uzupełniane po wdrożeniu; nigdy nie trafia do repozytorium
  updated_at timestamptz not null default now(),
  constraint push_config_single check (id = 1)
);
alter table public.push_config enable row level security;
revoke all on public.push_config from public, anon, authenticated;

/* ------------------------------------------------------------------ */
/* 2. Kolejkowanie zdarzeń                                            */
/* ------------------------------------------------------------------ */

create or replace function public.push_enqueue(p_user uuid, p_title text, p_body text, p_url text, p_tag text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if p_user is null then return; end if;
  if not exists (select 1 from public.push_subscriptions s where s.user_id = p_user) then return; end if;
  if exists (select 1 from public.push_outbox o
              where o.user_id = p_user and o.sent_at is null
                and o.created_at > now() - interval '2 minutes' and o.tag = p_tag) then
    return;
  end if;
  insert into public.push_outbox(user_id, title, body, url, tag) values (p_user, p_title, p_body, p_url, p_tag);
end; $fn$;

create or replace function public.push_enqueue_tg()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare v_actor text; v_kind text; v_title text; v_body text;
begin
  if tg_table_name = 'rejchat_notifications' then
    -- Własna aktywność nigdy nie trafia na telefon.
    if new.recipient_id = new.actor_id then return new; end if;
    select username into v_actor from public.community_users where id = new.actor_id;
    v_kind := coalesce(new.kind, 'post');
    v_title := case v_kind
      when 'like' then 'Nowa reakcja od ' || coalesce(v_actor, 'kogoś')
      when 'comment' then 'Nowy komentarz od ' || coalesce(v_actor, 'kogoś')
      when 'reply' then 'Odpowiedź od ' || coalesce(v_actor, 'kogoś')
      when 'reaction' then 'Reakcja od ' || coalesce(v_actor, 'kogoś')
      else 'Nowa aktywność w RejChacie' end;
    v_body := case when new.comment_id is not null then 'Ktoś odpowiedział na Twój wpis.'
                   else 'Zajrzyj do RejChatu, żeby zobaczyć szczegóły.' end;
    perform public.push_enqueue(new.recipient_id, v_title, v_body,
      'https://rejhub.vercel.app/rejchat#powiadomienia',
      'rejchat:' || v_kind || ':' || coalesce(new.post_id::text, ''));
    return new;
  elsif tg_table_name = 'rejfile_notifications' then
    perform public.push_enqueue(new.recipient_id, 'Nowy plik w RejFile',
      'Ktoś wysłał Ci plik — jest gotowy do pobrania.',
      'https://rejhub.vercel.app/rejfile#skrzynka', 'rejfile:' || new.transfer_id::text);
    return new;
  elsif tg_table_name = 'rejchat_dm_messages' then
    select username into v_actor from public.community_users where id = new.author_id;
    perform public.push_enqueue(t.user_low, 'Wiadomość od ' || coalesce(v_actor, 'kogoś'),
      left(coalesce(new.content, 'Nowa wiadomość'), 120), 'https://rejhub.vercel.app/rejchat#wiadomosci',
      'dm:' || new.id::text)
      from public.rejchat_dm_threads t where t.id = new.thread_id and t.user_low <> new.author_id;
    perform public.push_enqueue(t.user_high, 'Wiadomość od ' || coalesce(v_actor, 'kogoś'),
      left(coalesce(new.content, 'Nowa wiadomość'), 120), 'https://rejhub.vercel.app/rejchat#wiadomosci',
      'dm:' || new.id::text)
      from public.rejchat_dm_threads t where t.id = new.thread_id and t.user_high <> new.author_id;
    return new;
  end if;
  return new;
end; $fn$;

drop trigger if exists rejchat_notifications_push on public.rejchat_notifications;
create trigger rejchat_notifications_push after insert on public.rejchat_notifications
  for each row execute function public.push_enqueue_tg();
drop trigger if exists rejfile_notifications_push on public.rejfile_notifications;
create trigger rejfile_notifications_push after insert on public.rejfile_notifications
  for each row execute function public.push_enqueue_tg();
drop trigger if exists rejchat_dm_push on public.rejchat_dm_messages;
create trigger rejchat_dm_push after insert on public.rejchat_dm_messages
  for each row execute function public.push_enqueue_tg();

/* ------------------------------------------------------------------ */
/* 3. RPC dla przeglądarki                                             */
/* ------------------------------------------------------------------ */

create or replace function public.push_config_public()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('publicKey', public_key) from public.push_config where id = 1;
$fn$;

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
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (me.user_id, p_endpoint, p_p256dh, p_auth, left(coalesce(p_agent, ''), 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth = excluded.auth, user_agent = excluded.user_agent, last_seen_at = now();
  return jsonb_build_object('ok', true,
    'devices', (select count(*) from public.push_subscriptions where user_id = me.user_id));
end; $fn$;

create or replace function public.push_unsubscribe(p_token text, p_endpoint text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare me record; n int;
begin
  select * into me from public.community_session_user(p_token);
  delete from public.push_subscriptions where user_id = me.user_id and endpoint = p_endpoint;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'removed', n);
end; $fn$;

create or replace function public.push_devices(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare me record;
begin
  select * into me from public.community_session_user(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'agent', user_agent, 'created_at', created_at, 'last_seen_at', last_seen_at)
      order by created_at desc)
    from public.push_subscriptions where user_id = me.user_id), '[]'::jsonb);
end; $fn$;

/* ------------------------------------------------------------------ */
/* 4. Statystyki serwera dla panelu admina                            */
/* ------------------------------------------------------------------ */

create or replace function public.admin_server_stats()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v jsonb;
begin
  if not public.is_widget_admin() then raise exception 'Brak uprawnień administratora.'; end if;
  select jsonb_build_object(
    'database', jsonb_build_object(
      'bytes', pg_database_size(current_database()),
      'pretty', pg_size_pretty(pg_database_size(current_database())),
      'version', current_setting('server_version'),
      'now', now()
    ),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.relname, 'bytes', pg_total_relation_size(c.oid),
             'pretty', pg_size_pretty(pg_total_relation_size(c.oid)),
             'rows', greatest(c.reltuples::bigint, 0))
             order by pg_total_relation_size(c.oid) desc)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and pg_total_relation_size(c.oid) > 16384), '[]'::jsonb),
    'counts', jsonb_build_object(
      'accounts', (select count(*) from public.community_users),
      'sessions', (select count(*) from public.community_sessions where last_seen_at > now() - interval '1 day'),
      'posts', (select count(*) from public.community_posts),
      'chat', (select count(*) from public.community_chat),
      'dm', (select count(*) from public.rejchat_dm_messages),
      'photos', (select count(*) from public.rejchat_photos),
      'sejf', (select count(*) from public.rejsejf_items),
      'transfers', (select count(*) from public.rejfile_transfers),
      'push_devices', (select count(*) from public.push_subscriptions),
      'push_pending', (select count(*) from public.push_outbox where sent_at is null),
      'visits_7d', (select coalesce(sum(entries), 0) from public.visitor_days where day >= current_date - 6),
      'events_7d', (select count(*) from public.activity_events where at > now() - interval '7 days')
    ),
    'storage', jsonb_build_object(
      'accounts', coalesce((
        select jsonb_agg(jsonb_build_object('username', cu.username, 'used', u.used, 'quota', cu.quota_bytes,
               'percent', round(100.0 * u.used / greatest(cu.quota_bytes, 1), 1)) order by u.used desc)
          from public.community_users cu
          cross join lateral (select public.profile_usage_bytes(cu.id) as used) u
         where u.used > 0), '[]'::jsonb),
      'used_total', coalesce((select sum(public.profile_usage_bytes(id)) from public.community_users), 0),
      'bucket_bytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0),
      'bucket_objects', (select count(*) from storage.objects)
    ),
    'health', jsonb_build_object(
      'identity_rows', (select count(*) from public.identity_links),
      'identity_aliases', (select count(*) from public.identity_aliases),
      'push_oldest_pending', (select min(created_at) from public.push_outbox where sent_at is null),
      'push_failed', (select count(*) from public.push_outbox where sent_at is null and attempts >= 3),
      'http_queue', (select count(*) from net._http_response)
    ),
    'generated_at', now()
  ) into v;
  return v;
end; $fn$;

/* ------------------------------------------------------------------ */
/* 5. Harmonogram (pg_cron → funkcja Vercel)                          */
/* ------------------------------------------------------------------ */

-- Sekret nie jest trzymany w repozytorium. Po wdrożeniu wpisz go raz
-- w prywatnym wierszu push_config (service_role), a harmonogram odczyta go
-- z bazy. Wartość musi być identyczna z PUSH_SEND_SECRET w Vercel.
--   update public.push_config set send_secret = '<sekret>' where id = 1;
select cron.schedule('rejhub-push-sender', '* * * * *', $cron$
  select net.http_post(
    url := 'https://rejhub.vercel.app/api/push-send',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-key', (select send_secret from public.push_config where id = 1)
    ),
    timeout_milliseconds := 15000
  );
$cron$);

-- Porządki: stara kolejka HTTP i wysłane powiadomienia.
select cron.schedule('rejhub-net-cleanup', '17 * * * *', $cron$
  delete from net._http_response where created < now() - interval '1 day';
  delete from public.push_outbox where sent_at is not null and sent_at < now() - interval '14 days';
$cron$);

-- ============================================================================
-- Dziennik odwiedzin zamiast pełnej trasy: visitor_days
-- Data: 2026-10-28
--
-- Powód: page_trail rósł najszybciej ze wszystkich tabel (4,3 MB przy ~2 tys.
-- wierszy), a wartość z kolejnych hopów „A → B → A” po kilku dniach jest
-- znikoma. Za to kliknięcia i akcje są tym, co naprawdę mówi, co ludzie robią.
--
-- Nowy podział:
--   • visitor_days  — trwała pamięć: kto, którego dnia, na jakich PODSTRONACH
--                     był, o której wszedł i o której wyszedł (+ ile wejść).
--                     Jeden wiersz na osobę na dzień, więc rośnie bardzo wolno.
--   • page_trail    — tylko DZISIAJ (24 h), wyłącznie dla podglądu „Ścieżka”
--                     na żywo. Wczorajsze hopy nie są nikomu potrzebne.
--   • activity_events — kliknięcia i akcje: z 3 dni na 30 dni.
--   • visitor_days  — 180 dni historii.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabela dzienna
-- ---------------------------------------------------------------------------
create table if not exists public.visitor_days (
  day             date        not null,
  identity_key    text        not null,   -- 'u:nick' | 'fp:1234' | 'ch:…' | 'sk:…'
  username        text,                   -- niższe litery, gdy zalogowany
  fingerprint_id  text,
  client_hash     text,
  first_entry_at  timestamptz not null default now(),  -- kiedy wszedł tego dnia
  last_seen_at    timestamptz not null default now(),
  pages           text[]      not null default '{}',   -- podstrony tego dnia
  entries         integer     not null default 1,      -- ile razy zaczynał dzień
  primary key (day, identity_key)
);

alter table public.visitor_days enable row level security;
-- Bez polityk: dostęp wyłącznie przez funkcje SECURITY DEFINER (jak page_trail).

create index if not exists visitor_days_username_idx on public.visitor_days (lower(username));
create index if not exists visitor_days_fp_idx on public.visitor_days (fingerprint_id);
create index if not exists visitor_days_last_seen_idx on public.visitor_days (last_seen_at desc);

-- ---------------------------------------------------------------------------
-- 2. Zasilenie z tego, co już jest w page_trail (ostatnie 3 dni)
--    „wejścia” liczone uczciwie: nowe wejście = przerwa dłuższa niż 30 minut.
-- ---------------------------------------------------------------------------
with trail_days as (
  select (t.at at time zone 'Europe/Warsaw')::date as day,
         case
           when t.username is not null then 'u:' || lower(t.username)
           when t.fingerprint_id is not null then 'fp:' || t.fingerprint_id
           when t.client_hash is not null then 'ch:' || t.client_hash
           else 'sk:' || t.session_key
         end as identity_key,
         lower(t.username) as username,
         t.fingerprint_id,
         t.client_hash,
         t.project_slug,
         t.at,
         lag(t.at) over (
           partition by (t.at at time zone 'Europe/Warsaw')::date,
                        case
                          when t.username is not null then 'u:' || lower(t.username)
                          when t.fingerprint_id is not null then 'fp:' || t.fingerprint_id
                          when t.client_hash is not null then 'ch:' || t.client_hash
                          else 'sk:' || t.session_key
                        end
           order by t.at
         ) as prev_at
    from public.page_trail t
)
insert into public.visitor_days
  (day, identity_key, username, fingerprint_id, client_hash, first_entry_at, last_seen_at, pages, entries)
select day,
       identity_key,
       max(username),
       max(fingerprint_id),
       max(client_hash),
       min(at),
       max(at),
       array_agg(distinct project_slug),
       greatest(1, count(*) filter (where prev_at is null or at - prev_at > interval '30 minutes'))::int
  from trail_days
 group by day, identity_key
on conflict (day, identity_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Heartbeat: zapis do dziennika + nowe okresy przechowywania
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat_page_presence(
  p_slug text,
  p_session_id text default null::text,
  p_action text default 'ping'::text,
  p_window_seconds integer default 90,
  p_visitor_id text default null::text,
  p_token text default null::text,
  p_fp text default null::text,
  p_active text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_slug text;
  v_window integer;
  v_headers jsonb;
  v_client_ip text;
  v_user_agent text;
  v_client_hash text := null;
  v_session_hash text;
  v_username text := null;
  v_fingerprint text := null;
  v_is_bot boolean := false;
  v_can_presence boolean := false;
  v_trail_last text;
  v_trail_last_at timestamptz;
  v_active jsonb;
  v_total integer;
  v_day date;
  v_identity text;
begin
  v_slug := trim(coalesce(p_slug, ''));
  if v_slug = '' or char_length(v_slug) > 100 or v_slug !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'Invalid project_slug';
  end if;

  select pv.project_slug into v_slug from public.page_views pv
   where lower(pv.project_slug) = lower(v_slug) limit 1;
  if v_slug is null then v_slug := trim(p_slug); end if;

  v_window := greatest(30, least(coalesce(p_window_seconds, 90), 600));

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then v_headers := '{}'::jsonb;
  end;

  v_client_ip := trim(split_part(coalesce(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    v_headers ->> 'x-forwarded-for',
    ''
  ), ',', 1));
  v_user_agent := left(coalesce(v_headers ->> 'user-agent', ''), 256);

  if v_client_ip <> '' then
    v_client_hash := left(encode(extensions.digest('rejson_ie_v1:' || v_client_ip || ' · ' || v_user_agent, 'sha256'), 'hex'), 16);
  end if;

  if v_user_agent ~* '(bot|crawler|spider|headless|phantomjs|scrapy|curl/|wget/|python|axios|httpclient|libwww|pingdom|uptimerobot|statuscake|slackbot|discordbot|telegrambot|whatsapp|facebookexternalhit|lighthouse|pagespeed|gtmetrix)' then
    v_is_bot := true;
  end if;

  /* Zapis obecności WYŁĄCZNIE od aktualnego trackera po realnej
     interakcji (p_active='1'), z trwałym visitor_id i nie od botów. */
  v_can_presence := (not v_is_bot)
    and coalesce(p_active, '') = '1'
    and p_visitor_id is not null
    and char_length(trim(p_visitor_id)) >= 8;

  v_session_hash := encode(
    extensions.digest(
      case
        when p_visitor_id is not null and char_length(trim(p_visitor_id)) >= 8
          then 'rejson_presence_v2:' || trim(p_visitor_id)
        else 'rejson_presence_v1:' || coalesce(nullif(trim(p_session_id), ''), v_client_ip || ':' || v_user_agent)
      end,
      'sha256'
    ),
    'hex'
  );

  if p_token is not null and char_length(trim(p_token)) >= 16 then
    select cu.username into v_username
      from public.community_sessions cs
      join public.community_users cu on cu.id = cs.user_id
     where cs.token_hash = encode(extensions.digest('rejson_comm_sess_v1:' || trim(p_token), 'sha256'), 'hex')
     limit 1;
  end if;

  if p_fp is not null then
    v_fingerprint := left(regexp_replace(trim(p_fp), '[^0-9]', '', 'g'), 8);
    if v_fingerprint = '' then v_fingerprint := null; end if;
  end if;

  if v_username is not null and v_can_presence then
    insert into public.identity_links (kind, value, username) values
      ('sk', v_session_hash, lower(v_username))
    on conflict (kind, value) do update
      set username = excluded.username, last_seen_at = now();
    if v_fingerprint is not null then
      insert into public.identity_links (kind, value, username) values
        ('fp', v_fingerprint, lower(v_username))
      on conflict (kind, value) do update
        set username = excluded.username, last_seen_at = now();
    end if;
    if v_client_hash is not null then
      insert into public.identity_links (kind, value, username) values
        ('ch', v_client_hash, lower(v_username))
      on conflict (kind, value) do update
        set username = excluded.username, last_seen_at = now();
    end if;
  end if;

  delete from public.page_presence where last_seen_at < (now() - interval '5 minutes');

  if v_can_presence then
    if lower(coalesce(p_action, 'ping')) = 'leave' then
      delete from public.page_presence
       where project_slug = v_slug and session_key = v_session_hash;
    else
      insert into public.page_presence (project_slug, session_key, last_seen_at, username, fingerprint_id, client_hash, first_seen_at)
      values (v_slug, v_session_hash, now(), v_username, v_fingerprint, v_client_hash, now())
      on conflict (project_slug, session_key)
      do update set
        last_seen_at = now(),
        username = excluded.username,
        fingerprint_id = coalesce(excluded.fingerprint_id, public.page_presence.fingerprint_id),
        client_hash = coalesce(excluded.client_hash, public.page_presence.client_hash);

      delete from public.page_presence
       where session_key = v_session_hash
         and project_slug <> v_slug
         and last_seen_at < (now() - interval '20 seconds');

      delete from public.page_presence pp
       where pp.session_key <> v_session_hash
         and pp.last_seen_at < (now() - interval '25 seconds')
         and (
           (v_username is not null and pp.username is not null and lower(pp.username) = lower(v_username))
           or (v_fingerprint is not null and pp.fingerprint_id = v_fingerprint)
           or (v_client_hash is not null and pp.client_hash = v_client_hash)
         );

      /* ---- DZIENNIK: kto, którego dnia, na jakich podstronach ----
         Zamiast pamiętać każdy hop z osobna (page_trail), trzymamy zbiór
         podstron z danego dnia + godzinę pierwszego wejścia. Jeden wiersz
         na osobę na dzień. Kolejne wejście po przerwie >30 min liczy się
         jako nowe „wejście”, a nie nowa osoba. */
      v_day := (now() at time zone 'Europe/Warsaw')::date;
      v_identity := case
        when v_username is not null then 'u:' || lower(v_username)
        when v_fingerprint is not null then 'fp:' || v_fingerprint
        when v_client_hash is not null then 'ch:' || v_client_hash
        else 'sk:' || v_session_hash
      end;

      insert into public.visitor_days as vd
        (day, identity_key, username, fingerprint_id, client_hash, first_entry_at, last_seen_at, pages, entries)
      values
        (v_day, v_identity, lower(v_username), v_fingerprint, v_client_hash, now(), now(), array[v_slug], 1)
      on conflict (day, identity_key) do update set
        last_seen_at = now(),
        username = coalesce(excluded.username, vd.username),
        fingerprint_id = coalesce(excluded.fingerprint_id, vd.fingerprint_id),
        client_hash = coalesce(excluded.client_hash, vd.client_hash),
        entries = vd.entries + case when vd.last_seen_at < now() - interval '30 minutes' then 1 else 0 end,
        pages = case when v_slug = any(vd.pages) then vd.pages else vd.pages || v_slug end;

      /* page_trail zostaje tylko na dziś — do podglądu ścieżki na żywo */
      select tr.project_slug, tr.at into v_trail_last, v_trail_last_at
        from public.page_trail tr
       where tr.session_key = v_session_hash order by tr.at desc limit 1;
      if v_trail_last is null
         or (v_trail_last <> v_slug and v_trail_last_at < now() - interval '4 seconds') then
        insert into public.page_trail (session_key, fingerprint_id, client_hash, username, project_slug, is_bot)
        values (v_session_hash, v_fingerprint, v_client_hash, v_username, v_slug, v_is_bot);
      end if;

      /* sprzątanie: trasa 1 dzień, akcje 30 dni, dziennik 180 dni */
      delete from public.page_trail where at < now() - interval '1 day';
      delete from public.activity_events where at < now() - interval '30 days';
      delete from public.visitor_days where day < ((now() at time zone 'Europe/Warsaw')::date - 180);
    end if;
  end if;

  select coalesce(jsonb_object_agg(sub.project_slug, sub.cnt), '{}'::jsonb)
    into v_active
    from (
      select pp.project_slug,
             count(distinct coalesce(
               lsk.username, lfp.username, lch.username,
               nullif(lower(pp.username), ''), nullif(pp.fingerprint_id, ''),
               nullif(pp.client_hash, ''), pp.session_key))::integer as cnt
        from public.page_presence pp
        left join public.identity_links lsk on lsk.kind = 'sk' and lsk.value = pp.session_key
        left join public.identity_links lfp on lfp.kind = 'fp' and lfp.value = pp.fingerprint_id
        left join public.identity_links lch on lch.kind = 'ch' and lch.value = pp.client_hash
       where pp.last_seen_at > (now() - make_interval(secs => v_window))
       group by pp.project_slug
    ) sub;

  select count(distinct coalesce(
           lsk.username, lfp.username, lch.username,
           nullif(lower(pp.username), ''), nullif(pp.fingerprint_id, ''),
           nullif(pp.client_hash, ''), pp.session_key))::integer
    into v_total
    from public.page_presence pp
    left join public.identity_links lsk on lsk.kind = 'sk' and lsk.value = pp.session_key
    left join public.identity_links lfp on lfp.kind = 'fp' and lfp.value = pp.fingerprint_id
    left join public.identity_links lch on lch.kind = 'ch' and lch.value = pp.client_hash
   where pp.last_seen_at > (now() - make_interval(secs => v_window));

  return jsonb_build_object('project_slug', v_slug, 'active_counts', v_active, 'total_online', v_total);
end; $function$;

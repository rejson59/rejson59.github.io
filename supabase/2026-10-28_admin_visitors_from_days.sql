-- ============================================================================
-- Panel admina czyta dziennik (visitor_days) zamiast pełnej trasy
-- Data: 2026-10-28
--
-- admin_visitor_list / admin_visitor_profile liczyły „kto był” z page_trail,
-- który po zmianie trzyma tylko dzisiejsze hopy. Teraz źródłem jest
-- visitor_days (osoba × dzień): z tego liczymy wejścia, podstrony i godziny,
-- a kliknięcia dalej idą z activity_events (30 dni).
--
-- Dodatkowo:
--   • zakres dni w panelu: do 30 (było maks. 3),
--   • profil zwraca 'day_log' — dzień po dniu: o której wszedł, na jakich
--     podstronach był, ile wejść i akcji,
--   • akcje w profilu: do 150 zamiast 30.
-- ============================================================================

create or replace function public.admin_visitor_list(p_days integer default 7)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 30));
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_since_day date := v_today - (v_days - 1);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_list jsonb;
begin
  if not public.is_widget_admin() then
    raise exception 'Brak uprawnień administratora.';
  end if;

  with vd as (
    select d.*,
           case
             when d.username is not null then 'u:' || lower(d.username)
             when d.fingerprint_id is not null then 'fp:' || d.fingerprint_id
             when d.client_hash is not null then 'ch:' || d.client_hash
             else d.identity_key
           end as person_key
      from public.visitor_days d
     where d.day >= v_since_day
  ),
  pg as (
    select v.person_key, count(distinct p)::int as pages
      from vd v, unnest(v.pages) as p
     group by 1
  ),
  today as (
    select v.person_key,
           array_agg(distinct p) filter (where p is not null) as pages,
           min(v.first_entry_at) as entry_at
      from vd v, unnest(v.pages) as p
     where v.day = v_today
     group by 1
  ),
  people as (
    select person_key,
           max(username) as username,
           max(fingerprint_id) filter (where fingerprint_id is not null) as fp,
           max(client_hash) filter (where client_hash is not null) as ch,
           array_agg(distinct fingerprint_id) filter (where fingerprint_id is not null) as fps,
           sum(entries)::int as visits,
           min(first_entry_at) as first_seen_at,
           max(last_seen_at) as last_seen_at
      from vd
     group by 1
  ),
  act as (
    select coalesce(
             lsk.username, lfp.username,
             nullif(lower(e.username), ''), nullif(e.fingerprint_id, ''), e.session_key) as k,
           count(*)::int as c
      from public.activity_events e
      left join public.identity_links lsk on lsk.kind = 'sk' and lsk.value = e.session_key
      left join public.identity_links lfp on lfp.kind = 'fp' and lfp.value = e.fingerprint_id
     where e.at >= v_since
     group by 1
  ),
  sub as (
    select s.fingerprint_id as k, count(*)::int as c
      from public.submissions s
     where s.created_at >= v_since and s.fingerprint_id is not null
     group by 1
  ),
  vot as (
    select v.fingerprint_id as k, count(*)::int as c
      from public.submission_votes v
     where v.created_at >= v_since and v.fingerprint_id is not null
     group by 1
  )
  select coalesce(jsonb_agg(r.row order by r.last_seen_at desc), '[]'::jsonb)
  into v_list
  from (
    select jsonb_build_object(
      'id', p.person_key,
      'label', coalesce(p.username, p.fp,
        case when p.ch is not null
             then lpad((((('x' || substr(p.ch, 1, 7))::bit(28)::int) % 9000) + 1000)::text, 4, '0')
             else lpad((((('x' || substr(p.person_key, 4, 7))::bit(28)::int) % 9000) + 1000)::text, 4, '0') end),
      'via', case
        when p.username is not null then 'account'
        when p.fp is not null then 'fp'
        when p.ch is not null then 'browser'
        else 'session' end,
      'username', p.username,
      'is_owner', coalesce((select cu.is_owner from public.community_users cu where lower(cu.username) = lower(p.username)), false),
      'is_bot', false,
      'frozen', (coalesce(act.c, 0) = 0 and coalesce(pg.pages, 0) <= 1),
      'visits', p.visits,
      'pages', coalesce(pg.pages, 0),
      'actions', coalesce(act.c, 0),
      'submissions', coalesce((select sum(s.c)::int from sub s where s.k = any(p.fps)), 0),
      'votes', coalesce((select sum(s.c)::int from vot s where s.k = any(p.fps)), 0),
      'first_seen_at', p.first_seen_at,
      'last_seen_at', p.last_seen_at,
      'today_pages', coalesce(td.pages, '{}'::text[]),
      'today_entry_at', td.entry_at,
      'online', exists (
        select 1
          from public.page_presence pp
          left join public.identity_links lsk on lsk.kind = 'sk' and lsk.value = pp.session_key
          left join public.identity_links lfp on lfp.kind = 'fp' and lfp.value = pp.fingerprint_id
          left join public.identity_links lch on lch.kind = 'ch' and lch.value = pp.client_hash
         where pp.last_seen_at > now() - interval '90 seconds'
           and (
             (p.username is not null
               and lower(coalesce(lsk.username, lfp.username, lch.username, pp.username)) = lower(p.username))
             or (p.username is null and p.fp is not null and pp.fingerprint_id = p.fp)
           )
      )
    ) as row, p.last_seen_at
    from people p
    left join pg on pg.person_key = p.person_key
    left join today td on td.person_key = p.person_key
    left join act on act.k = p.person_key
  ) r;

  return jsonb_build_object('people', v_list, 'days', v_days, 'generated_at', now());
end; $function$;

create or replace function public.admin_visitor_profile(p_id text, p_days integer default 7)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_id text := trim(coalesce(p_id, ''));
  v_kind text := split_part(v_id, ':', 1);
  v_val text := substr(v_id, position(':' in v_id) + 1);
  v_days integer := greatest(1, least(coalesce(p_days, 7), 30));
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_since_day date := v_today - (v_days - 1);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_username text := null;
  v_first timestamptz := null;
  v_last timestamptz := null;
  v_visits integer := 0;
  v_pages integer := 0;
  v_trail jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_day_log jsonb := '[]'::jsonb;
  v_subs jsonb := '[]'::jsonb;
  v_posts jsonb := '[]'::jsonb;
  v_comments jsonb := '[]'::jsonb;
  v_votes integer := 0;
  v_action_count integer := 0;
  v_fps text[] := null;
  v_chs text[] := null;
  v_ids text[] := null;
begin
  if not public.is_widget_admin() then
    raise exception 'Brak uprawnień administratora.';
  end if;
  if v_kind not in ('fp', 'ch', 'sk', 'u') or v_val = '' then
    raise exception 'Nieprawidłowy identyfikator osoby.';
  end if;

  /* --- kim jest ta osoba: nick + wszystkie jej urządzenia --- */
  if v_kind = 'u' then
    v_username := v_val;
  else
    select max(il.username) into v_username
      from public.identity_links il
     where il.kind = v_kind and il.value = v_val;
  end if;

  if v_kind = 'fp' then v_fps := array[v_val]; end if;
  if v_kind = 'ch' then v_chs := array[v_val]; end if;

  if v_username is not null then
    select array_agg(distinct z.value) filter (where z.kind = 'fp'),
           array_agg(distinct z.value) filter (where z.kind = 'ch')
      into v_fps, v_chs
      from (
        select il.kind, il.value
          from public.identity_links il
         where lower(il.username) = lower(v_username)
        union all
        select 'fp', d.fingerprint_id
          from public.visitor_days d
         where lower(d.username) = lower(v_username) and d.day >= v_since_day and d.fingerprint_id is not null
        union all
        select 'ch', d.client_hash
          from public.visitor_days d
         where lower(d.username) = lower(v_username) and d.day >= v_since_day and d.client_hash is not null
      ) z;
  end if;

  v_ids := array(
    select x from unnest(
      array['u:' || lower(coalesce(v_username, v_val)), 'u:' || lower(v_val), v_id]
      || coalesce((select array_agg('fp:' || f) from unnest(v_fps) f), '{}'::text[])
      || coalesce((select array_agg('ch:' || c) from unnest(v_chs) c), '{}'::text[])
    ) x
  );

  /* --- dziennik: dzień po dniu --- */
  with mine as (
    select d.*
      from public.visitor_days d
     where d.day >= v_since_day
       and (
         (v_username is not null and lower(d.username) = lower(v_username))
         or (v_fps is not null and d.fingerprint_id = any(v_fps))
         or (v_chs is not null and d.client_hash = any(v_chs))
         or d.identity_key = any(v_ids)
       )
  ),
  day_pages as (
    select m.day, array_agg(distinct p) filter (where p is not null) as pages
      from mine m, unnest(m.pages) as p
     group by m.day
  ),
  day_actions as (
    select (e.at at time zone 'Europe/Warsaw')::date as day, count(*)::int as c
      from public.activity_events e
     where e.at >= v_since
       and (
         (v_username is not null and e.username is not null and lower(e.username) = lower(v_username))
         or (v_fps is not null and e.fingerprint_id = any(v_fps))
       )
     group by 1
  )
  select coalesce(jsonb_agg(x.o order by x.day desc), '[]'::jsonb)
    into v_day_log
    from (
      select jsonb_build_object(
               'day', m.day,
               'entry_at', min(m.first_entry_at),
               'last_at', max(m.last_seen_at),
               'entries', sum(m.entries)::int,
               'pages', coalesce((select dp.pages from day_pages dp where dp.day = m.day), '{}'::text[]),
               'actions', coalesce((select da.c from day_actions da where da.day = m.day), 0)
             ) as o,
             m.day
        from mine m
       group by m.day
    ) x;

  select sum(entries)::int, min(first_entry_at), max(last_seen_at)
    into v_visits, v_first, v_last
    from public.visitor_days d
   where d.day >= v_since_day
     and (
       (v_username is not null and lower(d.username) = lower(v_username))
       or (v_fps is not null and d.fingerprint_id = any(v_fps))
       or (v_chs is not null and d.client_hash = any(v_chs))
       or d.identity_key = any(v_ids)
     );

  select count(distinct p)::int into v_pages
    from public.visitor_days d, unnest(d.pages) as p
   where d.day >= v_since_day
     and (
       (v_username is not null and lower(d.username) = lower(v_username))
       or (v_fps is not null and d.fingerprint_id = any(v_fps))
       or (v_chs is not null and d.client_hash = any(v_chs))
       or d.identity_key = any(v_ids)
     );

  /* --- ścieżka: tylko dzisiejsze hopy (page_trail trzyma 24 h) --- */
  select coalesce(jsonb_agg(x.o order by x.at desc), '[]'::jsonb) into v_trail
    from (
      select jsonb_build_object('slug', t.project_slug, 'at', t.at) as o, t.at
        from public.page_trail t
       where t.at >= v_since
         and (
           (v_username is not null and t.username is not null and lower(t.username) = lower(v_username))
           or (v_fps is not null and t.fingerprint_id = any(v_fps))
           or (v_chs is not null and t.client_hash = any(v_chs))
         )
       order by t.at desc limit 100) x;

  /* --- kliknięcia i akcje: pełna lista, 30 dni --- */
  select count(*)::int into v_action_count
    from public.activity_events e
   where e.at >= v_since
     and (
       (v_username is not null and e.username is not null and lower(e.username) = lower(v_username))
       or (v_fps is not null and e.fingerprint_id = any(v_fps))
     );

  select coalesce(jsonb_agg(x.o order by x.at desc), '[]'::jsonb) into v_actions
    from (
      select jsonb_build_object('kind', e.kind, 'target', e.target, 'project', e.project_slug, 'at', e.at) as o, e.at
        from public.activity_events e
       where e.at >= v_since
         and (
           (v_username is not null and e.username is not null and lower(e.username) = lower(v_username))
           or (v_fps is not null and e.fingerprint_id = any(v_fps))
         )
       order by e.at desc limit 150) x;

  if v_fps is not null then
    select coalesce(jsonb_agg(x.o order by x.at desc), '[]'::jsonb) into v_subs
      from (
        select jsonb_build_object('type', s.type, 'status', s.status, 'title', s.title,
               'project', s.project_slug, 'votes', s.upvotes_count, 'at', s.created_at) as o, s.created_at as at
          from public.submissions s
         where s.fingerprint_id = any(v_fps)
         order by s.created_at desc limit 50) x;

    select count(*)::int into v_votes
      from public.submission_votes v
     where v.fingerprint_id = any(v_fps);
  end if;

  if v_username is not null then
    select coalesce(jsonb_agg(x.o order by x.at desc), '[]'::jsonb) into v_posts
      from (
        select jsonb_build_object('id', p.id, 'content', left(p.content, 160), 'tags', p.tags,
               'likes', (select count(*)::int from public.community_likes l where l.post_id = p.id),
               'at', p.created_at) as o, p.created_at as at
          from public.community_posts p
         where lower(p.author_name) = lower(v_username)
         order by p.created_at desc limit 20) x;

    select coalesce(jsonb_agg(x.o order by x.at desc), '[]'::jsonb) into v_comments
      from (
        select jsonb_build_object('post_id', c.post_id, 'content', left(c.content, 160), 'at', c.created_at) as o, c.created_at as at
          from public.community_comments c
         where lower(c.author_name) = lower(v_username)
         order by c.created_at desc limit 20) x;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'username', v_username,
    'label', case
               when v_kind = 'u' then coalesce(v_username, v_val)
               when v_kind = 'fp' then v_val
               else lpad((((('x' || substr(v_val, 1, 7))::bit(28)::int) % 9000) + 1000)::text, 4, '0') end,
    'via', case v_kind when 'u' then 'account' when 'fp' then 'fp' when 'ch' then 'browser' else 'session' end,
    'is_bot', false,
    'frozen', (v_action_count = 0 and v_pages <= 1),
    'first_seen_at', v_first,
    'last_seen_at', v_last,
    'visits', coalesce(v_visits, 0),
    'pages', coalesce(v_pages, 0),
    'action_count', v_action_count,
    'votes', v_votes,
    'trail', v_trail,
    'actions', v_actions,
    'day_log', v_day_log,
    'submissions', v_subs,
    'posts', v_posts,
    'comments', v_comments,
    'days', v_days,
    'generated_at', now()
  );
end; $function$;

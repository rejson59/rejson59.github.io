-- ============================================================
-- Społeczność 2.0 — media w wpisach, odpowiedzi na komentarze,
-- konto bota „Agent AI Rejsona" i dzienne statystyki wejść
-- (zastosowane 2026-10-23 przez migrację Supabase — kopia do repo)
-- ============================================================

-- ---------- 1. Nowe kolumny ----------
alter table public.community_posts
  add column if not exists media jsonb not null default '[]'::jsonb;

alter table public.community_comments
  add column if not exists parent_id uuid references public.community_comments(id) on delete cascade;

alter table public.community_users
  add column if not exists is_bot boolean not null default false;

create index if not exists community_comments_parent_idx
  on public.community_comments (parent_id) where parent_id is not null;

-- ---------- 2. Pliki trzymane w bazie (dostęp wyłącznie przez RPC) ----------
create table if not exists public.community_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.community_users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  mime text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
alter table public.community_media enable row level security;
revoke all on public.community_media from anon, authenticated;

-- ---------- 3. Konfiguracja agenta (klucz publikowania — tylko w funkcji RPC) ----------
create table if not exists public.agent_config (
  key text primary key,
  value text not null
);
alter table public.agent_config enable row level security;
revoke all on public.agent_config from anon, authenticated;
insert into public.agent_config (key, value)
values ('post_secret', 'e2148c352dfb065cf8662d91da3110b49e1776f666c572eb')
on conflict (key) do nothing;

-- ---------- 4. Dzienne statystyki wejść (wykres 14 dni w panelu admina) ----------
create table if not exists public.page_views_daily (
  project_slug text not null,
  day date not null,
  views bigint not null default 0,
  primary key (project_slug, day)
);
alter table public.page_views_daily enable row level security;
revoke all on public.page_views_daily from anon, authenticated;

create or replace function public.page_views_daily_bump()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_delta bigint;
begin
  if tg_op = 'UPDATE' then
    v_delta := new.views_count - old.views_count;
  else
    v_delta := new.views_count - coalesce(new.historical_seed_count, 0);
  end if;
  if v_delta > 0 then
    insert into public.page_views_daily (project_slug, day, views)
    values (new.project_slug, (now() at time zone 'Europe/Warsaw')::date, v_delta)
    on conflict (project_slug, day) do update
      set views = public.page_views_daily.views + excluded.views;
  end if;
  return new;
end;
$$;

drop trigger if exists page_views_daily_trg on public.page_views;
create trigger page_views_daily_trg
after insert or update of views_count on public.page_views
for each row execute function public.page_views_daily_bump();

-- Zasiew dzisiejszym stanem liczników (wcześniejsze dni nie mają historii dziennej)
insert into public.page_views_daily (project_slug, day, views)
select project_slug, views_today_date, views_today_count
from public.page_views
where views_today_date is not null and views_today_count > 0
on conflict (project_slug, day) do update
  set views = greatest(excluded.views, public.page_views_daily.views);

-- ---------- 5. Przesyłanie plików (po sesji nazwa+PIN) ----------
create or replace function public.community_upload_media(p_token text, p_mime text, p_data_base64 text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_user record;
  v_bytes bytea;
  v_size integer;
  v_max integer;
  v_today_bytes bigint;
  v_today_count integer;
  v_id uuid;
begin
  select * into v_user from public.community_session_user(p_token);

  if p_mime not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm') then
    raise exception 'Dozwolone formaty: JPG, PNG, WebP, GIF, MP4, WebM.';
  end if;
  if p_data_base64 is null or char_length(p_data_base64) < 24 or char_length(p_data_base64) > 17000000 then
    raise exception 'Plik jest pusty lub za duży.';
  end if;

  begin
    v_bytes := decode(p_data_base64, 'base64');
  exception when others then
    raise exception 'Nie udało się odczytać pliku.';
  end;
  v_size := octet_length(v_bytes);

  v_max := case when p_mime like 'video/%' then 12582912 else 6291456 end;
  if v_size > v_max then
    raise exception 'Plik jest za duży (maks. %).',
      case when p_mime like 'video/%' then '12 MB' else '6 MB' end;
  end if;

  select coalesce(sum(octet_length(m.data)), 0)::bigint, count(*)::integer
    into v_today_bytes, v_today_count
    from public.community_media m
   where m.owner_id = v_user.user_id
     and m.created_at > now() - interval '24 hours';
  if v_today_count >= 24 or v_today_bytes + v_size > 50331648 then
    raise exception 'Dzienny limit przesyłania wyczerpany (24 pliki / 48 MB) — spróbuj jutro.';
  end if;

  if pg_total_relation_size('public.community_media') > 402653184 then
    raise exception 'Magazyn mediów jest chwilowo pełny — spróbuj później.';
  end if;

  insert into public.community_media (owner_id, mime, data)
  values (v_user.user_id, p_mime, v_bytes)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'mime', p_mime, 'size', v_size);
end;
$$;

-- ---------- 6. Pobieranie pliku (tylko pliki przypięte do wpisu) ----------
create or replace function public.community_get_media(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_mime text;
  v_data text;
begin
  select m.mime, encode(m.data, 'base64') into v_mime, v_data
    from public.community_media m
   where m.id = p_id and m.post_id is not null;
  if v_mime is null then
    raise exception 'Plik nie istnieje.';
  end if;
  return jsonb_build_object('mime', v_mime, 'data', v_data);
end;
$$;

-- ---------- 7. Tworzenie wpisu z załącznikami ----------
drop function if exists public.community_create_post(text, text);
create or replace function public.community_create_post(p_token text, p_content text, p_media jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_user record;
  v_content text := trim(coalesce(p_content, ''));
  v_post record;
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_item jsonb;
  v_clean jsonb := '[]'::jsonb;
  v_id uuid;
  v_mime text;
  v_count integer;
begin
  select * into v_user from public.community_session_user(p_token);

  if char_length(v_content) < 3 or char_length(v_content) > 2000 then
    raise exception 'Wpis musi mieć od 3 do 2000 znaków.';
  end if;

  if jsonb_typeof(v_media) <> 'array' then
    raise exception 'Nieprawidłowy format załączników.';
  end if;
  select count(*) into v_count from jsonb_array_elements(v_media);
  if v_count > 4 then
    raise exception 'Do wpisu możesz dodać maksymalnie 4 załączniki.';
  end if;

  for v_item in select * from jsonb_array_elements(v_media) loop
    if v_item->>'kind' = 'media' then
      begin
        v_id := (v_item->>'id')::uuid;
      exception when others then
        raise exception 'Nieprawidłowy identyfikator załącznika.';
      end;
      select m.mime into v_mime from public.community_media m
       where m.id = v_id and m.owner_id = v_user.user_id and m.post_id is null;
      if v_mime is null then
        raise exception 'Załącznik nie istnieje lub został już użyty.';
      end if;
      v_clean := v_clean || jsonb_build_object('kind', 'media', 'id', v_id, 'mime', v_mime);
    elsif v_item->>'kind' = 'url' then
      if (v_item->>'url') ~ '^https://rejson59\.github\.io/'
         and char_length(v_item->>'url') <= 500
         and coalesce(v_item->>'type', 'image') in ('image', 'video') then
        v_clean := v_clean || jsonb_build_object(
          'kind', 'url', 'type', coalesce(v_item->>'type', 'image'), 'url', v_item->>'url');
      else
        raise exception 'Dozwolone są tylko pliki z domeny rejson59.github.io.';
      end if;
    else
      raise exception 'Nieznany rodzaj załącznika.';
    end if;
  end loop;

  insert into public.community_posts (author_id, author_name, content, media)
  values (v_user.user_id, v_user.username, v_content, v_clean)
  returning id, author_name, content, created_at into v_post;

  update public.community_media m
     set post_id = v_post.id
   where m.post_id is null
     and m.owner_id = v_user.user_id
     and m.id in (select (it->>'id')::uuid from jsonb_array_elements(v_clean) it
                   where it->>'kind' = 'media');

  return jsonb_build_object(
    'id', v_post.id,
    'author_name', v_post.author_name,
    'content', v_post.content,
    'media', v_clean,
    'created_at', v_post.created_at,
    'comments_count', 0,
    'mine', true
  );
end;
$$;

-- ---------- 8. Publikowanie z konta bota (klucz zamiast PIN-a) ----------
create or replace function public.community_agent_post(p_secret text, p_content text, p_media jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_secret text;
  v_agent record;
  v_content text := trim(coalesce(p_content, ''));
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_item jsonb;
  v_clean jsonb := '[]'::jsonb;
  v_count integer;
  v_recent integer;
  v_post record;
begin
  select c.value into v_secret from public.agent_config c where c.key = 'post_secret';
  if v_secret is null or coalesce(p_secret, '') = '' or p_secret <> v_secret then
    raise exception 'Nieprawidłowy klucz agenta.';
  end if;

  select u.id, u.username into v_agent
    from public.community_users u
   where u.is_bot
   order by u.created_at
   limit 1;
  if v_agent.id is null then
    raise exception 'Konto agenta nie istnieje.';
  end if;

  select count(*)::integer into v_recent from public.community_posts p
   where p.author_id = v_agent.id and p.created_at > now() - interval '24 hours';
  if v_recent >= 3 then
    raise exception 'Limit publikacji agenta: maks. 3 wpisy na dobę.';
  end if;

  if char_length(v_content) < 3 or char_length(v_content) > 2000 then
    raise exception 'Wpis musi mieć od 3 do 2000 znaków.';
  end if;

  if jsonb_typeof(v_media) <> 'array' then
    raise exception 'Nieprawidłowy format mediów.';
  end if;
  select count(*) into v_count from jsonb_array_elements(v_media);
  if v_count > 4 then
    raise exception 'Maksymalnie 4 załączniki.';
  end if;

  for v_item in select * from jsonb_array_elements(v_media) loop
    if v_item->>'kind' = 'url'
       and (v_item->>'url') ~ '^https://rejson59\.github\.io/'
       and char_length(v_item->>'url') <= 500
       and coalesce(v_item->>'type', 'image') in ('image', 'video') then
      v_clean := v_clean || jsonb_build_object(
        'kind', 'url', 'type', coalesce(v_item->>'type', 'image'), 'url', v_item->>'url');
    else
      raise exception 'Agent może dołączać tylko pliki z domeny rejson59.github.io.';
    end if;
  end loop;

  insert into public.community_posts (author_id, author_name, content, media)
  values (v_agent.id, v_agent.username, v_content, v_clean)
  returning id, created_at into v_post;

  return jsonb_build_object(
    'id', v_post.id,
    'author_name', v_agent.username,
    'created_at', v_post.created_at
  );
end;
$$;

-- ---------- 9. Komentarze z odpowiedziami (2 poziomy) ----------
drop function if exists public.community_add_comment(text, uuid, text);
create or replace function public.community_add_comment(p_token text, p_post_id uuid, p_content text, p_parent_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_user record;
  v_content text := trim(coalesce(p_content, ''));
  v_comment record;
  v_parent record;
begin
  select * into v_user from public.community_session_user(p_token);

  if not exists (select 1 from public.community_posts where id = p_post_id) then
    raise exception 'Ten wpis już nie istnieje.';
  end if;
  if char_length(v_content) < 1 or char_length(v_content) > 1000 then
    raise exception 'Komentarz może mieć maksymalnie 1000 znaków.';
  end if;

  if p_parent_id is not null then
    select * into v_parent from public.community_comments c where c.id = p_parent_id;
    if v_parent.id is null or v_parent.post_id <> p_post_id then
      raise exception 'Odpowiedź nie pasuje do tego wpisu.';
    end if;
    if v_parent.parent_id is not null then
      /* Maksymalnie 2 poziomy: odpowiedź na odpowiedź przypina się do korzenia wątku */
      p_parent_id := v_parent.parent_id;
    end if;
  end if;

  insert into public.community_comments (post_id, author_id, author_name, content, parent_id)
  values (p_post_id, v_user.user_id, v_user.username, v_content, p_parent_id)
  returning id, author_name, content, created_at, parent_id into v_comment;

  return jsonb_build_object(
    'id', v_comment.id,
    'author_name', v_comment.author_name,
    'content', v_comment.content,
    'created_at', v_comment.created_at,
    'parent_id', v_comment.parent_id,
    'mine', true
  );
end;
$$;

create or replace function public.community_list_comments(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'author_name', c.author_name,
      'is_owner', coalesce(u.is_owner, false),
      'is_bot', coalesce(u.is_bot, false),
      'content', c.content,
      'created_at', c.created_at,
      'parent_id', c.parent_id
    ) order by c.created_at asc), '[]'::jsonb)
  into v
  from public.community_comments c
  left join public.community_users u on u.id = c.author_id
  where c.post_id = p_post_id;
  return v;
end;
$$;

-- ---------- 10. Lista wpisów z mediami i odznaką bota ----------
drop function if exists public.community_list_posts(integer, integer);
create or replace function public.community_list_posts(p_limit integer default 30, p_offset integer default 0, p_token text default null::text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_user uuid := null;
  v_posts jsonb;
  v_total integer;
begin
  if p_token is not null and char_length(trim(p_token)) >= 16 then
    select cs.user_id into v_user
      from public.community_sessions cs
     where cs.token_hash = encode(extensions.digest('rejson_comm_sess_v1:' || trim(p_token), 'sha256'), 'hex')
     limit 1;
  end if;

  select count(*)::integer into v_total from public.community_posts;

  select coalesce(jsonb_agg(t.row_obj order by t.created_at desc), '[]'::jsonb)
  into v_posts
  from (
    select jsonb_build_object(
        'id', p.id,
        'author_name', p.author_name,
        'is_owner', coalesce(cu.is_owner, false),
        'is_bot', coalesce(cu.is_bot, false),
        'content', p.content,
        'media', p.media,
        'created_at', p.created_at,
        'comments_count', (select count(*)::integer from public.community_comments c where c.post_id = p.id),
        'likes_count', (select count(*)::integer from public.community_likes l where l.post_id = p.id),
        'has_liked', (v_user is not null and exists (
          select 1 from public.community_likes l2 where l2.post_id = p.id and l2.user_id = v_user))
      ) as row_obj,
      p.created_at
    from public.community_posts p
    left join public.community_users cu on cu.id = p.author_id
    order by p.created_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('posts', v_posts, 'total', v_total);
end;
$$;

-- ---------- 11. Panel admina: dzienne wejścia + top projekty tygodnia ----------
create or replace function public.get_admin_daily_views(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 14), 60));
  v_start date := ((now() at time zone 'Europe/Warsaw')::date - (v_days - 1));
  v_series jsonb;
  v_top jsonb;
begin
  if not public.is_widget_admin() then
    raise exception 'Brak uprawnień administratora.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day,
      'total', coalesce(s.total, 0),
      'projects', coalesce(s.projects, '{}'::jsonb)
    ) order by d.day), '[]'::jsonb)
  into v_series
  from (
    select generate_series(v_start, (now() at time zone 'Europe/Warsaw')::date, interval '1 day')::date as day
  ) d
  left join (
    select pvd.day, sum(pvd.views) as total, jsonb_object_agg(pvd.project_slug, pvd.views) as projects
      from public.page_views_daily pvd
     where pvd.day >= v_start
     group by pvd.day
  ) s on s.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('slug', t.project_slug, 'views', t.views) order by t.views desc), '[]'::jsonb)
  into v_top
  from (
    select pvd.project_slug, sum(pvd.views) as views
      from public.page_views_daily pvd
     where pvd.day >= ((now() at time zone 'Europe/Warsaw')::date - 6)
     group by pvd.project_slug
     order by sum(pvd.views) desc
     limit 6
  ) t;

  return jsonb_build_object('days', v_series, 'top_week', v_top);
end;
$$;

-- ---------- 12. Panel admina: odznaka bota na liście członków i wpisów ----------
create or replace function public.get_admin_community()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_users jsonb;
  v_posts jsonb;
begin
  if not public.is_widget_admin() then
    raise exception 'Brak uprawnień administratora.';
  end if;

  with u as (
    select
      cu.id,
      cu.username,
      cu.created_at,
      cu.is_owner,
      cu.is_bot,
      (select count(*)::integer from public.community_posts p where p.author_id = cu.id) as posts_count,
      (select count(*)::integer from public.community_comments c where c.author_id = cu.id) as comments_count,
      (select count(*)::integer from public.community_likes l join public.community_posts p2 on p2.id = l.post_id where p2.author_id = cu.id) as likes_received,
      exists (
        select 1 from public.page_presence pp
         where pp.username = cu.username
           and pp.last_seen_at > now() - interval '90 seconds'
      ) as online
    from public.community_users cu
    order by cu.created_at desc
    limit 100
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'username', u.username,
    'created_at', u.created_at,
    'is_owner', u.is_owner,
    'is_bot', u.is_bot,
    'online', u.online,
    'posts_count', u.posts_count,
    'comments_count', u.comments_count,
    'likes_received', u.likes_received
  ) order by u.created_at desc), '[]'::jsonb)
  into v_users
  from u;

  with pp as (
    select
      p.id,
      p.author_name,
      cu.is_owner,
      cu.is_bot,
      left(p.content, 140) as content,
      jsonb_array_length(p.media) as media_count,
      p.created_at,
      (select count(*)::integer from public.community_comments c where c.post_id = p.id) as comments_count,
      (select count(*)::integer from public.community_likes l where l.post_id = p.id) as likes_count
    from public.community_posts p
    left join public.community_users cu on cu.id = p.author_id
    order by p.created_at desc
    limit 25
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id,
    'author_name', pp.author_name,
    'is_owner', coalesce(pp.is_owner, false),
    'is_bot', coalesce(pp.is_bot, false),
    'content', pp.content,
    'media_count', pp.media_count,
    'created_at', pp.created_at,
    'comments_count', pp.comments_count,
    'likes_count', pp.likes_count
  ) order by pp.created_at desc), '[]'::jsonb)
  into v_posts
  from pp;

  return jsonb_build_object(
    'users', v_users,
    'posts', v_posts,
    'stats', jsonb_build_object(
      'users', (select count(*)::integer from public.community_users),
      'posts', (select count(*)::integer from public.community_posts),
      'comments', (select count(*)::integer from public.community_comments),
      'likes', (select count(*)::integer from public.community_likes)
    )
  );
end;
$$;

-- ---------- 13. Uprawnienia ----------
grant execute on function public.community_create_post(text, text, jsonb) to anon, authenticated;
grant execute on function public.community_agent_post(text, text, jsonb) to anon, authenticated;
grant execute on function public.community_add_comment(text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.community_list_comments(uuid) to anon, authenticated;
grant execute on function public.community_list_posts(integer, integer, text) to anon, authenticated;
grant execute on function public.community_upload_media(text, text, text) to anon, authenticated;
grant execute on function public.community_get_media(uuid) to anon, authenticated;
grant execute on function public.get_admin_daily_views(integer) to anon, authenticated;
grant execute on function public.get_admin_community() to anon, authenticated;

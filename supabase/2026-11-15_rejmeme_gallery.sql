-- © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
-- RejHub 2.0 — RejMeme: galeria memów społeczności + kolejka moderacji.
--
-- Zasada działania (taka sama jak przy zdjęciach w RejChacie):
--   * każdy wgrany mem trafia do bazy jako `pending` — NIE jest publiczny,
--   * admin ocenia mem pod kątem etyki i dopiero wtedy publikuje,
--   * odrzucony mem zostaje w bazie (autor widzi powód), ale nie wychodzi
--     na zewnątrz,
--   * pliki trzymamy w kolumnie `bytea` (bez publicznego Storage), a wydajemy
--     je wyłącznie przez funkcje `security definer` z limitami i sprawdzaniem
--     prawdziwego formatu pliku (magic bytes).
--
-- Limity: 2 MiB na plik, 10 plików i 20 MiB na dobę, 128 MiB łącznie,
-- maks. 5 memów oczekujących na jednego autora.

/* ------------------------------------------------------------------ */
/* 1. Tabele                                                           */
/* ------------------------------------------------------------------ */

create table if not exists public.rejmeme_memes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.community_users(id) on delete set null,
  author_name text not null default 'Anonim',
  title text not null,
  tags text[] not null default '{}',
  mime text not null,
  data bytea,
  bytes_size integer not null,
  status text not null default 'pending',
  reject_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  published_at timestamptz,
  views integer not null default 0,
  constraint rejmeme_memes_status_check check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists rejmeme_memes_status_idx
  on public.rejmeme_memes (status, published_at desc);
create index if not exists rejmeme_memes_author_idx
  on public.rejmeme_memes (author_id, created_at desc);
create index if not exists rejmeme_memes_created_idx
  on public.rejmeme_memes (created_at desc);

create table if not exists public.rejmeme_usage (
  user_id uuid primary key references public.community_users(id) on delete cascade,
  period_start timestamptz not null default clock_timestamp(),
  file_count integer not null default 0,
  byte_count bigint not null default 0
);

alter table public.rejmeme_memes enable row level security;
alter table public.rejmeme_usage enable row level security;
revoke all on public.rejmeme_memes from public, anon, authenticated;
revoke all on public.rejmeme_usage from public, anon, authenticated;

comment on table public.rejmeme_memes is
  'Memy społeczności RejHub. Publicznie widoczne są tylko wiersze ze statusem approved, i to wyłącznie przez funkcje RPC.';

/* ------------------------------------------------------------------ */
/* 2. Porządkowanie tagów                                              */
/* ------------------------------------------------------------------ */

create or replace function public.rejmeme_clean_tags(p_tags text[])
returns text[]
language plpgsql
immutable
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_tag text;
  v_out text[] := array[]::text[];
begin
  if p_tags is null then
    return v_out;
  end if;
  foreach v_tag in array p_tags loop
    v_tag := lower(btrim(coalesce(v_tag, '')));
    v_tag := regexp_replace(v_tag, '[[:cntrl:]]', '', 'g');
    v_tag := regexp_replace(v_tag, '\s+', ' ', 'g');
    v_tag := btrim(v_tag, '# ');
    if char_length(v_tag) < 2 or char_length(v_tag) > 24 then
      continue;
    end if;
    if v_tag = any(v_out) then
      continue;
    end if;
    v_out := array_append(v_out, v_tag);
    if array_length(v_out, 1) >= 6 then
      exit;
    end if;
  end loop;
  return v_out;
end;
$fn$;

/* ------------------------------------------------------------------ */
/* 3. Wgranie mema (kolejka moderacji)                                 */
/* ------------------------------------------------------------------ */

create or replace function public.rejmeme_submit(
  p_token text,
  p_title text,
  p_tags text[],
  p_mime text,
  p_data_base64 text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  me record;
  bytes bytea;
  sz integer;
  v_mime text := lower(btrim(coalesce(p_mime, '')));
  v_title text;
  v_tags text[];
  v_pending integer;
  v_used_files integer;
  v_used_bytes bigint;
  v_period timestamptz;
  v_row public.rejmeme_memes;
begin
  select * into me from public.community_session_user(p_token);

  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then
    raise exception 'Dozwolone są memy JPG, PNG, WebP i GIF.';
  end if;

  if p_data_base64 is null or length(p_data_base64) > 2796204 or length(p_data_base64) < 16 then
    raise exception 'Mem jest pusty lub za duży (maks. 2 MiB).';
  end if;
  begin
    bytes := decode(p_data_base64, 'base64');
  exception when others then
    raise exception 'Nie udało się odczytać pliku.';
  end;
  sz := octet_length(bytes);
  if sz < 12 or sz > 2097152 then
    raise exception 'Mem jest pusty lub za duży (maks. 2 MiB).';
  end if;

  if not (
       (v_mime = 'image/jpeg' and substring(bytes from 1 for 3) = decode('ffd8ff', 'hex'))
    or (v_mime = 'image/png'  and substring(bytes from 1 for 8) = decode('89504e470d0a1a0a', 'hex'))
    or (v_mime = 'image/gif'  and substring(bytes from 1 for 6) in (decode('474946383761', 'hex'), decode('474946383961', 'hex')))
    or (v_mime = 'image/webp' and substring(bytes from 1 for 4) = decode('52494646', 'hex')
                              and substring(bytes from 9 for 4) = decode('57454250', 'hex'))
  ) then
    raise exception 'Format pliku nie odpowiada rozszerzeniu.';
  end if;

  v_title := btrim(regexp_replace(coalesce(p_title, ''), '[[:cntrl:]]', '', 'g'));
  if char_length(v_title) < 3 then
    raise exception 'Tytuł mema musi mieć co najmniej 3 znaki.';
  end if;
  if char_length(v_title) > 120 then
    raise exception 'Tytuł mema może mieć maks. 120 znaków.';
  end if;

  v_tags := public.rejmeme_clean_tags(p_tags);

  select count(*) into v_pending
    from public.rejmeme_memes
   where author_id = me.user_id and status = 'pending';
  if v_pending >= 5 then
    raise exception 'Masz już 5 memów w kolejce do sprawdzenia. Poczekaj na decyzję admina.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rejmeme-global', 0));

  if coalesce((select sum(bytes_size) from public.rejmeme_memes where data is not null), 0) + sz > 134217728 then
    raise exception 'Magazyn memów jest chwilowo pełny — spróbuj później.';
  end if;

  select period_start, file_count, byte_count
    into v_period, v_used_files, v_used_bytes
    from public.rejmeme_usage where user_id = me.user_id;
  if not found then
    v_period := clock_timestamp();
    v_used_files := 0;
    v_used_bytes := 0;
  elsif v_period <= clock_timestamp() - interval '24 hours' then
    v_period := clock_timestamp();
    v_used_files := 0;
    v_used_bytes := 0;
  end if;
  if v_used_files >= 10 or v_used_bytes + sz > 20971520 then
    raise exception 'Dzienny limit memów (10 plików / 20 MiB) został osiągnięty.';
  end if;

  insert into public.rejmeme_memes (author_id, author_name, title, tags, mime, data, bytes_size, status)
  values (me.user_id, left(me.username, 60), v_title, v_tags, v_mime, bytes, sz, 'pending')
  returning * into v_row;

  insert into public.rejmeme_usage (user_id, period_start, file_count, byte_count)
  values (me.user_id, clock_timestamp(), 1, sz)
  on conflict (user_id) do update set
    period_start = case when public.rejmeme_usage.period_start <= clock_timestamp() - interval '24 hours'
                        then clock_timestamp() else public.rejmeme_usage.period_start end,
    file_count = case when public.rejmeme_usage.period_start <= clock_timestamp() - interval '24 hours'
                      then 1 else public.rejmeme_usage.file_count + 1 end,
    byte_count = case when public.rejmeme_usage.period_start <= clock_timestamp() - interval '24 hours'
                      then excluded.byte_count else public.rejmeme_usage.byte_count + excluded.byte_count end;

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'title', v_row.title,
    'tags', to_jsonb(v_row.tags),
    'created_at', v_row.created_at
  );
end;
$fn$;

/* ------------------------------------------------------------------ */
/* 4. Publiczna galeria (tylko zatwierdzone memy)                      */
/* ------------------------------------------------------------------ */

create or replace function public.rejmeme_gallery(
  p_query text default null,
  p_tag text default null,
  p_sort text default 'new',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_query text := btrim(regexp_replace(lower(coalesce(p_query, '')), '[[:cntrl:]]', '', 'g'));
  v_tag text := btrim(lower(coalesce(p_tag, '')));
  v_sort text := case when lower(coalesce(p_sort, '')) = 'popular' then 'popular' else 'new' end;
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  select count(*) into v_total
    from public.rejmeme_memes m
   where m.status = 'approved' and m.data is not null
     and (v_query = '' or lower(m.title) like '%' || v_query || '%'
          or lower(m.author_name) like '%' || v_query || '%'
          or exists (select 1 from unnest(m.tags) t where lower(t) like '%' || v_query || '%'))
     and (v_tag = '' or v_tag = any (m.tags));

  select coalesce(jsonb_agg(item order by sort_pop desc nulls last, sort_time desc), '[]'::jsonb)
    into v_items
    from (
      select jsonb_build_object(
               'id', m.id,
               'title', m.title,
               'tags', to_jsonb(m.tags),
               'author', m.author_name,
               'mime', m.mime,
               'bytes', m.bytes_size,
               'created_at', m.published_at,
               'views', m.views
             ) as item,
             case when v_sort = 'popular' then m.views end as sort_pop,
             m.published_at as sort_time
        from public.rejmeme_memes m
       where m.status = 'approved' and m.data is not null
         and (v_query = '' or lower(m.title) like '%' || v_query || '%'
              or lower(m.author_name) like '%' || v_query || '%'
              or exists (select 1 from unnest(m.tags) t where lower(t) like '%' || v_query || '%'))
         and (v_tag = '' or v_tag = any (m.tags))
       order by m.published_at desc
       limit v_limit offset v_offset
    ) q;

  return jsonb_build_object('items', v_items, 'total', v_total,
                            'limit', v_limit, 'offset', v_offset);
end;
$fn$;

/* Obraz mema — tylko po zatwierdzeniu. Każde pobranie liczy jedno wyświetlenie. */
create or replace function public.rejmeme_image(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_row public.rejmeme_memes;
begin
  update public.rejmeme_memes
     set views = views + 1
   where id = p_id and status = 'approved' and data is not null
   returning * into v_row;

  if not found then
    raise exception 'Ten mem nie jest dostępny.';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'mime', v_row.mime,
    'data', replace(encode(v_row.data, 'base64'), E'\n', '')
  );
end;
$fn$;

/* ------------------------------------------------------------------ */
/* 5. Własne zgłoszenia autora (ze statusem i powodem odrzucenia)      */
/* ------------------------------------------------------------------ */

create or replace function public.rejmeme_mine(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  me record;
  v_items jsonb;
begin
  select * into me from public.community_session_user(p_token);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'title', m.title,
           'tags', to_jsonb(m.tags),
           'mime', m.mime,
           'bytes', m.bytes_size,
           'status', m.status,
           'reason', m.reject_reason,
           'created_at', m.created_at,
           'reviewed_at', m.reviewed_at,
           'published_at', m.published_at,
           'views', m.views
         ) order by m.created_at desc), '[]'::jsonb)
    into v_items
    from (select * from public.rejmeme_memes
           where author_id = me.user_id
           order by created_at desc limit 50) m;

  return jsonb_build_object('items', v_items,
    'pending', (select count(*) from public.rejmeme_memes where author_id = me.user_id and status = 'pending'),
    'approved', (select count(*) from public.rejmeme_memes where author_id = me.user_id and status = 'approved'),
    'rejected', (select count(*) from public.rejmeme_memes where author_id = me.user_id and status = 'rejected'));
end;
$fn$;

/* Miniatura własnego zgłoszenia — także gdy jeszcze czeka lub został odrzucony. */
create or replace function public.rejmeme_own_image(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  me record;
  v_row public.rejmeme_memes;
begin
  select * into me from public.community_session_user(p_token);
  select * into v_row from public.rejmeme_memes
   where id = p_id and author_id = me.user_id and data is not null;
  if not found then
    raise exception 'Nie znaleziono tego mema.';
  end if;
  return jsonb_build_object('id', v_row.id, 'mime', v_row.mime,
                            'data', replace(encode(v_row.data, 'base64'), E'\n', ''));
end;
$fn$;

/* Wycofanie własnego mema, dopóki czeka w kolejce. */
create or replace function public.rejmeme_withdraw(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  me record;
  v_deleted integer;
begin
  select * into me from public.community_session_user(p_token);
  delete from public.rejmeme_memes
   where id = p_id and author_id = me.user_id and status = 'pending';
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'Można wycofać tylko własny mem, który jeszcze czeka na decyzję.';
  end if;
  return true;
end;
$fn$;

/* ------------------------------------------------------------------ */
/* 6. Moderacja (panel admina, konto z tabeli widget_admins)           */
/* ------------------------------------------------------------------ */

create or replace function public.rejmeme_admin_queue(
  p_status text default 'pending',
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_status text := lower(coalesce(p_status, 'pending'));
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_items jsonb;
begin
  if not public.is_widget_admin() then
    raise exception 'Ta sekcja jest dostępna tylko dla administratora.';
  end if;
  if v_status not in ('pending', 'approved', 'rejected', 'all') then
    raise exception 'Nieznany status kolejki.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'title', m.title,
           'tags', to_jsonb(m.tags),
           'author', m.author_name,
           'mime', m.mime,
           'bytes', m.bytes_size,
           'status', m.status,
           'reason', m.reject_reason,
           'created_at', m.created_at,
           'reviewed_at', m.reviewed_at,
           'published_at', m.published_at,
           'views', m.views
         ) order by m.created_at asc), '[]'::jsonb)
    into v_items
    from (select * from public.rejmeme_memes
           where (v_status = 'all' or status = v_status)
           order by created_at asc limit v_limit) m;

  return jsonb_build_object(
    'items', v_items,
    'pending', (select count(*) from public.rejmeme_memes where status = 'pending'),
    'approved', (select count(*) from public.rejmeme_memes where status = 'approved'),
    'rejected', (select count(*) from public.rejmeme_memes where status = 'rejected'),
    'status', v_status
  );
end;
$fn$;

create or replace function public.rejmeme_admin_image(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_row public.rejmeme_memes;
begin
  if not public.is_widget_admin() then
    raise exception 'Ta sekcja jest dostępna tylko dla administratora.';
  end if;
  select * into v_row from public.rejmeme_memes where id = p_id and data is not null;
  if not found then
    raise exception 'Nie znaleziono pliku tego mema.';
  end if;
  return jsonb_build_object('id', v_row.id, 'mime', v_row.mime,
                            'data', replace(encode(v_row.data, 'base64'), E'\n', ''));
end;
$fn$;

create or replace function public.rejmeme_moderate(
  p_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '[[:cntrl:]]', '', 'g'));
  v_row public.rejmeme_memes;
begin
  if not public.is_widget_admin() then
    raise exception 'Ta sekcja jest dostępna tylko dla administratora.';
  end if;

  if v_action = 'delete' then
    delete from public.rejmeme_memes where id = p_id;
    if not found then
      raise exception 'Nie znaleziono tego mema.';
    end if;
    return jsonb_build_object('id', p_id, 'status', 'deleted');
  end if;

  if v_action not in ('approve', 'reject') then
    raise exception 'Nieznana decyzja moderacji.';
  end if;

  if v_action = 'approve' then
    update public.rejmeme_memes
       set status = 'approved',
           reject_reason = null,
           reviewed_at = clock_timestamp(),
           reviewed_by = auth.uid(),
           published_at = coalesce(published_at, clock_timestamp())
     where id = p_id
     returning * into v_row;
  else
    if v_reason = '' then
      v_reason := 'Mem nie spełnia zasad etycznych RejHuba.';
    end if;
    update public.rejmeme_memes
       set status = 'rejected',
           reject_reason = left(v_reason, 300),
           reviewed_at = clock_timestamp(),
           reviewed_by = auth.uid(),
           published_at = null
     where id = p_id
     returning * into v_row;
  end if;

  if not found then
    raise exception 'Nie znaleziono tego mema.';
  end if;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status,
                            'reason', v_row.reject_reason);
end;
$fn$;

/* ------------------------------------------------------------------ */
/* 7. Uprawnienia                                                      */
/* ------------------------------------------------------------------ */

revoke all on function public.rejmeme_clean_tags(text[]) from public;
revoke all on function public.rejmeme_submit(text, text, text[], text, text) from public;
revoke all on function public.rejmeme_gallery(text, text, text, integer, integer) from public;
revoke all on function public.rejmeme_image(uuid) from public;
revoke all on function public.rejmeme_mine(text) from public;
revoke all on function public.rejmeme_own_image(text, uuid) from public;
revoke all on function public.rejmeme_withdraw(text, uuid) from public;
revoke all on function public.rejmeme_admin_queue(text, integer) from public;
revoke all on function public.rejmeme_admin_image(uuid) from public;
revoke all on function public.rejmeme_moderate(uuid, text, text) from public;

grant execute on function public.rejmeme_clean_tags(text[]) to anon, authenticated;
grant execute on function public.rejmeme_submit(text, text, text[], text, text) to anon, authenticated;
grant execute on function public.rejmeme_gallery(text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.rejmeme_image(uuid) to anon, authenticated;
grant execute on function public.rejmeme_mine(text) to anon, authenticated;
grant execute on function public.rejmeme_own_image(text, uuid) to anon, authenticated;
grant execute on function public.rejmeme_withdraw(text, uuid) to anon, authenticated;
grant execute on function public.rejmeme_admin_queue(text, integer) to anon, authenticated;
grant execute on function public.rejmeme_admin_image(uuid) to anon, authenticated;
grant execute on function public.rejmeme_moderate(uuid, text, text) to anon, authenticated;

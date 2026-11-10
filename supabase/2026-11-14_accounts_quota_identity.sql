-- © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
-- RejHub 2.0 — konta: jedna historia osoby, jeden wspólny limit danych.
--
-- 1) identity_aliases — jawne scalenia starych nazw w jedną osobę.
-- 2) identity_canonical() — rozwiązuje łańcuch aliasów (a → b → c).
-- 3) quota_bytes na koncie + profile_usage_bytes() + trigger pilnujący
--    jednego wspólnego limitu (RejChat + RejSejf + RejFile).
-- 4) Funkcje administracyjne: scalanie, zapominanie konta, lista problemów.
-- 5) admin_visitor_list / admin_visitor_profile liczą historię po scalonej
--    osobie (konto + fingerprint + przeglądarka), a nie po samej nazwie.

/* ------------------------------------------------------------------ */
/* 1. Aliasy tożsamości                                                */
/* ------------------------------------------------------------------ */

create table if not exists public.identity_aliases (
  alias text primary key,
  canonical text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint identity_alias_not_self check (lower(alias) <> lower(canonical))
);

alter table public.identity_aliases enable row level security;
revoke all on public.identity_aliases from public, anon, authenticated;

comment on table public.identity_aliases is
  'Scalenia nazw kont: alias (stara nazwa, małymi literami) → canonical (nazwa, pod którą liczy się historia).';

create or replace function public.identity_canonical(p_name text)
returns text
language sql
stable
set search_path to 'public'
as $fn$
  with recursive chain(name, depth) as (
    select lower(btrim(coalesce(p_name, ''))), 0
    union all
    select lower(a.canonical), c.depth + 1
      from chain c
      join public.identity_aliases a on a.alias = c.name
     where c.depth < 8
  )
  select name from chain order by depth desc limit 1;
$fn$;

/* ------------------------------------------------------------------ */
/* 2. Jeden wspólny limit danych na konto (250 MB)                     */
/* ------------------------------------------------------------------ */

alter table public.community_users
  add column if not exists quota_bytes bigint not null default 262144000; -- 250 MB

comment on column public.community_users.quota_bytes is
  'Wspólny limit danych profilu (RejChat + RejSejf + RejFile), w bajtach. Domyślnie 250 MB.';

/* Ile miejsca zajmuje konto — jedno miejsce prawdy dla wszystkich usług. */
create or replace function public.profile_usage_bytes(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select
    coalesce((select sum(p.bytes_size) from public.rejchat_photos p
               where p.owner_id = p_user_id
                 and (p.expires_at is null or p.expires_at > now())), 0)
  + coalesce((select sum(octet_length(s.content)) from public.rejsejf_items s
               where s.owner_id = p_user_id), 0)
  + coalesce((select sum(t.bytes) from public.rejfile_transfers t
               where (t.sender_id = p_user_id or t.recipient_id = p_user_id)
                 and t.expires_at > now()
                 and coalesce(t.status, 'ready') <> 'deleted'), 0);
$fn$;

/* Podział na usługi — tylko do pokazania w koncie i panelu, nie do limitów. */
create or replace function public.profile_usage_breakdown(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  me record;
  v_chat bigint;
  v_sejf bigint;
  v_file bigint;
  v_quota bigint;
begin
  select * into me from public.community_session_user(p_token);
  select coalesce(sum(p.bytes_size), 0) into v_chat
    from public.rejchat_photos p
   where p.owner_id = me.user_id and (p.expires_at is null or p.expires_at > now());
  select coalesce(sum(octet_length(s.content)), 0) into v_sejf
    from public.rejsejf_items s where s.owner_id = me.user_id;
  select coalesce(sum(t.bytes), 0) into v_file
    from public.rejfile_transfers t
   where (t.sender_id = me.user_id or t.recipient_id = me.user_id)
     and t.expires_at > now() and coalesce(t.status, 'ready') <> 'deleted';
  select coalesce(cu.quota_bytes, 262144000) into v_quota
    from public.community_users cu where cu.id = me.user_id;
  return jsonb_build_object(
    'used', v_chat + v_sejf + v_file,
    'quota', coalesce(v_quota, 262144000),
    'parts', jsonb_build_object('chat', v_chat, 'sejf', v_sejf, 'file', v_file),
    'percent', round(100.0 * (v_chat + v_sejf + v_file) / greatest(coalesce(v_quota, 262144000), 1), 1)
  );
end;
$fn$;

/* Trigger na wszystkich trzech magazynach: wspólny limit, nie trzy osobne. */
create or replace function public.profile_quota_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user uuid;
  v_bytes bigint := 0;
  v_quota bigint;
  v_used bigint;
begin
  if tg_table_name = 'rejfile_transfers' then
    v_user := new.sender_id;
    v_bytes := coalesce(new.bytes, 0);
  elsif tg_table_name = 'rejchat_photos' then
    v_user := new.owner_id;
    v_bytes := coalesce(new.bytes_size, 0);
  elsif tg_table_name = 'rejsejf_items' then
    v_user := new.owner_id;
    v_bytes := coalesce(octet_length(new.content), 0);
  end if;

  if v_user is null then
    return new;
  end if;

  select coalesce(quota_bytes, 262144000) into v_quota
    from public.community_users where id = v_user;

  if v_quota is null then
    return new;
  end if;

  v_used := public.profile_usage_bytes(v_user);

  if v_used + v_bytes > v_quota then
    raise exception 'Limit danych profilu wyczerpany (%. z % MB). Usuń starsze pliki, zdjęcia lub wpisy w RejSejfie.',
      round(v_used / 1048576.0, 1), round(v_quota / 1048576.0, 0)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists rejchat_photos_quota_guard on public.rejchat_photos;
create trigger rejchat_photos_quota_guard
  before insert on public.rejchat_photos
  for each row execute function public.profile_quota_guard();

drop trigger if exists rejsejf_items_quota_guard on public.rejsejf_items;
create trigger rejsejf_items_quota_guard
  before insert on public.rejsejf_items
  for each row execute function public.profile_quota_guard();

drop trigger if exists rejfile_transfers_quota_guard on public.rejfile_transfers;
create trigger rejfile_transfers_quota_guard
  before insert on public.rejfile_transfers
  for each row execute function public.profile_quota_guard();

/* RejChat: zdjęcia nie mają już własnego dziennego limitu (12 zdjęć / 8 MiB).
   Zostaje tylko jedno wspólne miejsce profilu (trigger wyżej) i bezpiecznik
   całego magazynu zdjęć. Licznik rejchat_photo_usage jest wyłącznie statystyką. */
create or replace function public.rejchat_send_photo(
  p_token text, p_scope text, p_room text, p_thread_id uuid,
  p_content text, p_reply_to uuid, p_mime text, p_data_base64 text)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $fn$
declare me record; bytes bytea; sz integer; text_content text:=btrim(coalesce(p_content,'')); result jsonb;
begin
  select * into me from public.community_session_user(p_token);
  if p_scope not in ('public','private') or p_scope is null then raise exception 'Nieznany rodzaj rozmowy.'; end if;
  if p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp','image/gif') then
    raise exception 'Dozwolone są zdjęcia JPG, PNG, WebP i GIF.';
  end if;
  if p_data_base64 is null or length(p_data_base64)>1398104 or length(p_data_base64)<16 then
    raise exception 'Zdjęcie jest puste lub za duże (maks. 1 MiB).';
  end if;
  begin bytes:=decode(p_data_base64,'base64'); exception when others then raise exception 'Nie udało się odczytać zdjęcia.'; end;
  sz:=octet_length(bytes);
  if sz<12 or sz>1048576 then raise exception 'Zdjęcie jest puste lub za duże (maks. 1 MiB).'; end if;
  if not ((p_mime='image/jpeg' and substring(bytes from 1 for 3)=decode('ffd8ff','hex'))
       or (p_mime='image/png' and substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex'))
       or (p_mime='image/gif' and substring(bytes from 1 for 6) in (decode('474946383761','hex'),decode('474946383961','hex')))
       or (p_mime='image/webp' and substring(bytes from 1 for 4)=decode('52494646','hex') and substring(bytes from 9 for 4)=decode('57454250','hex'))) then
    raise exception 'Format zdjęcia nie odpowiada plikowi.';
  end if;
  if text_content='' then text_content:='📷 Zdjęcie'; end if;

  perform pg_advisory_xact_lock(hashtextextended('rejchat-photo-global',0));
  if coalesce((select sum(bytes_size) from public.rejchat_photos where data is not null),0)+sz>268435456 then
    raise exception 'Magazyn zdjęć jest chwilowo pełny.';
  end if;

  if p_scope='public' then
    if p_room is null or p_room not in ('general','links') then raise exception 'Nieznany pokój.'; end if;
    if p_reply_to is not null and not exists(select 1 from public.community_chat where id=p_reply_to and room=p_room) then
      raise exception 'Nieznana wiadomość, na którą odpowiadasz.';
    end if;
    result:=public.community_chat_send(p_token,text_content);
    update public.community_chat set room=p_room,reply_to=p_reply_to where id=(result->>'id')::uuid;
    insert into public.rejchat_photos(owner_id,public_message_id,mime,data,bytes_size)
      values(me.user_id,(result->>'id')::uuid,p_mime,bytes,sz);
  else
    result:=public.rejchat_dm_send_v2(p_token,p_thread_id,text_content,p_reply_to);
    insert into public.rejchat_photos(owner_id,private_message_id,mime,data,bytes_size)
      values(me.user_id,(result->>'id')::uuid,p_mime,bytes,sz);
  end if;

  insert into public.rejchat_photo_usage(user_id,period_start,file_count,byte_count)
    values(me.user_id,clock_timestamp(),1,sz)
  on conflict(user_id) do update set
    period_start=case when rejchat_photo_usage.period_start<=clock_timestamp()-interval '24 hours' then clock_timestamp() else rejchat_photo_usage.period_start end,
    file_count=case when rejchat_photo_usage.period_start<=clock_timestamp()-interval '24 hours' then 1 else rejchat_photo_usage.file_count+1 end,
    byte_count=case when rejchat_photo_usage.period_start<=clock_timestamp()-interval '24 hours' then sz else rejchat_photo_usage.byte_count+sz end;
  return result;
end $fn$;

/* ------------------------------------------------------------------ */
/* 3. Porządkowanie tożsamości (panel admina)                          */
/* ------------------------------------------------------------------ */

create or replace function public.admin_identity_merge(p_from text, p_into text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_from text := lower(btrim(coalesce(p_from, '')));
  v_into text := lower(btrim(coalesce(p_into, '')));
  c_links int := 0; c_days int := 0; c_events int := 0; c_trail int := 0; c_presence int := 0;
  c_posts int := 0; c_comments int := 0; c_chat int := 0; c_aliases int := 0;
begin
  if not public.is_widget_admin() then raise exception 'Brak uprawnień administratora.'; end if;
  if v_from = '' or v_into = '' then raise exception 'Podaj obie nazwy.'; end if;
  v_into := public.identity_canonical(v_into);
  if v_from = v_into then raise exception 'To ta sama nazwa.'; end if;

  insert into public.identity_aliases(alias, canonical, reason)
  values (v_from, v_into, 'scalenie w panelu')
  on conflict (alias) do update set canonical = excluded.canonical;

  update public.identity_aliases set canonical = v_into where lower(canonical) = v_from; get diagnostics c_aliases = row_count;
  update public.identity_links set username = v_into where lower(username) = v_from; get diagnostics c_links = row_count;
  update public.visitor_days set username = v_into where lower(username) = v_from; get diagnostics c_days = row_count;
  update public.activity_events set username = v_into where lower(username) = v_from; get diagnostics c_events = row_count;
  update public.page_trail set username = v_into where lower(username) = v_from; get diagnostics c_trail = row_count;
  update public.page_presence set username = v_into where lower(username) = v_from; get diagnostics c_presence = row_count;
  update public.community_posts set author_name = v_into where lower(author_name) = v_from; get diagnostics c_posts = row_count;
  update public.community_comments set author_name = v_into where lower(author_name) = v_from; get diagnostics c_comments = row_count;
  update public.community_chat set author_name = v_into where lower(author_name) = v_from; get diagnostics c_chat = row_count;

  return jsonb_build_object('from', v_from, 'into', v_into, 'links', c_links, 'days', c_days,
    'events', c_events, 'trail', c_trail, 'presence', c_presence, 'posts', c_posts,
    'comments', c_comments, 'chat', c_chat, 'aliases', c_aliases);
end; $fn$;

create or replace function public.admin_identity_forget(p_name text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_name text := lower(btrim(coalesce(p_name, '')));
  c_links int := 0; c_days int := 0; c_events int := 0; c_trail int := 0; c_presence int := 0; c_aliases int := 0;
begin
  if not public.is_widget_admin() then raise exception 'Brak uprawnień administratora.'; end if;
  if v_name = '' then raise exception 'Podaj nazwę.'; end if;
  if exists (select 1 from public.community_users where lower(username) = v_name) then
    raise exception 'To konto nadal istnieje — najpierw je usuń albo scal z innym.';
  end if;

  delete from public.identity_links
   where lower(username) = v_name or lower(public.identity_canonical(username)) = v_name;
  get diagnostics c_links = row_count;

  /* Historia zostaje jako anonimowy ruch: nazwa znika, klucz osoby przestaje
     być kontem. identity_key jest wymagane, więc dostaje unikalny „anon:…”. */
  update public.visitor_days
     set username = null,
         identity_key = 'anon:' || substr(md5(random()::text || clock_timestamp()::text ||
             coalesce(fingerprint_id, '') || coalesce(client_hash, '')), 1, 16)
   where (lower(username) = v_name or lower(public.identity_canonical(username)) = v_name)
     and identity_key like 'u:%';
  get diagnostics c_days = row_count;
  update public.visitor_days set username = null
   where lower(username) = v_name or lower(public.identity_canonical(username)) = v_name;

  update public.activity_events set username = null where lower(username) = v_name; get diagnostics c_events = row_count;
  update public.page_trail set username = null where lower(username) = v_name; get diagnostics c_trail = row_count;
  update public.page_presence set username = null where lower(username) = v_name; get diagnostics c_presence = row_count;

  delete from public.identity_aliases where lower(alias) = v_name or lower(canonical) = v_name;
  get diagnostics c_aliases = row_count;

  return jsonb_build_object('name', v_name, 'links', c_links, 'days', c_days, 'events', c_events,
    'trail', c_trail, 'presence', c_presence, 'aliases', c_aliases);
end; $fn$;

create or replace function public.admin_identity_issues()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_out jsonb;
begin
  if not public.is_widget_admin() then raise exception 'Brak uprawnień administratora.'; end if;
  with links as (
    select lower(public.identity_canonical(il.username)) as name, count(*)::int as links,
           max(il.last_seen_at) as last_seen
      from public.identity_links il where il.username is not null group by 1
  ), trail as (
    select lower(public.identity_canonical(d.username)) as name,
           sum(d.entries)::int as visits, max(d.last_seen_at) as last_seen
      from public.visitor_days d where d.username is not null group by 1
  ), names as (
    select coalesce(l.name, t.name) as name,
           coalesce(l.links, 0) as links,
           coalesce(t.visits, 0) as visits,
           greatest(l.last_seen, t.last_seen) as last_seen
      from links l full join trail t on t.name = l.name
     where coalesce(l.name, t.name) is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', n.name,
      'links', n.links,
      'visits', n.visits,
      'last_seen', n.last_seen,
      'has_account', exists (select 1 from public.community_users cu where lower(cu.username) = n.name),
      'is_alias', exists (select 1 from public.identity_aliases a where a.alias = n.name),
      'canonical', public.identity_canonical(n.name)
    ) order by n.last_seen desc nulls last), '[]'::jsonb)
    into v_out
    from names n;
  return jsonb_build_object('names', v_out,
    'aliases', coalesce((select jsonb_agg(jsonb_build_object(
        'alias', alias, 'canonical', canonical, 'reason', reason, 'created_at', created_at)
        order by created_at desc) from public.identity_aliases), '[]'::jsonb),
    'generated_at', now());
end; $fn$;

/* ------------------------------------------------------------------ */
/* 4. Historia osoby w identyfikatorach                                */
/* ------------------------------------------------------------------ */

-- admin_visitor_list: osoba = scalona nazwa (konto + fp + przeglądarka),
-- a nie osobny wiersz dla „gościa” i osobny dla zalogowanego.
-- Pełna definicja jest wdrożona w bazie; kluczowe zmiany:
--   * CTE `links` normalizuje identity_links przez identity_canonical(),
--   * CTE `vd` wylicza `resolved` z username / fp / ch,
--   * person_key = 'u:' || resolved, a dopiero w drugiej kolejności 'fp:'/'ch:',
--   * aktywność (activity_events) liczy się pod tym samym kluczem osoby,
--   * w wierszu jest `has_account`, żeby panel odróżniał usunięte konta.

-- admin_visitor_profile: przyjmuje u:/fp:/ch:, sprowadza nazwę do postaci
-- kanonicznej i szuka historii po wszystkich aliasach (v_names), dzięki czemu
-- po scaleniu „sadik” → „sadik_pl” profil pokazuje wspólną historię.

-- Uwaga: scalanie i zapominanie nazw wykonuje się z panelu
-- (Administracja → Serwer), nie ręcznym UPDATE — wtedy aliasy i historia
-- zostają spójne.

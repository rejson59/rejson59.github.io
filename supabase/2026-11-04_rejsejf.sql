-- RejSejf: prywatne, niewygasające elementy na wspólnym koncie.
-- Dane binarne trzymamy w PostgreSQL (bez publicznych linków Storage).
-- Limity są celowo ograniczone ze względu na wspólny plan bazy.
create table public.rejsejf_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.community_users(id) on delete cascade,
  kind text not null check (kind in ('note','file')),
  title text not null check (char_length(title) between 1 and 200),
  content bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rejsejf_owner_idx on public.rejsejf_items(owner_id,updated_at desc);
alter table public.rejsejf_items enable row level security;
revoke all on public.rejsejf_items from public, anon, authenticated;

create function public.rejsejf_list(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare u uuid; result jsonb;
begin
  select user_id into strict u from public.community_session_user(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'size',octet_length(content),'created_at',created_at,'updated_at',updated_at) order by updated_at desc), '[]'::jsonb)
    into result from public.rejsejf_items where owner_id=u;
  return result;
end $$;

create function public.rejsejf_get(p_token text,p_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare u uuid; item public.rejsejf_items;
begin
  select user_id into strict u from public.community_session_user(p_token);
  select * into item from public.rejsejf_items where id=p_id and owner_id=u;
  if not found then raise exception 'Nie znaleziono elementu'; end if;
  return jsonb_build_object('id',item.id,'kind',item.kind,'title',item.title,'content',case when item.kind='note' then convert_from(item.content,'UTF8') else encode(item.content,'base64') end,'updated_at',item.updated_at);
end $$;

create function public.rejsejf_save(p_token text,p_kind text,p_title text,p_content text,p_id uuid default null,p_updated timestamptz default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare u uuid; data bytea; previous public.rejsejf_items; item public.rejsejf_items; own_size bigint; total_size bigint;
begin
  select user_id into strict u from public.community_session_user(p_token);
  if p_kind is null or p_kind not in ('note','file') or p_title is null or char_length(trim(p_title)) not between 1 and 200 or p_title ~ '[[:cntrl:]/\\]' then raise exception 'Nieprawidłowa nazwa lub rodzaj'; end if;
  if p_content is null then raise exception 'Brakuje treści'; end if;
  if p_kind='note' then
    if octet_length(p_content)>102400 then raise exception 'Notatka może mieć maksymalnie 100 KiB'; end if;
    data:=convert_to(p_content,'UTF8');
  else
    if length(p_content)>6990508 or p_content !~ '^[A-Za-z0-9+/]*={0,2}$' then raise exception 'Nieprawidłowy plik lub plik większy niż 5 MiB'; end if;
    begin data:=decode(p_content,'base64'); exception when others then raise exception 'Nieprawidłowy plik'; end;
    if octet_length(data)>5242880 then raise exception 'Plik może mieć maksymalnie 5 MiB'; end if;
  end if;
  -- Jeden globalny zamek zabezpiecza oba limity przed równoczesnymi zapisami.
  perform pg_advisory_xact_lock(hashtext('rejsejf_quota_v1'));
  if p_id is not null then
    select * into previous from public.rejsejf_items where id=p_id and owner_id=u for update;
    if not found or previous.kind <> 'note' or p_kind <> 'note' then raise exception 'Nie znaleziono notatki'; end if;
    if p_updated is null or previous.updated_at <> p_updated then raise exception 'Notatka zmieniła się na innym urządzeniu. Otwórz ją ponownie.'; end if;
  elsif (select count(*) from public.rejsejf_items where owner_id=u)>=200 then raise exception 'Limit 200 elementów został osiągnięty'; end if;
  select coalesce(sum(octet_length(content)),0) into own_size from public.rejsejf_items where owner_id=u;
  select coalesce(sum(octet_length(content)),0) into total_size from public.rejsejf_items;
  if own_size - coalesce(octet_length(previous.content),0) + octet_length(data)>26214400 then raise exception 'Limit 25 MiB na konto został osiągnięty'; end if;
  if total_size - coalesce(octet_length(previous.content),0) + octet_length(data)>157286400 then raise exception 'Wspólne miejsce RejSejfu jest obecnie pełne'; end if;
  if p_id is null then
    insert into public.rejsejf_items(owner_id,kind,title,content) values(u,p_kind,trim(p_title),data) returning * into item;
  else
    update public.rejsejf_items set title=trim(p_title),content=data,updated_at=clock_timestamp() where id=p_id and owner_id=u returning * into item;
  end if;
  return jsonb_build_object('id',item.id,'updated_at',item.updated_at);
end $$;

create function public.rejsejf_delete(p_token text,p_id uuid) returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
declare u uuid;
begin
  select user_id into strict u from public.community_session_user(p_token);
  perform pg_advisory_xact_lock(hashtext('rejsejf_quota_v1'));
  delete from public.rejsejf_items where id=p_id and owner_id=u;
  return found;
end $$;
revoke all on function public.rejsejf_list(text),public.rejsejf_get(text,uuid),public.rejsejf_save(text,text,text,text,uuid,timestamptz),public.rejsejf_delete(text,uuid) from public;
grant execute on function public.rejsejf_list(text),public.rejsejf_get(text,uuid),public.rejsejf_save(text,text,text,text,uuid,timestamptz),public.rejsejf_delete(text,uuid) to anon,authenticated;

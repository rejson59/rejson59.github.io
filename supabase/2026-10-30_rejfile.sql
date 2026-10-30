-- RejFile: osobny prywatny bucket; pliki w częściach po 10 MiB.
-- Dostęp do danych wyłącznie przez Edge Function; brak publicznych polityk Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rejfile', 'rejfile', false, 10485760, array['application/octet-stream'])
on conflict (id) do nothing;

create table if not exists public.rejfile_transfers (
 id uuid primary key default gen_random_uuid(),
 filename text not null, bytes bigint not null check (bytes between 1 and 104857600),
 chunks integer not null check (chunks between 1 and 10),
 owner_hash text not null, share_hash text, sender_id uuid references public.community_users(id) on delete set null,
 recipient_id uuid references public.community_users(id) on delete set null, ip_hash text not null,
 status text not null default 'uploading' check (status in ('uploading','ready','revoked')),
 created_at timestamptz not null default now(), expires_at timestamptz,
 cleanup_after timestamptz not null default now() + interval '130 minutes'
);
create index if not exists rejfile_cleanup_idx on public.rejfile_transfers(cleanup_after);
create index if not exists rejfile_recipient_idx on public.rejfile_transfers(recipient_id, expires_at) where status='ready';
create table if not exists public.rejfile_rate (ip_hash text not null, created_at timestamptz not null default now());
create index if not exists rejfile_rate_idx on public.rejfile_rate(ip_hash,created_at);
alter table public.rejfile_transfers enable row level security;
alter table public.rejfile_rate enable row level security;
revoke all on public.rejfile_transfers, public.rejfile_rate from public, anon, authenticated;

create or replace function public.rejfile_create(p_name text, p_bytes bigint, p_owner text, p_share text, p_session text, p_recipient text, p_ip text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare v_id uuid; v_sender uuid; v_recipient uuid; v_chunks int; v_reserved bigint;
begin
 if p_name is null or length(p_name) < 1 or length(p_name) > 200 or p_name ~ '[[:cntrl:]/\\]' then raise exception 'Nieprawidłowa nazwa pliku'; end if;
 if p_bytes is null or p_bytes < 1 or p_bytes > 104857600 then raise exception 'Plik musi mieć od 1 bajtu do 100 MiB'; end if;
 if p_owner !~ '^[a-f0-9]{64}$' or p_ip !~ '^[a-f0-9]{64}$' then raise exception 'Nieprawidłowe dane'; end if;
 if (p_share is null) = (p_recipient is null) then raise exception 'Wybierz link albo odbiorcę'; end if;
 if p_share is not null and p_share !~ '^[a-f0-9]{64}$' then raise exception 'Nieprawidłowy link'; end if;
 if p_session is not null and p_session <> '' then select user_id into v_sender from public.community_session_user(p_session); end if;
 if p_recipient is not null then
   select id into v_recipient from public.community_users where username_lower = lower(trim(p_recipient));
   if v_recipient is null then raise exception 'Nie znaleziono odbiorcy'; end if;
 end if;
 v_chunks := ceil(p_bytes::numeric / 10485760)::integer;
 perform pg_advisory_xact_lock(hashtext('rejfile_create'));
 delete from public.rejfile_rate where created_at < now() - interval '2 days';
 if (select count(*) from public.rejfile_rate where ip_hash=p_ip and created_at > now() - interval '24 hours') >= 8 then raise exception 'Dzienny limit przesyłania został osiągnięty'; end if;
 select coalesce(sum(chunks * 10485760::bigint),0) into v_reserved from public.rejfile_transfers;
 if v_reserved + v_chunks * 10485760::bigint > 419430400 then raise exception 'Wspólne miejsce jest obecnie pełne'; end if;
 if (select coalesce(sum(chunks * 10485760::bigint),0) from public.rejfile_transfers where ip_hash=p_ip) + v_chunks * 10485760::bigint > 209715200 then raise exception 'Limit miejsca dla tej sieci został osiągnięty'; end if;
 insert into public.rejfile_transfers(filename,bytes,chunks,owner_hash,share_hash,sender_id,recipient_id,ip_hash)
 values(p_name,p_bytes,v_chunks,encode(extensions.digest(p_owner,'sha256'),'hex'),case when p_share is null then null else encode(extensions.digest(p_share,'sha256'),'hex') end,v_sender,v_recipient,p_ip) returning id into v_id;
 insert into public.rejfile_rate(ip_hash) values (p_ip);
 return jsonb_build_object('id',v_id,'chunks',v_chunks);
end $$;

create or replace function public.rejfile_finish(p_id uuid, p_owner text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare t public.rejfile_transfers; n integer; sz bigint;
begin
 select * into t from public.rejfile_transfers where id=p_id and owner_hash=encode(extensions.digest(coalesce(p_owner,''),'sha256'),'hex') for update;
 if not found or t.status <> 'uploading' or t.cleanup_after <= now() then raise exception 'Przesyłanie wygasło'; end if;
 for n in 0..(t.chunks-1) loop
   select (metadata->>'size')::bigint into sz from storage.objects where bucket_id='rejfile' and name=t.id::text||'/'||n::text;
   if sz is distinct from least(10485760::bigint,t.bytes - n * 10485760::bigint) then raise exception 'Nie wszystkie części zostały poprawnie przesłane'; end if;
 end loop;
 update public.rejfile_transfers set status='ready',expires_at=now()+interval '3 days',cleanup_after=now()+interval '3 days' where id=t.id returning * into t;
 return jsonb_build_object('id',t.id,'expires_at',t.expires_at);
end $$;

create or replace function public.rejfile_access(p_id uuid, p_share text, p_owner text, p_session text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare t public.rejfile_transfers; v_user uuid; allowed boolean := false; sender text;
begin
 select * into t from public.rejfile_transfers where id=p_id and status='ready' and expires_at > now();
 if not found then raise exception 'Plik jest niedostępny lub wygasł'; end if;
 if p_share is not null and t.share_hash is not null and t.share_hash=encode(extensions.digest(p_share,'sha256'),'hex') then allowed := true; end if;
 if p_owner is not null and t.owner_hash=encode(extensions.digest(p_owner,'sha256'),'hex') then allowed := true; end if;
 if not allowed and p_session is not null and p_session <> '' then
   select user_id into v_user from public.community_session_user(p_session);
   allowed := v_user=t.recipient_id or v_user=t.sender_id;
 end if;
 if not coalesce(allowed,false) then raise exception 'Plik jest niedostępny lub wygasł'; end if;
 select username into sender from public.community_users where id=t.sender_id;
 return jsonb_build_object('id',t.id,'name',t.filename,'size',t.bytes,'chunks',t.chunks,'expires_at',t.expires_at,'sender',sender);
end $$;

create or replace function public.rejfile_inbox(p_session text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare u uuid; result jsonb;
begin
 select user_id into u from public.community_session_user(p_session);
 select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc),'[]'::jsonb) into result from (
   select t.id, t.filename as name, t.bytes as size, t.expires_at, t.created_at, cu.username as sender
   from public.rejfile_transfers t left join public.community_users cu on cu.id=t.sender_id
   where t.recipient_id=u and t.status='ready' and t.expires_at > now() order by t.created_at desc limit 100
 ) x;
 return result;
end $$;

create or replace function public.rejfile_revoke(p_id uuid, p_owner text, p_session text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare t public.rejfile_transfers; u uuid; allowed boolean := false;
begin
 select * into t from public.rejfile_transfers where id=p_id for update;
 if not found then return false; end if;
 if p_owner is not null and t.owner_hash=encode(extensions.digest(p_owner,'sha256'),'hex') then allowed:=true; end if;
 if not allowed and p_session is not null and p_session <> '' then select user_id into u from public.community_session_user(p_session); allowed:=u=t.sender_id; end if;
 if not coalesce(allowed,false) then raise exception 'Brak uprawnień'; end if;
 -- Podpisane adresy uploadu żyją do 2 h. Nie usuwaj części wcześniej,
 -- bo ten sam adres mógłby wgrać je ponownie po usunięciu.
 update public.rejfile_transfers set status='revoked',cleanup_after=greatest(now(),created_at + interval '130 minutes') where id=t.id;
 return true;
end $$;

create table if not exists public.rejfile_maintenance (id boolean primary key default true check(id), last_run timestamptz not null default '-infinity');
insert into public.rejfile_maintenance(id) values(true) on conflict do nothing;
alter table public.rejfile_maintenance enable row level security;
revoke all on public.rejfile_maintenance from public,anon,authenticated;
create or replace function public.rejfile_cleanup_list()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare last_at timestamptz; result jsonb;
begin
 select last_run into last_at from public.rejfile_maintenance where id=true for update;
 if last_at > now() - interval '1 minute' then return '[]'::jsonb; end if;
 update public.rejfile_maintenance set last_run=now() where id=true;
 delete from public.rejfile_rate where created_at < now() - interval '2 days';
 delete from public.rejfile_downloads where created_at < now() - interval '2 days';
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'chunks',chunks)),'[]'::jsonb) into result from (select id,chunks from public.rejfile_transfers where cleanup_after <= now() order by cleanup_after limit 40) x;
 return result;
end $$;
create or replace function public.rejfile_cleanup_done(p_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
begin delete from public.rejfile_transfers where id=p_id and cleanup_after <= now(); return found; end $$;

revoke all on function public.rejfile_create(text,bigint,text,text,text,text,text), public.rejfile_finish(uuid,text), public.rejfile_access(uuid,text,text,text), public.rejfile_inbox(text), public.rejfile_revoke(uuid,text,text), public.rejfile_cleanup_list(), public.rejfile_cleanup_done(uuid) from public, anon, authenticated;
grant execute on function public.rejfile_create(text,bigint,text,text,text,text,text), public.rejfile_finish(uuid,text), public.rejfile_access(uuid,text,text,text), public.rejfile_inbox(text), public.rejfile_revoke(uuid,text,text), public.rejfile_cleanup_list(), public.rejfile_cleanup_done(uuid) to service_role;

-- Limity wystawiania adresów pobierania (podpisane adresy żyją tylko 60 s).
create table if not exists public.rejfile_downloads(ip_hash text not null, bytes bigint not null, created_at timestamptz not null default now());
create index if not exists rejfile_downloads_idx on public.rejfile_downloads(ip_hash,created_at);
alter table public.rejfile_downloads enable row level security;
revoke all on public.rejfile_downloads from public, anon, authenticated;
create or replace function public.rejfile_sign_chunk(p_id uuid,p_share text,p_owner text,p_session text,p_index integer,p_ip text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare info jsonb; cost bigint;
begin
 if p_ip !~ '^[a-f0-9]{64}$' then raise exception 'Nieprawidłowe dane'; end if;
 info := public.rejfile_access(p_id,p_share,p_owner,p_session);
 if p_index is null or p_index < 0 or p_index >= (info->>'chunks')::integer then raise exception 'Nieprawidłowa część pliku'; end if;
 cost := least(10485760::bigint,(info->>'size')::bigint - p_index * 10485760::bigint);
 perform pg_advisory_xact_lock(hashtext('rejfile_download'));
 delete from public.rejfile_downloads where created_at < now() - interval '2 days';
 if (select coalesce(sum(bytes),0) from public.rejfile_downloads where ip_hash=p_ip and created_at > now() - interval '24 hours') + cost > 524288000 then raise exception 'Dzienny limit pobierania dla tej sieci został osiągnięty'; end if;
 if (select coalesce(sum(bytes),0) from public.rejfile_downloads where created_at > now() - interval '24 hours') + cost > 2147483648 then raise exception 'Dzienny limit transferu został osiągnięty'; end if;
 insert into public.rejfile_downloads(ip_hash,bytes) values(p_ip,cost);
 return info;
end $$;
revoke all on function public.rejfile_sign_chunk(uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.rejfile_sign_chunk(uuid,text,text,text,integer,text) to service_role;

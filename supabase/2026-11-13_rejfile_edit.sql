-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- RejFile: edycja notatki lub pliku, który już jest pod linkiem.
--
-- Nowa wersja treści trafia do magazynu pod osobną „rewizją” (id/r<N>/…),
-- a link, właściciel i odbiorca zostają bez zmian. Dopóki nowa wersja nie
-- zostanie w całości przesłana i potwierdzona, pod linkiem nadal działa
-- poprzednia treść — nie ma okna, w którym link zwraca błąd albo mieszankę
-- starych i nowych części.

alter table public.rejfile_transfers
  add column if not exists revision integer not null default 0,
  add column if not exists pending_revision integer,
  add column if not exists pending_bytes bigint,
  add column if not exists pending_chunks integer,
  add column if not exists pending_filename text;

-- Rewizja 0 to stare przesyłki (id/<część>); kolejne mają własny katalog.
create or replace function public.rejfile_part_path(p_id uuid, p_revision integer, p_index integer)
returns text
language sql
immutable
as $function$
  select case when coalesce(p_revision,0) <= 0
    then p_id::text || '/' || p_index::text
    else p_id::text || '/r' || p_revision::text || '/' || p_index::text
  end;
$function$;

revoke all on function public.rejfile_part_path(uuid, integer, integer) from public;
grant execute on function public.rejfile_part_path(uuid, integer, integer) to service_role;

-- Informacja o pliku zawiera teraz numer rewizji, żeby podpisywać właściwe części.
create or replace function public.rejfile_access(p_id uuid, p_share text, p_owner text, p_session text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare t public.rejfile_transfers; v_user uuid; allowed boolean:=false; sender text;
begin
  select * into t from public.rejfile_transfers where id=p_id and status='ready' and expires_at>now();
  if not found then raise exception 'Plik jest niedostępny lub wygasł'; end if;
  if p_share is not null and t.share_hash is not null and t.share_hash=encode(extensions.digest(p_share,'sha256'),'hex') then allowed:=true; end if;
  if p_owner is not null and t.owner_hash=encode(extensions.digest(p_owner,'sha256'),'hex') then allowed:=true; end if;
  if not allowed and p_session is not null and p_session<>'' then
    select user_id into v_user from public.community_session_user(p_session);
    allowed:=v_user=t.recipient_id or v_user=t.sender_id;
  end if;
  if not coalesce(allowed,false) then raise exception 'Plik jest niedostępny lub wygasł'; end if;
  select username into sender from public.community_users where id=t.sender_id;
  return jsonb_build_object('id',t.id,'name',t.filename,'size',t.bytes,'chunks',t.chunks,
    'revision',coalesce(t.revision,0),'expires_at',t.expires_at,'sender',sender);
end $function$;

-- Start edycji: właściciel (sekret z tej przeglądarki) albo autor zalogowany
-- na swoje konto. Zwraca numer nowej rewizji i liczbę części do przesłania.
create or replace function public.rejfile_edit_begin(p_id uuid, p_owner text, p_bytes bigint, p_name text, p_session text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare t public.rejfile_transfers; u uuid; allowed boolean:=false; v_chunks integer; v_reserved bigint; delta bigint; v_rev integer;
begin
  if p_bytes is null or p_bytes<1 or p_bytes>104857600 then raise exception 'Plik musi mieć od 1 bajtu do 100 MiB'; end if;
  if p_name is not null and (length(p_name)<1 or length(p_name)>200 or p_name ~ '[[:cntrl:]/\\]') then raise exception 'Nieprawidłowa nazwa pliku'; end if;
  select * into t from public.rejfile_transfers where id=p_id for update;
  if not found or t.status<>'ready' or t.expires_at<=now() then raise exception 'Plik jest niedostępny lub wygasł'; end if;
  if p_owner is not null and t.owner_hash=encode(extensions.digest(p_owner,'sha256'),'hex') then allowed:=true; end if;
  if not allowed and p_session is not null and p_session<>'' then
    select user_id into u from public.community_session_user(p_session);
    allowed:=u=t.sender_id;
  end if;
  if not coalesce(allowed,false) then raise exception 'Brak uprawnień'; end if;
  v_chunks:=ceil(p_bytes::numeric/10485760)::integer;
  delta:=v_chunks*10485760::bigint - t.chunks*10485760::bigint;
  perform pg_advisory_xact_lock(hashtext('rejfile_create'));
  select coalesce(sum(chunks*10485760::bigint),0) into v_reserved from public.rejfile_transfers;
  if v_reserved+delta>419430400 then raise exception 'Wspólne miejsce jest obecnie pełne'; end if;
  if (select coalesce(sum(chunks*10485760::bigint),0) from public.rejfile_transfers where ip_hash=t.ip_hash)+delta>209715200 then raise exception 'Limit miejsca dla tej sieci został osiągnięty'; end if;
  v_rev:=greatest(coalesce(t.revision,0),coalesce(t.pending_revision,0))+1;
  update public.rejfile_transfers
    set pending_revision=v_rev, pending_bytes=p_bytes, pending_chunks=v_chunks,
        pending_filename=coalesce(p_name,filename)
    where id=t.id;
  return jsonb_build_object('id',t.id,'chunks',v_chunks,'revision',v_rev,'name',coalesce(p_name,t.filename));
end $function$;

-- Potwierdzenie: sprawdza nową rewizję i dopiero wtedy podmienia treść pod linkiem.
create or replace function public.rejfile_finish(p_id uuid, p_owner text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare t public.rejfile_transfers; n integer; sz bigint; v_rev integer; v_bytes bigint; v_chunks integer; v_name text;
  v_prev integer; v_prev_chunks integer;
begin
  select * into t from public.rejfile_transfers
    where id=p_id and owner_hash=encode(extensions.digest(coalesce(p_owner,''),'sha256'),'hex')
    for update;
  if not found then raise exception 'Przesyłanie wygasło'; end if;
  if t.status='ready' and t.pending_revision is not null then
    if t.expires_at<=now() then raise exception 'Plik jest niedostępny lub wygasł'; end if;
    v_rev:=t.pending_revision; v_bytes:=t.pending_bytes; v_chunks:=t.pending_chunks;
    v_name:=coalesce(t.pending_filename,t.filename);
    v_prev:=coalesce(t.revision,0); v_prev_chunks:=t.chunks;
  else
    if t.status<>'uploading' or t.cleanup_after<=now() then raise exception 'Przesyłanie wygasło'; end if;
    v_rev:=coalesce(t.revision,0); v_bytes:=t.bytes; v_chunks:=t.chunks; v_name:=t.filename;
    v_prev:=null; v_prev_chunks:=null;
  end if;
  for n in 0..(v_chunks-1) loop
    select (metadata->>'size')::bigint into sz from storage.objects
      where bucket_id='rejfile' and name=public.rejfile_part_path(t.id,v_rev,n);
    if sz is distinct from least(10485760::bigint, v_bytes-n*10485760::bigint) then
      raise exception 'Nie wszystkie części zostały poprawnie przesłane';
    end if;
  end loop;
  update public.rejfile_transfers
    set status='ready', filename=v_name, revision=v_rev, bytes=v_bytes, chunks=v_chunks,
        pending_revision=null, pending_bytes=null, pending_chunks=null, pending_filename=null,
        expires_at=now()+interval '3 days', cleanup_after=now()+interval '3 days'
    where id=t.id returning * into t;
  return jsonb_build_object('id',t.id,'expires_at',t.expires_at,'revision',t.revision,
    'previous_revision',v_prev,'previous_chunks',v_prev_chunks);
end $function$;

grant execute on function public.rejfile_access(uuid, text, text, text) to anon, authenticated, service_role;
grant execute on function public.rejfile_edit_begin(uuid, text, bigint, text, text) to service_role;
grant execute on function public.rejfile_finish(uuid, text) to service_role;

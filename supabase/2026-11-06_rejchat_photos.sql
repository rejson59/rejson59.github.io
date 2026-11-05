-- Zdjęcia czatu: dane poza publicznym storage, atomowa wysyłka z wiadomością.
-- Obrazy wygasają po 14 dniach, nawet w DM. Metadane pozostają jako informacja o wygaśnięciu.
create table public.rejchat_photos (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.community_users(id) on delete cascade,
 public_message_id uuid unique references public.community_chat(id) on delete cascade,
 private_message_id uuid unique references public.rejchat_dm_messages(id) on delete cascade,
 mime text not null check (mime in ('image/jpeg','image/png','image/webp','image/gif')),
 data bytea, bytes_size integer not null check (bytes_size between 12 and 1048576), created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '14 days'),
 check ((public_message_id is null) <> (private_message_id is null))
);
create table public.rejchat_photo_usage (
 user_id uuid primary key references public.community_users(id) on delete cascade,
 period_start timestamptz not null, file_count integer not null, byte_count bigint not null
);
alter table public.rejchat_photos enable row level security;
alter table public.rejchat_photo_usage enable row level security;
revoke all on public.rejchat_photos,public.rejchat_photo_usage from public,anon,authenticated;

create or replace function public.rejchat_public_enrich(p_rows jsonb) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.obj || jsonb_build_object('edited_at',m.edited_at,'reply',case when p.id is null then null else jsonb_build_object('id',p.id,'author_name',p.author_name,'content',left(p.content,140)) end,'photo',case when f.id is null then null else jsonb_build_object('id',f.id,'expires_at',f.expires_at) end) order by x.n),'[]'::jsonb)
 from jsonb_array_elements(p_rows) with ordinality x(obj,n)
 join public.community_chat m on m.id=(x.obj->>'id')::uuid
 left join public.community_chat p on p.id=m.reply_to and p.room=m.room
 left join public.rejchat_photos f on f.public_message_id=m.id
$$;
create or replace function public.rejchat_private_enrich(p_rows jsonb,p_thread_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.obj || jsonb_build_object('edited_at',m.edited_at,'reply',case when p.id is null then null else jsonb_build_object('id',p.id,'author_name',u.username,'content',left(p.content,140)) end,'photo',case when f.id is null then null else jsonb_build_object('id',f.id,'expires_at',f.expires_at) end) order by x.n),'[]'::jsonb)
 from jsonb_array_elements(p_rows) with ordinality x(obj,n)
 join public.rejchat_dm_messages m on m.id=(x.obj->>'id')::uuid and m.thread_id=p_thread_id
 left join public.rejchat_dm_messages p on p.id=m.reply_to and p.thread_id=m.thread_id
 left join public.community_users u on u.id=p.author_id
 left join public.rejchat_photos f on f.private_message_id=m.id
$$;

-- Osobna funkcja tak aby publikacja zdjęcia i wiadomości miały tę samą transakcję.
create function public.rejchat_send_photo(p_token text,p_scope text,p_room text,p_thread_id uuid,p_content text,p_reply_to uuid,p_mime text,p_data_base64 text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; bytes bytea; sz integer; text_content text:=btrim(coalesce(p_content,'')); result jsonb; used record;
begin
 select * into me from public.community_session_user(p_token);
 if p_scope not in ('public','private') or p_scope is null then raise exception 'Nieznany rodzaj rozmowy.'; end if;
 if p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp','image/gif') then raise exception 'Dozwolone są zdjęcia JPG, PNG, WebP i GIF.'; end if;
 if p_data_base64 is null or length(p_data_base64)>1398104 or length(p_data_base64)<16 then raise exception 'Zdjęcie jest puste lub za duże (maks. 1 MiB).';end if;
 begin bytes:=decode(p_data_base64,'base64'); exception when others then raise exception 'Nie udało się odczytać zdjęcia.'; end;
 sz:=octet_length(bytes);
 if sz<12 or sz>1048576 then raise exception 'Zdjęcie jest puste lub za duże (maks. 1 MiB).'; end if;
 if not ((p_mime='image/jpeg' and substring(bytes from 1 for 3)=decode('ffd8ff','hex'))
  or (p_mime='image/png' and substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex'))
  or (p_mime='image/gif' and substring(bytes from 1 for 6) in (decode('474946383761','hex'),decode('474946383961','hex')))
  or (p_mime='image/webp' and substring(bytes from 1 for 4)=decode('52494646','hex') and substring(bytes from 9 for 4)=decode('57454250','hex'))) then raise exception 'Format zdjęcia nie odpowiada plikowi.';end if;
 if text_content='' then text_content:='📷 Zdjęcie'; end if;
 -- Blokada globalna zabezpiecza limit przed równoczesnymi żądaniami różnych kont.
 perform pg_advisory_xact_lock(hashtextextended('rejchat-photo-global',0));
 select * into used from public.rejchat_photo_usage where user_id=me.user_id;
 if used.user_id is not null and used.period_start>clock_timestamp()-interval '24 hours' and (used.file_count>=12 or used.byte_count+sz>8388608) then raise exception 'Dzienny limit zdjęć wyczerpany (12 zdjęć / 8 MiB).';end if;
 if coalesce((select sum(bytes_size) from public.rejchat_photos where data is not null),0)+sz>67108864 then raise exception 'Magazyn zdjęć jest chwilowo pełny.';end if;
 if p_scope='public' then
  if p_room is null or p_room not in ('general','links') then raise exception 'Nieznany pokój.';end if;
  if p_reply_to is not null and not exists(select 1 from public.community_chat where id=p_reply_to and room=p_room) then raise exception 'Wiadomość, na którą odpowiadasz, jest niedostępna.';end if;
  -- Zdjęcie samo w sobie jest dozwolone w Linkach; tekst przechodzi zwykłe triggery.
  result:=public.community_chat_send(p_token,text_content);
  update public.community_chat set room=p_room,reply_to=p_reply_to where id=(result->>'id')::uuid;
  insert into public.rejchat_photos(owner_id,public_message_id,mime,data,bytes_size) values(me.user_id,(result->>'id')::uuid,p_mime,bytes,sz);
 else
  result:=public.rejchat_dm_send_v2(p_token,p_thread_id,text_content,p_reply_to);
  insert into public.rejchat_photos(owner_id,private_message_id,mime,data,bytes_size) values(me.user_id,(result->>'id')::uuid,p_mime,bytes,sz);
 end if;
 insert into public.rejchat_photo_usage(user_id,period_start,file_count,byte_count) values(me.user_id,clock_timestamp(),1,sz)
 on conflict(user_id) do update set
 period_start=case when rejchat_photo_usage.period_start<=clock_timestamp()-interval '24 hours' then clock_timestamp() else rejchat_photo_usage.period_start end,
 file_count=case when rejchat_photo_usage.period_start<=clock_timestamp()-interval '24 hours' then 1 else rejchat_photo_usage.file_count+1 end,
 byte_count=case when rejchat_photo_usage.period_start<=clock_timestamp()-interval '24 hours' then sz else rejchat_photo_usage.byte_count+sz end;
 return result;
end $$;
create function public.rejchat_get_photo(p_id uuid,p_token text default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare f record; me record;
begin
 select * into f from public.rejchat_photos where id=p_id and data is not null and expires_at>clock_timestamp();
 if f.id is null then raise exception 'Zdjęcie jest niedostępne lub wygasło.';end if;
 if f.private_message_id is not null then
  select * into me from public.community_session_user(p_token);
  if not exists(select 1 from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id where m.id=f.private_message_id and (t.user_low=me.user_id or t.user_high=me.user_id)) then raise exception 'Zdjęcie jest niedostępne lub wygasło.';end if;
 end if;
 return jsonb_build_object('mime',f.mime,'data',encode(f.data,'base64'));
end $$;
-- Edycja zdjęć w Linkach nie wymaga dodania adresu; pozostałe wiadomości nadal wymagają linku.
create or replace function public.rejchat_message_edit(p_token text,p_scope text,p_id uuid,p_content text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; v_content text:=btrim(coalesce(p_content,'')); m record; maxlen integer;
begin
 select * into me from public.community_session_user(p_token);
 if p_scope='public' then select author_id,room,edited_at into m from public.community_chat where id=p_id for update; maxlen:=2000;
 elsif p_scope='private' then select d.author_id,null::text as room,d.edited_at into m from public.rejchat_dm_messages d join public.rejchat_dm_threads t on t.id=d.thread_id where d.id=p_id and (t.user_low=me.user_id or t.user_high=me.user_id) for update of d; maxlen:=1000;
 else raise exception 'Nieznany rodzaj rozmowy.';end if;
 if m.author_id is null or m.author_id<>me.user_id then raise exception 'Nie możesz edytować tej wiadomości.';end if;
 if char_length(v_content)<1 or char_length(v_content)>maxlen then raise exception 'Wiadomość musi mieć od 1 do % znaków.',maxlen;end if;
 if m.room='links' and v_content !~* '(https?://|www[.])[^[:space:]<>]+' and not exists(select 1 from public.rejchat_photos where public_message_id=p_id) then raise exception 'Wiadomość w kanale Linki musi zawierać link.';end if;
 if m.edited_at is not null and m.edited_at>clock_timestamp()-interval '5 seconds' then raise exception 'Odczekaj 5 sekund przed kolejną edycją.';end if;
 if p_scope='public' then update public.community_chat set content=v_content,edited_at=clock_timestamp() where id=p_id;else update public.rejchat_dm_messages set content=v_content,edited_at=clock_timestamp() where id=p_id;end if;
 return true;
end $$;
revoke all on function public.rejchat_send_photo(text,text,text,uuid,text,uuid,text,text),public.rejchat_get_photo(uuid,text) from public,anon,authenticated;
grant execute on function public.rejchat_send_photo(text,text,text,uuid,text,uuid,text,text),public.rejchat_get_photo(uuid,text) to anon,authenticated;
select cron.schedule('rejchat-photo-expiry','17 * * * *',$cron$update public.rejchat_photos set data=null where data is not null and expires_at<=clock_timestamp(); delete from public.rejchat_photo_usage where period_start<clock_timestamp()-interval '25 hours';$cron$);

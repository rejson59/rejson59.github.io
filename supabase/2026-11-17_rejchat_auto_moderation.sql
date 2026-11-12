-- Automatyczna moderacja RejChatu: zdjęcia i treść.
--
-- Wcześniej zdjęcie przechodziło po samym nagłówku pliku, więc do bazy trafiały
-- urwane pliki (klient przerwał wysyłanie) i identyczne duplikaty. Treść
-- sprawdzał wyłącznie trigger przy zapisie — wpis, który przeszedł, zostawał
-- w czacie nawet po dodaniu nowej frazy do filtra.
--
-- Ta migracja dodaje:
--  1. sprawdzanie kompletności obrazu (JPEG/PNG/GIF/WebP) i jego wymiarów,
--  2. limity wymiarów i proporcji, blokadę duplikatów i serii zdjęć,
--  3. status zdjęcia — zablokowane nie jest pobierane ani pokazywane,
--  4. cykliczną moderację treści z zapisem działań i automatycznym wyciszeniem,
--  5. podgląd zdjęć i działań automatu w panelu administratora.

-- ---------------------------------------------------------------------------
-- 1. Metadane zdjęcia: wymiary, kompletność, odcisk pliku i status
-- ---------------------------------------------------------------------------
alter table public.rejchat_photos add column if not exists sha256 text;
alter table public.rejchat_photos add column if not exists width integer;
alter table public.rejchat_photos add column if not exists height integer;
alter table public.rejchat_photos add column if not exists status text not null default 'ok';
alter table public.rejchat_photos add column if not exists blocked_reason text;
alter table public.rejchat_photos add column if not exists checked_at timestamptz;
alter table public.rejchat_photos drop constraint if exists rejchat_photos_status_check;
alter table public.rejchat_photos add constraint rejchat_photos_status_check check (status in ('ok','blocked'));
create index if not exists rejchat_photos_status_idx on public.rejchat_photos(status,created_at desc);
create index if not exists rejchat_photos_hash_idx on public.rejchat_photos(owner_id,sha256);

create or replace function public.rejchat_image_meta(p_data bytea, p_mime text)
returns jsonb
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare n integer:=octet_length(p_data); w integer; h integer; complete boolean:=false;
        pos integer; marker integer; seg integer; i integer; found boolean:=false;
begin
 if p_data is null or n<12 then return jsonb_build_object('complete',false,'width',null,'height',null);end if;

 if p_mime='image/png' then
  -- Wymiary z IHDR (big endian) i obowiązkowy blok IEND na końcu.
  w:=get_byte(p_data,16)*16777216+get_byte(p_data,17)*65536+get_byte(p_data,18)*256+get_byte(p_data,19);
  h:=get_byte(p_data,20)*16777216+get_byte(p_data,21)*65536+get_byte(p_data,22)*256+get_byte(p_data,23);
  complete:=position('IEND' in substring(p_data from greatest(1,n-32)))>0;

 elsif p_mime='image/gif' then
  w:=get_byte(p_data,6)+get_byte(p_data,7)*256;
  h:=get_byte(p_data,8)+get_byte(p_data,9)*256;
  complete:=get_byte(p_data,n-1)=59; -- 0x3B — zakończenie strumienia GIF

 elsif p_mime='image/webp' then
  -- RIFF podaje rozmiar całego pliku; VP8X i VP8 mają wymiary w nagłówku.
  complete:=(get_byte(p_data,4)+get_byte(p_data,5)*256+get_byte(p_data,6)*65536+get_byte(p_data,7)*16777216)+8<=n+1;
  if substring(p_data from 13 for 4)=convert_to('VP8X','UTF8') and n>30 then
   w:=1+get_byte(p_data,24)+get_byte(p_data,25)*256+get_byte(p_data,26)*65536;
   h:=1+get_byte(p_data,27)+get_byte(p_data,28)*256+get_byte(p_data,29)*65536;
  elsif substring(p_data from 13 for 4)=convert_to('VP8 ','UTF8') and n>30 then
   w:=(get_byte(p_data,26)+get_byte(p_data,27)*256) & 16383;
   h:=(get_byte(p_data,28)+get_byte(p_data,29)*256) & 16383;
  elsif substring(p_data from 13 for 4)=convert_to('VP8L','UTF8') and n>25 then
   w:=1+(((get_byte(p_data,22) & 63) << 8) | get_byte(p_data,21));
   h:=1+(((get_byte(p_data,24) & 15) << 10) | (get_byte(p_data,23) << 2) | ((get_byte(p_data,22) & 192) >> 6));
  end if;

 elsif p_mime='image/jpeg' then
  -- Znaczniki końca strumienia i pierwszy segment SOF z wymiarami.
  complete:=get_byte(p_data,n-2)=255 and get_byte(p_data,n-1)=217;
  pos:=2;
  while pos<n-9 and not found loop
   if get_byte(p_data,pos)<>255 then pos:=pos+1; continue;end if;
   i:=pos+1;
   while i<n and get_byte(p_data,i)=255 loop i:=i+1;end loop;
   if i>=n then exit;end if;
   marker:=get_byte(p_data,i);
   if marker in (216,217) or marker=1 or (marker>=208 and marker<=215) then pos:=i+1; continue;end if;
   if i+2>=n then exit;end if;
   seg:=get_byte(p_data,i+1)*256+get_byte(p_data,i+2);
   -- SOF0-SOF15 bez DHT(C4), JPG(C8) i DAC(CC).
   if marker between 192 and 207 and marker not in (196,200,204) then
    h:=get_byte(p_data,i+4)*256+get_byte(p_data,i+5);
    w:=get_byte(p_data,i+6)*256+get_byte(p_data,i+7);
    found:=true;
   else
    pos:=i+1+seg;
   end if;
  end loop;
 end if;

 return jsonb_build_object('complete',complete,'width',nullif(w,0),'height',nullif(h,0));
end $$;

revoke all on function public.rejchat_image_meta(bytea,text) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2. Wysyłka zdjęcia: kompletność, wymiary, duplikat i seria
-- ---------------------------------------------------------------------------
create or replace function public.rejchat_send_photo(p_token text,p_scope text,p_room text,p_thread_id uuid,p_content text,p_reply_to uuid,p_mime text,p_data_base64 text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; bytes bytea; sz integer; text_content text:=btrim(coalesce(p_content,'')); result jsonb; used record;
        meta jsonb; v_hash text; v_width integer; v_height integer; recent integer;
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
 -- Urwany plik (np. przerwane wysyłanie) nie trafia do czatu.
 meta:=public.rejchat_image_meta(bytes,p_mime);
 if not coalesce((meta->>'complete')::boolean,false) then raise exception 'Zdjęcie jest niekompletne — wyślij je ponownie.';end if;
 v_width:=nullif(meta->>'width','')::integer;
 v_height:=nullif(meta->>'height','')::integer;
 if coalesce(v_width,0)<16 or coalesce(v_height,0)<16 then raise exception 'Zdjęcie jest za małe.';end if;
 if v_width>6000 or v_height>6000 then raise exception 'Zdjęcie jest za duże (maks. 6000 px na bok).';end if;
 if greatest(v_width,v_height)::numeric/least(v_width,v_height)>4 then raise exception 'Takie proporcje nie wyglądają na zdjęcie — zmień kadr.';end if;
 v_hash:=encode(extensions.digest(bytes,'sha256'),'hex');
 if exists(select 1 from public.rejchat_photos where owner_id=me.user_id and sha256=v_hash and status='ok') then
  raise exception 'To zdjęcie już wysłałeś — nie wysyłaj go drugi raz.';
 end if;
 -- Seria: maksymalnie 3 zdjęcia na minutę.
 select count(*) into recent from public.rejchat_photos where owner_id=me.user_id and created_at>clock_timestamp()-interval '60 seconds';
 if recent>=3 then raise exception 'Za dużo zdjęć naraz — odczekaj minutę.';end if;
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
  insert into public.rejchat_photos(owner_id,public_message_id,mime,data,bytes_size,sha256,width,height,checked_at)
   values(me.user_id,(result->>'id')::uuid,p_mime,bytes,sz,v_hash,v_width,v_height,clock_timestamp());
 else
  result:=public.rejchat_dm_send_v2(p_token,p_thread_id,text_content,p_reply_to);
  insert into public.rejchat_photos(owner_id,private_message_id,mime,data,bytes_size,sha256,width,height,checked_at)
   values(me.user_id,(result->>'id')::uuid,p_mime,bytes,sz,v_hash,v_width,v_height,clock_timestamp());
 end if;
 insert into public.rejchat_photo_usage(user_id,period_start,file_count,byte_count) values(me.user_id,clock_timestamp(),1,sz)
 on conflict(user_id) do update set
 period_start=case when rejchat_photo_usage.period_start<=clock_timestamp()-interval '24 hours' then clock_timestamp() else rejchat_photo_usage.period_start end,
 file_count=case when rejchat_photo_usage.period_start<=clock_timestamp()-interval '24 hours' then 1 else rejchat_photo_usage.file_count+1 end,
 byte_count=case when rejchat_photo_usage.period_start<=clock_timestamp()-interval '24 hours' then sz else rejchat_photo_usage.byte_count+sz end;
 return result;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Zablokowane zdjęcie nie wychodzi z serwera i nie jest pokazywane w czacie
-- ---------------------------------------------------------------------------
create or replace function public.rejchat_get_photo(p_id uuid,p_token text default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare f record; me record;
begin
 select * into f from public.rejchat_photos where id=p_id and data is not null and status='ok' and expires_at>clock_timestamp();
 if f.id is null then raise exception 'Zdjęcie jest niedostępne lub wygasło.';end if;
 if f.private_message_id is not null then
  select * into me from public.community_session_user(p_token);
  if not exists(select 1 from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id where m.id=f.private_message_id and (t.user_low=me.user_id or t.user_high=me.user_id)) then raise exception 'Zdjęcie jest niedostępne lub wygasło.';end if;
 end if;
 return jsonb_build_object('mime',f.mime,'data',encode(f.data,'base64'));
end $$;

create or replace function public.rejchat_public_enrich(p_rows jsonb) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.obj || jsonb_build_object('edited_at',m.edited_at,'reply',case when p.id is null then null else jsonb_build_object('id',p.id,'author_name',p.author_name,'content',left(p.content,140)) end,'photo',case when f.id is null then null else jsonb_build_object('id',f.id,'expires_at',f.expires_at) end) order by x.n),'[]'::jsonb)
 from jsonb_array_elements(p_rows) with ordinality x(obj,n)
 join public.community_chat m on m.id=(x.obj->>'id')::uuid
 left join public.community_chat p on p.id=m.reply_to and p.room=m.room
 left join public.rejchat_photos f on f.public_message_id=m.id and f.status='ok'
$$;

create or replace function public.rejchat_private_enrich(p_rows jsonb,p_thread_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.obj || jsonb_build_object('edited_at',m.edited_at,'reply',case when p.id is null then null else jsonb_build_object('id',p.id,'author_name',u.username,'content',left(p.content,140)) end,'photo',case when f.id is null then null else jsonb_build_object('id',f.id,'expires_at',f.expires_at) end) order by x.n),'[]'::jsonb)
 from jsonb_array_elements(p_rows) with ordinality x(obj,n)
 join public.rejchat_dm_messages m on m.id=(x.obj->>'id')::uuid and m.thread_id=p_thread_id
 left join public.rejchat_dm_messages p on p.id=m.reply_to and p.thread_id=m.thread_id
 left join public.community_users u on u.id=p.author_id
 left join public.rejchat_photos f on f.private_message_id=m.id and f.status='ok'
$$;

-- ---------------------------------------------------------------------------
-- 4. Dziennik automatycznych działań i cykliczna moderacja
-- ---------------------------------------------------------------------------
create table if not exists public.rejchat_auto_log (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('tekst','zdjęcie','blokada')),
 author_id uuid,
 author_name text,
 target_kind text,
 target_id uuid,
 reason text not null,
 excerpt text,
 retro boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists rejchat_auto_log_created_idx on public.rejchat_auto_log(created_at desc);
alter table public.rejchat_auto_log enable row level security;
revoke all on public.rejchat_auto_log from public,anon,authenticated;

-- Sprawdza nowe wpisy i zdjęcia. Tryb retro (p_retro=true) porządkuje starsze
-- treści po zmianie reguł i nie nalicza za to automatycznych wyciszeń.
create or replace function public.rejchat_auto_moderate(p_retro boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare m record; p record; d record; removed_text integer:=0; blocked_photos integer:=0; muted integer:=0; duplicates integer:=0;
begin
 for m in select id,author_id,author_name,content from public.community_chat
          where created_at>now()-interval '12 hours' and char_length(content)<4000 order by created_at loop
  if public.rejchat_text_blocked(m.content) then
   delete from public.community_chat where id=m.id;
   insert into public.rejchat_auto_log(kind,author_id,author_name,target_kind,target_id,reason,excerpt,retro)
    values('tekst',m.author_id,m.author_name,'community_chat',m.id,'treść niezgodna z filtrem',left(m.content,120),p_retro);
   removed_text:=removed_text+1;
  end if;
 end loop;
 for p in select id,owner_id,mime,data,sha256 from public.rejchat_photos
          where status='ok' and data is not null and checked_at is null loop
  if not coalesce((public.rejchat_image_meta(p.data,p.mime)->>'complete')::boolean,false) then
   update public.rejchat_photos set status='blocked',blocked_reason='uszkodzony lub urwany plik',checked_at=clock_timestamp() where id=p.id;
   insert into public.rejchat_auto_log(kind,author_id,target_kind,target_id,reason,retro)
    values('zdjęcie',p.owner_id,'rejchat_photos',p.id,'uszkodzony plik',p_retro);
   blocked_photos:=blocked_photos+1;
  else
   update public.rejchat_photos set checked_at=clock_timestamp(),
     sha256=coalesce(p.sha256,encode(extensions.digest(p.data,'sha256'),'hex')),
     width=coalesce(width,(public.rejchat_image_meta(p.data,p.mime)->>'width')::integer),
     height=coalesce(height,(public.rejchat_image_meta(p.data,p.mime)->>'height')::integer)
    where id=p.id;
  end if;
 end loop;
 -- Ten sam plik drugi raz to duplikat — zostaje pierwsze wysłanie.
 for d in select id,owner_id from (
   select id,owner_id,sha256,row_number() over(partition by owner_id,sha256 order by created_at) rn
   from public.rejchat_photos where status='ok' and sha256 is not null) q where rn>1 loop
  update public.rejchat_photos set status='blocked',blocked_reason='duplikat tego samego zdjęcia' where id=d.id;
  insert into public.rejchat_auto_log(kind,author_id,target_kind,target_id,reason,retro)
   values('zdjęcie',d.owner_id,'rejchat_photos',d.id,'duplikat tego samego zdjęcia',p_retro);
  duplicates:=duplicates+1;
 end loop;
 if not p_retro then
  -- Trzy automatyczne usunięcia w godzinie to automatyczne wyciszenie na godzinę.
  for m in select author_id,count(*) n from public.rejchat_auto_log
           where kind='tekst' and not retro and created_at>now()-interval '60 minutes' and author_id is not null
           group by author_id having count(*)>=3 loop
   if not exists(select 1 from public.rejchat_write_blocks b where b.user_id=m.author_id and (b.until_at is null or b.until_at>now())) then
    insert into public.rejchat_write_blocks(user_id,until_at,created_at) values(m.author_id,now()+interval '60 minutes',now())
    on conflict(user_id) do update set until_at=now()+interval '60 minutes',created_at=now();
    insert into public.rejchat_auto_log(kind,author_id,target_kind,reason)
     select 'blokada',m.author_id,'rejchat_write_blocks','automatyczne wyciszenie po 3 usunięciach'
     from public.community_users u where u.id=m.author_id;
    muted:=muted+1;
   end if;
  end loop;
 end if;
 return jsonb_build_object('tekst',removed_text,'zdjęcia',blocked_photos,'duplikaty',duplicates,'blokady',muted);
end $$;
revoke all on function public.rejchat_auto_moderate(boolean) from public,anon,authenticated;

select cron.unschedule(jobid) from cron.job where jobname='rejchat-auto-moderate';
select cron.schedule('rejchat-auto-moderate','*/5 * * * *',$cron$select public.rejchat_auto_moderate(false);$cron$);

-- ---------------------------------------------------------------------------
-- 5. Panel: zdjęcia i działania automatu
-- ---------------------------------------------------------------------------
create or replace function public.admin_rejchat_overview() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare phrases jsonb; blocks jsonb; messages jsonb; actions jsonb; photos jsonb;
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.phrase),'[]'::jsonb) into phrases from (select id,phrase,created_at,match_mode from public.rejchat_blocked_phrases order by phrase) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into blocks from (
  select u.username,b.until_at,b.created_at from public.rejchat_write_blocks b join public.community_users u on u.id=b.user_id where b.until_at is null or b.until_at>now() order by b.created_at desc limit 200
 ) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into messages from (
  select id,author_name,content,created_at from public.community_chat order by created_at desc,id desc limit 100
 ) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into actions from (
  select id,kind,author_name,reason,excerpt,created_at from public.rejchat_auto_log order by created_at desc limit 60
 ) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into photos from (
  select p.id,u.username,p.mime,p.bytes_size,p.width,p.height,p.status,p.blocked_reason,p.created_at
  from public.rejchat_photos p left join public.community_users u on u.id=p.owner_id
  order by p.created_at desc limit 60
 ) q;
 return jsonb_build_object('phrases',phrases,'blocks',blocks,'messages',messages,'actions',actions,'photos',photos);
end $$;

-- Administrator może ukryć albo przywrócić zdjęcie po obejrzeniu.
create or replace function public.admin_rejchat_photo_action(p_id uuid,p_action text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 if p_action='block' then
  update public.rejchat_photos set status='blocked',blocked_reason='decyzja administratora' where id=p_id;
 elsif p_action='restore' then
  update public.rejchat_photos set status='ok',blocked_reason=null where id=p_id;
 else
  raise exception 'Nieznana akcja.';
 end if;
 return true;
end $$;
revoke all on function public.admin_rejchat_photo_action(uuid,text) from public,anon;
grant execute on function public.admin_rejchat_photo_action(uuid,text) to anon,authenticated;

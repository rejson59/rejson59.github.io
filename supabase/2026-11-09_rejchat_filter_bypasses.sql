-- Obejścia zauważone w publicznej rozmowie: maskowanie, inne alfabety, skróty
-- i dzielenie słowa na wiadomości. Nie zmieniamy wpisów z listy administratora.
insert into public.rejchat_blocked_phrases(phrase,match_mode) values
 ('qrw','prefix'),('jebl','prefix'),('cipsk','prefix'),('шлюх','prefix'),('shlyukh','prefix'),('shlyuh','prefix'),
 ('jatɔmuso','word'),('売春婦','substring'),('antisemitism is my goal','word'),('popieram antysemityzm','word')
on conflict (lower(phrase)) do nothing;

create or replace function public.rejchat_filter_normalize(p_text text) returns text
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare s text; part text; acc text:=''; result text:='';
begin
 s:=lower(normalize(coalesce(p_text,''),NFKD));
 s:=translate(s, 'łđðþæœß', 'lddtaos');
 s:=translate(s, 'аесорхукіјѕԁοαεορυχκν', 'aecopxykijsdoaeopuxkv');
 -- Pozostałe litery cyrylicy i otwarte o użyte w próbach obejścia.
 s:=translate(s, 'шлюɔ', 'sluo');
 s:=translate(s, '013457@$!', 'oieastasi');
 s:=regexp_replace(s, '[̀-ͯ]', '', 'g');
 s:=translate(s,chr(173)||chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279)||chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297),'');
 s:=regexp_replace(s,'[^a-z0-9]+',' ','g');
 foreach part in array regexp_split_to_array(btrim(s),' +') loop
  if length(part)=1 then acc:=acc||part;
  else if acc<>'' then result:=result||' '||acc;acc:='';end if; if part<>'' then result:=result||' '||part;end if; end if;
 end loop;
 if acc<>'' then result:=result||' '||acc;end if;
 return btrim(result);
end $$;

create or replace function public.rejchat_text_blocked(p_text text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare normalized text:=public.rejchat_filter_normalize(p_text); compressed text; f record; term text; padded text; padded_compressed text; words text[]; compressed_words text[]; mask_text text; unicode_compact text;
begin
 -- Maskowane formy kontrolujemy osobno; znaki # i * nie są usuwane przed sprawdzeniem.
 mask_text:=lower(normalize(coalesce(p_text,''),NFKC));
 mask_text:=translate(mask_text,chr(173)||chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279)||chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297),'');
 unicode_compact:=regexp_replace(mask_text,'[[:space:][:punct:]]','','g');
 mask_text:=translate(mask_text, 'аесорхукіјѕԁοαεορυχκν', 'aecopxykijsdoaeopuxkv');
 mask_text:=translate(mask_text, '013457@$!', 'oieastasi');
 if mask_text ~ '(^|[^[:alnum:]_])k[#*]{2,4}(wa|a)([^[:alnum:]_]|$)' or
    mask_text ~ '(^|[^[:alnum:]_])q[#*]{2,4}(wa|a)([^[:alnum:]_]|$)' then return true;end if;
 -- Wskazany japoński wyraz, również z odstępami i interpunkcją między znakami.
 if position('売春婦' in unicode_compact)>0 and exists(select 1 from public.rejchat_blocked_phrases where lower(phrase)='売春婦') then return true;end if;
 -- Izolowana treść jednoznacznie seksualna; nie blokujemy zdań o edukacji i zdrowiu.
 if normalized in ('seks','sex') then return true;end if;
 -- Połączenie sygnałów, a nie pojedynczych zwykłych słów, ogranicza fałszywe alarmy.
 if normalized ~ '(^| )samotn[a-z]* (matk[a-z]*|mam[a-z]*)( |$)' and
    normalized ~ '(^| )(zdejm[a-z]*|sciag[a-z]*) (spodn[a-z]*|ubran[a-z]*)( |$)' then return true;end if;
 compressed:=regexp_replace(normalized,'([a-z])\1{2,}','\1','g');
 padded:=' '||normalized||' ';padded_compressed:=' '||compressed||' ';
 words:=regexp_split_to_array(normalized,' +');compressed_words:=regexp_split_to_array(compressed,' +');
 for f in select phrase,match_mode from public.rejchat_blocked_phrases loop
  if f.match_mode='substring' and position(lower(f.phrase) in lower(coalesce(p_text,'')))>0 then return true;end if;
  term:=public.rejchat_filter_normalize(f.phrase);if term='' then continue;end if;
  if f.match_mode='prefix' and position(' ' in term)=0 then
   if exists(select 1 from unnest(words||compressed_words) w where left(w,length(term))=term) then return true;end if;
  elsif position(' '||term||' ' in padded)>0 or position(' '||term||' ' in padded_compressed)>0 then return true;
  end if;
 end loop;
 return false;
end $$;
-- Ograniczony kontekst tylko własnych, sąsiadujących krótkich wiadomości;
-- brak dodatkowego zapisywania ich treści lub udostępniania DM.
create index community_chat_author_time_idx on public.community_chat(author_id,created_at desc,id desc);

create function public.rejchat_fragments_blocked(parts text[], pos integer) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare first_part integer; last_part integer; n integer:=coalesce(cardinality(parts),0); joined text; streak integer:=0; streak_start integer:=0;
begin
 if pos<1 or pos>n then return false;end if;
 for last_part in 1..n loop
  if char_length(parts[last_part])=1 then
   if streak=0 then streak_start:=last_part;end if;streak:=streak+1;
   if streak>=3 and pos between streak_start and last_part then return true;end if;
  else streak:=0;end if;
 end loop;
 for first_part in greatest(1,pos-4)..pos loop
  joined:='';
  for last_part in first_part..least(n,pos+4) loop
   joined:=joined||parts[last_part];
   if last_part>=pos and last_part>first_part and public.rejchat_text_blocked(joined) then return true;end if;
  end loop;
 end loop;
 return false;
end $$;

create function public.rejchat_enforce_fragments() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; fragments text[]:='{}'; pos integer:=0; n text; stamp timestamptz:=coalesce(new.created_at,clock_timestamp());
begin
 n:=public.rejchat_filter_normalize(new.content);
 -- Interesują nas tylko krótkie, jednolite fragmenty alfanumeryczne.
 if n='' or n !~ '^[a-z0-9]{1,6}$' then return new;end if;
 -- Osobne rozmowy nigdy nie dzielą kontekstu; blokada serializuje zmiany autora.
 perform pg_advisory_xact_lock(hashtextextended('rejchat-fragments:'||tg_table_name||':'||new.author_id::text,0));
 if tg_table_name='community_chat' then
  for item in
   with before_rows as (select m.id,m.created_at,m.content from public.community_chat m where m.author_id=new.author_id and m.room=new.room and m.id<>new.id and m.created_at>=stamp-interval '60 seconds' and (m.created_at,m.id)<(stamp,new.id) order by m.created_at desc,m.id desc limit 4),
   after_rows as (select m.id,m.created_at,m.content from public.community_chat m where m.author_id=new.author_id and m.room=new.room and m.id<>new.id and m.created_at<=stamp+interval '60 seconds' and (m.created_at,m.id)>(stamp,new.id) order by m.created_at,m.id limit 4)
   select * from (select *,false as selected from before_rows union all select new.id,stamp,new.content,true union all select *,false from after_rows) q order by created_at,id
  loop
   n:=public.rejchat_filter_normalize(item.content);
   if n='' or n !~ '^[a-z0-9]{1,6}$' then
    if pos>0 then exit;end if;fragments:='{}';
   else fragments:=array_append(fragments,n);if item.selected then pos:=cardinality(fragments);end if;end if;
  end loop;
 elsif tg_table_name='rejchat_dm_messages' then
  for item in
   with before_rows as (select m.id,m.created_at,m.content from public.rejchat_dm_messages m where m.author_id=new.author_id and m.thread_id=new.thread_id and m.id<>new.id and m.created_at>=stamp-interval '60 seconds' and (m.created_at,m.id)<(stamp,new.id) order by m.created_at desc,m.id desc limit 4),
   after_rows as (select m.id,m.created_at,m.content from public.rejchat_dm_messages m where m.author_id=new.author_id and m.thread_id=new.thread_id and m.id<>new.id and m.created_at<=stamp+interval '60 seconds' and (m.created_at,m.id)>(stamp,new.id) order by m.created_at,m.id limit 4)
   select * from (select *,false as selected from before_rows union all select new.id,stamp,new.content,true union all select *,false from after_rows) q order by created_at,id
  loop
   n:=public.rejchat_filter_normalize(item.content);
   if n='' or n !~ '^[a-z0-9]{1,6}$' then
    if pos>0 then exit;end if;fragments:='{}';
   else fragments:=array_append(fragments,n);if item.selected then pos:=cardinality(fragments);end if;end if;
  end loop;
 else return new;
 end if;
 if public.rejchat_fragments_blocked(fragments,pos) then
  raise exception 'Połącz krótkie fragmenty w jedną wiadomość i upewnij się, że nie zawiera niedozwolonych treści.';
 end if;
 return new;
end $$;
revoke all on function public.rejchat_fragments_blocked(text[],integer),public.rejchat_enforce_fragments() from public,anon,authenticated;
create trigger rejchat_fragments_chat before insert or update of content on public.community_chat for each row execute function public.rejchat_enforce_fragments();
create trigger rejchat_fragments_dm before insert or update of content on public.rejchat_dm_messages for each row execute function public.rejchat_enforce_fragments();

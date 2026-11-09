-- Przeskakuj krótkie wiadomości z samymi symbolami (maksymalnie dwie pod rząd).
-- Nadal badamy tylko autora, rozmowę, ograniczoną liczbę wiadomości i 60 sekund.
create or replace function public.rejchat_enforce_fragments() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; fragments text[]:='{}'; pos integer:=0; n text; separators integer:=0; stamp timestamptz:=coalesce(new.created_at,clock_timestamp());
begin
 n:=public.rejchat_short_fragment(new.content);
 -- Interesują nas tylko krótkie, jednolite fragmenty alfanumeryczne.
 if new.content !~ '[[:alnum:]]' or n='' or n !~ '^[[:alnum:]]{1,6}$' then return new;end if;
 -- Osobne rozmowy nigdy nie dzielą kontekstu; blokada serializuje zmiany autora.
 perform pg_advisory_xact_lock(hashtextextended('rejchat-fragments:'||tg_table_name||':'||new.author_id::text,0));
 if tg_table_name='community_chat' then
  for item in
   with before_rows as (select m.id,m.created_at,m.content from public.community_chat m where m.author_id=new.author_id and m.room=new.room and m.id<>new.id and m.created_at>=stamp-interval '60 seconds' and (m.created_at,m.id)<(stamp,new.id) order by m.created_at desc,m.id desc limit 10),
   after_rows as (select m.id,m.created_at,m.content from public.community_chat m where m.author_id=new.author_id and m.room=new.room and m.id<>new.id and m.created_at<=stamp+interval '60 seconds' and (m.created_at,m.id)>(stamp,new.id) order by m.created_at,m.id limit 10)
   select * from (select *,false as selected from before_rows union all select new.id,stamp,new.content,true union all select *,false from after_rows) q order by created_at,id
  loop
   n:=public.rejchat_short_fragment(item.content);
   if char_length(btrim(item.content)) between 1 and 12 and item.content !~ '[[:alnum:]]' then
    separators:=separators+1;
    if separators<=2 then continue;end if;
    n:='';
   end if;
   if n='' or n !~ '^[[:alnum:]]{1,6}$' then
    if pos>0 then exit;end if;fragments:='{}';separators:=0;
   else separators:=0;fragments:=array_append(fragments,n);if item.selected then pos:=cardinality(fragments);end if;end if;
  end loop;
 elsif tg_table_name='rejchat_dm_messages' then
  for item in
   with before_rows as (select m.id,m.created_at,m.content from public.rejchat_dm_messages m where m.author_id=new.author_id and m.thread_id=new.thread_id and m.id<>new.id and m.created_at>=stamp-interval '60 seconds' and (m.created_at,m.id)<(stamp,new.id) order by m.created_at desc,m.id desc limit 10),
   after_rows as (select m.id,m.created_at,m.content from public.rejchat_dm_messages m where m.author_id=new.author_id and m.thread_id=new.thread_id and m.id<>new.id and m.created_at<=stamp+interval '60 seconds' and (m.created_at,m.id)>(stamp,new.id) order by m.created_at,m.id limit 10)
   select * from (select *,false as selected from before_rows union all select new.id,stamp,new.content,true union all select *,false from after_rows) q order by created_at,id
  loop
   n:=public.rejchat_short_fragment(item.content);
   if char_length(btrim(item.content)) between 1 and 12 and item.content !~ '[[:alnum:]]' then
    separators:=separators+1;
    if separators<=2 then continue;end if;
    n:='';
   end if;
   if n='' or n !~ '^[[:alnum:]]{1,6}$' then
    if pos>0 then exit;end if;fragments:='{}';separators:=0;
   else separators:=0;fragments:=array_append(fragments,n);if item.selected then pos:=cardinality(fragments);end if;end if;
  end loop;
 else return new;
 end if;
 if public.rejchat_fragments_blocked(fragments,pos) then
  raise exception 'Wykryto serię krótkich fragmentów. Połącz je w jedną wiadomość i popraw treść, jeśli narusza zasady.';
 end if;
 return new;
end $$;

-- Podgląd używa tych samych zasad dopasowania pojedynczej frazy co filtr.
create function public.rejchat_phrase_matches(p_text text,p_phrase text,p_mode text) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare normalized text:=public.rejchat_filter_normalize(p_text); term text:=public.rejchat_filter_normalize(p_phrase); compressed text; repeat_words text[]; repeat_term text;
begin
 if p_mode not in ('substring','word','prefix') then return false;end if;
 if p_mode='substring' and coalesce(p_phrase,'')<>'' and position(lower(p_phrase) in lower(coalesce(p_text,'')))>0 then return true;end if;
 if term='' then return false;end if;
 compressed:=regexp_replace(normalized,'([a-z])\1{2,}','\1','g');
 -- Dłuższe, jednolite słowa: warianty z celowym podwajaniem liter.
 -- Tylko całe słowo lub początek słowa, nigdy dowolny fragment po kompresji.
 if term ~ '^[a-z]{4,}$' then
  repeat_term:=regexp_replace(term,'([a-z])\1+','\1','g');
  repeat_words:=regexp_split_to_array(regexp_replace(normalized,'([a-z])\1+','\1','g'),' +');
  if p_mode='prefix' then
   if exists(select 1 from unnest(repeat_words) w where left(w,length(repeat_term))=repeat_term) then return true;end if;
  elsif repeat_term=any(repeat_words) then return true;end if;
 end if;
 if p_mode='prefix' and position(' ' in term)=0 then
  return exists(select 1 from unnest(regexp_split_to_array(normalized,' +')||regexp_split_to_array(compressed,' +')) w where left(w,length(term))=term);
 end if;
 return position(' '||term||' ' in ' '||normalized||' ')>0 or position(' '||term||' ' in ' '||compressed||' ')>0;
end $$;
revoke all on function public.rejchat_phrase_matches(text,text,text) from public,anon,authenticated;

-- Takie same zasady dopasowania dla filtra i podglądu.
create or replace function public.rejchat_text_blocked(p_text text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare normalized text:=public.rejchat_filter_normalize(p_text); compressed text; f record; term text; padded text; padded_compressed text; words text[]; compressed_words text[]; mask_text text; unicode_compact text; repeat_words text[]; repeat_term text;
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
 repeat_words:=regexp_split_to_array(regexp_replace(normalized,'([a-z])\1+','\1','g'),' +');
 for f in select phrase,match_mode from public.rejchat_blocked_phrases loop
  if f.match_mode='substring' and position(lower(f.phrase) in lower(coalesce(p_text,'')))>0 then return true;end if;
  term:=public.rejchat_filter_normalize(f.phrase);if term='' then continue;end if;
  if term ~ '^[a-z]{4,}$' then
   repeat_term:=regexp_replace(term,'([a-z])\1+','\1','g');
   if f.match_mode='prefix' then
    if exists(select 1 from unnest(repeat_words) w where left(w,length(repeat_term))=repeat_term) then return true;end if;
   elsif repeat_term=any(repeat_words) then return true;end if;
  end if;
  if f.match_mode='prefix' and position(' ' in term)=0 then
   if exists(select 1 from unnest(words||compressed_words) w where left(w,length(term))=term) then return true;end if;
  elsif position(' '||term||' ' in padded)>0 or position(' '||term||' ' in padded_compressed)>0 then return true;
  end if;
 end loop;
 return false;
end $$;

-- Tylko administrator może testować własny tekst; nic nie zapisujemy i nie czytamy rozmów.
create function public.admin_rejchat_filter_check(p_text text,p_candidate text default '',p_mode text default 'substring') returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare candidate text:=btrim(coalesce(p_candidate,''));
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.';end if;
 if char_length(coalesce(p_text,''))<1 or char_length(p_text)>2000 then raise exception 'Przykład musi mieć od 1 do 2000 znaków.';end if;
 if char_length(candidate)>80 or (candidate<>'' and char_length(candidate)<2) or candidate ~ '[[:cntrl:]]' then raise exception 'Fraza musi mieć 2–80 znaków.';end if;
 if p_mode not in ('substring','word','prefix') or p_mode is null then raise exception 'Nieznany typ reguły.';end if;
 if candidate<>'' and p_mode='prefix' and (public.rejchat_filter_normalize(candidate)='' or position(' ' in public.rejchat_filter_normalize(candidate))>0) then raise exception 'Rdzeń musi być pojedynczym słowem.';end if;
 return jsonb_build_object('blocked',public.rejchat_text_blocked(p_text),'candidate_blocked',candidate<>'' and public.rejchat_phrase_matches(p_text,candidate,p_mode));
end $$;
revoke all on function public.admin_rejchat_filter_check(text,text,text) from public,anon,authenticated;
grant execute on function public.admin_rejchat_filter_check(text,text,text) to authenticated;

-- Stare RPC pozostaje dla starszego panelu; nowe pozwala wybrać typ reguły.
create function public.admin_rejchat_phrase_v2(p_phrase text,p_mode text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_phrase text:=btrim(coalesce(p_phrase,''));
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.';end if;
 if p_mode not in ('substring','word','prefix') or p_mode is null then raise exception 'Nieznany typ reguły.';end if;
 if char_length(v_phrase)<2 or char_length(v_phrase)>80 or v_phrase ~ '[[:cntrl:]]' then raise exception 'Fraza musi mieć 2–80 znaków i nie może zawierać znaków sterujących.';end if;
 if p_mode='prefix' and (public.rejchat_filter_normalize(v_phrase)='' or position(' ' in public.rejchat_filter_normalize(v_phrase))>0) then raise exception 'Rdzeń musi być pojedynczym słowem.';end if;
 perform pg_advisory_xact_lock(hashtextextended('rejchat-moderation-phrases',0));
 if (select count(*) from public.rejchat_blocked_phrases)>=500 then raise exception 'Limit 500 fraz.';end if;
 insert into public.rejchat_blocked_phrases(phrase,match_mode) values(v_phrase,p_mode);
 return true;
end $$;
revoke all on function public.admin_rejchat_phrase_v2(text,text) from public,anon,authenticated;
grant execute on function public.admin_rejchat_phrase_v2(text,text) to authenticated;

-- Typy fraz dla istniejącego widoku administratora.
create or replace function public.admin_rejchat_overview() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare phrases jsonb; blocks jsonb; messages jsonb;
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.phrase),'[]'::jsonb) into phrases from (select id,phrase,match_mode,created_at from public.rejchat_blocked_phrases order by phrase) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into blocks from (
  select u.username,b.until_at,b.created_at,b.reason from public.rejchat_write_blocks b join public.community_users u on u.id=b.user_id where b.until_at is null or b.until_at>now() order by b.created_at desc limit 200
 ) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into messages from (
  select id,author_name,content,created_at from public.community_chat order by created_at desc,id desc limit 100
 ) q;
 return jsonb_build_object('phrases',phrases,'blocks',blocks,'messages',messages);
end $$;


notify pgrst,'reload schema';

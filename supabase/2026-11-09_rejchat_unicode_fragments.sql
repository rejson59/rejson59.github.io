-- Uwzględniaj także niełacińskie fragmenty, nie traktując emoji jak liter.
create function public.rejchat_short_fragment(p_text text) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare normalized text:=public.rejchat_filter_normalize(p_text); raw text;
begin
 if normalized<>'' then return normalized;end if;
 raw:=lower(normalize(btrim(coalesce(p_text,'')),NFKC));
 if raw ~ '^[[:alnum:]]{1,6}$' then return raw;end if;
 return '';
end $$;
revoke all on function public.rejchat_short_fragment(text) from public,anon,authenticated;

create or replace function public.rejchat_enforce_fragments() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; fragments text[]:='{}'; pos integer:=0; n text; stamp timestamptz:=coalesce(new.created_at,clock_timestamp());
begin
 n:=public.rejchat_short_fragment(new.content);
 -- Interesują nas tylko krótkie, jednolite fragmenty alfanumeryczne.
 if n='' or n !~ '^[[:alnum:]]{1,6}$' then return new;end if;
 -- Osobne rozmowy nigdy nie dzielą kontekstu; blokada serializuje zmiany autora.
 perform pg_advisory_xact_lock(hashtextextended('rejchat-fragments:'||tg_table_name||':'||new.author_id::text,0));
 if tg_table_name='community_chat' then
  for item in
   with before_rows as (select m.id,m.created_at,m.content from public.community_chat m where m.author_id=new.author_id and m.room=new.room and m.id<>new.id and m.created_at>=stamp-interval '60 seconds' and (m.created_at,m.id)<(stamp,new.id) order by m.created_at desc,m.id desc limit 4),
   after_rows as (select m.id,m.created_at,m.content from public.community_chat m where m.author_id=new.author_id and m.room=new.room and m.id<>new.id and m.created_at<=stamp+interval '60 seconds' and (m.created_at,m.id)>(stamp,new.id) order by m.created_at,m.id limit 4)
   select * from (select *,false as selected from before_rows union all select new.id,stamp,new.content,true union all select *,false from after_rows) q order by created_at,id
  loop
   n:=public.rejchat_short_fragment(item.content);
   if n='' or n !~ '^[[:alnum:]]{1,6}$' then
    if pos>0 then exit;end if;fragments:='{}';
   else fragments:=array_append(fragments,n);if item.selected then pos:=cardinality(fragments);end if;end if;
  end loop;
 elsif tg_table_name='rejchat_dm_messages' then
  for item in
   with before_rows as (select m.id,m.created_at,m.content from public.rejchat_dm_messages m where m.author_id=new.author_id and m.thread_id=new.thread_id and m.id<>new.id and m.created_at>=stamp-interval '60 seconds' and (m.created_at,m.id)<(stamp,new.id) order by m.created_at desc,m.id desc limit 4),
   after_rows as (select m.id,m.created_at,m.content from public.rejchat_dm_messages m where m.author_id=new.author_id and m.thread_id=new.thread_id and m.id<>new.id and m.created_at<=stamp+interval '60 seconds' and (m.created_at,m.id)>(stamp,new.id) order by m.created_at,m.id limit 4)
   select * from (select *,false as selected from before_rows union all select new.id,stamp,new.content,true union all select *,false from after_rows) q order by created_at,id
  loop
   n:=public.rejchat_short_fragment(item.content);
   if n='' or n !~ '^[[:alnum:]]{1,6}$' then
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

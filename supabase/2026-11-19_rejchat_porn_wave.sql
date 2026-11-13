-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- RejChat: fala treści pornograficznych z 19.11.
--
-- W czacie pojawiły się wersje „naokoło” filtra: „pornhu\”, „pormjub”,
-- „onlyfans za darmo”, „rule34.xxx”, „johnny sins”. Filtr znał tylko
-- dokładne „pornhub”/„porno”, więc przepuścił literówki i nazwy serwisów.
--
-- 1. Dokładamy rdzenie i nazwy serwisów (także w formie bez polskich znaków,
--    bo normalizacja filtra i tak sprowadza tekst do a–z).
-- 2. Automatyczne wyciszenie po trzech usunięciach zmienia się z godziny
--    na 15 minut (drabinka właściciela: ostrzeżenie → zmiana nazwy → mute,
--    a nie od razu długie blokady).
-- 3. Automat wystawia przy tym ostrzeżenie, żeby konto miało ślad w panelu
--    i w profilu, a nie tylko cichą blokadę.

insert into public.rejchat_blocked_phrases (phrase, match_mode)
select v.phrase, v.mode
from (values
  ('porn',       'prefix'),
  ('porm',       'prefix'),
  ('porh',       'prefix'),
  ('onlyfans',   'substring'),
  ('only fans',  'word'),
  ('rule34',     'substring'),
  ('rule 34',    'word'),
  ('johnny sin', 'substring'),
  ('xvideos',    'substring'),
  ('xnxx',       'substring'),
  ('redtube',    'substring'),
  ('brazzers',   'substring'),
  ('hentai',     'substring'),
  ('milf',       'word'),
  ('nude',       'prefix'),
  ('erotyk',     'prefix')
) as v(phrase, mode)
where not exists (
  select 1 from public.rejchat_blocked_phrases b
  where lower(b.phrase) = lower(v.phrase)
);

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
  -- Trzy automatyczne usunięcia w godzinie: ostrzeżenie + 15 minut ciszy.
  -- Ban nigdy nie jest automatyczny — decyzja zostaje w panelu.
  for m in select author_id,count(*) n from public.rejchat_auto_log
           where kind='tekst' and not retro and created_at>now()-interval '60 minutes' and author_id is not null
           group by author_id having count(*)>=3 loop
   if not exists(select 1 from public.rejchat_write_blocks b where b.user_id=m.author_id and (b.until_at is null or b.until_at>now())) then
    insert into public.rejchat_write_blocks(user_id,until_at,created_at) values(m.author_id,now()+interval '15 minutes',now())
    on conflict(user_id) do update set until_at=now()+interval '15 minutes',created_at=now();
    insert into public.rejchat_auto_log(kind,author_id,target_kind,reason)
     select 'blokada',m.author_id,'rejchat_write_blocks','automatyczne wyciszenie na 15 minut po 3 usunięciach'
     from public.community_users u where u.id=m.author_id;
    -- Jedno ostrzeżenie na dobę, żeby automat nie zasypywał konta wpisami.
    if not exists(select 1 from public.rejchat_warnings w
                  where w.user_id=m.author_id and w.reason like 'Automatyczna moderacja%'
                    and w.created_at>clock_timestamp()-interval '24 hours') then
      insert into public.rejchat_warnings(user_id,reason,issued_by)
      values(m.author_id,'Automatyczna moderacja: treści niezgodne z filtrem (3 usunięcia w godzinę).','00000000-0000-0000-0000-000000000000'::uuid);
    end if;
    muted:=muted+1;
   end if;
  end loop;
 end if;
 return jsonb_build_object('tekst',removed_text,'zdjęcia',blocked_photos,'duplikaty',duplicates,'blokady',muted);
end $$;
revoke all on function public.rejchat_auto_moderate(boolean) from public,anon,authenticated;
grant execute on function public.rejchat_auto_moderate(boolean) to service_role;

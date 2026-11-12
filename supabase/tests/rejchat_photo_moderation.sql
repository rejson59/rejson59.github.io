-- Testy transakcyjne moderacji zdjęć. Wszystko wycofywane (rollback).
begin;
do $$
declare u uuid:=gen_random_uuid(); tok text:='test-'||gen_random_uuid()::text;
        png bytea; urwany bytea; meta jsonb; ok jsonb; zapisane uuid;
begin
 -- Minimalny, kompletny PNG 40x30 (sygnatura + IHDR + IEND).
 png:=decode('89504e470d0a1a0a','hex')
   || decode('0000000d49484452','hex')
   || decode('00000028','hex')          -- szerokość 40
   || decode('0000001e','hex')          -- wysokość 30
   || decode('0802000000','hex')
   || decode('00000000','hex')
   || decode('0000000049454e44ae426082','hex');

 meta:=public.rejchat_image_meta(png,'image/png');
 if not (meta->>'complete')::boolean then raise exception 'Kompletny PNG uznany za urwany';end if;
 if (meta->>'width')::integer<>40 or (meta->>'height')::integer<>30 then raise exception 'Złe wymiary PNG: %',meta;end if;

 urwany:=substring(png from 1 for octet_length(png)-12);
 meta:=public.rejchat_image_meta(urwany,'image/png');
 if (meta->>'complete')::boolean then raise exception 'Urwany PNG uznany za kompletny';end if;

 if has_function_privilege('anon','public.rejchat_image_meta(bytea,text)','execute') then raise exception 'Anon ma dostęp do parsera';end if;

 -- Wysyłka: urwany plik odrzucony, poprawny przyjęty, duplikat odrzucony.
 insert into public.community_users(id,username,pin_hash) values(u,'T'||left(replace(u::text,'-',''),20),'test');
 insert into public.community_sessions(token_hash,user_id)
  values(encode(extensions.digest('rejson_comm_sess_v1:'||tok,'sha256'),'hex'),u);
 begin
  perform public.rejchat_send_photo(tok,'public','general',null,null,null,'image/png',encode(urwany,'base64'));
  raise exception 'Urwane zdjęcie przeszło';
 exception when raise_exception then
  if sqlerrm not like 'Zdjęcie jest niekompletne%' then raise;end if;
 end;
 ok:=public.rejchat_send_photo(tok,'public','general',null,null,null,'image/png',encode(png,'base64'));
 zapisane:=(ok->>'id')::uuid;
 if zapisane is null then raise exception 'Poprawne zdjęcie nie przeszło';end if;
 if (select status from public.rejchat_photos where public_message_id=zapisane)<>'ok' then raise exception 'Złe oznaczenie nowego zdjęcia';end if;
 begin
  perform public.rejchat_send_photo(tok,'public','general',null,null,null,'image/png',encode(png,'base64'));
  raise exception 'Duplikat przeszedł';
 exception when raise_exception then
  if sqlerrm not like 'To zdjęcie już wysłałeś%' then raise;end if;
 end;
 -- Zdjęcie ukryte przez automatu nie wychodzi już z serwera.
 update public.rejchat_photos set status='blocked',blocked_reason='test' where public_message_id=zapisane;
 begin
  perform public.rejchat_get_photo((select id from public.rejchat_photos where public_message_id=zapisane),null);
  raise exception 'Ukryte zdjęcie wyszło';
 exception when raise_exception then
  if sqlerrm not like 'Zdjęcie jest niedostępne%' then raise;end if;
 end;
 if exists(select 1 from public.rejchat_public_enrich(jsonb_build_array(jsonb_build_object('id',zapisane))) e where e->'photo' is not null) then
  raise exception 'Ukryte zdjęcie nadal jest w wiadomości';
 end if;
end $$;
rollback;

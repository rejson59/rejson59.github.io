-- Uruchamiaj na testowej bazie albo w transakcji wycofywanej na produkcji.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 na text:='T'||substr(replace(a::text,'-',''),1,20); nb text:='T'||substr(replace(b::text,'-',''),1,20);
 ta text:=gen_random_uuid()::text; tb text:=gen_random_uuid()::text; tc text:=gen_random_uuid()::text;
 png text:=encode(decode('89504e470d0a1a0a00000000','hex'),'base64');
 mid uuid; fid uuid; tid uuid; dmid uuid; dfid uuid; x jsonb;
begin
 insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test'),(c,'T'||substr(replace(c::text,'-',''),1,20),'test');
 insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),(encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b),(encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'),c);
 mid:=(public.rejchat_send_photo(ta,'public','general',null,'',null,'image/png',png)->>'id')::uuid;
 select id into fid from public.rejchat_photos where public_message_id=mid;
 x:=public.rejchat_room_list_v2('general',null,100);
 if not exists(select 1 from jsonb_array_elements(x) v where v->>'id'=mid::text and v->'photo'->>'id'=fid::text) then raise exception 'brak zdjęcia publicznego';end if;
 if public.rejchat_get_photo(fid,null)->>'data'<>png then raise exception 'błędne dane';end if;
 perform public.rejchat_send_photo(tb,'public','links',null,'',null,'image/png',png);
 select public_message_id into mid from public.rejchat_photos where owner_id=b;
 perform public.rejchat_message_edit(tb,'public',mid,'Podpis bez linku');
 tid:=(public.rejchat_dm_open(ta,nb)->>'id')::uuid;
 dmid:=(public.rejchat_send_photo(ta,'private',null,tid,'Prywatne',null,'image/png',png)->>'id')::uuid;
 select id into dfid from public.rejchat_photos where private_message_id=dmid;
 x:=public.rejchat_dm_list_v2(tb,tid);
 if not exists(select 1 from jsonb_array_elements(x->'messages') v where v->>'id'=dmid::text and v->'photo'->>'id'=dfid::text) then raise exception 'brak zdjęcia DM';end if;
 if public.rejchat_get_photo(dfid,tb)->>'data'<>png then raise exception 'odbiorca nie widzi';end if;
 begin perform public.rejchat_get_photo(dfid,tc);raise exception 'wyciek DM';exception when raise_exception then if sqlerrm not like 'Zdjęcie jest niedostępne%' then raise;end if;end;
 update public.rejchat_photos set expires_at=clock_timestamp()-interval '1 second' where id=dfid;
 begin perform public.rejchat_get_photo(dfid,tb);raise exception 'brak wygasania';exception when raise_exception then if sqlerrm not like 'Zdjęcie jest niedostępne%' then raise;end if;end;
 begin perform public.rejchat_send_photo(tc,'public','general',null,'',null,'image/png',encode(convert_to('nieobrazxxxx','utf8'),'base64'));raise exception 'brak walidacji';exception when raise_exception then if sqlerrm not like 'Format zdjęcia%' then raise;end if;end;
 update public.rejchat_photo_usage set file_count=12 where user_id=a;
 begin perform public.rejchat_send_photo(ta,'private',null,tid,'',null,'image/png',png);raise exception 'brak limitu';exception when raise_exception then if sqlerrm not like 'Dzienny limit%' then raise;end if;end;
 insert into public.rejchat_write_blocks(user_id,until_at) values(c,now()+interval '5 minutes');
 begin perform public.rejchat_send_photo(tc,'private',null,tid,'',null,'image/png',png);raise exception 'wysyłka poza rozmową';exception when raise_exception then if sqlerrm not like 'Rozmowa jest niedostępna%' then raise;end if;end;
 begin perform public.rejchat_send_photo(tc,'public','general',null,'',null,'image/png',png);raise exception 'brak mute';exception when raise_exception then if sqlerrm not like 'Twoje konto ma zablokowaną%' then raise;end if;end;
 if exists(select 1 from public.rejchat_photos where owner_id=c) or exists(select 1 from public.rejchat_photo_usage where user_id=c) then raise exception 'nieatomowa nieudana wysyłka';end if;
 if has_table_privilege('anon','public.rejchat_photos','select') or has_function_privilege('anon','public.rejchat_private_enrich(jsonb,uuid)','execute') then raise exception 'brak izolacji';end if;
end $$;
rollback;

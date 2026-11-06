-- Testy działają w transakcji, która zawsze jest wycofywana.
begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();na text:='T'||substr(replace(a::text,'-',''),1,20);nb text:='T'||substr(replace(b::text,'-',''),1,20);ta text:=gen_random_uuid()::text;tb text:=gen_random_uuid()::text;tc text:=gen_random_uuid()::text;png text:=encode(decode('89504e470d0a1a0a00000000','hex')||decode(repeat('aa',200),'hex'),'base64');tid uuid;mid uuid;res jsonb;sid uuid;data jsonb;begin
 insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test'),(c,'T'||substr(replace(c::text,'-',''),1,20),'test');
 insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),(encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b),(encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'),c);
 mid:=(public.rejchat_room_send_v2(ta,'links','https://example.org/rzecz',null)->>'id')::uuid;
 res:=public.rejchat_save_to_rejsejf(tb,'public',mid,'text');sid:=(res->>'id')::uuid;data:=public.rejsejf_get(tb,sid);
 if data->>'kind'<>'note' or position('https://example.org/rzecz' in data->>'content')=0 then raise exception 'brak treści w sejfie';end if;
 begin perform public.rejsejf_get(ta,sid);raise exception 'wyciek notatki';exception when raise_exception then if sqlerrm not like 'Nie znaleziono elementu%' then raise;end if;end;
 insert into public.rejsejf_items(owner_id,kind,title,content) select c,'note','quota',convert_to('x','utf8') from generate_series(1,200);
 begin perform public.rejchat_save_to_rejsejf(tc,'public',mid,'text');raise exception 'brak limitu sejfu';exception when raise_exception then if sqlerrm not like 'Limit 200 elementów%' then raise;end if;end;
 tid:=(public.rejchat_dm_open(ta,nb)->>'id')::uuid;
 mid:=(public.rejchat_send_photo(ta,'private',null,tid,'Prywatne zdjęcie',null,'image/png',replace(png,E'\n',''))->>'id')::uuid;
 res:=public.rejchat_save_to_rejsejf(tb,'private',mid,'photo');sid:=(res->>'id')::uuid;data:=public.rejsejf_get(tb,sid);
 if data->>'kind'<>'file' or decode(data->>'content','base64')<>decode(png,'base64') then raise exception 'błędna kopia';end if;
 begin perform public.rejchat_save_to_rejsejf(tc,'private',mid,'text');raise exception 'wyciek tekstu DM';exception when raise_exception then if sqlerrm not like 'Wiadomość jest niedostępna%' then raise;end if;end;
 begin perform public.rejchat_save_to_rejsejf(tc,'private',mid,'photo');raise exception 'wyciek zdjęcia DM';exception when raise_exception then if sqlerrm not like 'Wiadomość jest niedostępna%' then raise;end if;end;
 update public.rejchat_photos set expires_at=clock_timestamp()-interval '1 second' where private_message_id=mid;
 begin perform public.rejchat_save_to_rejsejf(tb,'private',mid,'photo');raise exception 'kopiowanie wygasłego';exception when raise_exception then if sqlerrm not like 'Zdjęcie jest niedostępne%' then raise;end if;end;
 if has_table_privilege('anon','public.rejsejf_items','select') or has_table_privilege('anon','public.rejchat_photos','select') then raise exception 'zbyt szerokie uprawnienia';end if;
end $$;
rollback;

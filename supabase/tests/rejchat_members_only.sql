-- Użyj po obu migracjach. ROLE anon sprawdza dostęp tak jak przeglądarka.
begin;
do $$declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();na text:='T'||substr(replace(a::text,'-',''),1,20);nb text:='T'||substr(replace(b::text,'-',''),1,20);ta text:=gen_random_uuid()::text;tb text:=gen_random_uuid()::text;tc text:=gen_random_uuid()::text;png text:=encode(decode('89504e470d0a1a0a00000000','hex'),'base64');mid uuid;photo uuid;tid uuid;dm uuid;dp uuid;begin
 insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test'),(c,'T'||substr(replace(c::text,'-',''),1,20),'test');
 insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),(encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b),(encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'),c);
 mid:=(public.rejchat_send_photo(ta,'public','links',null,'',null,'image/png',png)->>'id')::uuid;select id into photo from public.rejchat_photos where public_message_id=mid;
 tid:=(public.rejchat_dm_open(ta,nb)->>'id')::uuid;dm:=(public.rejchat_send_photo(ta,'private',null,tid,'',null,'image/png',png)->>'id')::uuid;select id into dp from public.rejchat_photos where private_message_id=dm;
 perform set_config('test.token',tb,true);perform set_config('test.outsider',tc,true);perform set_config('test.photo',photo::text,true);perform set_config('test.dmphoto',dp::text,true);perform set_config('test.message',mid::text,true);perform set_config('test.png',png,true);
end $$;
set local role anon;
do $$declare t text:=current_setting('test.token');p uuid:=current_setting('test.photo')::uuid;dp uuid:=current_setting('test.dmphoto')::uuid;mid uuid:=current_setting('test.message')::uuid;x jsonb;begin
 begin perform public.community_chat_list(null,50);raise exception 'dostęp legacy';exception when insufficient_privilege then null;end;
 begin perform public.rejchat_room_list('links',null,50);raise exception 'dostęp legacy room';exception when insufficient_privilege then null;end;
 begin perform public.rejchat_room_list_v2('links',null,50);raise exception 'dostęp legacy v2';exception when insufficient_privilege then null;end;
 begin perform 1 from public.community_chat limit 1;raise exception 'dostęp tabeli';exception when insufficient_privilege then null;end;
 begin perform public.rejchat_room_list_v3(null,'links',null,50);raise exception 'brak sesji';exception when raise_exception then if sqlerrm not like 'Musisz być zalogowany%' then raise;end if;end;
 begin perform public.rejchat_room_list_v3('invalid-test-token','links',null,50);raise exception 'niepoprawny token';exception when raise_exception then if sqlerrm not like 'Sesja wygasła%' then raise;end if;end;
 begin perform public.rejchat_get_photo(p,null);raise exception 'brak ochrony zdjęć';exception when raise_exception then if sqlerrm not like 'Musisz być zalogowany%' then raise;end if;end;
 begin perform public.rejchat_reactions_list(array[mid],null);raise exception 'brak ochrony reakcji';exception when raise_exception then if sqlerrm not like 'Musisz być zalogowany%' then raise;end if;end;
 x:=public.rejchat_room_list_v3(t,'links',null,100);if not exists(select 1 from jsonb_array_elements(x) v where v->>'id'=mid::text) then raise exception 'brak czatu konta';end if;
 if public.rejchat_get_photo(p,t)->>'data'<>current_setting('test.png') then raise exception 'brak zdjęcia konta';end if;
 if public.rejchat_get_photo(dp,t)->>'data'<>current_setting('test.png') then raise exception 'brak zdjęcia uczestnika DM';end if;
 begin perform public.rejchat_get_photo(dp,current_setting('test.outsider'));raise exception 'wyciek DM';exception when raise_exception then if sqlerrm not like 'Zdjęcie jest niedostępne%' then raise;end if;end;
 perform public.rejchat_get_profiles(array['Example']);perform public.community_list_posts(1,0,null,null);
end $$;
rollback;

-- Uruchamiać po migracji: transakcja wycofuje wszystkie dane testowe.
begin;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();t uuid:=gen_random_uuid();m uuid:=gen_random_uuid();p uuid:=gen_random_uuid();ta text:='token-a-'||a::text;tb text:='token-b-'||b::text;tc text:='token-c-'||c::text;na text:='T'||substr(replace(a::text,'-',''),1,20);nb text:='T'||substr(replace(b::text,'-',''),1,20);r jsonb;begin
 insert into public.community_users(id,username,pin_hash,is_owner) values(a,na,'test',true),(b,nb,'test',false),(c,'T'||substr(replace(c::text,'-',''),1,20),'test',false);
 insert into public.community_sessions(user_id,token_hash) values(a,encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex')),(b,encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex')),(c,encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'));
 insert into public.community_chat(id,author_id,author_name,content,room,created_at) values(p,b,nb,'Test szukania publicznego','links',clock_timestamp()-interval '1 minute');
 insert into public.rejchat_dm_threads(id,user_low,user_high) values(t,least(a,b),greatest(a,b));insert into public.rejchat_dm_messages(id,thread_id,author_id,content,created_at) values(m,t,b,'Tajny testowy tekst',clock_timestamp()-interval '1 minute');
 begin perform public.rejchat_pin_message(tb,'public',p,true);raise exception 'nieadmin przypial';exception when raise_exception then if sqlerrm not like 'Tylko właściciel%' then raise;end if;end;
 if not public.rejchat_pin_message(ta,'public',p,true) or public.rejchat_pinned(tb,'public','links',null)->>'id'<>p::text then raise exception 'pin publiczny';end if;
 if public.rejchat_pinned(tb,'public','general',null)<>'null'::jsonb then raise exception 'pin w obcym pokoju';end if;
 if not public.rejchat_pin_message(ta,'private',m,true) or public.rejchat_pinned(tb,'private',null,t)->>'id'<>m::text then raise exception 'pin prywatny';end if;
 begin perform public.rejchat_pinned(tc,'private',null,t);raise exception 'osoba postronna widzi pin';exception when raise_exception then if sqlerrm not like 'Rozmowa jest niedostępna%' then raise;end if;end;
 begin perform public.rejchat_search_messages(tc,'private',null,t,'tajny');raise exception 'osoba postronna szuka dm';exception when raise_exception then if sqlerrm not like 'Rozmowa jest niedostępna%' then raise;end if;end;
 r:=public.rejchat_search_messages(ta,'private',null,t,'tajny');if jsonb_array_length(r)<>1 or r->0->>'id'<>m::text then raise exception 'wyszukiwanie tekstu';end if;
 r:=public.rejchat_search_messages(ta,'private',null,t,nb);if jsonb_array_length(r)<>1 then raise exception 'wyszukiwanie autora';end if;
 r:=public.rejchat_search_messages(ta,'public','general',null,'publicznego');if jsonb_array_length(r)<>0 then raise exception 'obcy pokoj';end if;
 r:=public.rejchat_search_messages(ta,'public','links',null,'publicznego');if jsonb_array_length(r)<>1 then raise exception 'wyszukiwanie publiczne';end if;
 delete from public.rejchat_dm_messages where id=m;if public.rejchat_pinned(ta,'private',null,t)<>'null'::jsonb then raise exception 'usuniety pin';end if;
 if has_table_privilege('anon','public.rejchat_dm_pins','select') or not has_function_privilege('anon','public.rejchat_search_messages(text,text,text,uuid,text)','execute') then raise exception 'uprawnienia';end if;
end $$;
rollback;

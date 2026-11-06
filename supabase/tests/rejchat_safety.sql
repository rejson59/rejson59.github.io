-- Po migracji: testy całkowicie wycofywane (także testowe sesje i ostrzeżenia).
begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();t uuid:=gen_random_uuid();m uuid:=gen_random_uuid();pub uuid:=gen_random_uuid();w uuid;rep uuid;na text:='T'||substr(replace(a::text,'-',''),1,20);nb text:='T'||substr(replace(b::text,'-',''),1,20);nc text:='T'||substr(replace(c::text,'-',''),1,20);ta text:='token-a-'||a::text;tb text:='token-b-'||b::text;tc text:='token-c-'||c::text;r jsonb;admin_id uuid;begin
 insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test'),(c,nc,'test');
 insert into public.community_sessions(user_id,token_hash) values(a,encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex')),(b,encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex')),(c,encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'));
 insert into public.rejchat_dm_threads(id,user_low,user_high) values(t,least(a,b),greatest(a,b));
 insert into public.rejchat_dm_messages(id,thread_id,author_id,content,created_at) values(m,t,b,'Tylko ta wiadomosc',clock_timestamp()-interval '1 minute');
 insert into public.community_chat(id,author_id,author_name,content,room,created_at) values(pub,b,nb,'Publiczna wiadomosc','general',clock_timestamp()-interval '1 minute');
 begin perform public.rejchat_report(tc,'private',m,null,'spam','');raise exception 'osoba postronna zglosila DM';exception when raise_exception then if sqlerrm not like 'Zgłaszana treść%' then raise;end if;end;
 begin perform public.rejchat_report(tb,'private',m,null,'spam','');raise exception 'wlasna wiadomosc';exception when raise_exception then if sqlerrm not like 'Nie możesz zgłosić%' then raise;end if;end;
 r:=public.rejchat_report(ta,'private',m,null,'abuse','opis');rep:=(r->>'id')::uuid;
 if (select snapshot from public.rejchat_reports where id=rep)<>'Tylko ta wiadomosc' then raise exception 'zly snapshot';end if;
 begin perform public.rejchat_report(ta,'private',m,null,'spam','');raise exception 'duplikat';exception when raise_exception then if sqlerrm not like 'To zgłoszenie już%' then raise;end if;end;
 perform public.rejchat_report(ta,'public',pub,null,'spam','');perform public.rejchat_report(ta,'profile',null,nb,'other','');
 begin perform public.admin_rejchat_reports();raise exception 'nieadmin widzi zgloszenia';exception when raise_exception then if sqlerrm not like 'Brak uprawnień%' then raise;end if;end;
 perform public.rejchat_block_user(ta,nb,true);
 if not (public.rejchat_block_status(ta,nb)->>'blocked')::boolean or (public.rejchat_block_status(tb,na)->>'blocked')::boolean then raise exception 'zly status blokady';end if;
 begin insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t,b,'Test zablokowany');raise exception 'blokada b->a nie dziala';exception when raise_exception then if sqlerrm not like 'Nie można wysłać%' then raise;end if;end;
 begin insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t,a,'Test zablokowany');raise exception 'blokada a->b nie dziala';exception when raise_exception then if sqlerrm not like 'Nie można wysłać%' then raise;end if;end;
 begin update public.rejchat_dm_messages set content='Test edycji' where id=m;raise exception 'edycja przeszla';exception when raise_exception then if sqlerrm not like 'Nie można wysłać%' then raise;end if;end;
 begin insert into public.rejchat_dm_reactions(message_id,user_id,emoji) values(m,a,'👍');raise exception 'reakcja przeszla';exception when raise_exception then if sqlerrm not like 'Nie można wysłać%' then raise;end if;end;
 perform public.rejchat_block_user(tb,na,true);perform public.rejchat_block_user(ta,nb,false);
 begin insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t,a,'Test blokady drugiej osoby');raise exception 'blokada drugiej osoby nie dziala';exception when raise_exception then if sqlerrm not like 'Nie można wysłać%' then raise;end if;end;
 perform public.rejchat_block_user(tb,na,false);insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t,a,'Po odblokowaniu');
 select user_id into admin_id from public.widget_admins limit 1;if admin_id is null then raise exception 'brak admina testowego';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 if not public.admin_rejchat_warn(na,'Test ostrzezenia') then raise exception 'brak ostrzezenia';end if;
 r:=public.rejchat_my_warnings(ta);w:=(r->'items'->0->>'id')::uuid;
 if w is null or jsonb_array_length(public.rejchat_my_warnings(tb)->'items')<>0 then raise exception 'prywatnosc ostrzezenia';end if;
 if public.rejchat_ack_warning(tb,w) then raise exception 'cudze potwierdzenie';end if;
 if not public.rejchat_ack_warning(ta,w) or jsonb_array_length(public.rejchat_my_warnings(ta)->'items')<>0 then raise exception 'potwierdzenie nie dziala';end if;
 if not public.admin_rejchat_resolve_report(rep) then raise exception 'brak rozpatrzenia';end if;
 if has_table_privilege('anon','public.rejchat_reports','select') or has_table_privilege('authenticated','public.rejchat_warnings','select') or has_function_privilege('anon','public.admin_rejchat_reports()','execute') or has_function_privilege('anon','public.rejchat_pair_lock(uuid,uuid)','execute') then raise exception 'nieuprawniony dostep';end if;
end $$;
rollback;

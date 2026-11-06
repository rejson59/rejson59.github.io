-- Po migracji; wszystkie dane testowe są wycofywane.
begin;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();ta text:=gen_random_uuid()::text;tb text:=gen_random_uuid()::text;tc text:=gen_random_uuid()::text;mid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();dm uuid:=gen_random_uuid();begin
 insert into public.community_users(id,username,pin_hash) values(a,'T'||substr(replace(a::text,'-',''),1,20),'test'),(b,'T'||substr(replace(b::text,'-',''),1,20),'test'),(c,'T'||substr(replace(c::text,'-',''),1,20),'test');
 insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),(encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b),(encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'),c);
 insert into public.community_chat(id,author_id,author_name,content,room) select mid,a,username,'test','general' from public.community_users where id=a;
 insert into public.rejchat_dm_threads(id,user_low,user_high) values(tid,least(a,b),greatest(a,b));insert into public.rejchat_dm_messages(id,thread_id,author_id,content) values(dm,tid,a,'test');
 insert into public.rejchat_chat_reactions(message_id,user_id,emoji) values(mid,b,'👍');insert into public.rejchat_dm_reactions(message_id,user_id,emoji) values(dm,b,'❤️');
 perform set_config('test.ta',ta,true);perform set_config('test.tb',tb,true);perform set_config('test.tc',tc,true);perform set_config('test.mid',mid::text,true);perform set_config('test.dm',dm::text,true);
end $$;
set local role anon;
do $$ declare a text:=current_setting('test.ta');b text:=current_setting('test.tb');c text:=current_setting('test.tc');m uuid:=current_setting('test.mid')::uuid;d uuid:=current_setting('test.dm')::uuid;x jsonb;begin
 if public.rejchat_mark_seen(a,'public',array[m])<>0 then raise exception 'autor nie jest czytelnikiem';end if;
 if public.rejchat_mark_seen(b,'public',array[m])<>1 or public.rejchat_mark_seen(b,'public',array[m])<>0 then raise exception 'odczyt lub deduplikacja';end if;
 if public.rejchat_mark_seen(b,'private',array[d])<>1 then raise exception 'odczyt DM';end if;
 x:=public.rejchat_message_details(a,'public',m);if x->>'reader_count'<>'1' or jsonb_array_length(x->'reactions')<>1 then raise exception 'dane publiczne';end if;
 x:=public.rejchat_message_details(a,'private',d);if x->>'reader_count'<>'1' or jsonb_array_length(x->'reactions')<>1 then raise exception 'dane DM';end if;
 begin perform public.rejchat_message_details(c,'private',d);raise exception 'wyciek';exception when raise_exception then if sqlerrm not like 'Wiadomość jest niedostępna%' then raise;end if;end;
 begin perform public.rejchat_mark_seen(c,'private',array[d]);raise exception 'wyciek zapis';exception when raise_exception then if sqlerrm not like 'Wiadomość jest niedostępna%' then raise;end if;end;
 begin perform public.rejchat_message_details(null,'public',m);raise exception 'anon';exception when raise_exception then if sqlerrm not like 'Musisz być zalogowany%' then raise;end if;end;
 begin perform 1 from public.rejchat_room_reads limit 1;raise exception 'tabela';exception when insufficient_privilege then null;end;
end $$;
rollback;

-- Po migracji; dane testowe wycofywane.
begin;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();ta text:=gen_random_uuid()::text;tb text:=gen_random_uuid()::text;tc text:=gen_random_uuid()::text;mid uuid:=gen_random_uuid();lnk uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();dm uuid:=gen_random_uuid();begin
 insert into public.community_users(id,username,pin_hash) values(a,'T'||substr(replace(a::text,'-',''),1,20),'test'),(b,'T'||substr(replace(b::text,'-',''),1,20),'test'),(c,'T'||substr(replace(c::text,'-',''),1,20),'test');
 insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),(encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b),(encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'),c);
 insert into public.community_chat(id,author_id,author_name,content,room) select mid,a,username,'test','general' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '3 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(id,author_id,author_name,content,room) select lnk,a,username,'test','links' from public.community_users where id=a;
 insert into public.rejchat_dm_threads(id,user_low,user_high) values(tid,least(a,b),greatest(a,b));insert into public.rejchat_dm_messages(id,thread_id,author_id,content) values(dm,tid,a,'test');
 perform set_config('test.ta',ta,true);perform set_config('test.tb',tb,true);perform set_config('test.tc',tc,true);perform set_config('test.mid',mid::text,true);perform set_config('test.lnk',lnk::text,true);perform set_config('test.dm',dm::text,true);perform set_config('test.b',b::text,true);
end $$;
set local role anon;
do $$ declare a text:=current_setting('test.ta');b text:=current_setting('test.tb');c text:=current_setting('test.tc');m uuid:=current_setting('test.mid')::uuid;l uuid:=current_setting('test.lnk')::uuid;d uuid:=current_setting('test.dm')::uuid;x jsonb;begin
 if public.rejchat_react(b,'public',m,'🧑🏽‍🚀')->>'active'<>'true' then raise exception 'public insert';end if;
 if public.rejchat_react(b,'public',l,'🍕')->>'active'<>'true' then raise exception 'links insert';end if;
 if public.rejchat_react(b,'private',d,'🏳️‍🌈')->>'active'<>'true' then raise exception 'DM insert';end if;
 x:=public.rejchat_reactions_list(array[m,l],a);if not exists(select 1 from jsonb_array_elements(x) v where v->>'emoji'='🧑🏽‍🚀' and v->>'count'='1') then raise exception 'licznik';end if;
 x:=public.rejchat_message_details(a,'private',d);if not exists(select 1 from jsonb_array_elements(x->'reactions') v where v->>'emoji'='🏳️‍🌈') then raise exception 'szczegóły';end if;
 x:=public.rejchat_reaction_inbox(a);if x->>'unread'<>'3' or not exists(select 1 from jsonb_array_elements(x->'items') v where v->>'emoji'='🏳️‍🌈' and v->>'scope'='private') then raise exception 'powiadomienia';end if;
 begin perform public.rejchat_react(c,'private',d,'🍕');raise exception 'wyciek';exception when raise_exception then if sqlerrm not like 'Wiadomość jest niedostępna%' then raise;end if;end;
 begin perform public.rejchat_react(null,'public',m,'🍕');raise exception 'brak sesji';exception when raise_exception then if sqlerrm not like 'Musisz być zalogowany%' then raise;end if;end;
 begin perform public.rejchat_react(b,'public',m,'foo');raise exception 'brak walidacji';exception when raise_exception then if sqlerrm not like 'Nieznana reakcja%' then raise;end if;end;
 begin perform 1 from public.rejchat_reaction_emojis limit 1;raise exception 'dostęp do tabeli';exception when insufficient_privilege then null;end;
 if public.rejchat_react(b,'public',m,'🧑🏽‍🚀')->>'active'<>'false' then raise exception 'usuwanie';end if;
end $$;
reset role;
update public.rejchat_reaction_limits set minute_start=now(),minute_count=60 where user_id=current_setting('test.b')::uuid;
set local role anon;
do $$ begin
 begin perform public.rejchat_react(current_setting('test.tb'),'public',current_setting('test.mid')::uuid,'😀');raise exception 'brak limitu';exception when raise_exception then if sqlerrm not like 'Limit reakcji%' then raise;end if;end;
end $$;
rollback;

-- Test uprawnień i metadanych odpowiedzi/edycji; transakcja jest wycofywana.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); na text:='T'||substr(replace(a::text,'-',''),1,20); nb text:='T'||substr(replace(b::text,'-',''),1,20); ta text:=gen_random_uuid()::text; tb text:=gen_random_uuid()::text; tc text:=gen_random_uuid()::text; pid uuid; reply uuid; tid uuid; d1 uuid; d2 uuid; x jsonb;
begin
 insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test'),(c,'T'||substr(replace(c::text,'-',''),1,20),'test');
 insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),(encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b),(encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'),c);
 pid:=(public.rejchat_room_send_v2(ta,'general','Witaj serdecznie',null)->>'id')::uuid;
 reply:=(public.rejchat_room_send_v2(tb,'general','Odpowiedź',pid)->>'id')::uuid;
 x:=public.rejchat_room_list_v2('general',null,100);
 if not exists(select 1 from jsonb_array_elements(x) v where v->>'id'=reply::text and v->'reply'->>'id'=pid::text) then raise exception 'brak odpowiedzi'; end if;
 begin perform public.rejchat_message_edit(ta,'public',reply,'nadużycie');raise exception 'edytowano cudze';exception when raise_exception then if sqlerrm not like 'Nie możesz edytować%' then raise;end if;end;
 perform public.rejchat_message_edit(tb,'public',reply,'Edytowana wiadomość');
 begin perform public.rejchat_message_edit(tb,'public',reply,'Za szybko');raise exception 'brak limitu edycji';exception when raise_exception then if sqlerrm not like 'Odczekaj 5 sekund%' then raise;end if;end;
 x:=public.rejchat_room_list_v2('general',null,100);
 if not exists(select 1 from jsonb_array_elements(x) v where v->>'id'=reply::text and v->>'content'='Edytowana wiadomość' and v->>'edited_at' is not null) then raise exception 'brak edycji';end if;
 begin perform public.rejchat_room_send_v2(tc,'links','https://example.org',pid);raise exception 'odpowiedź z innego kanału';exception when raise_exception then if sqlerrm not like 'Wiadomość, na którą%' then raise;end if;end;
 tid:=(public.rejchat_dm_open(ta,nb)->>'id')::uuid;
 d1:=(public.rejchat_dm_send_v2(ta,tid,'sekretna wiadomość',null)->>'id')::uuid;
 d2:=(public.rejchat_dm_send_v2(tb,tid,'odpowiedź tajna',d1)->>'id')::uuid;
 x:=public.rejchat_dm_list_v2(ta,tid);
 if not exists(select 1 from jsonb_array_elements(x->'messages') v where v->>'id'=d2::text and v->'reply'->>'content'='sekretna wiadomość') then raise exception 'brak odpowiedzi DM'; end if;
 begin perform public.rejchat_dm_list_v2(tc,tid);raise exception 'prywatny wyciek';exception when raise_exception then if sqlerrm not like 'Rozmowa jest niedostępna%' then raise;end if;end;
 begin perform public.rejchat_message_edit(tc,'private',d1,'nadużycie');raise exception 'edycja obcego DM';exception when raise_exception then if sqlerrm not like 'Nie możesz edytować%' then raise;end if;end;
 perform public.rejchat_message_edit(ta,'private',d1,'zmieniona tajna');
 x:=public.rejchat_dm_list_v2(tb,tid);
 if not exists(select 1 from jsonb_array_elements(x->'messages') v where v->>'id'=d2::text and v->'reply'->>'content'='zmieniona tajna') then raise exception 'stary cytat';end if;
 update public.rejchat_dm_messages set edited_at=clock_timestamp()-interval '6 seconds' where id=d1;
 insert into public.rejchat_write_blocks(user_id,until_at) values(a,now()+interval '5 minutes');
 begin perform public.rejchat_message_edit(ta,'private',d1,'zablokowany');raise exception 'brak mute';exception when raise_exception then if sqlerrm not like 'Twoje konto ma zablokowaną%' then raise;end if;end;
 if has_function_privilege('anon','public.rejchat_private_enrich(jsonb,uuid)','execute') then raise exception 'wyciek helpera'; end if;
end $$;
rollback;

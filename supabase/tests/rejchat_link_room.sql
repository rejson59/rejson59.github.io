-- Test rollback — pokoje są rozdzielone i współdzielą moderację.
begin;
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); na text:='T'||substr(replace(a::text,'-',''),1,20); nb text:='T'||substr(replace(b::text,'-',''),1,20); ta text:=gen_random_uuid()::text; tb text:=gen_random_uuid()::text; g uuid; l uuid; rows jsonb; begin
insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test');
insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),(encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b);
g:=(public.community_chat_send(ta,repeat('różne ',50))->>'id')::uuid;
perform public.rejchat_react(tb,'public',g,'👍');
begin perform public.rejchat_link_send(tb,'bez linku');raise exception 'brak linku przyjęty';exception when raise_exception then if sqlerrm not like 'Dodaj do wiadomości link%' then raise;end if;end;
l:=(public.rejchat_link_send(tb,'https://example.org/abc')->>'id')::uuid;
rows:=public.community_chat_list(null,100);
if not exists(select 1 from jsonb_array_elements(rows) x where x->>'id'=g::text) or exists(select 1 from jsonb_array_elements(rows) x where x->>'id'=l::text) then raise exception 'ogólny pomieszany z linkami';end if;
rows:=public.rejchat_room_list('links',null,100);
if not exists(select 1 from jsonb_array_elements(rows) x where x->>'id'=l::text) or exists(select 1 from jsonb_array_elements(rows) x where x->>'id'=g::text) then raise exception 'linki pomieszane';end if;
if public.rejchat_room_list('links',g,50)<>'[]'::jsonb then raise exception 'obcy kursor';end if;
perform public.rejchat_react(ta,'public',l,'👍');
begin insert into public.community_chat(author_id,author_name,content,room) values(a,na,'https://a https://b https://c https://d','links');raise exception 'pominął moderację';exception when raise_exception then if sqlerrm not like 'Za dużo linków%' then raise;end if;end;
insert into public.rejchat_write_blocks(user_id,until_at) values(a,now()+interval '5 minutes');
begin insert into public.community_chat(author_id,author_name,content,room) values(a,na,'https://example.org','links');raise exception 'pominął mute';exception when raise_exception then if sqlerrm not like 'Twoje konto ma zablokowaną%' then raise;end if;end;
if not has_function_privilege('anon','public.rejchat_room_list(text,uuid,integer)','execute') then raise exception 'brak dostępu do pokoju';end if;
end $$;
rollback;

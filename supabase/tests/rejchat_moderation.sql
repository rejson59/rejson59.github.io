-- Test transakcyjny uruchamia się po migracji i nie pozostawia danych.
begin;
do $$
declare aid uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); na text:='T'||substr(replace(a::text,'-',''),1,20); nb text:='T'||substr(replace(b::text,'-',''),1,20); token text:=gen_random_uuid()::text; pid uuid; tid uuid; mid uuid; data jsonb; phrase text:='testfraza'||substr(replace(a::text,'-',''),1,10);
begin
 select user_id into aid from public.widget_admins limit 1; if aid is null then raise exception 'Brak admina do testu'; end if;
 insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test');
 insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||token,'sha256'),'hex'),a);
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.admin_rejchat_overview(); raise exception 'unauthorized allowed'; exception when raise_exception then if sqlerrm<>'Brak uprawnień administratora.' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'role','authenticated')::text,true);
 perform public.admin_rejchat_phrase(phrase,null);
 data:=public.admin_rejchat_overview(); if not exists(select 1 from jsonb_array_elements(data->'phrases') x where x->>'phrase'=phrase) then raise exception 'missing phrase'; end if;
 begin perform public.community_chat_send(token,'pReFiX '||upper(phrase)); raise exception 'chat allowed'; exception when raise_exception then if sqlerrm<>'Treść zawiera niedozwoloną frazę. Zmień wiadomość i spróbuj ponownie.' then raise; end if; end;
 begin perform public.community_create_post(token,'pReFiX '||upper(phrase),'[]'::jsonb,'{}'); raise exception 'post allowed'; exception when raise_exception then if sqlerrm<>'Treść zawiera niedozwoloną frazę. Zmień wiadomość i spróbuj ponownie.' then raise; end if; end;
 insert into public.community_posts(author_id,author_name,content) values(a,na,'safe content') returning id into pid;
 begin perform public.community_add_comment(token,pid,'pReFiX '||upper(phrase),null); raise exception 'comment allowed'; exception when raise_exception then if sqlerrm<>'Treść zawiera niedozwoloną frazę. Zmień wiadomość i spróbuj ponownie.' then raise; end if; end;
 tid:=(public.rejchat_dm_open(token,nb)->>'id')::uuid;
 begin perform public.rejchat_dm_send(token,tid,'pReFiX '||upper(phrase)); raise exception 'dm allowed'; exception when raise_exception then if sqlerrm<>'Treść zawiera niedozwoloną frazę. Zmień wiadomość i spróbuj ponownie.' then raise; end if; end;
 perform public.admin_rejchat_write_block(na,1);
 begin perform public.community_chat_send(token,'safe content'); raise exception 'muted allowed'; exception when raise_exception then if sqlerrm<>'Twoje konto ma zablokowaną możliwość pisania w RejChat.' then raise; end if; end;
 perform public.admin_rejchat_write_block(na,0); mid:=(public.community_chat_send(token,'safe content')->>'id')::uuid;
 if public.admin_rejchat_delete_messages(array[mid])<>1 then raise exception 'delete failed'; end if;
 if has_table_privilege('anon','public.rejchat_blocked_phrases','select') or has_function_privilege('anon','public.admin_rejchat_overview()','execute') then raise exception 'anon access'; end if;
end $$;
rollback;

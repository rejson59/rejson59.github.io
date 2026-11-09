begin;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();ta text:=gen_random_uuid()::text;tb text:=gen_random_uuid()::text;r jsonb;begin
 insert into public.community_users(id,username,pin_hash) values(a,'T'||left(replace(a::text,'-',''),20),'test'),(b,'T'||left(replace(b::text,'-',''),20),'test');
 insert into public.community_sessions(user_id,token_hash) values(a,encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex')),(b,encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'));
 perform public.rejclass_topics_set(ta,'{"bio2-1":true,"bio2-2":false}');
 r:=public.rejclass_topics_get(ta);if r->>'user_id'<>a::text or r->'entries'->>'bio2-1'<>'true' or r->'entries'->>'bio2-2'<>'false' then raise exception 'Złe dane postępu';end if;
 if public.rejclass_topics_get(tb)->'entries'<>'{}'::jsonb then raise exception 'Wyciek postępów';end if;
 perform public.rejclass_topics_set(tb,'{"bio2-1":false}');if public.rejclass_topics_get(ta)->'entries'->>'bio2-1'<>'true' then raise exception 'Nadpisano inne konto';end if;
 begin perform public.rejclass_topics_set(ta,'{"bio2-8":true}');raise exception 'Nieznany temat';exception when raise_exception then if sqlerrm not like 'Nieprawidłowe dane%' then raise;end if;end;
 begin perform public.rejclass_topics_set(ta,'{"bio2-1":"true"}');raise exception 'Nieprawidłowy typ';exception when raise_exception then if sqlerrm not like 'Nieprawidłowe dane%' then raise;end if;end;
 begin perform public.rejclass_topics_get('invalid');raise exception 'Brak sesji';exception when raise_exception then if sqlerrm not like 'Sesja wygasła%' then raise;end if;end;
 if has_table_privilege('anon','public.rejclass_topic_progress','select') or has_table_privilege('authenticated','public.rejclass_topic_progress','update') then raise exception 'Nieuprawniony dostęp';end if;
end $$;
rollback;

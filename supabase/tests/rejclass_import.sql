begin;
do $$
declare a uuid:=gen_random_uuid();t text:='token-import-test-only';r integer;j jsonb;begin
 insert into public.community_users(id,username,pin_hash) values(a,'T'||left(replace(a::text,'-',''),20),'test');
 insert into public.community_sessions(user_id,token_hash) values(a,encode(extensions.digest('rejson_comm_sess_v1:'||t,'sha256'),'hex'));
 perform public.rejclass_progress_set(t,'{"go":"known"}');
 r:=public.rejclass_progress_import(t,'{"go":"hard","burn":"hard"}');
 j:=public.rejclass_progress_get(t)->'entries';
 if r<>1 or j->>'go'<>'known' or j->>'burn'<>'hard' then raise exception 'Import nadpisał istniejący stan';end if;
 r:=public.rejclass_progress_import(t,'{"go":"hard","burn":"known"}');if r<>0 then raise exception 'Import nie jest idempotentny';end if;
 begin perform public.rejclass_progress_import(t,'{"not-a-verb":"known"}');raise exception 'Przyjęto nieznane słowo';exception when check_violation then null;end;
 begin perform public.rejclass_progress_import('invalid-token','{"go":"hard"}');raise exception 'Przyjęto błędną sesję';exception when raise_exception then if sqlerrm='Przyjęto błędną sesję' then raise;end if;end;
 if has_table_privilege('anon','public.rejclass_progress','select') or not has_function_privilege('anon','public.rejclass_progress_import(text,jsonb)','execute') then raise exception 'Błędne uprawnienia';end if;
end $$;
rollback;

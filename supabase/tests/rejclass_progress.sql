begin;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();ta text:='token-a-'||a::text;tb text:='token-b-'||b::text;r jsonb;begin
 insert into public.community_users(id,username,pin_hash) values(a,'T'||substr(replace(a::text,'-',''),1,20),'test'),(b,'T'||substr(replace(b::text,'-',''),1,20),'test');
 insert into public.community_sessions(user_id,token_hash) values(a,encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex')),(b,encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'));
 perform public.rejclass_progress_set(ta,'{"go":"known","burn":"hard"}'::jsonb);
 r:=public.rejclass_progress_get(ta);if r->>'user_id'<>a::text or r->'entries'->>'go'<>'known' or r->'entries'->>'burn'<>'hard' then raise exception 'odczyt postępów';end if;
 if public.rejclass_progress_get(tb)->'entries'<>'{}'::jsonb then raise exception 'wyciek do drugiego konta';end if;
 perform public.rejclass_progress_set(tb,'{"go":"hard"}'::jsonb);
 if public.rejclass_progress_get(ta)->'entries'->>'go'<>'known' then raise exception 'nadpisano inne konto';end if;
 begin perform public.rejclass_progress_get('nieprawidlowa-sesja');raise exception 'brak uwierzytelnienia';exception when raise_exception then if sqlerrm not like 'Sesja wygasła%' then raise;end if;end;
 begin perform public.rejclass_progress_set(ta,'{"bogus":"known"}'::jsonb);raise exception 'zly czasownik';exception when raise_exception then if sqlerrm not like 'Nieprawidłowe dane%' then raise;end if;end;
 begin perform public.rejclass_progress_set(ta,'{"go":"zly"}'::jsonb);raise exception 'zly status';exception when raise_exception then if sqlerrm not like 'Nieprawidłowe dane%' then raise;end if;end;
 if has_table_privilege('anon','public.rejclass_progress','select') or has_table_privilege('authenticated','public.rejclass_progress','update') then raise exception 'zly dostep';end if;
end $$;
rollback;

-- Regresja: PostgREST uruchamia STABLE w transakcji tylko do odczytu, ale
-- community_session_user aktualizuje last_seen_at. Ten test sprawdza metadane,
-- a nie tylko wywołanie w zwykłej transakcji, która maskuje problem.
begin;
do $$
declare f regprocedure;
begin
  foreach f in array array[
    'public.rejchat_room_list_v3(text,text,uuid,integer)'::regprocedure,
    'public.rejchat_get_photo(uuid,text)'::regprocedure
  ] loop
    if (select provolatile from pg_proc where oid = f) <> 'v' then
      raise exception 'RPC % musi być VOLATILE dla PostgREST', f;
    end if;
  end loop;
  if has_function_privilege('anon','public.rejchat_room_list_v2(text,uuid,integer)','execute')
     or has_table_privilege('anon','public.community_chat','select') then
    raise exception 'Anonimowy dostęp do czatu nie może być przywrócony';
  end if;
end $$;
rollback;

-- Import nigdy nie nadpisuje równoczesnych zmian innego urządzenia.
create function public.rejclass_progress_import(p_token text,p_entries jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare me record;item record;inserted integer;begin
 select * into me from public.community_session_user(p_token);
 if p_entries is null or jsonb_typeof(p_entries)<>'object' or length(p_entries::text)>10000 or (select count(*) from jsonb_object_keys(p_entries))>138 then raise exception 'Nieprawidłowe dane postępów.';end if;
 for item in select key,value from jsonb_each(p_entries) loop
  if jsonb_typeof(item.value)<>'string' or item.value #>> '{}' not in ('hard','known') then raise exception 'Nieprawidłowe dane postępów.';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('rejclass-progress:'||me.user_id::text,0));
 insert into public.rejclass_progress(user_id,verb,status) select me.user_id,key,value #>> '{}' from jsonb_each(p_entries) on conflict(user_id,verb) do nothing;
 get diagnostics inserted = row_count;return inserted;
end $$;
revoke all on function public.rejclass_progress_import(text,jsonb) from public,anon,authenticated;
grant execute on function public.rejclass_progress_import(text,jsonb) to anon,authenticated;

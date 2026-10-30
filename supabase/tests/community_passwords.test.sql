-- Uruchomić na bazie testowej lub jako jedna transakcja; końcowy ROLLBACK.
-- Nie wykorzystuje istniejących kont i nie ujawnia ich danych.
begin;
do $$
declare
  n text := 'rjtest' || substr(encode(extensions.gen_random_bytes(6),'hex'),1,12);
  n2 text := 'rjtest' || substr(encode(extensions.gen_random_bytes(6),'hex'),1,12);
  session1 text; session2 text; other_token text; uid uuid; result jsonb; i int;
begin
  session1 := public.community_register(n,'1234')->>'token';
  select id into uid from public.community_users where username=n;
  if session1 is null or (public.community_password_status(session1)->>'has_password')::boolean then raise exception 'PIN registration/status'; end if;
  session2 := public.community_login(n,'1234')->>'token';
  if session2 is null then raise exception 'PIN login'; end if;
  for i in 1..5 loop perform public.community_login(n,'0000'); end loop;
  if current_setting('response.status',true) <> '401' then raise exception 'wrong PIN response'; end if;
  perform public.community_login(n,'1234');
  if current_setting('response.status',true) <> '429' then raise exception 'throttle'; end if;
  update public.community_login_attempts set window_started=now()-interval '16 minutes' where user_id=uid;
  if public.community_login(n,'1234')->>'token' is null then raise exception 'throttle reset'; end if;
  result:=public.community_set_password(session1,'1234','TestoweHaslo_256!');
  if result->>'ok'<>'true' or public.community_password_status(session1)->>'has_password'<>'true' then raise exception 'password upgrade'; end if;
  if public.community_login(n,'1234') ? 'token' then raise exception 'PIN still works'; end if;
  if public.community_login(n,'TestoweHaslo_256!')->>'token' is null then raise exception 'password login'; end if;
  if public.community_whoami(session1)->>'username'<>n then raise exception 'old session lost'; end if;
  other_token:=public.community_register(n2,'HasloDrugiejOsoby!')->>'token';
  if other_token is null or public.community_login(n2,'HasloDrugiejOsoby!')->>'token' is null then raise exception 'password registration'; end if;
  if has_table_privilege('anon','public.community_login_attempts','select') or has_function_privilege('anon','public.community_auth_attempt(uuid)','execute') then raise exception 'attempt data exposed'; end if;
  perform set_config('request.headers','{"prefer":"tx=rollback"}',true);
  begin
    perform public.community_login(n,'0000');
    raise exception 'rollback preference allowed';
  exception when others then
    if sqlerrm <> 'Niedozwolona preferencja transakcji.' then raise; end if;
  end;
  perform set_config('request.headers','{}',true);
  result:=public.community_revoke_other_sessions(session1);
  if (result->>'removed')::int < 1 then raise exception 'revoke'; end if;
  if public.community_whoami(session1)->>'username'<>n or public.community_whoami(session2)->>'username' is not null or public.community_whoami(other_token)->>'username'<>n2 then raise exception 'session isolation'; end if;
end $$;
rollback;

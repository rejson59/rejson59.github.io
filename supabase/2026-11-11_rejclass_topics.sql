-- Osobne postępy tematów, bez ingerencji w dotychczasowe czasowniki.
create table public.rejclass_topic_progress (
 user_id uuid not null references public.community_users(id) on delete cascade,
 topic text not null check (topic = any(array['bio2-1','bio2-2','bio2-3','bio2-4','bio2-5','bio2-6','bio2-7'])),
 done boolean not null,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,topic)
);
alter table public.rejclass_topic_progress enable row level security;
revoke all on public.rejclass_topic_progress from public,anon,authenticated;
create function public.rejclass_topics_get(p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record;entries jsonb;begin
 select * into me from public.community_session_user(p_token);
 select coalesce(jsonb_object_agg(topic,done),'{}'::jsonb) into entries from public.rejclass_topic_progress where user_id=me.user_id;
 return jsonb_build_object('user_id',me.user_id,'username',me.username,'entries',entries);
end $$;
create function public.rejclass_topics_set(p_token text,p_entries jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record;item record;begin
 select * into me from public.community_session_user(p_token);
 if p_entries is null or jsonb_typeof(p_entries)<>'object' or length(p_entries::text)>1000 or (select count(*) from jsonb_object_keys(p_entries))>7 then raise exception 'Nieprawidłowe dane postępów.';end if;
 for item in select key,value from jsonb_each(p_entries) loop
  if item.key <> all(array['bio2-1','bio2-2','bio2-3','bio2-4','bio2-5','bio2-6','bio2-7']) or jsonb_typeof(item.value)<>'boolean' then raise exception 'Nieprawidłowe dane postępów.';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('rejclass-topics:'||me.user_id::text,0));
 insert into public.rejclass_topic_progress(user_id,topic,done) select me.user_id,key,(value #>> '{}')::boolean from jsonb_each(p_entries)
 on conflict(user_id,topic) do update set done=excluded.done,updated_at=clock_timestamp();
 return true;
end $$;
revoke all on function public.rejclass_topics_get(text),public.rejclass_topics_set(text,jsonb) from public,anon,authenticated;
grant execute on function public.rejclass_topics_get(text),public.rejclass_topics_set(text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';

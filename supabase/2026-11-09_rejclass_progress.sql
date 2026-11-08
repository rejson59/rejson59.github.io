-- Tylko właściciel sesji może odczytywać i zmieniać własne postępy RejClass.
create table public.rejclass_progress (
 user_id uuid not null references public.community_users(id) on delete cascade,
 verb text not null check (verb = any (array['arise','awake','be','bear','beat','become','begin','bend','bet','bind','bite','bleed','blow','break','breed','bring','broadcast','build','burn','buy','cast','catch','choose','cling','come','cost','cut','deal','dig','do','draw','dream','drink','drive','eat','feel','fight','find','fit','flee','fly','forbid','forecast','forget','forgive','freeze','get','give','go','grow','hang','have','hear','hide','hit','hold','hurt','keep','kneel','knit','know','lay','lead','lean','leap','learn','leave','lend','let','lie','light','lose','make','mean','meet','mistake','mow','overcome','oversleep','pay','prove','put','quit','read','rid','ride','ring','rise','run','say','see','seek','sell','send','set','sew','shake','shed','shine','shoot','show','shrink','shut','sing','sink','sit','sleep','slide','smell','speak','speed','spend','steal','stick','sting','stink','strike','swear','sweep','swell','swim','swing','take','teach','tear','tell','think','throw','thrust','undergo','understand','wake','wear','win','wind','withdraw','wring','write']::text[])),
 status text not null check (status in ('hard','known')),
 updated_at timestamptz not null default clock_timestamp(), primary key(user_id,verb)
);
alter table public.rejclass_progress enable row level security;
revoke all on public.rejclass_progress from public,anon,authenticated;
create function public.rejclass_progress_get(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me record;entries jsonb;begin
 select * into me from public.community_session_user(p_token);
 select coalesce(jsonb_object_agg(verb,status),'{}'::jsonb) into entries from public.rejclass_progress where user_id=me.user_id;
 return jsonb_build_object('user_id',me.user_id,'username',me.username,'entries',entries);
end $$;
create function public.rejclass_progress_set(p_token text,p_entries jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; item record;begin
 select * into me from public.community_session_user(p_token);
 if p_entries is null or jsonb_typeof(p_entries)<>'object' or length(p_entries::text)>10000 or (select count(*) from jsonb_object_keys(p_entries))>138 then raise exception 'Nieprawidłowe dane postępów.';end if;
 for item in select key,value from jsonb_each(p_entries) loop
  if item.key <> all(array['arise','awake','be','bear','beat','become','begin','bend','bet','bind','bite','bleed','blow','break','breed','bring','broadcast','build','burn','buy','cast','catch','choose','cling','come','cost','cut','deal','dig','do','draw','dream','drink','drive','eat','feel','fight','find','fit','flee','fly','forbid','forecast','forget','forgive','freeze','get','give','go','grow','hang','have','hear','hide','hit','hold','hurt','keep','kneel','knit','know','lay','lead','lean','leap','learn','leave','lend','let','lie','light','lose','make','mean','meet','mistake','mow','overcome','oversleep','pay','prove','put','quit','read','rid','ride','ring','rise','run','say','see','seek','sell','send','set','sew','shake','shed','shine','shoot','show','shrink','shut','sing','sink','sit','sleep','slide','smell','speak','speed','spend','steal','stick','sting','stink','strike','swear','sweep','swell','swim','swing','take','teach','tear','tell','think','throw','thrust','undergo','understand','wake','wear','win','wind','withdraw','wring','write']::text[]) or jsonb_typeof(item.value)<>'string' or item.value #>> '{}' not in ('hard','known') then raise exception 'Nieprawidłowe dane postępów.';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('rejclass-progress:'||me.user_id::text,0));
 insert into public.rejclass_progress(user_id,verb,status) select me.user_id,key,value #>> '{}' from jsonb_each(p_entries)
 on conflict(user_id,verb) do update set status=excluded.status,updated_at=clock_timestamp();
 return true;
end $$;
revoke all on function public.rejclass_progress_get(text),public.rejclass_progress_set(text,jsonb) from public,anon,authenticated;
grant execute on function public.rejclass_progress_get(text),public.rejclass_progress_set(text,jsonb) to anon,authenticated;

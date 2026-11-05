-- Limit dodawanych reakcji (także ponownego dodania po cofnięciu), wspólny dla czatu i DM.
create table public.rejchat_reaction_limits (
  user_id uuid primary key references public.community_users(id) on delete cascade,
  minute_start timestamptz not null default now(), minute_count integer not null default 0,
  day_start timestamptz not null default now(), day_count integer not null default 0
);
alter table public.rejchat_reaction_limits enable row level security;
revoke all on public.rejchat_reaction_limits from public,anon,authenticated;
create function public.rejchat_limit_reaction() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.rejchat_reaction_limits%rowtype;
begin
 insert into public.rejchat_reaction_limits(user_id) values(new.user_id) on conflict(user_id) do nothing;
 select * into r from public.rejchat_reaction_limits where user_id=new.user_id for update;
 if r.minute_start<=now()-interval '1 minute' then r.minute_start:=now(); r.minute_count:=0; end if;
 if r.day_start<=now()-interval '1 day' then r.day_start:=now(); r.day_count:=0; end if;
 if r.minute_count>=60 or r.day_count>=1000 then raise exception 'Limit reakcji. Spróbuj później.'; end if;
 update public.rejchat_reaction_limits set minute_start=r.minute_start,minute_count=r.minute_count+1,day_start=r.day_start,day_count=r.day_count+1 where user_id=new.user_id;
 return new;
end $$;
revoke all on function public.rejchat_limit_reaction() from public,anon,authenticated;
create trigger rejchat_chat_reaction_limit before insert on public.rejchat_chat_reactions for each row execute function public.rejchat_limit_reaction();
create trigger rejchat_dm_reaction_limit before insert on public.rejchat_dm_reactions for each row execute function public.rejchat_limit_reaction();

-- Przypięcia i wyszukiwanie: sesja i uczestnictwo w DM zawsze sprawdzane na serwerze.
create table public.rejchat_room_pins (room text primary key check(room in ('general','links')),message_id uuid not null references public.community_chat(id) on delete cascade,pinned_by uuid not null references public.community_users(id) on delete cascade,pinned_at timestamptz not null default now());
create table public.rejchat_dm_pins (thread_id uuid primary key references public.rejchat_dm_threads(id) on delete cascade,message_id uuid not null references public.rejchat_dm_messages(id) on delete cascade,pinned_by uuid not null references public.community_users(id) on delete cascade,pinned_at timestamptz not null default now());
create table public.rejchat_search_usage (user_id uuid primary key references public.community_users(id) on delete cascade,period_start timestamptz not null,searches integer not null);
alter table public.rejchat_room_pins enable row level security;alter table public.rejchat_dm_pins enable row level security;alter table public.rejchat_search_usage enable row level security;
revoke all on public.rejchat_room_pins,public.rejchat_dm_pins,public.rejchat_search_usage from public,anon,authenticated;
create function public.rejchat_pinned(p_token text,p_scope text,p_room text,p_thread_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me record;result jsonb;begin
 select * into me from public.community_session_user(p_token);
 if p_scope='public' and p_room in ('general','links') then
  select jsonb_build_object('id',m.id,'author',m.author_name,'content',m.content,'pinned_at',p.pinned_at,'can_unpin',coalesce((select is_owner from public.community_users where id=me.user_id),false)) into result from public.rejchat_room_pins p join public.community_chat m on m.id=p.message_id and m.room=p.room where p.room=p_room;
 elsif p_scope='private' then
  if not exists(select 1 from public.rejchat_dm_threads t where t.id=p_thread_id and me.user_id in (t.user_low,t.user_high)) then raise exception 'Rozmowa jest niedostępna.';end if;
  select jsonb_build_object('id',m.id,'author',u.username,'content',m.content,'pinned_at',p.pinned_at,'can_unpin',true) into result from public.rejchat_dm_pins p join public.rejchat_dm_messages m on m.id=p.message_id and m.thread_id=p.thread_id join public.community_users u on u.id=m.author_id where p.thread_id=p_thread_id;
 else raise exception 'Nieznana rozmowa.';end if;
 return coalesce(result,'null'::jsonb);
end $$;
create function public.rejchat_pin_message(p_token text,p_scope text,p_message_id uuid,p_pin boolean) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare me record;rm text;tid uuid;lo uuid;hi uuid;n integer;begin
 select * into me from public.community_session_user(p_token);if p_pin is null then raise exception 'Nieprawidłowa operacja.';end if;
 if p_scope='public' then
  if not coalesce((select is_owner from public.community_users where id=me.user_id),false) then raise exception 'Tylko właściciel może przypinać wiadomości w pokojach publicznych.';end if;
  select room into rm from public.community_chat where id=p_message_id;if rm is null then raise exception 'Wiadomość jest niedostępna.';end if;
  if p_pin then insert into public.rejchat_room_pins(room,message_id,pinned_by) values(rm,p_message_id,me.user_id) on conflict(room) do update set message_id=excluded.message_id,pinned_by=excluded.pinned_by,pinned_at=now();return true;
  else delete from public.rejchat_room_pins where room=rm and message_id=p_message_id;get diagnostics n=row_count;return n>0;end if;
 elsif p_scope='private' then
  select m.thread_id into tid from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id where m.id=p_message_id and me.user_id in (t.user_low,t.user_high);
  if tid is null then raise exception 'Wiadomość jest niedostępna.';end if;
  if p_pin then
   select user_low,user_high into lo,hi from public.rejchat_dm_threads where id=tid;perform public.rejchat_pair_lock(lo,hi);
   if exists(select 1 from public.rejchat_user_blocks b where (b.blocker_id=lo and b.blocked_id=hi) or (b.blocker_id=hi and b.blocked_id=lo)) then raise exception 'Nie można przypiąć wiadomości w tej rozmowie.';end if;
  end if;
  if p_pin then insert into public.rejchat_dm_pins(thread_id,message_id,pinned_by) values(tid,p_message_id,me.user_id) on conflict(thread_id) do update set message_id=excluded.message_id,pinned_by=excluded.pinned_by,pinned_at=now();return true;
  else delete from public.rejchat_dm_pins where thread_id=tid and message_id=p_message_id;get diagnostics n=row_count;return n>0;end if;
 else raise exception 'Nieznana rozmowa.';end if;
end $$;
create function public.rejchat_search_messages(p_token text,p_scope text,p_room text,p_thread_id uuid,p_query text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me record;q text:=lower(btrim(coalesce(p_query,'')));used record;result jsonb;begin
 select * into me from public.community_session_user(p_token);
 if char_length(q)<2 or char_length(q)>100 then raise exception 'Wpisz od 2 do 100 znaków.';end if;
 if p_scope='public' then if p_room is null or p_room not in ('general','links') then raise exception 'Nieznany pokój.';end if;
 elsif p_scope='private' then if not exists(select 1 from public.rejchat_dm_threads t where t.id=p_thread_id and me.user_id in (t.user_low,t.user_high)) then raise exception 'Rozmowa jest niedostępna.';end if;
 else raise exception 'Nieznana rozmowa.';end if;
 perform pg_advisory_xact_lock(hashtextextended('rejchat-search:'||me.user_id::text,0));
 select * into used from public.rejchat_search_usage where user_id=me.user_id;
 if used.user_id is not null and used.period_start>clock_timestamp()-interval '1 minute' and used.searches>=20 then raise exception 'Zbyt wiele wyszukiwań. Spróbuj za chwilę.';end if;
 insert into public.rejchat_search_usage(user_id,period_start,searches) values(me.user_id,clock_timestamp(),1) on conflict(user_id) do update set period_start=case when rejchat_search_usage.period_start<=clock_timestamp()-interval '1 minute' then clock_timestamp() else rejchat_search_usage.period_start end, searches=case when rejchat_search_usage.period_start<=clock_timestamp()-interval '1 minute' then 1 else rejchat_search_usage.searches+1 end;
 if p_scope='public' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into result from (select m.id,m.author_name as author,m.content,m.created_at from public.community_chat m where m.room=p_room and (strpos(lower(m.content),q)>0 or strpos(lower(m.author_name),q)>0) order by m.created_at desc,m.id desc limit 50) x;
 else
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into result from (select m.id,u.username as author,m.content,m.created_at from public.rejchat_dm_messages m join public.community_users u on u.id=m.author_id where m.thread_id=p_thread_id and (strpos(lower(m.content),q)>0 or strpos(lower(u.username),q)>0) order by m.created_at desc,m.id desc limit 50) x;
 end if;
 return result;
end $$;
revoke all on function public.rejchat_pinned(text,text,text,uuid),public.rejchat_pin_message(text,text,uuid,boolean),public.rejchat_search_messages(text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.rejchat_pinned(text,text,text,uuid),public.rejchat_pin_message(text,text,uuid,boolean),public.rejchat_search_messages(text,text,text,uuid,text) to anon,authenticated;

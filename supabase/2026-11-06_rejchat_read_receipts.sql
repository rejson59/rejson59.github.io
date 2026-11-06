-- Potwierdzenia widocznych wiadomości i autorzy reakcji. Konta strony używają własnej sesji.
create table public.rejchat_room_reads (
  message_id uuid not null references public.community_chat(id) on delete cascade,
  user_id uuid not null references public.community_users(id) on delete cascade,
  seen_at timestamptz not null default now(), primary key(message_id,user_id)
);
create table public.rejchat_dm_reads (
  message_id uuid not null references public.rejchat_dm_messages(id) on delete cascade,
  user_id uuid not null references public.community_users(id) on delete cascade,
  seen_at timestamptz not null default now(), primary key(message_id,user_id)
);
alter table public.rejchat_room_reads enable row level security;
alter table public.rejchat_dm_reads enable row level security;
revoke all on public.rejchat_room_reads, public.rejchat_dm_reads from public,anon,authenticated;

create function public.rejchat_mark_seen(p_token text,p_scope text,p_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; n integer;
begin
 select * into me from public.community_session_user(p_token);
 if coalesce(cardinality(p_ids),0)>50 then raise exception 'Zbyt wiele wiadomości.';end if;
 if p_scope='public' then
   insert into public.rejchat_room_reads(message_id,user_id)
   select m.id,me.user_id from public.community_chat m where m.id=any(p_ids) and m.author_id<>me.user_id
   on conflict do nothing;
 elsif p_scope='private' then
   if exists(select 1 from unnest(p_ids) i(id) where not exists(select 1 from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id where m.id=i.id and (t.user_low=me.user_id or t.user_high=me.user_id))) then raise exception 'Wiadomość jest niedostępna.';end if;
   insert into public.rejchat_dm_reads(message_id,user_id)
   select m.id,me.user_id from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id
   where m.id=any(p_ids) and m.author_id<>me.user_id and (t.user_low=me.user_id or t.user_high=me.user_id)
   on conflict do nothing;
 else raise exception 'Nieznany rodzaj rozmowy.'; end if;
 get diagnostics n=row_count; return n;
end $$;

create function public.rejchat_message_details(p_token text,p_scope text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; readers jsonb; reactions jsonb; total integer;
begin
 select * into me from public.community_session_user(p_token);
 if p_scope='public' then
   if not exists(select 1 from public.community_chat where id=p_id) then raise exception 'Wiadomość jest niedostępna.'; end if;
   select count(*)::integer into total from public.rejchat_room_reads where message_id=p_id;
   select coalesce(jsonb_agg(to_jsonb(x) order by x.seen_at,x.username),'[]'::jsonb) into readers from (select u.username,r.seen_at from public.rejchat_room_reads r join public.community_users u on u.id=r.user_id where r.message_id=p_id order by r.seen_at,u.username limit 100) x;
   select coalesce(jsonb_agg(to_jsonb(x) order by x.emoji,x.username),'[]'::jsonb) into reactions from (select r.emoji,u.username from public.rejchat_chat_reactions r join public.community_users u on u.id=r.user_id where r.message_id=p_id order by r.emoji,u.username limit 500) x;
 elsif p_scope='private' then
   if not exists(select 1 from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id where m.id=p_id and (t.user_low=me.user_id or t.user_high=me.user_id)) then raise exception 'Wiadomość jest niedostępna.'; end if;
   select count(*)::integer into total from public.rejchat_dm_reads where message_id=p_id;
   select coalesce(jsonb_agg(to_jsonb(x) order by x.seen_at,x.username),'[]'::jsonb) into readers from (select u.username,r.seen_at from public.rejchat_dm_reads r join public.community_users u on u.id=r.user_id where r.message_id=p_id order by r.seen_at,u.username limit 100) x;
   select coalesce(jsonb_agg(to_jsonb(x) order by x.emoji,x.username),'[]'::jsonb) into reactions from (select r.emoji,u.username from public.rejchat_dm_reactions r join public.community_users u on u.id=r.user_id where r.message_id=p_id order by r.emoji,u.username limit 500) x;
 else raise exception 'Nieznany rodzaj rozmowy.'; end if;
 return jsonb_build_object('readers',readers,'reader_count',total,'reactions',reactions);
end $$;
revoke all on function public.rejchat_mark_seen(text,text,uuid[]),public.rejchat_message_details(text,text,uuid) from public,anon,authenticated;
grant execute on function public.rejchat_mark_seen(text,text,uuid[]),public.rejchat_message_details(text,text,uuid) to anon,authenticated;
notify pgrst,'reload schema';

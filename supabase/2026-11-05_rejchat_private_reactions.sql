-- Prywatne rozmowy i reakcje. Tokeny są weryfikowane przez istniejące konto strony.
-- Brak bezpośredniego dostępu do tabel, brak kopiowania poprzedniej historii.
create table public.rejchat_dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.community_users(id) on delete cascade,
  user_high uuid not null references public.community_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_low < user_high), unique (user_low,user_high)
);
create table public.rejchat_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.rejchat_dm_threads(id) on delete cascade,
  author_id uuid not null references public.community_users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now(), read_at timestamptz
);
create index rejchat_dm_messages_thread_time_idx on public.rejchat_dm_messages(thread_id,created_at desc,id desc);
create index rejchat_dm_messages_author_time_idx on public.rejchat_dm_messages(author_id,created_at desc);
create table public.rejchat_dm_reactions (
  message_id uuid not null references public.rejchat_dm_messages(id) on delete cascade,
  user_id uuid not null references public.community_users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢')),
  primary key (message_id,user_id,emoji)
);
create table public.rejchat_chat_reactions (
  message_id uuid not null references public.community_chat(id) on delete cascade,
  user_id uuid not null references public.community_users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢')),
  primary key (message_id,user_id,emoji)
);
alter table public.rejchat_dm_threads enable row level security;
alter table public.rejchat_dm_messages enable row level security;
alter table public.rejchat_dm_reactions enable row level security;
alter table public.rejchat_chat_reactions enable row level security;
revoke all on public.rejchat_dm_threads, public.rejchat_dm_messages, public.rejchat_dm_reactions, public.rejchat_chat_reactions from public, anon, authenticated;

create function public.rejchat_dm_open(p_token text, p_username text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; other_user record; result uuid; lo uuid; hi uuid;
begin
  select * into me from public.community_session_user(p_token);
  select id,username into other_user from public.community_users where username_lower=lower(btrim(coalesce(p_username,'')));
  if other_user.id is null then raise exception 'Nie znaleziono takiego konta.'; end if;
  if other_user.id=me.user_id then raise exception 'Wybierz inne konto.'; end if;
  lo:=least(me.user_id,other_user.id); hi:=greatest(me.user_id,other_user.id);
  perform pg_advisory_xact_lock(hashtextextended('rejchat-dm-open:'||me.user_id::text,0));
  select id into result from public.rejchat_dm_threads where user_low=lo and user_high=hi;
  if result is null then
    if (select count(*) from public.rejchat_dm_threads where user_low=me.user_id or user_high=me.user_id)>=200 then raise exception 'Osiągnięto limit rozmów.'; end if;
    insert into public.rejchat_dm_threads(user_low,user_high) values(lo,hi)
      on conflict(user_low,user_high) do update set user_low=excluded.user_low returning id into result;
  end if;
  return jsonb_build_object('id',result,'username',other_user.username);
end $$;

create function public.rejchat_dm_inbox(p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; result jsonb;
begin
  select * into me from public.community_session_user(p_token);
  select coalesce(jsonb_agg(to_jsonb(q) order by q.last_at desc,q.id desc),'[]'::jsonb) into result from (
    select t.id,u.username, last.created_at as last_at,
      (select count(*)::integer from public.rejchat_dm_messages m where m.thread_id=t.id and m.author_id<>me.user_id and m.read_at is null) as unread
    from public.rejchat_dm_threads t
    join public.community_users u on u.id=case when t.user_low=me.user_id then t.user_high else t.user_low end
    join lateral (select created_at from public.rejchat_dm_messages m where m.thread_id=t.id order by m.created_at desc,m.id desc limit 1) last on true
    where t.user_low=me.user_id or t.user_high=me.user_id
    order by last.created_at desc,t.id desc limit 200
  ) q;
  return result;
end $$;

create function public.rejchat_dm_list(p_token text,p_thread_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; other_name text; result jsonb;
begin
  select * into me from public.community_session_user(p_token);
  select u.username into other_name from public.rejchat_dm_threads t join public.community_users u on u.id=case when t.user_low=me.user_id then t.user_high else t.user_low end
    where t.id=p_thread_id and (t.user_low=me.user_id or t.user_high=me.user_id);
  if other_name is null then raise exception 'Rozmowa jest niedostępna.'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.id),'[]'::jsonb) into result from (
    select m.id,m.content,m.created_at,u.username as author_name,(m.author_id=me.user_id) as mine,
      coalesce((select jsonb_agg(jsonb_build_object('emoji',r.emoji,'count',r.n,'mine',r.mine) order by r.emoji) from (
        select emoji,count(*)::integer n,bool_or(user_id=me.user_id) mine from public.rejchat_dm_reactions where message_id=m.id group by emoji
      ) r),'[]'::jsonb) as reactions
    from public.rejchat_dm_messages m join public.community_users u on u.id=m.author_id
    where m.thread_id=p_thread_id order by m.created_at desc,m.id desc limit 100
  ) q;
  update public.rejchat_dm_messages m set read_at=now() where m.thread_id=p_thread_id and m.author_id<>me.user_id and m.read_at is null
    and m.id in (select (x->>'id')::uuid from jsonb_array_elements(result) x);
  return jsonb_build_object('username',other_name,'messages',result);
end $$;

create function public.rejchat_dm_send(p_token text,p_thread_id uuid,p_content text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; content text:=btrim(coalesce(p_content,'')); msg_id uuid; at_time timestamptz;
begin
  select * into me from public.community_session_user(p_token);
  if not exists(select 1 from public.rejchat_dm_threads t where t.id=p_thread_id and (t.user_low=me.user_id or t.user_high=me.user_id)) then raise exception 'Rozmowa jest niedostępna.'; end if;
  if char_length(content)<1 or char_length(content)>1000 then raise exception 'Wiadomość musi mieć od 1 do 1000 znaków.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rejchat-dm-send:'||me.user_id::text,0));
  if exists(select 1 from public.rejchat_dm_messages where author_id=me.user_id and created_at>now()-interval '2 seconds') then raise exception 'Odczekaj 2 sekundy przed następną wiadomością.'; end if;
  if (select count(*) from public.rejchat_dm_messages where author_id=me.user_id and created_at>now()-interval '10 minutes')>=30 then raise exception 'Limit wiadomości. Spróbuj za kilka minut.'; end if;
  if (select count(*) from public.rejchat_dm_messages where thread_id=p_thread_id)>=10000 then raise exception 'Ta rozmowa osiągnęła limit wiadomości.'; end if;
  insert into public.rejchat_dm_messages(thread_id,author_id,content) values(p_thread_id,me.user_id,content) returning id,created_at into msg_id,at_time;
  return jsonb_build_object('id',msg_id,'created_at',at_time);
end $$;

create function public.rejchat_dm_read_all(p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; n integer;
begin
  select * into me from public.community_session_user(p_token);
  update public.rejchat_dm_messages m set read_at=now() from public.rejchat_dm_threads t
    where m.thread_id=t.id and (t.user_low=me.user_id or t.user_high=me.user_id) and m.author_id<>me.user_id and m.read_at is null;
  get diagnostics n=row_count; return jsonb_build_object('marked',n);
end $$;

create function public.rejchat_reactions_list(p_ids uuid[],p_token text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; me_id uuid; result jsonb;
begin
  if coalesce(array_length(p_ids,1),0)>100 then raise exception 'Zbyt wiele wiadomości.'; end if;
  if p_token is not null and btrim(p_token)<>'' then select * into me from public.community_session_user(p_token); me_id:=me.user_id; end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
    select r.message_id,r.emoji,count(*)::integer as count,coalesce(bool_or(r.user_id=me_id),false) as mine
    from public.rejchat_chat_reactions r join public.community_chat m on m.id=r.message_id
    where r.message_id=any(p_ids) group by r.message_id,r.emoji
  ) q; return result;
end $$;

create function public.rejchat_react(p_token text,p_scope text,p_message_id uuid,p_emoji text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; n integer;
begin
  select * into me from public.community_session_user(p_token);
  if p_emoji not in ('👍','❤️','😂','😮','😢') or p_emoji is null then raise exception 'Nieznana reakcja.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rejchat-react:'||me.user_id::text,0));
  if p_scope='public' then
    if not exists(select 1 from public.community_chat where id=p_message_id) then raise exception 'Wiadomość jest niedostępna.'; end if;
    delete from public.rejchat_chat_reactions where message_id=p_message_id and user_id=me.user_id and emoji=p_emoji;
    get diagnostics n=row_count;
    if n=0 then insert into public.rejchat_chat_reactions(message_id,user_id,emoji) values(p_message_id,me.user_id,p_emoji); end if;
  elsif p_scope='private' then
    if not exists(select 1 from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id where m.id=p_message_id and (t.user_low=me.user_id or t.user_high=me.user_id)) then raise exception 'Wiadomość jest niedostępna.'; end if;
    delete from public.rejchat_dm_reactions where message_id=p_message_id and user_id=me.user_id and emoji=p_emoji;
    get diagnostics n=row_count;
    if n=0 then insert into public.rejchat_dm_reactions(message_id,user_id,emoji) values(p_message_id,me.user_id,p_emoji); end if;
  else raise exception 'Nieznany rodzaj rozmowy.'; end if;
  return jsonb_build_object('active',n=0);
end $$;
revoke all on function public.rejchat_dm_open(text,text), public.rejchat_dm_inbox(text), public.rejchat_dm_list(text,uuid), public.rejchat_dm_send(text,uuid,text), public.rejchat_dm_read_all(text), public.rejchat_reactions_list(uuid[],text), public.rejchat_react(text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.rejchat_dm_open(text,text), public.rejchat_dm_inbox(text), public.rejchat_dm_list(text,uuid), public.rejchat_dm_send(text,uuid,text), public.rejchat_dm_read_all(text), public.rejchat_reactions_list(uuid[],text), public.rejchat_react(text,text,uuid,text) to anon, authenticated;

-- Stronicowanie starszych wiadomości; odczyt dotyczy tylko zwróconych pozycji.
create function public.rejchat_dm_history(p_token text,p_thread_id uuid,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; result jsonb;
begin
  select * into me from public.community_session_user(p_token);
  if not exists(select 1 from public.rejchat_dm_threads where id=p_thread_id and (user_low=me.user_id or user_high=me.user_id)) then raise exception 'Rozmowa jest niedostępna.'; end if;
  if not exists(select 1 from public.rejchat_dm_messages where id=p_before_id and thread_id=p_thread_id and created_at=p_before) then raise exception 'Nie znaleziono punktu historii.'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.id),'[]'::jsonb) into result from (
    select m.id,m.content,m.created_at,u.username as author_name,(m.author_id=me.user_id) as mine,
      coalesce((select jsonb_agg(jsonb_build_object('emoji',r.emoji,'count',r.n,'mine',r.mine) order by r.emoji) from (
        select emoji,count(*)::integer n,bool_or(user_id=me.user_id) mine from public.rejchat_dm_reactions where message_id=m.id group by emoji
      ) r),'[]'::jsonb) as reactions
    from public.rejchat_dm_messages m join public.community_users u on u.id=m.author_id
    where m.thread_id=p_thread_id and (m.created_at,m.id)<(p_before,p_before_id)
    order by m.created_at desc,m.id desc limit 100
  ) q;
  update public.rejchat_dm_messages m set read_at=now() where m.thread_id=p_thread_id and m.author_id<>me.user_id and m.read_at is null
    and m.id in (select (x->>'id')::uuid from jsonb_array_elements(result) x);
  return result;
end $$;
revoke all on function public.rejchat_dm_history(text,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.rejchat_dm_history(text,uuid,timestamptz,uuid) to anon,authenticated;

-- Reakcje do wiadomości publicznych tworzą autentyczne powiadomienie autora.
alter table public.rejchat_chat_reactions add column id uuid not null default gen_random_uuid() unique;
alter table public.rejchat_chat_reactions add column created_at timestamptz not null default now();
alter table public.rejchat_chat_reactions add column read_at timestamptz;
create function public.rejchat_reaction_inbox(p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; items jsonb; unread integer;
begin
  select * into me from public.community_session_user(p_token);
  select count(*)::integer into unread from public.rejchat_chat_reactions r join public.community_chat m on m.id=r.message_id
    where m.author_id=me.user_id and r.user_id<>me.user_id and r.read_at is null;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into items from (
    select r.id,r.message_id,r.emoji,r.created_at,u.username as actor_name
    from public.rejchat_chat_reactions r join public.community_chat m on m.id=r.message_id join public.community_users u on u.id=r.user_id
    where m.author_id=me.user_id and r.user_id<>me.user_id and r.read_at is null order by r.created_at desc,r.id desc limit 50
  ) q;
  return jsonb_build_object('items',items,'unread',unread);
end $$;
create function public.rejchat_reaction_read(p_token text,p_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; n integer;
begin
  select * into me from public.community_session_user(p_token);
  if coalesce(array_length(p_ids,1),0)>100 then raise exception 'Zbyt wiele powiadomień.'; end if;
  update public.rejchat_chat_reactions r set read_at=now() from public.community_chat m
    where m.id=r.message_id and m.author_id=me.user_id and r.user_id<>me.user_id and r.read_at is null and (p_ids is null or r.id=any(p_ids));
  get diagnostics n=row_count; return jsonb_build_object('marked',n);
end $$;
revoke all on function public.rejchat_reaction_inbox(text), public.rejchat_reaction_read(text,uuid[]) from public,anon,authenticated;
grant execute on function public.rejchat_reaction_inbox(text), public.rejchat_reaction_read(text,uuid[]) to anon,authenticated;

-- Powiadomienia o reakcjach także do prywatnych wiadomości, wyłącznie dla autora.
alter table public.rejchat_dm_reactions add column id uuid not null default gen_random_uuid() unique;
alter table public.rejchat_dm_reactions add column created_at timestamptz not null default now();
alter table public.rejchat_dm_reactions add column read_at timestamptz;
create or replace function public.rejchat_reaction_inbox(p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; items jsonb; unread integer;
begin
  select * into me from public.community_session_user(p_token);
  select count(*)::integer into unread from (
    select r.id from public.rejchat_chat_reactions r join public.community_chat m on m.id=r.message_id where m.author_id=me.user_id and r.user_id<>me.user_id and r.read_at is null
    union all select r.id from public.rejchat_dm_reactions r join public.rejchat_dm_messages m on m.id=r.message_id join public.rejchat_dm_threads t on t.id=m.thread_id where m.author_id=me.user_id and (t.user_low=me.user_id or t.user_high=me.user_id) and r.user_id<>me.user_id and r.read_at is null
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into items from (
    select * from (
      select r.id,r.message_id,r.emoji,r.created_at,u.username as actor_name,'public'::text as scope,null::uuid as thread_id
      from public.rejchat_chat_reactions r join public.community_chat m on m.id=r.message_id join public.community_users u on u.id=r.user_id
      where m.author_id=me.user_id and r.user_id<>me.user_id and r.read_at is null
      union all
      select r.id,r.message_id,r.emoji,r.created_at,u.username,'private'::text,m.thread_id
      from public.rejchat_dm_reactions r join public.rejchat_dm_messages m on m.id=r.message_id join public.rejchat_dm_threads t on t.id=m.thread_id join public.community_users u on u.id=r.user_id
      where m.author_id=me.user_id and (t.user_low=me.user_id or t.user_high=me.user_id) and r.user_id<>me.user_id and r.read_at is null
    ) all_notes order by created_at desc,id desc limit 50
  ) q;
  return jsonb_build_object('items',items,'unread',unread);
end $$;
create or replace function public.rejchat_reaction_read(p_token text,p_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; n integer; n2 integer;
begin
  select * into me from public.community_session_user(p_token);
  if coalesce(array_length(p_ids,1),0)>100 then raise exception 'Zbyt wiele powiadomień.'; end if;
  update public.rejchat_chat_reactions r set read_at=now() from public.community_chat m where m.id=r.message_id and m.author_id=me.user_id and r.user_id<>me.user_id and r.read_at is null and (p_ids is null or r.id=any(p_ids));
  get diagnostics n=row_count;
  update public.rejchat_dm_reactions r set read_at=now() from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id where m.id=r.message_id and m.author_id=me.user_id and (t.user_low=me.user_id or t.user_high=me.user_id) and r.user_id<>me.user_id and r.read_at is null and (p_ids is null or r.id=any(p_ids));
  get diagnostics n2=row_count; return jsonb_build_object('marked',n+n2);
end $$;

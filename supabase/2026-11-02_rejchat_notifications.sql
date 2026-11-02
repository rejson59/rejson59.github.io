-- Powiadomienia powstają wyłącznie z nowych, rzeczywistych zdarzeń.
-- Istniejące wpisy, komentarze i konta nie są modyfikowane ani importowane.
create table if not exists public.rejchat_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.community_users(id) on delete cascade,
  actor_id uuid not null references public.community_users(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  kind text not null check (kind in ('comment', 'reply', 'like')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check ((kind = 'like') = (comment_id is null))
);
create index if not exists rejchat_notifications_recipient_idx on public.rejchat_notifications (recipient_id, created_at desc, id desc);
create unique index if not exists rejchat_notifications_like_idx on public.rejchat_notifications (recipient_id, actor_id, post_id) where kind = 'like';
create unique index if not exists rejchat_notifications_comment_idx on public.rejchat_notifications (recipient_id, comment_id) where comment_id is not null;
alter table public.rejchat_notifications enable row level security;
revoke all on public.rejchat_notifications from public, anon, authenticated;

create or replace function public.rejchat_notify_comment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare post_owner uuid; parent_owner uuid;
begin
  select author_id into post_owner from public.community_posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.author_id then
    insert into public.rejchat_notifications(recipient_id, actor_id, post_id, comment_id, kind, created_at)
    values(post_owner, new.author_id, new.post_id, new.id, 'comment', new.created_at) on conflict do nothing;
  end if;
  if new.parent_id is not null then
    select author_id into parent_owner from public.community_comments where id = new.parent_id and post_id = new.post_id;
    if parent_owner is not null and parent_owner <> new.author_id and parent_owner is distinct from post_owner then
      insert into public.rejchat_notifications(recipient_id, actor_id, post_id, comment_id, kind, created_at)
      values(parent_owner, new.author_id, new.post_id, new.id, 'reply', new.created_at) on conflict do nothing;
    end if;
  end if;
  return new;
exception when others then
  raise warning 'rejchat comment notification failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists rejchat_notify_comment_trigger on public.community_comments;
create trigger rejchat_notify_comment_trigger after insert on public.community_comments for each row execute function public.rejchat_notify_comment();

create or replace function public.rejchat_notify_like() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare post_owner uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.rejchat_notifications where kind = 'like' and post_id = old.post_id and actor_id = old.user_id;
    return old;
  end if;
  select author_id into post_owner from public.community_posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into public.rejchat_notifications(recipient_id, actor_id, post_id, kind, created_at)
    values(post_owner, new.user_id, new.post_id, 'like', new.created_at) on conflict do nothing;
  end if;
  return new;
exception when others then
  raise warning 'rejchat like notification failed: %', sqlerrm;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists rejchat_notify_like_trigger on public.community_likes;
create trigger rejchat_notify_like_trigger after insert or delete on public.community_likes for each row execute function public.rejchat_notify_like();

create or replace function public.rejchat_notifications_list(p_token text, p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me record; result jsonb; unread integer;
begin
  select * into me from public.community_session_user(p_token);
  select count(*)::integer into unread from public.rejchat_notifications n where n.recipient_id = me.user_id and n.read_at is null;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb) into result from (
    select n.id, n.kind, n.post_id, n.comment_id, n.created_at, n.read_at, u.username as actor_name
    from public.rejchat_notifications n join public.community_users u on u.id = n.actor_id
    where n.recipient_id = me.user_id order by n.created_at desc, n.id desc limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) q;
  return jsonb_build_object('items', result, 'unread', unread);
end $$;
create or replace function public.rejchat_notifications_read(p_token text, p_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me record; changed integer;
begin
  select * into me from public.community_session_user(p_token);
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'Zbyt wiele powiadomień.'; end if;
  update public.rejchat_notifications set read_at = now()
  where recipient_id = me.user_id and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics changed = row_count;
  return jsonb_build_object('marked', changed);
end $$;
revoke all on function public.rejchat_notify_comment() from public, anon, authenticated;
revoke all on function public.rejchat_notify_like() from public, anon, authenticated;
revoke all on function public.rejchat_notifications_list(text, integer) from public;
revoke all on function public.rejchat_notifications_read(text, uuid[]) from public;
grant execute on function public.rejchat_notifications_list(text, integer) to anon, authenticated;
grant execute on function public.rejchat_notifications_read(text, uuid[]) to anon, authenticated;

-- Powrót do właściwego wpisu także wtedy, gdy nie należy on do ostatnich 40.
create or replace function public.rejchat_notification_post(p_token text, p_notification_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me record; result jsonb;
begin
  select * into me from public.community_session_user(p_token);
  select jsonb_build_object('id', p.id, 'author_name', p.author_name,
    'is_owner', coalesce(u.is_owner, false), 'is_bot', coalesce(u.is_bot, false),
    'content', p.content, 'media', p.media, 'tags', coalesce(p.tags, '{}'), 'created_at', p.created_at,
    'comments_count', (select count(*)::integer from public.community_comments c where c.post_id = p.id),
    'likes_count', (select count(*)::integer from public.community_likes l where l.post_id = p.id),
    'has_liked', exists(select 1 from public.community_likes l where l.post_id = p.id and l.user_id = me.user_id))
  into result from public.rejchat_notifications n
    join public.community_posts p on p.id = n.post_id
    left join public.community_users u on u.id = p.author_id
  where n.id = p_notification_id and n.recipient_id = me.user_id;
  return result;
end $$;
revoke all on function public.rejchat_notification_post(text, uuid) from public;
grant execute on function public.rejchat_notification_post(text, uuid) to anon, authenticated;

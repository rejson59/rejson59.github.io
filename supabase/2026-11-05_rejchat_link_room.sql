-- Dwa publiczne pokoje współdzielą moderację, reakcje, limit i retencję czatu.
alter table public.community_chat add column room text not null default 'general' check (room in ('general','links'));
create index community_chat_room_created_idx on public.community_chat(room,created_at desc,id desc);

create function public.rejchat_room_list(p_room text,p_after_id uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,50),100)); v_after timestamptz;
begin
 if p_room is null or p_room not in ('general','links') then raise exception 'Nieznany pokój.'; end if;
 if p_after_id is not null then
  select created_at into v_after from public.community_chat where id=p_after_id and room=p_room;
  if v_after is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at,q.id) from (
   select m.id,m.author_name,m.content,m.created_at,coalesce(u.is_owner,false) is_owner,coalesce(u.is_bot,false) is_bot
   from public.community_chat m left join public.community_users u on u.id=m.author_id
   where m.room=p_room and (m.created_at,m.id)>(v_after,p_after_id) order by m.created_at,m.id limit v_limit
  ) q),'[]'::jsonb);
 end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at,q.id) from (
  select m.id,m.author_name,m.content,m.created_at,coalesce(u.is_owner,false) is_owner,coalesce(u.is_bot,false) is_bot
  from public.community_chat m left join public.community_users u on u.id=m.author_id
  where m.room=p_room order by m.created_at desc,m.id desc limit v_limit
 ) q),'[]'::jsonb);
end $$;
-- Starsze klienty nadal otrzymują tylko czat ogólny.
create or replace function public.community_chat_list(p_after_id uuid default null,p_limit integer default 50) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select public.rejchat_room_list('general',p_after_id,p_limit)
$$;

create or replace function public.community_chat_send(p_token text,p_content text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user record; v_content text:=trim(coalesce(p_content,'')); v_id uuid; v_at timestamptz; v_last timestamptz;
begin
 select * into v_user from public.community_session_user(p_token);
 if char_length(v_content)<1 or char_length(v_content)>2000 then raise exception 'Wiadomość musi mieć od 1 do 2000 znaków.'; end if;
 select max(m.created_at) into v_last from public.community_chat m where m.author_id=v_user.user_id;
 if v_last is not null and v_last>now()-interval '2 seconds' then raise exception 'Daj oddech czatowi — jedna wiadomość na 2 sekundy.'; end if;
 insert into public.community_chat(author_id,author_name,content) values(v_user.user_id,v_user.username,v_content) returning id,created_at into v_id,v_at;
 delete from public.community_chat where created_at<now()-interval '14 days';
 return jsonb_build_object('id',v_id,'author_name',v_user.username,'content',v_content,'created_at',v_at);
end $$;

-- Ponowne użycie wysyłki ogólnej zachowuje dotychczasowe kontrole i limity.
create function public.rejchat_link_send(p_token text,p_content text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if coalesce(p_content,'') !~* '(https?://|www[.])[^[:space:]<>]+' then raise exception 'Dodaj do wiadomości link zaczynający się od https://, http:// lub www.'; end if;
 result:=public.community_chat_send(p_token,p_content);
 update public.community_chat set room='links' where id=(result->>'id')::uuid;
 return result;
end $$;
revoke all on function public.rejchat_room_list(text,uuid,integer),public.rejchat_link_send(text,text) from public,anon,authenticated;
grant execute on function public.rejchat_room_list(text,uuid,integer),public.rejchat_link_send(text,text) to anon,authenticated;

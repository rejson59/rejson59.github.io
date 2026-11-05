-- Odpowiedzi i edycja: stare funkcje pozostają zgodne ze starszymi klientami.
alter table public.community_chat add column reply_to uuid references public.community_chat(id) on delete set null, add column edited_at timestamptz;
alter table public.rejchat_dm_messages add column reply_to uuid references public.rejchat_dm_messages(id) on delete set null, add column edited_at timestamptz;

-- Funkcje wzbogacające są wewnętrzne: prywatna działa wyłącznie po kontroli rozmowy.
create function public.rejchat_public_enrich(p_rows jsonb) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.obj || jsonb_build_object('edited_at',m.edited_at,'reply',case when p.id is null then null else jsonb_build_object('id',p.id,'author_name',p.author_name,'content',left(p.content,140)) end) order by x.n),'[]'::jsonb)
 from jsonb_array_elements(p_rows) with ordinality x(obj,n)
 join public.community_chat m on m.id=(x.obj->>'id')::uuid
 left join public.community_chat p on p.id=m.reply_to and p.room=m.room
$$;
create function public.rejchat_private_enrich(p_rows jsonb,p_thread_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.obj || jsonb_build_object('edited_at',m.edited_at,'reply',case when p.id is null then null else jsonb_build_object('id',p.id,'author_name',u.username,'content',left(p.content,140)) end) order by x.n),'[]'::jsonb)
 from jsonb_array_elements(p_rows) with ordinality x(obj,n)
 join public.rejchat_dm_messages m on m.id=(x.obj->>'id')::uuid and m.thread_id=p_thread_id
 left join public.rejchat_dm_messages p on p.id=m.reply_to and p.thread_id=m.thread_id
 left join public.community_users u on u.id=p.author_id
$$;
create function public.rejchat_room_list_v2(p_room text,p_after_id uuid default null,p_limit integer default 50) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select public.rejchat_public_enrich(public.rejchat_room_list(p_room,p_after_id,p_limit))
$$;
create function public.rejchat_dm_list_v2(p_token text,p_thread_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.rejchat_dm_list(p_token,p_thread_id);
 return jsonb_set(result,'{messages}',public.rejchat_private_enrich(result->'messages',p_thread_id));
end $$;
create function public.rejchat_dm_history_v2(p_token text,p_thread_id uuid,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return public.rejchat_private_enrich(public.rejchat_dm_history(p_token,p_thread_id,p_before,p_before_id),p_thread_id);
end $$;

create function public.rejchat_room_send_v2(p_token text,p_room text,p_content text,p_reply_to uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_room is null or p_room not in ('general','links') then raise exception 'Nieznany pokój.'; end if;
 -- Sprawdzenie przed wysyłką i klucz obcy w tej samej transakcji.
 if p_reply_to is not null and not exists(select 1 from public.community_chat where id=p_reply_to and room=p_room) then raise exception 'Wiadomość, na którą odpowiadasz, jest niedostępna.'; end if;
 if p_room='links' then result:=public.rejchat_link_send(p_token,p_content); else result:=public.community_chat_send(p_token,p_content); end if;
 if p_reply_to is not null then update public.community_chat set reply_to=p_reply_to where id=(result->>'id')::uuid; end if;
 return result;
end $$;
create function public.rejchat_dm_send_v2(p_token text,p_thread_id uuid,p_content text,p_reply_to uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; result jsonb;
begin
 select * into me from public.community_session_user(p_token);
 if not exists(select 1 from public.rejchat_dm_threads where id=p_thread_id and (user_low=me.user_id or user_high=me.user_id)) then raise exception 'Rozmowa jest niedostępna.'; end if;
 if p_reply_to is not null and not exists(select 1 from public.rejchat_dm_messages where id=p_reply_to and thread_id=p_thread_id) then raise exception 'Wiadomość, na którą odpowiadasz, jest niedostępna.'; end if;
 result:=public.rejchat_dm_send(p_token,p_thread_id,p_content);
 if p_reply_to is not null then update public.rejchat_dm_messages set reply_to=p_reply_to where id=(result->>'id')::uuid; end if;
 return result;
end $$;
create function public.rejchat_message_edit(p_token text,p_scope text,p_id uuid,p_content text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; v_content text:=btrim(coalesce(p_content,'')); m record; maxlen integer;
begin
 select * into me from public.community_session_user(p_token);
 if p_scope='public' then
  select author_id,room,edited_at into m from public.community_chat where id=p_id for update;
  maxlen:=2000;
 elsif p_scope='private' then
  select d.author_id,null::text as room,d.edited_at into m from public.rejchat_dm_messages d join public.rejchat_dm_threads t on t.id=d.thread_id where d.id=p_id and (t.user_low=me.user_id or t.user_high=me.user_id) for update of d;
  maxlen:=1000;
 else raise exception 'Nieznany rodzaj rozmowy.';
 end if;
 if m.author_id is null or m.author_id<>me.user_id then raise exception 'Nie możesz edytować tej wiadomości.'; end if;
 if char_length(v_content)<1 or char_length(v_content)>maxlen then raise exception 'Wiadomość musi mieć od 1 do % znaków.',maxlen; end if;
 if m.room='links' and v_content !~* '(https?://|www[.])[^[:space:]<>]+' then raise exception 'Wiadomość w kanale Linki musi zawierać link.'; end if;
 if m.edited_at is not null and m.edited_at>clock_timestamp()-interval '5 seconds' then raise exception 'Odczekaj 5 sekund przed kolejną edycją.'; end if;
 -- Istniejące triggery weryfikują mute, frazy i reguły antyspamowe również na UPDATE.
 if p_scope='public' then update public.community_chat set content=v_content,edited_at=clock_timestamp() where id=p_id;
 else update public.rejchat_dm_messages set content=v_content,edited_at=clock_timestamp() where id=p_id; end if;
 return true;
end $$;
revoke all on function public.rejchat_public_enrich(jsonb),public.rejchat_private_enrich(jsonb,uuid),public.rejchat_room_list_v2(text,uuid,integer),public.rejchat_dm_list_v2(text,uuid),public.rejchat_dm_history_v2(text,uuid,timestamptz,uuid),public.rejchat_room_send_v2(text,text,text,uuid),public.rejchat_dm_send_v2(text,uuid,text,uuid),public.rejchat_message_edit(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.rejchat_room_list_v2(text,uuid,integer),public.rejchat_dm_list_v2(text,uuid),public.rejchat_dm_history_v2(text,uuid,timestamptz,uuid),public.rejchat_room_send_v2(text,text,text,uuid),public.rejchat_dm_send_v2(text,uuid,text,uuid),public.rejchat_message_edit(text,text,uuid,text) to anon,authenticated;

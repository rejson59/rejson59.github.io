-- Jawne kopiowanie wybranej wiadomości albo zdjęcia do prywatnego RejSejfu.
-- Funkcja nie publikuje zawartości Sejfu i wykorzystuje istniejące limity.
create function public.rejchat_save_to_rejsejf(p_token text,p_scope text,p_message_id uuid,p_part text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; msg record; photo record; title text; text_content text; encoded text; ext text;
begin
 select * into me from public.community_session_user(p_token);
 if p_scope='public' then
  select m.id,m.content,m.author_name,m.created_at,m.room into msg from public.community_chat m where m.id=p_message_id;
 elsif p_scope='private' then
  select m.id,m.content,u.username as author_name,m.created_at,'private'::text as room into msg
  from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id
  join public.community_users u on u.id=m.author_id
  where m.id=p_message_id and (t.user_low=me.user_id or t.user_high=me.user_id);
 else raise exception 'Nieznany rodzaj rozmowy.';end if;
 if msg.id is null then raise exception 'Wiadomość jest niedostępna.';end if;
 if p_part='text' then
  title:='RejChat – '||msg.author_name;
  text_content:='Zapisana wiadomość z RejChat'||E'\n'||'Autor: '||msg.author_name||E'\n'||'Czas (UTC): '||to_char(msg.created_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')||E'\n\n'||msg.content;
  return public.rejsejf_save(p_token,'note',title,text_content,null,null);
 elsif p_part='photo' then
  if p_scope='public' then select mime,data,expires_at into photo from public.rejchat_photos where public_message_id=p_message_id and data is not null and expires_at>clock_timestamp();
  else select mime,data,expires_at into photo from public.rejchat_photos where private_message_id=p_message_id and data is not null and expires_at>clock_timestamp();end if;
  if photo.data is null then raise exception 'Zdjęcie jest niedostępne lub wygasło.';end if;
  ext:=case photo.mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/gif' then 'gif' end;
  if ext is null then raise exception 'Nieznany format zdjęcia.';end if;
  title:='RejChat-zdjecie-'||left(msg.id::text,8)||'.'||ext;
  encoded:=replace(encode(photo.data,'base64'),E'\n','');
  return public.rejsejf_save(p_token,'file',title,encoded,null,null);
 else raise exception 'Wybierz tekst albo zdjęcie.';end if;
end $$;
revoke all on function public.rejchat_save_to_rejsejf(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.rejchat_save_to_rejsejf(text,text,uuid,text) to anon,authenticated;

-- Ogólny i Linki wyłącznie dla kont strony. Wpisy i profile pozostają publiczne.
-- Starsze RPC bez tokenu zostają wyłączone, również dla roli authenticated Supabase,
-- ponieważ konto strony korzysta z własnej sesji zamiast Supabase Auth.
revoke all on public.community_chat from public,anon,authenticated;
revoke all on function public.community_chat_list(uuid,integer),public.rejchat_room_list(text,uuid,integer),public.rejchat_room_list_v2(text,uuid,integer) from public,anon,authenticated;
-- Dane obrazu też wymagają sesji; DM dodatkowo weryfikuje uczestnictwo.
create or replace function public.rejchat_get_photo(p_id uuid,p_token text default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare f record; me record;
begin
 select * into me from public.community_session_user(p_token);
 select * into f from public.rejchat_photos where id=p_id and data is not null and expires_at>clock_timestamp();
 if f.id is null then raise exception 'Zdjęcie jest niedostępne lub wygasło.';end if;
 if f.private_message_id is not null and not exists(select 1 from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id where m.id=f.private_message_id and (t.user_low=me.user_id or t.user_high=me.user_id)) then raise exception 'Zdjęcie jest niedostępne lub wygasło.';end if;
 return jsonb_build_object('mime',f.mime,'data',encode(f.data,'base64'));
end $$;
-- Nie ujawniaj reakcji na wiadomości czatu bez ważnej sesji.
create or replace function public.rejchat_reactions_list(p_ids uuid[],p_token text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; result jsonb;
begin
 if coalesce(array_length(p_ids,1),0)>100 then raise exception 'Zbyt wiele wiadomości.'; end if;
 select * into me from public.community_session_user(p_token);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
   select r.message_id,r.emoji,count(*)::integer as count,coalesce(bool_or(r.user_id=me.user_id),false) as mine
   from public.rejchat_chat_reactions r join public.community_chat m on m.id=r.message_id
   where r.message_id=any(p_ids) group by r.message_id,r.emoji
 ) q; return result;
end $$;

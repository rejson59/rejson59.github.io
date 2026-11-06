-- Nowy klient sprawdza sesję przed odczytem; stary endpoint wyłączamy dopiero po wdrożeniu klienta.
create function public.rejchat_room_list_v3(p_token text,p_room text,p_after_id uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.community_session_user(p_token);
 return public.rejchat_room_list_v2(p_room,p_after_id,p_limit);
end $$;
revoke all on function public.rejchat_room_list_v3(text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.rejchat_room_list_v3(text,text,uuid,integer) to anon,authenticated;


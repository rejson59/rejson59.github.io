-- community_session_user aktualizuje last_seen_at. PostgREST wykonuje funkcje
-- STABLE w transakcji read-only, więc RPC korzystające z sesji muszą być VOLATILE.
alter function public.rejchat_room_list_v3(text,text,uuid,integer) volatile;
alter function public.rejchat_get_photo(uuid,text) volatile;
notify pgrst, 'reload schema';

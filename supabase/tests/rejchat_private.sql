-- Test w transakcji, żadna wiadomość testowa nie zostaje w bazie.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 ta text:=gen_random_uuid()::text; tb text:=gen_random_uuid()::text; tc text:=gen_random_uuid()::text;
 na text:='T'||substr(replace(a::text,'-',''),1,20); nb text:='T'||substr(replace(b::text,'-',''),1,20); nc text:='T'||substr(replace(c::text,'-',''),1,20);
 tid uuid; mid uuid; pub uuid:=gen_random_uuid(); data jsonb; cursor_id uuid; cursor_at timestamptz; g integer;
begin
 insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test'),(c,nc,'test');
 insert into public.community_sessions(token_hash,user_id) values
  (encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),
  (encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b),
  (encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'),c);
 tid:=(public.rejchat_dm_open(ta,nb)->>'id')::uuid;
 if tid<>(public.rejchat_dm_open(tb,na)->>'id')::uuid then raise exception 'duplikat rozmowy'; end if;
 mid:=(public.rejchat_dm_send(ta,tid,'tajna wiadomość')->>'id')::uuid;
 data:=public.rejchat_dm_inbox(tb); if (data->0->>'unread')::int<>1 then raise exception 'zły licznik: %',data; end if;
 if jsonb_array_length(public.rejchat_dm_inbox(tc))<>0 then raise exception 'wyciek listy'; end if;
 begin perform public.rejchat_dm_list(tc,tid); raise exception 'zaakceptowano odczyt obcego'; exception when raise_exception then if sqlerrm='zaakceptowano odczyt obcego' then raise; end if; end;
 begin perform public.rejchat_dm_send(tc,tid,'nie'); raise exception 'zaakceptowano wysyłkę obcego'; exception when raise_exception then if sqlerrm='zaakceptowano wysyłkę obcego' then raise; end if; end;
 begin perform public.rejchat_react(tc,'private',mid,'👍'); raise exception 'zaakceptowano reakcję obcego'; exception when raise_exception then if sqlerrm='zaakceptowano reakcję obcego' then raise; end if; end;
 perform public.rejchat_react(tb,'private',mid,'❤️');
 data:=public.rejchat_reaction_inbox(ta); if (data->>'unread')::int<>1 or data->'items'->0->>'scope'<>'private' then raise exception 'brak powiadomienia DM: %',data; end if;
 if (public.rejchat_reaction_inbox(tc)->>'unread')::int<>0 then raise exception 'wyciek powiadomienia'; end if;
 data:=public.rejchat_dm_list(tb,tid);
 if data->'messages'->0->>'content'<>'tajna wiadomość' or data->'messages'->0->'reactions'->0->>'emoji'<>'❤️' then raise exception 'brak wiadomości lub reakcji: %',data; end if;
 if (public.rejchat_dm_inbox(tb)->0->>'unread')::int<>0 then raise exception 'nie oznaczono jako przeczytane'; end if;
 perform public.rejchat_react(tb,'private',mid,'❤️'); if exists(select 1 from public.rejchat_dm_reactions where message_id=mid) then raise exception 'nie cofnięto reakcji'; end if;
 begin perform public.rejchat_dm_send(ta,tid,'spam'); raise exception 'zaakceptowano spam'; exception when raise_exception then if sqlerrm='zaakceptowano spam' then raise; end if; end;
 insert into public.community_chat(id,author_id,author_name,content) values(pub,a,na,'public'); perform public.rejchat_react(tb,'public',pub,'👍');
 data:=public.rejchat_reaction_inbox(ta); if (data->>'unread')::int<>1 or data->'items'->0->>'scope'<>'public' then raise exception 'brak powiadomienia publicznego: %',data; end if;
 perform public.rejchat_reaction_read(ta,null); if (public.rejchat_reaction_inbox(ta)->>'unread')::int<>0 then raise exception 'nie oznaczono reakcji'; end if;
 data:=public.rejchat_reactions_list(array[pub],tb); if (data->0->>'count')::int<>1 or (data->0->>'mine')::boolean is not true then raise exception 'błąd reakcji publicznej: %',data; end if;
 -- Test stronicowania importuje historyczne dane i resetuje wyłącznie testowy stan limitu.
 for g in 1..105 loop
  delete from public.rejchat_antispam_state where user_id=a and kind='dm';
  insert into public.rejchat_dm_messages(thread_id,author_id,content,created_at)
  values(tid,a,'historia '||g,now()-make_interval(secs=>106-g));
 end loop;
 data:=public.rejchat_dm_list(tb,tid); if jsonb_array_length(data->'messages')<>100 then raise exception 'zły rozmiar nowej strony'; end if;
 cursor_id:=(data->'messages'->0->>'id')::uuid; cursor_at:=(data->'messages'->0->>'created_at')::timestamptz;
 data:=public.rejchat_dm_history(tb,tid,cursor_at,cursor_id); if jsonb_array_length(data)<>6 then raise exception 'zły rozmiar historii: %',data; end if;
 begin perform public.rejchat_dm_history(tc,tid,cursor_at,cursor_id); raise exception 'zaakceptowano obcą historię'; exception when raise_exception then if sqlerrm='zaakceptowano obcą historię' then raise; end if; end;
 update public.rejchat_reaction_limits set minute_count=60 where user_id=b;
 begin perform public.rejchat_react(tb,'public',pub,'❤️'); raise exception 'zaakceptowano nadmiar reakcji'; exception when raise_exception then if sqlerrm='zaakceptowano nadmiar reakcji' then raise; end if; end;
 if has_table_privilege('anon','public.rejchat_dm_messages','SELECT') or has_table_privilege('anon','public.rejchat_dm_threads','SELECT') or has_table_privilege('anon','public.rejchat_dm_reactions','SELECT') then raise exception 'anon ma dostęp do danych'; end if;
 begin perform public.rejchat_dm_inbox('not-a-valid-token'); raise exception 'zaakceptowano zły token'; exception when raise_exception then if sqlerrm='zaakceptowano zły token' then raise; end if; end;
end $$;
rollback;

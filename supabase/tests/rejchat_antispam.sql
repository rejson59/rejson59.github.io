-- Uruchamiać po migracji; całość jest wycofywana.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 na text:='T'||substr(replace(a::text,'-',''),1,20); nb text:='T'||substr(replace(b::text,'-',''),1,20);
 tok text:=gen_random_uuid()::text; pid uuid; mid uuid; tid uuid; n integer; k text; phrase text:='fraza'||substr(replace(a::text,'-',''),1,8);
begin
 insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test');
 insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||tok,'sha256'),'hex'),a);
 -- Serwerowe RPC i niezależność kont.
 mid:=(public.community_chat_send(tok,'Dłuższa unikalna treść testowa')->>'id')::uuid;
 delete from public.community_chat where id=mid;
 begin insert into public.community_chat(author_id,author_name,content) values(a,na,'następna'); raise exception 'brak odstępu'; exception when raise_exception then if sqlerrm not like 'Wysyłasz zbyt szybko%' then raise; end if; end;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '3 seconds' where user_id=a and kind='chat';
 begin insert into public.community_chat(author_id,author_name,content) values(a,na,'  DŁUŻSZA   UNIKALNA TREŚĆ TESTOWA  '); raise exception 'brak kontroli duplikatu'; exception when raise_exception then if sqlerrm not like 'Ta treść została%' then raise; end if; end;
 insert into public.community_chat(author_id,author_name,content) values(b,nb,'Dłuższa unikalna treść testowa') returning id into mid;
 update public.community_chat set content='Zmieniona poprawna treść' where id=mid;
 begin update public.community_chat set content='https://a https://b https://c www.d' where id=mid; raise exception 'brak kontroli edycji'; exception when raise_exception then if sqlerrm not like 'Za dużo linków%' then raise; end if; end;
 begin insert into public.community_chat(author_id,author_name,content) values(a,na,repeat('x',24)); raise exception 'brak kontroli znaków'; exception when raise_exception then if sqlerrm not like 'Treść zawiera zbyt długi%' then raise; end if; end;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '3 seconds',recent_start=clock_timestamp()-interval '2 minutes' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content) values(a,na,'Dłuższa unikalna treść testowa');
 -- Osobne limity dla wpisów, komentarzy i DM, także poza RPC.
 insert into public.community_posts(author_id,author_name,content) values(a,na,'wpis testowy') returning id into pid;
 begin insert into public.community_posts(author_id,author_name,content) values(a,na,'drugi wpis'); raise exception 'brak limitu wpisów'; exception when raise_exception then if sqlerrm not like 'Wysyłasz zbyt szybko%' then raise; end if; end;
 perform public.community_add_comment(tok,pid,'komentarz testowy',null);
 begin perform public.community_add_comment(tok,pid,'drugi komentarz',null); raise exception 'brak limitu komentarzy'; exception when raise_exception then if sqlerrm not like 'Wysyłasz zbyt szybko%' then raise; end if; end;
 tid:=(public.rejchat_dm_open(tok,nb)->>'id')::uuid;
 perform public.rejchat_dm_send(tok,tid,'Prywatna wiadomość testowa');
 begin insert into public.rejchat_dm_messages(thread_id,author_id,content) values(tid,a,'druga prywatna'); raise exception 'brak limitu DM'; exception when raise_exception then if sqlerrm not like 'Wysyłasz zbyt szybko%' then raise; end if; end;
 -- Granice okien i zachowanie liczników po odrzuceniu.
 foreach k in array array['chat','post','comment','dm'] loop
  update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '1 minute',window_start=clock_timestamp(),sent_count=case k when 'post' then 3 when 'comment' then 10 else 20 end where user_id=a and kind=k;
  begin
   case k
    when 'chat' then insert into public.community_chat(author_id,author_name,content) values(a,na,'nowa');
    when 'post' then insert into public.community_posts(author_id,author_name,content) values(a,na,'nowy');
    when 'comment' then insert into public.community_comments(post_id,author_id,author_name,content) values(pid,a,na,'nowy');
    when 'dm' then insert into public.rejchat_dm_messages(thread_id,author_id,content) values(tid,a,'nowa');
   end case;
   raise exception 'brak limitu okna: %',k;
  exception when raise_exception then if sqlerrm not like 'Osiągnięto tymczasowy limit%' then raise; end if; end;
  select sent_count into n from public.rejchat_antispam_state where user_id=a and kind=k;
  if n<>(case k when 'post' then 3 when 'comment' then 10 else 20 end) then raise exception 'zmiana licznika po odrzuceniu'; end if;
 end loop;
 update public.rejchat_antispam_state set window_start=clock_timestamp()-interval '11 minutes',last_sent=clock_timestamp()-interval '1 minute' where user_id=a and kind='post';
 insert into public.community_posts(author_id,author_name,content) values(a,na,'nowy wpis');
 -- Istniejące globalne frazy i mute nadal są egzekwowane.
 insert into public.rejchat_blocked_phrases(phrase) values(phrase);
 begin insert into public.community_chat(author_id,author_name,content) values(a,na,phrase); raise exception 'brak filtra'; exception when raise_exception then if sqlerrm not like 'Treść zawiera niedozwoloną frazę%' then raise; end if; end;
 insert into public.rejchat_write_blocks(user_id,until_at) values(a,now()+interval '5 minutes');
 begin insert into public.community_posts(author_id,author_name,content) values(a,na,'poprawny tekst'); raise exception 'brak mute'; exception when raise_exception then if sqlerrm not like 'Twoje konto ma zablokowaną%' then raise; end if; end;
 if has_table_privilege('anon','public.rejchat_antispam_state','select') or has_table_privilege('authenticated','public.rejchat_antispam_state','select') or has_function_privilege('anon','public.rejchat_enforce_antispam()','execute') then raise exception 'dostęp do prywatnego stanu'; end if;
 if not exists(select 1 from cron.job where jobname='rejchat-antispam-cleanup' and active and schedule='*/15 * * * *') then raise exception 'brak zadania czyszczącego'; end if;
end $$;
rollback;

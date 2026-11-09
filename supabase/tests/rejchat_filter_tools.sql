-- Testy transakcyjne, bez utrwalania kont, przykładów ani wiadomości.
begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();t uuid:=gen_random_uuid();m uuid;admin_id uuid;x text;r jsonb;candidate text:='zxqv'||left(replace(gen_random_uuid()::text,'-',''),8);before_count int;
begin
 foreach x in array array['kuurrwa','kkurrwwaa','kυrrwa','Ｋ###а','売・春・婦'] loop
  if not public.rejchat_text_blocked(x) then raise exception 'Obejście przeszło: %',x;end if;
 end loop;
 foreach x in array array['Kawa i herbata','Lekcja historii','Bardzo dobry pomysł','We should oppose antisemitism','Drzewo rośnie w parku','https://example.org/'] loop
  if public.rejchat_text_blocked(x) then raise exception 'Fałszywy alarm: %',x;end if;
 end loop;
 if not public.rejchat_phrase_matches('xx'||candidate||'yy',candidate,'substring') or public.rejchat_phrase_matches('xx'||candidate||'yy',candidate,'word') or not public.rejchat_phrase_matches(candidate||'yy',candidate,'prefix') then raise exception 'Typy dopasowania';end if;
 if has_function_privilege('anon','public.admin_rejchat_filter_check(text,text,text)','execute') or has_function_privilege('anon','public.admin_rejchat_phrase_v2(text,text)','execute') then raise exception 'Anon ma dostęp';end if;
 perform set_config('request.jwt.claims','{}',true);perform set_config('request.jwt.claim.sub','',true);
 begin perform public.admin_rejchat_filter_check('przykład',candidate,'word');raise exception 'brak autoryzacji podglądu';exception when raise_exception then if sqlerrm<>'Brak uprawnień administratora.' then raise;end if;end;
 begin perform public.admin_rejchat_phrase_v2(candidate,'word');raise exception 'brak autoryzacji zapisu';exception when raise_exception then if sqlerrm<>'Brak uprawnień administratora.' then raise;end if;end;
 select user_id into admin_id from public.widget_admins limit 1;if admin_id is null then raise exception 'brak admina';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 select count(*) into before_count from public.rejchat_blocked_phrases;
 r:=public.admin_rejchat_filter_check('xx'||candidate||'yy',candidate,'word');
 if (r->>'candidate_blocked')::boolean or (r->>'blocked')::boolean then raise exception 'Podgląd całego słowa';end if;
 r:=public.admin_rejchat_filter_check('xx'||candidate||'yy',candidate,'substring');if not (r->>'candidate_blocked')::boolean then raise exception 'Podgląd fragmentu';end if;
 if (select count(*) from public.rejchat_blocked_phrases)<>before_count then raise exception 'Podgląd zapisał regułę';end if;
 perform public.admin_rejchat_phrase_v2(candidate,'word');
 if not exists(select 1 from public.rejchat_blocked_phrases where phrase=candidate and match_mode='word') then raise exception 'Typ nie został zapisany';end if;
 r:=public.admin_rejchat_filter_check(candidate,'','substring');if not (r->>'blocked')::boolean then raise exception 'Aktywna reguła nie wykryta';end if;
 if not exists(select 1 from jsonb_array_elements(public.admin_rejchat_overview()->'phrases') p where p->>'phrase'=candidate and p->>'match_mode'='word') then raise exception 'Brak typu na liście';end if;
 begin perform public.admin_rejchat_phrase_v2('dwa słowa','prefix');raise exception 'rdzeń wielowyrazowy przeszedł';exception when raise_exception then if sqlerrm not like 'Rdzeń musi%' then raise;end if;end;
 insert into public.community_users(id,username,pin_hash) values(a,'T'||left(replace(a::text,'-',''),20),'test'),(b,'T'||left(replace(b::text,'-',''),20),'test');
 -- Seria z emoji i interpunkcją; same emoji pozostają dozwolone.
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'k','general',clock_timestamp()-interval '18 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'😀','general',clock_timestamp()-interval '14 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'u','general',clock_timestamp()-interval '10 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'!','general',clock_timestamp()-interval '6 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 begin insert into public.community_chat(author_id,author_name,content,room) select a,username,'r','general' from public.community_users where id=a;raise exception 'Seria z symbolami przeszła';exception when raise_exception then if sqlerrm not like 'Wykryto serię krótkich fragmentów%' then raise;end if;end;
 insert into public.community_chat(author_id,author_name,content,room) select b,username,'r','general' from public.community_users where id=b;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room) select a,username,'r','links' from public.community_users where id=a;
 -- Zwykłe zdanie resetuje kontekst; emoji nie jest samodzielnie blokowane.
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'Widzimy się jutro','general',clock_timestamp()-interval '2 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'r','general',clock_timestamp() from public.community_users where id=a;
 -- Wiadomości starsze niż minuta nie łączą się z nowymi.
 delete from public.community_chat where author_id=a;update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'k','general',clock_timestamp()-interval '80 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'u','general',clock_timestamp()-interval '70 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room) select a,username,'r','general' from public.community_users where id=a;
 insert into public.rejchat_dm_threads(id,user_low,user_high) values(t,least(a,b),greatest(a,b));
 insert into public.rejchat_dm_messages(thread_id,author_id,content,created_at) values(t,a,'ku',clock_timestamp()-interval '8 seconds');
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='dm';
 insert into public.rejchat_dm_messages(thread_id,author_id,content,created_at) values(t,a,'✨',clock_timestamp()-interval '4 seconds');
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='dm';
 begin insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t,a,'rwa');raise exception 'DM z emoji przeszło';exception when raise_exception then if sqlerrm not like 'Wykryto serię krótkich fragmentów%' then raise;end if;end;
end $$;
rollback;

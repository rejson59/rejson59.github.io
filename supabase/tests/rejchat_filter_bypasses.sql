-- Regression tests use only temporary accounts and are always rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); u uuid; x text; first_id uuid; second_id uuid; third_id uuid;
begin
 foreach x in array array['Qrwa','K###a','Ｋ###а','k###4','k****wa','K***a','Шлюха','ш л ю х а','ＳＨＬＹＵＫＨＡ','売春婦','売・春・婦','Jatɔmuso','Antisemitism is my goal','Samotne matki zdejmij spodnie','cipsko','jeble','Seks','SEX','k.u.r.w.a','j3b4c'] loop
  if not public.rejchat_text_blocked(x) then raise exception 'Obejście przeszło: %',x;end if;
 end loop;
 -- Wpisy administratora mogą niezależnie blokować neutralne terminy.
 foreach x in array array['Jestem samotną matką i szukam pracy','Historia antysemityzmu w Europie','We should oppose antisemitism','Podaj kod QR','日本の文化','Привет друг','Hej, widzimy się jutro!','https://example.org/'] loop
  if public.rejchat_text_blocked(x) then raise exception 'Fałszywy alarm: %',x;end if;
 end loop;
 if public.rejchat_short_fragment('売')<>'売' or public.rejchat_short_fragment('😃')<>'' or not public.rejchat_fragments_blocked(array['売','春','婦'],3) or not public.rejchat_fragments_blocked(array['売','春','婦'],1) then raise exception 'Fragmenty Unicode';end if;
 if not public.rejchat_fragments_blocked(array['k','u','r'],3) or not public.rejchat_fragments_blocked(array['k','u','r'],1) or not public.rejchat_fragments_blocked(array['ku','rwa'],2) or not public.rejchat_fragments_blocked(array['ku','rwa'],1) then raise exception 'Podzielone słowo nie zostało wykryte';end if;
 if public.rejchat_fragments_blocked(array['hej','ok'],2) or public.rejchat_fragments_blocked(array['a','b'],2) or public.rejchat_fragments_blocked(array['k','u','r','ok'],4) then raise exception 'Fałszywy alarm fragmentów';end if;
 insert into public.community_users(id,username,pin_hash) values(a,'T'||left(replace(a::text,'-',''),20),'test'),(b,'T'||left(replace(b::text,'-',''),20),'test'),(c,'T'||left(replace(c::text,'-',''),20),'test');
 insert into public.community_chat(id,author_id,author_name,content,room,created_at) select gen_random_uuid(),a,username,'K','general',clock_timestamp()-interval '12 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(id,author_id,author_name,content,room,created_at) select gen_random_uuid(),a,username,'U','general',clock_timestamp()-interval '8 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 begin insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'R','general',clock_timestamp()-interval '4 seconds' from public.community_users where id=a;raise exception 'Trzecia litera przeszła';exception when raise_exception then if sqlerrm not like 'Połącz krótkie fragmenty%' then raise;end if;end;
 -- Inny autor albo inny pokój nie dokłada się do sekwencji.
 insert into public.community_chat(author_id,author_name,content,room) select b,username,'R','general' from public.community_users where id=b;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room) select a,username,'R','links' from public.community_users where id=a;
 delete from public.community_chat where author_id in (a,b);
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'売','general',clock_timestamp()-interval '8 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'春','general',clock_timestamp()-interval '4 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 begin insert into public.community_chat(author_id,author_name,content,room) select a,username,'婦','general' from public.community_users where id=a;raise exception 'Fragmenty japońskie przeszły';exception when raise_exception then if sqlerrm not like 'Połącz krótkie fragmenty%' then raise;end if;end;
 delete from public.community_chat where author_id=a;
 -- Litery z edycji w dowolnej kolejności także są sprawdzane.
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(id,author_id,author_name,content,room,created_at) select gen_random_uuid(),a,username,'hello','general',clock_timestamp()-interval '12 seconds' from public.community_users where id=a returning id into first_id;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(id,author_id,author_name,content,room,created_at) select gen_random_uuid(),a,username,'ok','general',clock_timestamp()-interval '8 seconds' from public.community_users where id=a returning id into second_id;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(id,author_id,author_name,content,room,created_at) select gen_random_uuid(),a,username,'tak','general',clock_timestamp()-interval '4 seconds' from public.community_users where id=a returning id into third_id;
 update public.community_chat set content='r' where id=third_id;update public.community_chat set content='u' where id=second_id;
 begin update public.community_chat set content='k' where id=first_id;raise exception 'Edycja od tyłu przeszła';exception when raise_exception then if sqlerrm not like 'Połącz krótkie fragmenty%' then raise;end if;end;
 delete from public.community_chat where author_id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 insert into public.community_chat(author_id,author_name,content,room,created_at) select a,username,'ku','general',clock_timestamp()-interval '5 seconds' from public.community_users where id=a;
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='chat';
 begin insert into public.community_chat(author_id,author_name,content,room) select a,username,'rwa','general' from public.community_users where id=a;raise exception 'Dwa fragmenty przeszły';exception when raise_exception then if sqlerrm not like 'Połącz krótkie fragmenty%' then raise;end if;end;
 insert into public.rejchat_dm_threads(id,user_low,user_high) values(t,least(a,b),greatest(a,b)),(t2,least(a,c),greatest(a,c));
 insert into public.rejchat_dm_messages(thread_id,author_id,content,created_at) values(t,a,'ku',clock_timestamp()-interval '6 seconds');
 update public.rejchat_antispam_state set last_sent=clock_timestamp()-interval '10 seconds' where user_id=a and kind='dm';
 begin insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t,a,'rwa');raise exception 'Fragmenty DM przeszły';exception when raise_exception then if sqlerrm not like 'Połącz krótkie fragmenty%' then raise;end if;end;
 -- Nie kojarzymy różnych prywatnych wątków ani różnych autorów.
 insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t2,a,'rwa');
 insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t,b,'rwa');
 begin insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t,b,'Шлюха');raise exception 'DM w innym alfabecie przeszło';exception when raise_exception then if sqlerrm not like 'Treść zawiera niedozwoloną frazę%' then raise;end if;end;
 begin insert into public.community_posts(id,author_id,author_name,content) select p,a,username,'K###a' from public.community_users where id=a;raise exception 'Wpis przeszedł';exception when raise_exception then if sqlerrm not like 'Treść zawiera niedozwoloną frazę%' then raise;end if;end;
 insert into public.community_posts(id,author_id,author_name,content) select p,a,username,'Zwykły wpis' from public.community_users where id=a;
 begin insert into public.community_comments(post_id,author_id,author_name,content) select p,a,username,'売春婦' from public.community_users where id=a;raise exception 'Komentarz przeszedł';exception when raise_exception then if sqlerrm not like 'Treść zawiera niedozwoloną frazę%' then raise;end if;end;
 begin perform public.rejchat_validate_nickname('Qrwa');raise exception 'Nick przeszedł';exception when raise_exception then if sqlerrm not like 'Nick zawiera niedozwoloną frazę%' then raise;end if;end;
 if has_function_privilege('anon','public.rejchat_fragments_blocked(text[],integer)','execute') or has_table_privilege('anon','public.community_chat','select') then raise exception 'Błędne uprawnienia';end if;
end $$;
rollback;

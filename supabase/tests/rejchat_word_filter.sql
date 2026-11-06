-- Po migracji, bez danych trwałych. Sprawdza także triggery przy edycji i prywatność DM.
begin;
do $$ declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();t uuid:=gen_random_uuid();m uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();x text;begin
 foreach x in array array['KURWA','k.u.r.w.a','k'||chr(8203)||'urwa','ＫＵＲＷＡ','kυrwa','kuuurwa','j3b4c','f.u.c.k','czarnuch','zabij się','wyslij nudesy','oral sex'] loop
  if not public.rejchat_text_blocked(x) then raise exception 'Nie wykryto obejścia: %',x;end if;
 end loop;
 foreach x in array array['Pedał roweru i edukacja zdrowotna','seksualność i zdrowie','pies suka oraz baran','spotkanie w środę o 18','dyskusja o filtrowaniu','https://example.org/muzyka'] loop
  if public.rejchat_text_blocked(x) then raise exception 'Fałszywy alarm: %',x;end if;
 end loop;
 insert into public.community_users(id,username,pin_hash) values(a,'T'||substr(replace(a::text,'-',''),1,20),'test'),(b,'T'||substr(replace(b::text,'-',''),1,20),'test');
 insert into public.community_chat(id,author_id,author_name,content,room) select m,a,username,'dzien dobry','general' from public.community_users where id=a;
 begin update public.community_chat set content='k.u.r.w.a' where id=m;raise exception 'edycja przeszła';exception when raise_exception then if sqlerrm not like 'Treść zawiera niedozwoloną frazę%' then raise;end if;end;
 begin insert into public.community_chat(author_id,author_name,content,room) select a,username,'j3b4c','links' from public.community_users where id=a;raise exception 'linki przeszły';exception when raise_exception then if sqlerrm not like 'Treść zawiera niedozwoloną frazę%' then raise;end if;end;
 insert into public.rejchat_dm_threads(id,user_low,user_high) values(t,least(a,b),greatest(a,b));
 begin insert into public.rejchat_dm_messages(thread_id,author_id,content) values(t,a,'k.u.r.w.a');raise exception 'DM przeszło';exception when raise_exception then if sqlerrm not like 'Treść zawiera niedozwoloną frazę%' then raise;end if;end;
 begin insert into public.community_posts(id,author_id,author_name,content) select pid,a,username,'j3b4c' from public.community_users where id=a;raise exception 'wpis przeszedł';exception when raise_exception then if sqlerrm not like 'Treść zawiera niedozwoloną frazę%' then raise;end if;end;
 insert into public.community_posts(id,author_id,author_name,content) select pid,a,username,'dzien dobry' from public.community_users where id=a;
 begin insert into public.community_comments(post_id,author_id,author_name,content) select pid,a,username,'k.u.r.w.a' from public.community_users where id=a;raise exception 'komentarz przeszedł';exception when raise_exception then if sqlerrm not like 'Treść zawiera niedozwoloną frazę%' then raise;end if;end;
 begin perform public.rejchat_validate_nickname('k.u.r.w.a');raise exception 'nick przeszedł';exception when raise_exception then if sqlerrm not like 'Nick zawiera niedozwoloną frazę%' then raise;end if;end;
 if has_function_privilege('anon','public.rejchat_text_blocked(text)','execute') or has_table_privilege('anon','public.rejchat_blocked_phrases','select') then raise exception 'anon ma dostęp do filtra';end if;
end $$;
rollback;

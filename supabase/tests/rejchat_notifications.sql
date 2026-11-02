-- Test transakcyjny: wszystkie konta, sesje i wpisy są cofane.
begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  post uuid := gen_random_uuid(); parent uuid := gen_random_uuid();
  ta text := gen_random_uuid()::text; tb text := gen_random_uuid()::text; tc text := gen_random_uuid()::text;
  result jsonb; notification uuid;
begin
  insert into public.community_users(id,username,pin_hash) values
    (a,'T'||substr(replace(a::text,'-',''),1,20),'test'),
    (b,'T'||substr(replace(b::text,'-',''),1,20),'test'),
    (c,'T'||substr(replace(c::text,'-',''),1,20),'test');
  insert into public.community_sessions(token_hash,user_id) values
    (encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),
    (encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b),
    (encode(extensions.digest('rejson_comm_sess_v1:'||tc,'sha256'),'hex'),c);
  insert into public.community_posts(id,author_id,author_name,content) select post,a,username,'test' from public.community_users where id=a;
  insert into public.community_comments(id,post_id,author_id,author_name,content) select parent,post,b,username,'test' from public.community_users where id=b;
  insert into public.community_comments(post_id,author_id,author_name,content,parent_id) select post,c,username,'reply',parent from public.community_users where id=c;
  insert into public.community_likes(post_id,user_id) values(post,b),(post,a);
  result := public.rejchat_notifications_list(ta,50);
  if (result->>'unread')::int <> 3 then raise exception 'licznik autora: %',result; end if;
  result := public.rejchat_notifications_list(tb,50);
  if (result->>'unread')::int <> 1 then raise exception 'licznik odpowiedzi: %',result; end if;
  notification := (result->'items'->0->>'id')::uuid;
  if (public.rejchat_notification_post(tb,notification)->>'id')::uuid <> post then raise exception 'niewłaściwy wpis'; end if;
  if public.rejchat_notification_post(tc,notification) is not null then raise exception 'wyciek między kontami'; end if;
  perform public.rejchat_notifications_read(ta,null);
  if (public.rejchat_notifications_list(tb,50)->>'unread')::int <> 1 then raise exception 'odczyt zmienił inne konto'; end if;
  delete from public.community_likes where post_id=post and user_id=b;
  if exists(select 1 from public.rejchat_notifications where kind='like' and post_id=post) then raise exception 'cofnięte polubienie nadal widoczne'; end if;
  if has_table_privilege('anon','public.rejchat_notifications','SELECT') then raise exception 'anon ma dostęp do tabeli'; end if;
  begin
    perform public.rejchat_notifications_list('invalid-invalid-invalid',50);
    raise exception 'zaakceptowano nieprawidłowy token';
  exception when raise_exception then
    if sqlerrm='zaakceptowano nieprawidłowy token' then raise; end if;
  end;
end $$;
rollback;

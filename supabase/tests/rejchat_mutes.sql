-- Test transakcyjny; po rollbacku nie zostają konta ani blokady.
begin;
do $$
declare aid uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); boss uuid:=gen_random_uuid(); na text:='T'||substr(replace(a::text,'-',''),1,20); nb text:='T'||substr(replace(b::text,'-',''),1,20); nc text:='T'||substr(replace(boss::text,'-',''),1,20); ta text:=gen_random_uuid()::text; tb text:=gen_random_uuid()::text; tid uuid; postid uuid; data jsonb;
begin
 select user_id into aid from public.widget_admins limit 1; if aid is null then raise exception 'brak administratora testowego'; end if;
 insert into public.community_users(id,username,pin_hash,is_owner) values(a,na,'test',false),(b,nb,'test',false),(boss,nc,'test',true);
 insert into public.community_sessions(token_hash,user_id) values (encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),(encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b);
 tid:=(public.rejchat_dm_open(ta,nb)->>'id')::uuid;
 insert into public.community_posts(author_id,author_name,content) values(b,nb,'test') returning id into postid;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.admin_rejchat_mute(na,5,'test'); raise exception 'nieautoryzowane wyciszenie'; exception when raise_exception then if sqlerrm<>'Brak uprawnień administratora.' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'role','authenticated')::text,true);
 begin perform public.admin_rejchat_mute(nc,5,'test'); raise exception 'wyciszono właściciela'; exception when raise_exception then if sqlerrm<>'Nie można wyciszyć tego konta.' then raise; end if; end;
 perform public.admin_rejchat_mute(na,5,'Proszę bez spamu');
 data:=public.rejchat_my_mute(ta); if (data->>'muted')::boolean is not true or data->>'reason'<>'Proszę bez spamu' or (data->>'until_at')::timestamptz <> now()+interval '5 minutes' then raise exception 'nieprawidłowy stan: %',data; end if;
 if (public.rejchat_my_mute(tb)->>'muted')::boolean is not false then raise exception 'wyciek stanu innego konta'; end if;
 begin perform public.community_chat_send(ta,'test'); raise exception 'pozwolono pisać na czacie'; exception when raise_exception then if sqlerrm<>'Twoje konto ma zablokowaną możliwość pisania w RejChat.' then raise; end if; end;
 begin perform public.community_create_post(ta,'test','[]'::jsonb,'{}'); raise exception 'pozwolono pisać wpis'; exception when raise_exception then if sqlerrm<>'Twoje konto ma zablokowaną możliwość pisania w RejChat.' then raise; end if; end;
 begin perform public.community_add_comment(ta,postid,'test',null); raise exception 'pozwolono pisać komentarz'; exception when raise_exception then if sqlerrm<>'Twoje konto ma zablokowaną możliwość pisania w RejChat.' then raise; end if; end;
 begin perform public.rejchat_dm_send(ta,tid,'test'); raise exception 'pozwolono pisać prywatnie'; exception when raise_exception then if sqlerrm<>'Twoje konto ma zablokowaną możliwość pisania w RejChat.' then raise; end if; end;
 update public.rejchat_write_blocks set until_at=now()-interval '1 second' where user_id=a;
 if (public.rejchat_my_mute(ta)->>'muted')::boolean is not false then raise exception 'blokada nie wygasła'; end if;
 perform public.community_chat_send(ta,'można pisać');
 perform public.admin_rejchat_mute(na,-1,''); if (public.rejchat_my_mute(ta)->>'muted')::boolean is not true or public.rejchat_my_mute(ta)->>'until_at' is not null then raise exception 'blokada bezterminowa'; end if;
 perform public.admin_rejchat_write_block(na,1); if public.rejchat_my_mute(ta)->>'reason'<>'' then raise exception 'stare RPC zachowało powód'; end if;
 perform public.admin_rejchat_write_block(na,0); if (public.rejchat_my_mute(ta)->>'muted')::boolean is not false then raise exception 'nie zdjęto blokady'; end if;
 if has_function_privilege('anon','public.admin_rejchat_mute(text,integer,text)','execute') or has_table_privilege('anon','public.rejchat_write_blocks','select') then raise exception 'błędne uprawnienia'; end if;
 begin perform public.rejchat_my_mute('invalid'); raise exception 'zaakceptowano zły token'; exception when raise_exception then if sqlerrm='zaakceptowano zły token' then raise; end if; end;
end $$;
rollback;

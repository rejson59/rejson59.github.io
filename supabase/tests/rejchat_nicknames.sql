-- Testy transakcyjne nowych nicków; dane są wycofywane.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); na text:='T'||substr(replace(a::text,'-',''),1,20); nb text:='T'||substr(replace(b::text,'-',''),1,20); ta text:=gen_random_uuid()::text; aid uuid; x jsonb; phrase text:='bad'||substr(replace(a::text,'-',''),1,10);
begin
 select user_id into aid from public.widget_admins limit 1; if aid is null then raise exception 'brak admina'; end if;
 insert into public.community_users(id,username,pin_hash) values(a,na,'test'),(b,nb,'test');
 insert into public.community_sessions(token_hash,user_id) values(encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a);
 perform public.rejchat_set_nickname(ta,'  Gwiazda  ');
 x:=public.rejchat_get_profiles(array[na,nb]);
 if not exists(select 1 from jsonb_array_elements(x) p where p->>'username'=na and p->>'nickname'='Gwiazda') then raise exception 'brak nicka'; end if;
 begin perform public.rejchat_set_nickname(ta,'Nowa'); raise exception 'pominięto limit'; exception when raise_exception then if sqlerrm not like 'Nick można zmienić%' then raise; end if; end;
 begin perform public.admin_rejchat_set_nickname(nb,'Inna'); raise exception 'brak kontroli admina'; exception when raise_exception then if sqlerrm <> 'Brak uprawnień administratora.' then raise; end if; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'role','authenticated')::text,true); perform public.admin_rejchat_set_nickname(nb,'Inna');
 insert into public.rejchat_blocked_phrases(phrase) values(phrase);
 begin perform public.admin_rejchat_set_nickname(nb,phrase); raise exception 'brak filtra'; exception when raise_exception then if sqlerrm not like 'Nick zawiera niedozwoloną%' then raise; end if; end;
 begin perform public.admin_rejchat_set_nickname(nb,'x'||chr(8203)||'y'); raise exception 'brak kontroli'; exception when raise_exception then if sqlerrm not like 'Nick musi mieć%' then raise; end if; end;
 insert into public.rejchat_write_blocks(user_id,until_at) values(a,now()+interval '5 minutes');
 begin perform public.rejchat_set_nickname(ta,'Próba'); raise exception 'brak mute'; exception when raise_exception then if sqlerrm not like 'Twoje konto ma zablokowaną%' then raise; end if; end;
 if has_table_privilege('anon','public.rejchat_nicknames','select') or has_function_privilege('anon','public.admin_rejchat_set_nickname(text,text)','execute') then raise exception 'brak ochrony'; end if;
end $$;
rollback;

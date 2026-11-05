-- Czasowe wyciszenia rozszerzają istniejące blokady pisania; historia i aktywne blokady zostają.
alter table public.rejchat_write_blocks add column reason text not null default '' check (char_length(reason)<=200);

create function public.admin_rejchat_mute(p_username text,p_minutes integer,p_reason text default '') returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare target record; reason text:=btrim(coalesce(p_reason,''));
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 if p_minutes is null or p_minutes not in (-1,0,5,15,30,60,1440,10080) then raise exception 'Nieprawidłowy czas wyciszenia.'; end if;
 if char_length(reason)>200 or reason ~ '[[:cntrl:]]' then raise exception 'Powód może mieć maksymalnie 200 znaków i nie może zawierać znaków sterujących.'; end if;
 select id,is_owner,is_bot into target from public.community_users where username_lower=lower(btrim(coalesce(p_username,'')));
 if target.id is null then raise exception 'Nie znaleziono konta.'; end if;
 if target.is_owner or target.is_bot then raise exception 'Nie można wyciszyć tego konta.'; end if;
 if p_minutes=0 then delete from public.rejchat_write_blocks where user_id=target.id;
 else insert into public.rejchat_write_blocks(user_id,until_at,reason) values(target.id,case when p_minutes=-1 then null else now()+make_interval(mins=>p_minutes) end,reason)
 on conflict(user_id) do update set until_at=excluded.until_at,created_at=now(),reason=excluded.reason; end if;
 return true;
end $$;
revoke all on function public.admin_rejchat_mute(text,integer,text) from public,anon,authenticated;
grant execute on function public.admin_rejchat_mute(text,integer,text) to authenticated;

-- Zachowanie starszego panelu i starych zakładek; nowa blokada usuwa poprzedni powód.
create or replace function public.admin_rejchat_write_block(p_username text,p_hours integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 if p_hours is null or p_hours not in (0,1,24,168,-1) then raise exception 'Nieprawidłowy czas blokady.'; end if;
 return public.admin_rejchat_mute(p_username,case when p_hours=-1 then -1 else p_hours*60 end,'');
end $$;

create or replace function public.admin_rejchat_overview() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare phrases jsonb; blocks jsonb; messages jsonb;
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.phrase),'[]'::jsonb) into phrases from (select id,phrase,created_at from public.rejchat_blocked_phrases order by phrase) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into blocks from (
  select u.username,b.until_at,b.created_at,b.reason from public.rejchat_write_blocks b join public.community_users u on u.id=b.user_id where b.until_at is null or b.until_at>now() order by b.created_at desc limit 200
 ) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into messages from (
  select id,author_name,content,created_at from public.community_chat order by created_at desc,id desc limit 100
 ) q;
 return jsonb_build_object('phrases',phrases,'blocks',blocks,'messages',messages);
end $$;

-- Każda sesja widzi tylko własny stan, nigdy inne konta ani ich wiadomości.
create function public.rejchat_my_mute(p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; block public.rejchat_write_blocks%rowtype;
begin
 select * into me from public.community_session_user(p_token);
 select * into block from public.rejchat_write_blocks where user_id=me.user_id and (until_at is null or until_at>now());
 if not found then return jsonb_build_object('muted',false); end if;
 return jsonb_build_object('muted',true,'until_at',block.until_at,'reason',block.reason);
end $$;
revoke all on function public.rejchat_my_mute(text) from public,anon,authenticated;
grant execute on function public.rejchat_my_mute(text) to anon,authenticated;
notify pgrst,'reload schema';

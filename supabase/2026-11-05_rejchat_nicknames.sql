-- Publiczna nazwa wyświetlana obok niezmienionej nazwy konta.
create table public.rejchat_nicknames (
 user_id uuid primary key references public.community_users(id) on delete cascade,
 nickname text not null default '',
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.rejchat_nicknames enable row level security;
revoke all on public.rejchat_nicknames from public,anon,authenticated;

create function public.rejchat_validate_nickname(p_nickname text) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare n text:=btrim(coalesce(p_nickname,''));
begin
 if n='' then return n; end if;
 if char_length(n)<2 or char_length(n)>32 or n ~ '[[:cntrl:]]' or n ~ '(.)\1{11,}' or n ~* '(https?://|www[.])' or
    n ~ ('['||chr(173)||chr(8203)||chr(8204)||chr(8205)||chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297)||chr(65279)||']') then
  raise exception 'Nick musi mieć 2–32 znaki i nie może zawierać linków ani ukrytych znaków.';
 end if;
 if exists(select 1 from public.rejchat_blocked_phrases where position(lower(phrase) in lower(n))>0) then
  raise exception 'Nick zawiera niedozwoloną frazę.';
 end if;
 return n;
end $$;

create function public.rejchat_set_nickname(p_token text,p_nickname text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; n text; previous timestamptz;
begin
 select * into me from public.community_session_user(p_token);
 if exists(select 1 from public.rejchat_write_blocks where user_id=me.user_id and (until_at is null or until_at>now())) then raise exception 'Twoje konto ma zablokowaną możliwość pisania w RejChat.'; end if;
 n:=public.rejchat_validate_nickname(p_nickname);
 perform pg_advisory_xact_lock(hashtextextended('rejchat-nickname:'||me.user_id::text,0));
 select updated_at into previous from public.rejchat_nicknames where user_id=me.user_id;
 if previous is not null and previous>clock_timestamp()-interval '5 minutes' then raise exception 'Nick można zmienić ponownie po 5 minutach.'; end if;
 insert into public.rejchat_nicknames(user_id,nickname,updated_at) values(me.user_id,n,clock_timestamp())
 on conflict(user_id) do update set nickname=excluded.nickname,updated_at=excluded.updated_at;
 return true;
end $$;

create function public.admin_rejchat_set_nickname(p_username text,p_nickname text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid; n text;
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 select id into target from public.community_users where username_lower=lower(btrim(coalesce(p_username,'')));
 if target is null then raise exception 'Nie znaleziono konta.'; end if;
 n:=public.rejchat_validate_nickname(p_nickname);
 perform pg_advisory_xact_lock(hashtextextended('rejchat-nickname:'||target::text,0));
 insert into public.rejchat_nicknames(user_id,nickname,updated_at) values(target,n,clock_timestamp())
 on conflict(user_id) do update set nickname=excluded.nickname,updated_at=excluded.updated_at;
 return true;
end $$;

create or replace function public.rejchat_get_profiles(p_names text[]) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if coalesce(cardinality(p_names),0)>100 then raise exception 'Za dużo profili.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'username',u.username,'avatar',coalesce(p.avatar,'comet'),'color',coalesce(p.color,'mint'),'bio',coalesce(p.bio,''),
  'is_bot',u.is_bot,'is_owner',u.is_owner,'nickname',coalesce(n.nickname,'')))
 from public.community_users u left join public.rejchat_profiles p on p.user_id=u.id
 left join public.rejchat_nicknames n on n.user_id=u.id
 where u.username_lower in (select lower(trim(x)) from unnest(coalesce(p_names,'{}'::text[])) x where char_length(x) between 3 and 24)), '[]'::jsonb);
end $$;
revoke all on function public.rejchat_validate_nickname(text),public.rejchat_set_nickname(text,text),public.admin_rejchat_set_nickname(text,text) from public,anon,authenticated;
grant execute on function public.rejchat_set_nickname(text,text) to anon,authenticated;
grant execute on function public.admin_rejchat_set_nickname(text,text) to authenticated;

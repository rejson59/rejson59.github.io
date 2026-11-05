-- Globalna moderacja: frazy i blokady pisania obowiązują dla nowej treści,
-- także w prywatnych rozmowach, których treści nie są ujawniane administratorowi.
create table public.rejchat_blocked_phrases (
 id uuid primary key default gen_random_uuid(), phrase text not null check(char_length(phrase) between 2 and 80),
 created_at timestamptz not null default now()
);
create unique index rejchat_blocked_phrases_lower_idx on public.rejchat_blocked_phrases(lower(phrase));
create table public.rejchat_write_blocks (
 user_id uuid primary key references public.community_users(id) on delete cascade,
 until_at timestamptz, created_at timestamptz not null default now()
);
alter table public.rejchat_blocked_phrases enable row level security;
alter table public.rejchat_write_blocks enable row level security;
revoke all on public.rejchat_blocked_phrases, public.rejchat_write_blocks from public, anon, authenticated;

create function public.rejchat_enforce_moderation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.rejchat_write_blocks b where b.user_id=new.author_id and (b.until_at is null or b.until_at>now())) then
   raise exception 'Twoje konto ma zablokowaną możliwość pisania w RejChat.';
 end if;
 if exists(select 1 from public.rejchat_blocked_phrases f where position(lower(f.phrase) in lower(new.content))>0) then
   raise exception 'Treść zawiera niedozwoloną frazę. Zmień wiadomość i spróbuj ponownie.';
 end if;
 return new;
end $$;
revoke all on function public.rejchat_enforce_moderation() from public,anon,authenticated;
create trigger rejchat_moderate_chat before insert or update of content on public.community_chat for each row execute function public.rejchat_enforce_moderation();
create trigger rejchat_moderate_post before insert or update of content on public.community_posts for each row execute function public.rejchat_enforce_moderation();
create trigger rejchat_moderate_comment before insert or update of content on public.community_comments for each row execute function public.rejchat_enforce_moderation();
create trigger rejchat_moderate_dm before insert or update of content on public.rejchat_dm_messages for each row execute function public.rejchat_enforce_moderation();

create function public.admin_rejchat_overview() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare phrases jsonb; blocks jsonb; messages jsonb;
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.phrase),'[]'::jsonb) into phrases from (select id,phrase,created_at from public.rejchat_blocked_phrases order by phrase) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into blocks from (
  select u.username,b.until_at,b.created_at from public.rejchat_write_blocks b join public.community_users u on u.id=b.user_id where b.until_at is null or b.until_at>now() order by b.created_at desc limit 200
 ) q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into messages from (
  select id,author_name,content,created_at from public.community_chat order by created_at desc,id desc limit 100
 ) q;
 return jsonb_build_object('phrases',phrases,'blocks',blocks,'messages',messages);
end $$;

create function public.admin_rejchat_phrase(p_phrase text, p_delete_id uuid default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_phrase text:=btrim(coalesce(p_phrase,'')); n integer;
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rejchat-moderation-phrases',0));
 if p_delete_id is not null then delete from public.rejchat_blocked_phrases where id=p_delete_id; get diagnostics n=row_count; return n>0; end if;
 if char_length(v_phrase)<2 or char_length(v_phrase)>80 or v_phrase ~ '[[:cntrl:]]' then raise exception 'Fraza musi mieć 2–80 znaków i nie może zawierać znaków sterujących.'; end if;
 if (select count(*) from public.rejchat_blocked_phrases)>=500 then raise exception 'Limit 500 fraz.'; end if;
 insert into public.rejchat_blocked_phrases(phrase) values(v_phrase);
 return true;
end $$;

-- 0 zdejmuje blokadę, 1/24/168 godzin, -1 bezterminowo.
create function public.admin_rejchat_write_block(p_username text,p_hours integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare target record;
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 if p_hours is null or p_hours not in (0,1,24,168,-1) then raise exception 'Nieprawidłowy czas blokady.'; end if;
 select id,is_owner,is_bot into target from public.community_users where username_lower=lower(btrim(coalesce(p_username,'')));
 if target.id is null then raise exception 'Nie znaleziono konta.'; end if;
 if target.is_owner or target.is_bot then raise exception 'Nie można zablokować tego konta.'; end if;
 if p_hours=0 then delete from public.rejchat_write_blocks where user_id=target.id;
 else insert into public.rejchat_write_blocks(user_id,until_at) values(target.id,case when p_hours=-1 then null else now()+make_interval(hours=>p_hours) end)
 on conflict(user_id) do update set until_at=excluded.until_at,created_at=now(); end if;
 return true;
end $$;

create function public.admin_rejchat_delete_messages(p_ids uuid[]) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.'; end if;
 if coalesce(array_length(p_ids,1),0)<1 or coalesce(array_length(p_ids,1),0)>100 then raise exception 'Wybierz od 1 do 100 wiadomości.'; end if;
 delete from public.community_chat where id=any(p_ids); get diagnostics n=row_count; return n;
end $$;
revoke all on function public.admin_rejchat_overview(),public.admin_rejchat_phrase(text,uuid),public.admin_rejchat_write_block(text,integer),public.admin_rejchat_delete_messages(uuid[]) from public,anon,authenticated;
grant execute on function public.admin_rejchat_overview(),public.admin_rejchat_phrase(text,uuid),public.admin_rejchat_write_block(text,integer),public.admin_rejchat_delete_messages(uuid[]) to authenticated;

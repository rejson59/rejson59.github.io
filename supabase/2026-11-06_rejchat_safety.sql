-- Zgłoszenia są dobrowolne: administrator widzi wyłącznie zgłoszony tekst DM, nigdy całą rozmowę ani zdjęcia.
create table public.rejchat_user_blocks (
 blocker_id uuid not null references public.community_users(id) on delete cascade,
 blocked_id uuid not null references public.community_users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(), primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create table public.rejchat_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.community_users(id) on delete cascade,
 target_id uuid references public.community_users(id) on delete set null, target_name text not null,
 scope text not null check(scope in ('public','private','profile')), subject_key text not null,
 snapshot text not null default '' check(char_length(snapshot)<=2000), category text not null check(category in ('spam','abuse','sexual','threat','other')),
 note text not null default '' check(char_length(note)<=500), created_at timestamptz not null default clock_timestamp(),
 resolved_at timestamptz, resolved_by uuid
);
create index rejchat_reports_reporter_date on public.rejchat_reports(reporter_id,created_at desc);
create index rejchat_reports_open_date on public.rejchat_reports(created_at desc) where resolved_at is null;
create table public.rejchat_warnings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.community_users(id) on delete cascade,
 reason text not null check(char_length(reason) between 3 and 300), created_at timestamptz not null default clock_timestamp(),
 issued_by uuid not null, read_at timestamptz
);
create index rejchat_warnings_user_date on public.rejchat_warnings(user_id,created_at desc);
alter table public.rejchat_user_blocks enable row level security;
alter table public.rejchat_reports enable row level security;
alter table public.rejchat_warnings enable row level security;
revoke all on public.rejchat_user_blocks,public.rejchat_reports,public.rejchat_warnings from public,anon,authenticated;

-- Blokada działa symetrycznie na nowe/edytowane DM, zdjęcia oraz nowe reakcje w DM.
-- Obie operacje biorą ten sam lock pary: wysyłka i blokada nie mogą się wyprzedzić.
create function public.rejchat_pair_lock(a uuid,b uuid) returns void language sql volatile set search_path=pg_catalog,pg_temp as $$
 select pg_advisory_xact_lock(hashtextextended('rejchat-safety-pair:'||least(a,b)::text||':'||greatest(a,b)::text,0))
$$;
create function public.rejchat_check_dm_block() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare lo uuid; hi uuid;begin
 if tg_table_name='rejchat_dm_messages' then select user_low,user_high into lo,hi from public.rejchat_dm_threads where id=new.thread_id;
 else select t.user_low,t.user_high into lo,hi from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id where m.id=new.message_id;end if;
 if lo is null or hi is null then raise exception 'Rozmowa jest niedostępna.';end if;
 perform public.rejchat_pair_lock(lo,hi);
 if exists(select 1 from public.rejchat_user_blocks b where (b.blocker_id=lo and b.blocked_id=hi) or (b.blocker_id=hi and b.blocked_id=lo)) then raise exception 'Nie można wysłać wiadomości lub reakcji w tej rozmowie.';end if;
 return new;
end $$;
create trigger rejchat_dm_block_messages before insert or update of content on public.rejchat_dm_messages for each row execute function public.rejchat_check_dm_block();
create trigger rejchat_dm_block_reactions before insert on public.rejchat_dm_reactions for each row execute function public.rejchat_check_dm_block();

create function public.rejchat_block_user(p_token text,p_username text,p_block boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; other_id uuid;begin
 select * into me from public.community_session_user(p_token);
 if p_block is null then raise exception 'Nieprawidłowa operacja.';end if;
 select id into other_id from public.community_users where username_lower=lower(btrim(coalesce(p_username,'')));
 if other_id is null then raise exception 'Nie znaleziono konta.';end if;
 if other_id=me.user_id then raise exception 'Nie możesz zablokować swojego konta.';end if;
 perform public.rejchat_pair_lock(me.user_id,other_id);
 if p_block then
  perform pg_advisory_xact_lock(hashtextextended('rejchat-block-user:'||me.user_id::text,0));
  if not exists(select 1 from public.rejchat_user_blocks where blocker_id=me.user_id and blocked_id=other_id) and (select count(*) from public.rejchat_user_blocks where blocker_id=me.user_id)>=500 then raise exception 'Osiągnięto limit blokad.';end if;
  insert into public.rejchat_user_blocks(blocker_id,blocked_id) values(me.user_id,other_id) on conflict do nothing;
 else delete from public.rejchat_user_blocks where blocker_id=me.user_id and blocked_id=other_id;end if;
 return jsonb_build_object('blocked',p_block);
end $$;
create function public.rejchat_block_status(p_token text,p_username text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; other_id uuid;begin
 select * into me from public.community_session_user(p_token);select id into other_id from public.community_users where username_lower=lower(btrim(coalesce(p_username,'')));
 if other_id is null then raise exception 'Nie znaleziono konta.';end if;
 return jsonb_build_object('blocked',exists(select 1 from public.rejchat_user_blocks where blocker_id=me.user_id and blocked_id=other_id));
end $$;

create function public.rejchat_report(p_token text,p_scope text,p_message_id uuid,p_username text,p_category text,p_note text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me record; author_id uuid; author_name text; content_text text:=''; subject text; report_id uuid; note_text text:=btrim(coalesce(p_note,''));begin
 select * into me from public.community_session_user(p_token);
 if p_scope is null or p_scope not in ('public','private','profile') or p_category is null or p_category not in ('spam','abuse','sexual','threat','other') or char_length(note_text)>500 then raise exception 'Nieprawidłowe zgłoszenie.';end if;
 if p_scope='profile' then
  select id,username into author_id,author_name from public.community_users where username_lower=lower(btrim(coalesce(p_username,'')));subject:=author_id::text;
 elsif p_scope='public' then
  select m.author_id,m.author_name,m.content into author_id,author_name,content_text from public.community_chat m where m.id=p_message_id;subject:=p_message_id::text;
 else
  select m.author_id,u.username,m.content into author_id,author_name,content_text from public.rejchat_dm_messages m join public.rejchat_dm_threads t on t.id=m.thread_id join public.community_users u on u.id=m.author_id where m.id=p_message_id and (t.user_low=me.user_id or t.user_high=me.user_id);subject:=p_message_id::text;
 end if;
 if author_name is null or subject is null then raise exception 'Zgłaszana treść jest niedostępna.';end if;
 if author_id=me.user_id or lower(author_name)=lower(me.username) then raise exception 'Nie możesz zgłosić własnej treści ani profilu.';end if;
 perform pg_advisory_xact_lock(hashtextextended('rejchat-report:'||me.user_id::text,0));
 if (select count(*) from public.rejchat_reports where reporter_id=me.user_id and created_at>clock_timestamp()-interval '24 hours')>=20 then raise exception 'Limit 20 zgłoszeń na 24 godziny.';end if;
 if exists(select 1 from public.rejchat_reports where reporter_id=me.user_id and scope=p_scope and subject_key=subject and resolved_at is null) then raise exception 'To zgłoszenie już oczekuje na rozpatrzenie.';end if;
 insert into public.rejchat_reports(reporter_id,target_id,target_name,scope,subject_key,snapshot,category,note) values(me.user_id,author_id,author_name,p_scope,subject,coalesce(content_text,''),p_category,note_text) returning id into report_id;
 return jsonb_build_object('id',report_id);
end $$;
create function public.admin_rejchat_reports() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.';end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at asc,q.id asc) from (select r.id,r.scope,r.target_name,r.snapshot,r.category,r.note,r.created_at,u.username as reporter from public.rejchat_reports r join public.community_users u on u.id=r.reporter_id where r.resolved_at is null order by r.created_at asc,r.id asc limit 100) q),'[]'::jsonb);
end $$;
create function public.admin_rejchat_resolve_report(p_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.';end if;
 update public.rejchat_reports set resolved_at=clock_timestamp(),resolved_by=auth.uid() where id=p_id and resolved_at is null;get diagnostics n=row_count;return n>0;
end $$;
create function public.admin_rejchat_warn(p_username text,p_reason text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare target record;reason_text text:=btrim(coalesce(p_reason,''));begin
 if not coalesce(public.is_widget_admin(),false) then raise exception 'Brak uprawnień administratora.';end if;
 if char_length(reason_text)<3 or char_length(reason_text)>300 then raise exception 'Powód musi mieć 3–300 znaków.';end if;
 select id,is_owner,is_bot into target from public.community_users where username_lower=lower(btrim(coalesce(p_username,'')));
 if target.id is null then raise exception 'Nie znaleziono konta.';end if;
 if target.is_owner or target.is_bot then raise exception 'Nie można ostrzec tego konta.';end if;
 perform pg_advisory_xact_lock(hashtextextended('rejchat-warn:'||target.id::text,0));
 if (select count(*) from public.rejchat_warnings where user_id=target.id and created_at>clock_timestamp()-interval '24 hours')>=10 then raise exception 'Limit ostrzeżeń dla konta na 24 godziny.';end if;
 insert into public.rejchat_warnings(user_id,reason,issued_by) values(target.id,reason_text,auth.uid());return true;
end $$;
create function public.rejchat_my_warnings(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me record;begin
 select * into me from public.community_session_user(p_token);
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (select id,reason,created_at from public.rejchat_warnings where user_id=me.user_id and read_at is null order by created_at desc limit 20) q),'[]'::jsonb));
end $$;
create function public.rejchat_ack_warning(p_token text,p_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare me record;n integer;begin
 select * into me from public.community_session_user(p_token);update public.rejchat_warnings set read_at=clock_timestamp() where id=p_id and user_id=me.user_id and read_at is null;get diagnostics n=row_count;return n>0;
end $$;
revoke all on function public.rejchat_pair_lock(uuid,uuid),public.rejchat_check_dm_block(),public.rejchat_block_user(text,text,boolean),public.rejchat_block_status(text,text),public.rejchat_report(text,text,uuid,text,text,text),public.admin_rejchat_reports(),public.admin_rejchat_resolve_report(uuid),public.admin_rejchat_warn(text,text),public.rejchat_my_warnings(text),public.rejchat_ack_warning(text,uuid) from public,anon,authenticated;
grant execute on function public.rejchat_block_user(text,text,boolean),public.rejchat_block_status(text,text),public.rejchat_report(text,text,uuid,text,text,text),public.rejchat_my_warnings(text),public.rejchat_ack_warning(text,uuid) to anon,authenticated;
grant execute on function public.admin_rejchat_reports(),public.admin_rejchat_resolve_report(uuid),public.admin_rejchat_warn(text,text) to authenticated;
select cron.schedule('rejchat-safety-cleanup','23 4 * * *',$cron$delete from public.rejchat_reports where created_at<clock_timestamp()-interval '90 days';delete from public.rejchat_warnings where created_at<clock_timestamp()-interval '180 days';$cron$);

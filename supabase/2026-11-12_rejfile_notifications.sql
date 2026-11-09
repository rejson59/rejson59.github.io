-- Powiadomienia o plikach: wyłącznie przesyłki skierowane na konto,
-- po potwierdzonym zakończeniu uploadu. Stare pliki nie są importowane.
create table public.rejfile_notifications (
  transfer_id uuid primary key references public.rejfile_transfers(id) on delete cascade,
  recipient_id uuid not null references public.community_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index rejfile_notifications_recipient_idx on public.rejfile_notifications(recipient_id,created_at desc) where read_at is null;
alter table public.rejfile_notifications enable row level security;
revoke all on public.rejfile_notifications from public, anon, authenticated;

create function public.rejfile_notify_ready() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if old.status='uploading' and new.status='ready' and new.recipient_id is not null and new.expires_at>now() then
    insert into public.rejfile_notifications(transfer_id,recipient_id) values(new.id,new.recipient_id) on conflict do nothing;
  end if;
  return new;
exception when others then
  raise warning 'rejfile notification failed: %', sqlerrm;
  return new;
end $$;
revoke all on function public.rejfile_notify_ready() from public,anon,authenticated;
create trigger rejfile_notify_ready_trigger after update of status on public.rejfile_transfers for each row execute function public.rejfile_notify_ready();

create function public.rejfile_notifications_list(p_token text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid; result jsonb;
begin
  select user_id into me from public.community_session_user(p_token);
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into result from (
    select n.transfer_id as id, n.created_at, t.filename, u.username as sender
    from public.rejfile_notifications n join public.rejfile_transfers t on t.id=n.transfer_id
    left join public.community_users u on u.id=t.sender_id
    where n.recipient_id=me and t.recipient_id=me and n.read_at is null and t.status='ready' and t.expires_at>now()
    order by n.created_at desc limit 100
  ) q;
  return result;
end $$;
create function public.rejfile_notifications_read(p_token text,p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare me uuid; changed integer;
begin
  select user_id into me from public.community_session_user(p_token);
  if coalesce(array_length(p_ids,1),0)>100 then raise exception 'Zbyt wiele powiadomień'; end if;
  update public.rejfile_notifications set read_at=now() where recipient_id=me and read_at is null and (p_ids is null or transfer_id=any(p_ids));
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke all on function public.rejfile_notifications_list(text),public.rejfile_notifications_read(text,uuid[]) from public,anon,authenticated;
grant execute on function public.rejfile_notifications_list(text),public.rejfile_notifications_read(text,uuid[]) to anon,authenticated;

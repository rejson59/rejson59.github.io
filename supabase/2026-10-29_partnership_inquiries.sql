-- Prywatne zapytania o współpracę. Formularz jest publiczny, odczyt wyłącznie
-- dla właściciela panelu (Supabase Auth + is_widget_admin). Bez danych w Issues.
create table if not exists public.partnership_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  kind text not null,
  website text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'read'))
);
alter table public.partnership_inquiries enable row level security;
revoke all on table public.partnership_inquiries from public, anon, authenticated;

create or replace function public.submit_partnership_inquiry(
  p_name text, p_email text, p_kind text, p_message text,
  p_website text default null, p_consent boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_website text := nullif(btrim(coalesce(p_website, '')), '');
  v_id uuid;
begin
  if p_consent is distinct from true then raise exception 'Potwierdź zgodę na kontakt w sprawie zapytania.'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'Podaj nazwę (2–100 znaków).'; end if;
  if char_length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Podaj poprawny adres e-mail.'; end if;
  if p_kind is null or p_kind not in ('banner', 'card', 'other', 'undecided') then raise exception 'Wybierz rodzaj współpracy.'; end if;
  if char_length(v_message) < 20 or char_length(v_message) > 4000 then raise exception 'Opisz propozycję (20–4000 znaków).'; end if;
  if v_website is not null and (char_length(v_website) > 500 or v_website !~* '^https?://[^[:space:]]+$') then
    raise exception 'Adres strony musi zaczynać się od http:// lub https://.';
  end if;
  -- Dwa proste limity, serializowane transakcyjnie; nie jest to CAPTCHA.
  perform pg_advisory_xact_lock(414267310117::bigint);
  if (select count(*) from public.partnership_inquiries where created_at > now() - interval '1 hour') >= 150
     or (select count(*) from public.partnership_inquiries where lower(email) = lower(v_email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Limit wysyłania osiągnięty. Spróbuj ponownie później.';
  end if;
  insert into public.partnership_inquiries(name, email, kind, website, message)
    values(v_name, v_email, p_kind, v_website, v_message) returning id into v_id;
  return jsonb_build_object('received', true);
end;
$$;
revoke all on function public.submit_partnership_inquiry(text,text,text,text,text,boolean) from public;
grant execute on function public.submit_partnership_inquiry(text,text,text,text,text,boolean) to anon, authenticated;

create or replace function public.admin_partnership_inquiries()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(public.is_widget_admin(), false) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select id, created_at, name, email, kind, website, message, status
    from public.partnership_inquiries order by created_at desc limit 100
  ) x), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_partnership_inquiries() from public, anon;
grant execute on function public.admin_partnership_inquiries() to authenticated;

create or replace function public.admin_partnership_action(p_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(public.is_widget_admin(), false) then raise exception 'forbidden'; end if;
  if p_action = 'read' then
    update public.partnership_inquiries set status = 'read' where id = p_id;
  elsif p_action = 'new' then
    update public.partnership_inquiries set status = 'new' where id = p_id;
  elsif p_action = 'delete' then
    delete from public.partnership_inquiries where id = p_id;
  else
    raise exception 'invalid action';
  end if;
  return found;
end;
$$;
revoke all on function public.admin_partnership_action(uuid,text) from public, anon;
grant execute on function public.admin_partnership_action(uuid,text) to authenticated;

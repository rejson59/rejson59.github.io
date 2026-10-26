-- ============================================================================
-- Cichy łapacz błędów + załączniki (zrzuty ekranu / nagrania) do zgłoszeń
-- Projekt: rejson-widgets (hzbqzfimtroixnldzjeq)
-- Migracja: error_reports_and_feedback_media (2026-10-26)
--
-- Zasady prywatności:
--  * anon NIE może czytać tabel (revoke all) — tylko dopisywać przez RPC
--  * w załącznikach nie ma tekstu pól, haseł ani parametrów URL (czyszczone po stronie klienta)
--  * bucket storage jest prywatny; administrator odczytuje pliki przez podpisane URL-e
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Automatycznie wykrywane błędy (jeden wiersz = jeden unikalny błąd)
-- ----------------------------------------------------------------------------
create table if not exists public.error_reports (
  id            uuid primary key default gen_random_uuid(),
  fingerprint   text not null unique,
  kind          text not null default 'js'
                check (kind in ('js', 'promise', 'network', 'preview', 'slow', 'manual')),
  message       text not null default '',
  stack         text,
  source        text,
  page_url      text,
  project_slug  text,
  browser       text,
  os            text,
  viewport      text,
  language      text,
  user_agent    text,
  interactions  jsonb not null default '[]'::jsonb,
  diagnostics   jsonb not null default '{}'::jsonb,
  occurrences   integer not null default 1 check (occurrences >= 1),
  status        text not null default 'new'
                check (status in ('new', 'triaged', 'fixed', 'ignored')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists error_reports_last_seen_idx
  on public.error_reports (last_seen_at desc);
create index if not exists error_reports_status_idx
  on public.error_reports (status, last_seen_at desc);

alter table public.error_reports enable row level security;
revoke all on public.error_reports from anon, authenticated;

-- Zapis raportu: upsert po odcisku, licznik powtórzeń, regresja „fixed" wraca jako nowy
create or replace function public.submit_error_report(
  p_fingerprint   text,
  p_kind          text,
  p_message       text,
  p_stack         text,
  p_source        text,
  p_page_url      text,
  p_project_slug  text,
  p_browser       text,
  p_os            text,
  p_viewport      text,
  p_language      text,
  p_user_agent    text,
  p_interactions  jsonb,
  p_diagnostics   jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fp text := left(trim(coalesce(p_fingerprint, '')), 120);
begin
  if length(v_fp) < 4 then
    return;
  end if;

  insert into public.error_reports (
    fingerprint, kind, message, stack, source, page_url, project_slug,
    browser, os, viewport, language, user_agent, interactions, diagnostics
  ) values (
    v_fp,
    case when p_kind in ('js','promise','network','preview','slow','manual') then p_kind else 'js' end,
    left(coalesce(p_message, ''), 600),
    left(coalesce(p_stack, ''), 4000),
    left(coalesce(p_source, ''), 300),
    left(coalesce(p_page_url, ''), 500),
    left(coalesce(p_project_slug, ''), 80),
    left(coalesce(p_browser, ''), 80),
    left(coalesce(p_os, ''), 40),
    left(coalesce(p_viewport, ''), 40),
    left(coalesce(p_language, ''), 20),
    left(coalesce(p_user_agent, ''), 400),
    coalesce(p_interactions, '[]'::jsonb),
    coalesce(p_diagnostics, '{}'::jsonb)
  )
  on conflict (fingerprint) do update set
    occurrences  = public.error_reports.occurrences + 1,
    last_seen_at = now(),
    message      = excluded.message,
    stack        = coalesce(nullif(excluded.stack, ''), public.error_reports.stack),
    page_url     = excluded.page_url,
    browser      = excluded.browser,
    os           = excluded.os,
    viewport     = excluded.viewport,
    interactions = excluded.interactions,
    diagnostics  = excluded.diagnostics,
    -- błąd, który uznano za naprawiony, a wraca — traktujemy jak nowy (regresja)
    status       = case when public.error_reports.status = 'fixed'
                        then 'new' else public.error_reports.status end;
end;
$$;

revoke all on function public.submit_error_report(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb
) from public;
grant execute on function public.submit_error_report(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb
) to anon, authenticated;

-- Odczyt dla administratora (zgrupowane, najświeższe pierwsze)
create or replace function public.get_admin_errors(
  p_limit  integer default 100,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 300));
begin
  if not public.is_widget_admin() then
    raise exception 'forbidden';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.last_seen_at desc)
    from (
      select id, fingerprint, kind, message, stack, source, page_url, project_slug,
             browser, os, viewport, language, interactions, diagnostics,
             occurrences, status, created_at, last_seen_at
      from public.error_reports
      where p_status is null or status = p_status
      order by last_seen_at desc
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_admin_errors(integer, text) from public;
-- Supabase nadaje anonowi EXECUTE na nowych funkcjach domyślnie — odbieramy jawnie
revoke execute on function public.get_admin_errors(integer, text) from anon;
grant execute on function public.get_admin_errors(integer, text) to authenticated;

create or replace function public.admin_set_error_status(p_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_widget_admin() then
    raise exception 'forbidden';
  end if;
  if p_status not in ('new', 'triaged', 'fixed', 'ignored') then
    raise exception 'invalid status';
  end if;

  update public.error_reports
     set status = p_status
   where id = p_id;

  return found;
end;
$$;

revoke all on function public.admin_set_error_status(uuid, text) from public;
revoke execute on function public.admin_set_error_status(uuid, text) from anon;
grant execute on function public.admin_set_error_status(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Załączniki do zgłoszeń użytkowników (zrzuty, nagrania, pliki)
--    Metadane w bazie, pliki w prywatnym buckecie storage.
-- ----------------------------------------------------------------------------
create table if not exists public.feedback_media (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete cascade,
  fingerprint_id text,
  kind          text not null check (kind in ('screenshot', 'dom', 'replay', 'file')),
  storage_path  text not null,
  mime          text not null default 'application/octet-stream',
  bytes         integer not null default 0 check (bytes >= 0),
  duration_ms   integer,
  created_at    timestamptz not null default now()
);

create index if not exists feedback_media_submission_idx
  on public.feedback_media (submission_id, created_at desc);

alter table public.feedback_media enable row level security;
revoke all on public.feedback_media from anon, authenticated;

-- Dołączenie pliku do zgłoszenia — tylko gdy odcisk zgłaszającego się zgadza
create or replace function public.attach_feedback_media(
  p_submission_id uuid,
  p_fingerprint_id text,
  p_kind          text,
  p_storage_path  text,
  p_mime          text,
  p_bytes         integer,
  p_duration_ms   integer default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if p_submission_id is null or coalesce(length(trim(p_storage_path)), 0) < 4 then
    return null;
  end if;

  if p_kind not in ('screenshot', 'dom', 'replay', 'file') then
    return null;
  end if;

  -- ochrona: plik wolno dołączyć wyłącznie do własnego zgłoszenia
  if not exists (
    select 1 from public.submissions s
     where s.id = p_submission_id
       and coalesce(s.fingerprint_id, '') = coalesce(p_fingerprint_id, '')
  ) then
    return null;
  end if;

  insert into public.feedback_media (
    submission_id, fingerprint_id, kind, storage_path, mime, bytes, duration_ms
  ) values (
    p_submission_id,
    left(coalesce(p_fingerprint_id, ''), 80),
    p_kind,
    left(p_storage_path, 400),
    left(coalesce(p_mime, 'application/octet-stream'), 100),
    greatest(0, coalesce(p_bytes, 0)),
    p_duration_ms
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.attach_feedback_media(uuid, text, text, text, text, integer, integer) from public;
grant execute on function public.attach_feedback_media(uuid, text, text, text, text, integer, integer) to anon, authenticated;

create or replace function public.get_admin_feedback_media(p_limit integer default 60)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 60), 200));
begin
  if not public.is_widget_admin() then
    raise exception 'forbidden';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select m.id, m.submission_id, m.kind, m.storage_path, m.mime, m.bytes,
             m.duration_ms, m.created_at,
             s.title, s.project_name, s.type, s.author_name, s.page_url
      from public.feedback_media m
      left join public.submissions s on s.id = m.submission_id
      order by m.created_at desc
      limit v_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_admin_feedback_media(integer) from public;
revoke execute on function public.get_admin_feedback_media(integer) from anon;
grant execute on function public.get_admin_feedback_media(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Prywatny bucket na załączniki
--    Upload: każdy (anon) może DODAĆ plik, ale nikt bez uprawnień admina
--    nie może go odczytać ani wylistować.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-media',
  'feedback-media',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'video/webm', 'video/mp4']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "feedback_media_insert_any" on storage.objects;
create policy "feedback_media_insert_any"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'feedback-media');

drop policy if exists "feedback_media_admin_read" on storage.objects;
create policy "feedback_media_admin_read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'feedback-media' and public.is_widget_admin());

drop policy if exists "feedback_media_admin_delete" on storage.objects;
create policy "feedback_media_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'feedback-media' and public.is_widget_admin());

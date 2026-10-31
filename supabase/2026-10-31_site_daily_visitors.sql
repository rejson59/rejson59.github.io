-- Wyłącznie publiczny agregat: przybliżona liczba przeglądarek, których
-- zarejestrowane wejście na stronę główną przypada na dzień warszawski.
-- Nie udostępniamy kluczy odwiedzających ani żadnych innych stron.
create or replace function public.site_visitors_today()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'day', (now() at time zone 'Europe/Warsaw')::date,
    'count', count(*)
  )
  from public.page_view_cooldowns
  where project_slug = 'rejson59.github.io'
    and visitor_key like 'v:%'
    and last_counted_at >= (date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw')
    and last_counted_at < ((date_trunc('day', now() at time zone 'Europe/Warsaw') + interval '1 day') at time zone 'Europe/Warsaw');
$$;
revoke all on function public.site_visitors_today() from public;
grant execute on function public.site_visitors_today() to anon, authenticated;

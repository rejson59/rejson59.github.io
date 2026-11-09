-- Treść studia nie jest w repozytorium: pochodzi z prywatnej tabeli w Supabase.
-- Wiersz jest uzupełniany osobno przez administratora, nie przez publiczne migracje.
create schema if not exists studio_private;
revoke all on schema studio_private from public, anon, authenticated;
create table if not exists studio_private.content (
  id boolean primary key default true check (id),
  html text not null, css text not null, javascript text not null,
  updated_at timestamptz not null default now()
);
alter table studio_private.content enable row level security;
revoke all on table studio_private.content from public, anon, authenticated;

create or replace function public.admin_private_studio()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, studio_private
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_widget_admin() then
    raise exception 'Brak dostępu' using errcode = '42501';
  end if;
  select jsonb_build_object('html', html, 'css', css, 'javascript', javascript)
    into result from studio_private.content where id = true;
  if result is null then raise exception 'Studio nie jest dostępne'; end if;
  perform set_config('response.headers', '[{"Cache-Control":"no-store, private"}]', true);
  return result;
end;
$$;
revoke all on function public.admin_private_studio() from public, anon, authenticated;
grant execute on function public.admin_private_studio() to authenticated;

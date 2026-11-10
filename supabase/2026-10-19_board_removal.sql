-- 2026-10-19 — koniec publicznej tablicy pomysłów
--
-- Decyzja właściciela: błędy i pomysły (pigułka „Zgłoś”) trafiają WYŁĄCZNIE
-- do panelu admina. Publiczna tablica znika ze starej i nowej strony.
--
-- Wykonane na projekcie hzbqzfimtroixnldzjeq (przez konektor Supabase):
--   1. odebranie publicznego dostępu do funkcji czytających zgłoszenia,
--   2. wyłączenie flagi `is_public` na istniejących wpisach.
--
-- Czego NIE ruszamy:
--   - `submit_feedback` (2 przeciążenia) — pigułka na stronach i w projektach
--     nadal wysyła zgłoszenia; stare wersje widżetu (v12) też muszą działać,
--     dlatego podpis funkcji z `p_is_public` zostaje,
--   - `get_ecosystem_summary` — z tego korzysta strona główna (js/app.js),
--   - tabela `public.submissions` i jej jedyna polityka RLS
--     `Admins full access on submissions` (is_widget_admin()).

-- 1. Tylko admin/service_role może czytać listę zgłoszeń.
revoke execute on function public.list_public_board(text, text, integer)
  from public, anon, authenticated;

-- 2. Głosowanie na pomysły nie ma już sensu bez publicznej listy.
revoke execute on function public.toggle_upvote(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.toggle_upvote(uuid, text, text)
  from public, anon, authenticated;

-- 3. Historyczne zgłoszenia nie są publiczne.
update public.submissions set is_public = false where is_public = true;

-- Kontrola (oczekiwane: proacl bez anon/authenticated; public_rows = 0):
--   select proname, proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and proname in ('list_public_board','toggle_upvote');
--   select count(*) filter (where is_public) as public_rows from public.submissions;

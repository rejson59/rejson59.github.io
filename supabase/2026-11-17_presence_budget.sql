-- 2026-11-17 · Budżet danych: koniec pętli obecności
--
-- Co się działo (objaw: 4,02 / 5 GB egressu w Supabase Free):
--   1. Klient (js/view-tracker.js) subskrybował przez Realtime tabelę
--      `page_presence` i na KAŻDĄ jej zmianę odbijał własny heartbeat.
--   2. `heartbeat_page_presence()` przy każdym wywołaniu robi UPDATE
--      `page_presence.last_seen_at` — nawet gdy wiersz nie zmienił się
--      w żaden istotny sposób.
--   3. UPDATE → WAL → Realtime rozsyła wiersz do wszystkich kart →
--      każda karta bije ping (debounce 350 ms) → UPDATE → …
--   Pętla kręciła się ~3 razy na sekundę na każdą otwartą kartę.
--
-- Co robi ta migracja:
--   * trigger `page_presence_throttle` — aktualizacja `last_seen_at`
--     częściej niż co 20 s jest pomijana (return null = brak zapisu,
--     brak wpisu w WAL, brak broadcastu). Okno „online” to 90 s, więc
--     nic nie tracimy, a zapisów jest ~60× mniej.
--   * Pomijamy tylko wiersze, w których nie zmieniła się tożsamość
--     (username / fingerprint / client_hash) — zmiana nazwy nadal
--     przechodzi natychmiast.
--
-- Klient (view-tracker.js v11) nie subskrybuje już `page_presence`,
-- więc pętla nie powstanie nawet przy starej wersji skryptu z cache:
-- taki klient dostanie najwyżej jeden broadcast na 20 s.

create or replace function public.page_presence_throttle()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.last_seen_at - old.last_seen_at < interval '20 seconds'
     and new.project_slug = old.project_slug
     and coalesce(new.username, '') = coalesce(old.username, '')
     and coalesce(new.fingerprint_id, '') = coalesce(old.fingerprint_id, '')
     and coalesce(new.client_hash, '') = coalesce(old.client_hash, '') then
    -- Bez zapisu: brak nowej wersji wiersza = brak zdarzenia Realtime.
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists page_presence_throttle on public.page_presence;
create trigger page_presence_throttle
  before update on public.page_presence
  for each row execute function public.page_presence_throttle();

comment on function public.page_presence_throttle() is
  'Pomija zapis page_presence, gdy last_seen_at zmienia się częściej niż co 20 s (ochrona egressu i WAL).';

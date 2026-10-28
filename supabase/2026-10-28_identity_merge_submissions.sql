-- ============================================================================
-- Scalanie tożsamości: dopisanie nicku do WCZEŚNIEJSZYCH anonimowych zgłoszeń
-- Data: 2026-10-28
--
-- Po co: ktoś zagłosował albo zgłosił błąd bez konta (wpis podpisany „Anonim”),
-- a potem założył konto / zalogował się. Bez tego zostawały dwa różne życia:
-- „Anonim” i „jego nick”. Funkcja dopisuje nick do starych wpisów, ale tylko
-- tych, które pochodzą z urządzeń już powiązanych z tym kontem
-- (tabela identity_links, wpis „fp” — zapisuje ją heartbeat_page_presence,
-- gdy osoba jest zalogowana).
--
-- Bezpieczeństwo:
--   • wymaga poprawnego tokenu sesji (inaczej wyjątek),
--   • dotyka WYŁĄCZNIE wierszy bez podpisu (null / '' / 'Anonim'),
--   • nigdy nie nadpisuje podpisu wybranego ręcznie ani cudzego,
--   • nie zmienia updated_at, więc kolejność tablicy się nie przestawia.
--
-- Logowanie na drugim urządzeniu dociąga jego odcisk („fp”) do tego samego
-- nicku, więc „kilka identyfikatorów” samo scala się w jedno konto.
-- ============================================================================

create or replace function public.community_link_submissions(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_username text;
  v_linked integer := 0;
begin
  if p_token is null or char_length(trim(p_token)) < 16 then
    raise exception 'Musisz być zalogowany, aby to zrobić.';
  end if;

  select cu.username into v_username
    from public.community_sessions cs
    join public.community_users cu on cu.id = cs.user_id
   where cs.token_hash = encode(extensions.digest('rejson_comm_sess_v1:' || trim(p_token), 'sha256'), 'hex')
   limit 1;

  if v_username is null then
    raise exception 'Sesja wygasła — zaloguj się ponownie.';
  end if;

  update public.community_sessions
     set last_seen_at = now()
   where token_hash = encode(extensions.digest('rejson_comm_sess_v1:' || trim(p_token), 'sha256'), 'hex');

  update public.submissions s
     set author_name = v_username
   where s.fingerprint_id is not null
     and s.fingerprint_id in (
       select il.value
         from public.identity_links il
        where il.kind = 'fp'
          and lower(il.username) = lower(v_username)
     )
     and (
       s.author_name is null
       or btrim(s.author_name) = ''
       or lower(btrim(s.author_name)) = 'anonim'
     )
     and lower(coalesce(s.author_name, '')) <> lower(v_username);

  get diagnostics v_linked = row_count;

  return jsonb_build_object('username', v_username, 'linked', v_linked);
end;
$function$;

revoke all on function public.community_link_submissions(text) from public;
grant execute on function public.community_link_submissions(text) to anon, authenticated, service_role;

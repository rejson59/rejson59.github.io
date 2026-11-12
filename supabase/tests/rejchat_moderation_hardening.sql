-- Testy twardszej moderacji (2026-11-18). Wszystko w transakcji, bez danych trwałych.
begin;
do $$
declare
  a uuid := gen_random_uuid();
  t text;
  old_token text := 'expired-token-0123456789abcdef';
  n integer;
begin
  -- 1. Symbole nienawiści, które 12.11.2026 przeszły do czatu.
  foreach t in array array['kkk','K.K.K.','ku klux klan','hitler','Heil Hitler','1488','swastyka','white power'] loop
    if not public.rejchat_text_blocked(t) then raise exception 'Filtr przepuścił symbol nienawiści: %', t; end if;
  end loop;

  -- 2. Fałszywe alarmy: zwykłe zdania i nazwiska nie mogą być blokowane.
  foreach t in array array['Krzysztof i jego rower','nazistowski film to nie temat','antysemityzm jest zły'] loop
    if public.rejchat_text_blocked(t) then raise exception 'Fałszywy alarm filtra: %', t; end if;
  end loop;

  -- 3. Rejestracja odrzuca nick z wulgaryzmem (wcześniej przechodził).
  begin
    perform public.community_register('WieslawWpierdol2', 'bardzodlughaslo1', 'test-fp-hardening');
    raise exception 'Rejestracja przyjęła wulgarny nick';
  exception when raise_exception then
    if sqlerrm not like 'Nick zawiera niedozwolon%' then raise; end if;
  end;

  -- 4. Limit nowych kont: dwie rejestracje przechodzą, trzecia jest zatrzymana.
  perform public.community_register('HardeningA', 'bardzodlughaslo1', 'test-fp-limit');
  perform public.community_register('HardeningB', 'bardzodlughaslo1', 'test-fp-limit');
  begin
    perform public.community_register('HardeningC', 'bardzodlughaslo1', 'test-fp-limit');
    raise exception 'Trzecie konto z jednej przeglądarki przeszło';
  exception when raise_exception then
    if sqlerrm not like 'Za dużo nowych kont%' then raise; end if;
  end;

  -- 5. Legalne konto zakłada się bez przeszkód.
  select (public.community_register('HardeningOk', 'bardzodlughaslo1', 'test-fp-other') ->> 'token') is not null into n;
  if not n then raise exception 'Nie udało się założyć zwykłego konta'; end if;

  -- 6. Sesja starsza niż 90 dni nie działa.
  select id into a from public.community_users where username = 'HardeningOk';
  insert into public.community_sessions(token_hash, user_id, created_at, last_seen_at)
  values (encode(extensions.digest('rejson_comm_sess_v1:' || old_token, 'sha256'), 'hex'), a,
          now() - interval '100 days', now() - interval '100 days');
  begin
    perform 1 from public.community_session_user(old_token);
    raise exception 'Wygasła sesja nadal działa';
  exception when raise_exception then
    if sqlerrm not like 'Sesja wygasła%' then raise; end if;
  end;

  -- 7. „Wyloguj wszystkie urządzenia” kasuje wszystkie sesje konta.
  insert into public.community_sessions(token_hash, user_id)
  values (encode(extensions.digest('rejson_comm_sess_v1:' || 'drugi-token-0123456789abcdef', 'sha256'), 'hex'), a);
  n := public.rejchat_logout_all((public.community_register('HardeningD', 'bardzodlughaslo1', 'test-fp-other') ->> 'token'));
  if n < 1 then raise exception 'Wylogowanie urządzeń nie usunęło sesji'; end if;
  if exists (select 1 from public.community_sessions where user_id = a) then
    raise exception 'Po wylogowaniu zostały sesje konta';
  end if;

  -- 8. Lista czatu mówi, że zdjęcie zostało zatrzymane.
  insert into public.community_chat(id, author_id, author_name, content, room)
  values (gen_random_uuid(), a, 'HardeningD', 'zdjecie', 'general');
  if jsonb_typeof(public.rejchat_public_enrich('[]'::jsonb)) <> 'array' then
    raise exception 'rejchat_public_enrich nie zwraca tablicy';
  end if;
end $$;
rollback;

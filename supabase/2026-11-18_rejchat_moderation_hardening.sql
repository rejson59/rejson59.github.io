-- Twardsza moderacja po fali kont z 12.11.2026.
--
-- Audyt po ataku pokazał cztery dziury, których nie łatał żaden wcześniejszy
-- plik:
--  1. przy zakładaniu konta nie był wołany filtr nicków — „WieslawWpierdol”
--     i „UgandyjskaCiota” powstały bez przeszkód,
--  2. filtr nie znał symboli nienawiści („kkk”, „ku klux klan”, „hitler”,
--     „1488”), więc przechodziły do czatu,
--  3. jedno urządzenie mogło założyć dowolnie wiele kont w kilka minut,
--  4. sesja nigdy nie wygasała, a użytkownik nie mógł wylogować innych
--     urządzeń.
--
-- Dodatkowo komunikaty o zdjęciach: po blokadzie zostawała w czacie pusta
-- wiadomość „📷 Zdjęcie”. Teraz lista wie, że zdjęcie zostało zatrzymane,
-- i interfejs może to powiedzieć wprost.

-- ---------------------------------------------------------------------------
-- 1. Symbole nienawiści. Tryb „word” — tylko całe słowa/frazy, żeby nie
--    blokować zwykłych wyrazów („nazistowski” nie jest tu blokowane).
-- ---------------------------------------------------------------------------
-- Uwaga do „nazi”: w treści działa jak każde słowo, ale w nickach jest
-- wyłączone z dopasowania wewnątrz wyrazu (patrz rejchat_nickname_blocked
-- niżej) — inaczej blokowałoby niewinne nazwy typu „Nazir”.
insert into public.rejchat_blocked_phrases(phrase,match_mode)
select v.phrase,'word' from (values
  ('kkk'),('ku klux klan'),('kukluxklan'),
  ('hitler'),('heil hitler'),('sieg heil'),
  ('1488'),('white power'),('swastyka'),('swastyki'),
  ('nazi'),('nazista'),('nazistka'),
  ('antysemita'),('antysemitka')
) v(phrase)
where not exists (select 1 from public.rejchat_blocked_phrases b where lower(b.phrase)=lower(v.phrase));

-- Filtr nicków: „nazi” tylko jako całe słowo. W nicku wyrazy są sklejone,
-- więc dopasowanie wewnątrz „nazir”/„nazistowski” dawałoby fałszywy alarm.
create or replace function public.rejchat_nickname_blocked(p_nickname text)
returns boolean
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare compact text; terms text[]; i integer;
begin
  if public.rejchat_text_blocked(p_nickname) then return true; end if;
  compact := replace(public.rejchat_filter_normalize(p_nickname),' ','');
  if compact = '' then return false; end if;
  select array_agg(t.term) into terms from (
    select public.rejchat_filter_normalize(phrase) term from public.rejchat_blocked_phrases
    where match_mode in ('prefix','word')
  ) t
  where t.term <> '' and position(' ' in t.term) = 0 and char_length(t.term) >= 4
    and t.term <> 'nazi';
  if terms is null then return false; end if;
  for i in 1..cardinality(terms) loop
    if position(terms[i] in compact) > 0 then return true; end if;
  end loop;
  return false;
end $$;
revoke all on function public.rejchat_nickname_blocked(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Rejestracja: filtr nicku + limit nowych kont z jednej przeglądarki.
-- ---------------------------------------------------------------------------
create table if not exists public.community_register_limits (
  fingerprint text primary key,
  window_started timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.community_register_limits enable row level security;
revoke all on public.community_register_limits from public, anon, authenticated;

create or replace function public.community_register(p_username text, p_pin text, p_fp text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_name text := trim(coalesce(p_username, ''));
  v_secret text := coalesce(p_pin, '');
  v_fp text := nullif(btrim(coalesce(p_fp, '')), '');
  v_hash text;
  v_user_id uuid;
  v_canonical text;
  v_token text;
  v_attempts integer;
begin
  if not public.community_username_valid(v_name) then
    raise exception 'Nieprawidłowa nazwa użytkownika (3–24 znaki: litery, cyfry, _ . -).';
  end if;
  -- Nazwa jest widoczna w czacie i w profilu, więc przechodzi ten sam filtr
  -- co każda inna publiczna treść.
  perform public.rejchat_validate_nickname(v_name);
  if v_secret ~ '^[0-9]{4}$' then
    v_hash := encode(extensions.digest('rejson_pin_v1:' || lower(v_name) || ':' || v_secret, 'sha256'), 'hex');
  elsif char_length(v_secret) >= 10 and octet_length(v_secret) <= 72 then
    v_hash := extensions.crypt(v_secret, extensions.gen_salt('bf', 12));
  else
    raise exception 'Hasło powinno mieć co najmniej 10 znaków i maksymalnie 72 bajty.';
  end if;
  if exists (select 1 from public.community_users where username_lower = lower(v_name)) then
    raise exception 'Ta nazwa jest już zajęta — zaloguj się nią zamiast zakładać konto.';
  end if;
  -- Jedno urządzenie nie może zasypać czatu nowymi kontami. Limit dotyczy
  -- tylko zakładania kont, nie logowania na istniejące.
  if v_fp is not null and char_length(v_fp) between 8 and 64 then
    insert into public.community_register_limits(fingerprint, window_started, attempts)
    values (v_fp, now(), 1)
    on conflict (fingerprint) do update set
      attempts = case when community_register_limits.window_started <= now() - interval '10 minutes'
                      then 1 else community_register_limits.attempts + 1 end,
      window_started = case when community_register_limits.window_started <= now() - interval '10 minutes'
                      then now() else community_register_limits.window_started end
    returning attempts into v_attempts;
    if v_attempts > 2 then
      raise exception 'Za dużo nowych kont z tej przeglądarki — odczekaj 10 minut.';
    end if;
  end if;
  insert into public.community_users (username, pin_hash, last_login_at)
    values (v_name, v_hash, now()) returning id, username into v_user_id, v_canonical;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.community_sessions (token_hash, user_id)
    values (encode(extensions.digest('rejson_comm_sess_v1:' || v_token, 'sha256'), 'hex'), v_user_id);
  return jsonb_build_object('token', v_token, 'username', v_canonical);
end $function$;

-- Stara, dwuargumentowa wersja nie ma limitu — usuwamy ją, żeby nikt nie
-- korzystał z obejścia. Wywołanie z dwoma argumentami dalej działa przez
-- wartość domyślną p_fp.
drop function if exists public.community_register(text, text);
grant execute on function public.community_register(text, text, text) to anon, authenticated;

-- Sprzątanie okien starszych niż doba (cron nie musi tego robić).
create or replace function public.community_register_limits_prune()
returns void language sql security definer set search_path=public,pg_temp as $$
  delete from public.community_register_limits where window_started < now() - interval '1 day';
$$;

-- ---------------------------------------------------------------------------
-- 3. Sesja wygasa po 90 dniach bez użycia. Token, którego nikt nie dotknął,
--    nie może działać wiecznie.
-- ---------------------------------------------------------------------------
create or replace function public.community_session_user(p_token text)
returns table(user_id uuid, username text)
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
begin
  if p_token is null or char_length(trim(p_token)) < 16 then
    raise exception 'Musisz być zalogowany, aby to zrobić.';
  end if;

  update public.community_sessions
     set last_seen_at = now()
   where token_hash = encode(extensions.digest('rejson_comm_sess_v1:' || trim(p_token), 'sha256'), 'hex')
     and coalesce(last_seen_at, created_at) > now() - interval '90 days';

  return query
    select cu.id, cu.username
      from public.community_sessions cs
      join public.community_users cu on cu.id = cs.user_id
     where cs.token_hash = encode(extensions.digest('rejson_comm_sess_v1:' || trim(p_token), 'sha256'), 'hex')
       and coalesce(cs.last_seen_at, cs.created_at) > now() - interval '90 days';

  if not found then
    raise exception 'Sesja wygasła — zaloguj się ponownie.';
  end if;
end;
$function$;

-- „Wyloguj wszystkie urządzenia”: kasuje wszystkie sesje konta, także tę,
-- z której wywołano akcję — po powrocie trzeba się zalogować ponownie.
create or replace function public.rejchat_logout_all(p_token text)
returns integer
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare me record; n integer;
begin
  select * into me from public.community_session_user(p_token);
  delete from public.community_sessions where user_id = me.user_id;
  get diagnostics n = row_count;
  return coalesce(n, 0);
end $function$;
grant execute on function public.rejchat_logout_all(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lista czatu wie, że zdjęcie zostało zatrzymane przez moderację.
--    Wcześniej zablokowane zdjęcie wypadało z odpowiedzi i w czacie zostawała
--    wiadomość „📷 Zdjęcie”, pod którą nie było nic.
-- ---------------------------------------------------------------------------
create or replace function public.rejchat_public_enrich(p_rows jsonb)
returns jsonb
language sql stable security definer set search_path=public,pg_temp
as $function$
select coalesce(jsonb_agg(x.obj || jsonb_build_object(
  'edited_at', m.edited_at,
  'reply', case when p.id is null then null else jsonb_build_object('id',p.id,'author_name',p.author_name,'content',left(p.content,140)) end,
  'photo', case when f.id is null then null else jsonb_build_object('id',f.id,'expires_at',f.expires_at,'status',f.status) end
) order by x.n),'[]'::jsonb)
from jsonb_array_elements(p_rows) with ordinality x(obj,n)
join public.community_chat m on m.id=(x.obj->>'id')::uuid
left join public.community_chat p on p.id=m.reply_to and p.room=m.room
left join lateral (
  select f.id, f.expires_at, f.status
    from public.rejchat_photos f
   where f.public_message_id = m.id
   order by (f.status = 'ok') desc, f.created_at desc
   limit 1
) f on true
$function$;

create or replace function public.rejchat_private_enrich(p_rows jsonb, p_thread_id uuid)
returns jsonb
language sql stable security definer set search_path=public,pg_temp
as $function$
select coalesce(jsonb_agg(x.obj || jsonb_build_object(
  'edited_at', m.edited_at,
  'reply', case when p.id is null then null else jsonb_build_object('id',p.id,'author_name',u.username,'content',left(p.content,140)) end,
  'photo', case when f.id is null then null else jsonb_build_object('id',f.id,'expires_at',f.expires_at,'status',f.status) end
) order by x.n),'[]'::jsonb)
from jsonb_array_elements(p_rows) with ordinality x(obj,n)
join public.rejchat_dm_messages m on m.id=(x.obj->>'id')::uuid and m.thread_id=p_thread_id
left join public.rejchat_dm_messages p on p.id=m.reply_to and p.thread_id=m.thread_id
left join public.community_users u on u.id=p.author_id
left join lateral (
  select f.id, f.expires_at, f.status
    from public.rejchat_photos f
   where f.private_message_id = m.id
   order by (f.status = 'ok') desc, f.created_at desc
   limit 1
) f on true
$function$;

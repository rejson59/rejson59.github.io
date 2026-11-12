-- Obejścia, które przeszły w publicznym czacie 12.11.2026:
--  1. słowo pocięte na krótkie kawałki w jednej wiadomości („kur wo”, „je b”),
--  2. treść zapisana jako grupy binarne („01001011 01110101 …”),
--  3. wulgarny nick („WieslawWpierdol”) i bio, których nikt nie sprawdzał.
-- Filtr skleja teraz sąsiednie krótkie słowa i czyta kod binarny,
-- a nick i bio przechodzą przez tę samą listę fraz co czat.

-- Grupy po osiem bitów zamieniamy na tekst; krótsze lub dłuższe ciągi cyfr
-- zostawiamy w spokoju, żeby nie psuć zwykłych liczb w rozmowie.
create or replace function public.rejchat_binary_decode(p_text text)
returns text
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare out_text text:=''; bits text; code integer; groups integer:=0;
begin
 if coalesce(p_text,'')='' then return '';end if;
 if p_text !~ '([01]{8}[^01]+){2,}[01]{8}' then return '';end if;
 for bits in select m[1] from regexp_matches(p_text,'[01]{8}','g') as m loop
  groups:=groups+1;
  code:=bits::bit(8)::integer;
  if code between 32 and 126 then out_text:=out_text||chr(code);end if;
 end loop;
 if groups<3 then return '';end if;
 return out_text;
end $$;

-- Skleja sąsiednie krótkie słowa („kur”+„wo”) i porównuje z listą fraz.
-- Tylko dopasowanie na początku słowa albo całego słowa — bez wyszukiwania
-- w środku zdania, żeby nie blokować zwykłych wypowiedzi.
create or replace function public.rejchat_joined_blocked(p_normalized text)
returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare w text[]; n integer; s integer; l integer; joined text; terms text[]; modes text[]; i integer;
begin
 if coalesce(p_normalized,'')='' then return false;end if;
 w:=regexp_split_to_array(p_normalized,' +');
 n:=cardinality(w);
 if n<2 then return false;end if;
 select array_agg(t.term),array_agg(t.match_mode) into terms,modes from (
   select public.rejchat_filter_normalize(phrase) term,match_mode from public.rejchat_blocked_phrases
   where match_mode in ('prefix','word')
 ) t where t.term<>'' and position(' ' in t.term)=0 and char_length(t.term)>=3;
 if terms is null or cardinality(terms)=0 then return false;end if;
 for s in 1..n-1 loop
  joined:='';
  for l in 1..least(4,n-s+1) loop
   if char_length(w[s+l-1])>4 then exit;end if;
   joined:=joined||w[s+l-1];
   if l<2 then continue;end if;
   if char_length(joined)>10 then exit;end if;
   for i in 1..cardinality(terms) loop
    if modes[i]='prefix' and left(joined,char_length(terms[i]))=terms[i] then return true;end if;
    if modes[i]='word' and joined=terms[i] then return true;end if;
   end loop;
  end loop;
 end loop;
 return false;
end $$;

-- Dotychczasowa logika bez zmian — nowa nazwa, żeby dało się ją wywołać
-- także na tekście odczytanym z kodu binarnego.
create or replace function public.rejchat_text_blocked_core(p_text text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare normalized text:=public.rejchat_filter_normalize(p_text); compressed text; f record; term text; padded text; padded_compressed text; words text[]; compressed_words text[]; mask_text text; unicode_compact text; repeat_words text[]; repeat_term text;
begin
 -- Maskowane formy kontrolujemy osobno; znaki # i * nie są usuwane przed sprawdzeniem.
 mask_text:=lower(normalize(coalesce(p_text,''),NFKC));
 mask_text:=translate(mask_text,chr(173)||chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279)||chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297),'');
 unicode_compact:=regexp_replace(mask_text,'[[:space:][:punct:]]','','g');
 mask_text:=translate(mask_text, 'аесорхукіјѕԁοαεορυχκν', 'aecopxykijsdoaeopuxkv');
 mask_text:=translate(mask_text, '013457@$!', 'oieastasi');
 if mask_text ~ '(^|[^[:alnum:]_])k[#*]{2,4}(wa|a)([^[:alnum:]_]|$)' or
    mask_text ~ '(^|[^[:alnum:]_])q[#*]{2,4}(wa|a)([^[:alnum:]_]|$)' then return true;end if;
 -- Wskazany japoński wyraz, również z odstępami i interpunkcją między znakami.
 if position('売春婦' in unicode_compact)>0 and exists(select 1 from public.rejchat_blocked_phrases where lower(phrase)='売春婦') then return true;end if;
 -- Izolowana treść jednoznacznie seksualna; nie blokujemy zdań o edukacji i zdrowiu.
 if normalized in ('seks','sex') then return true;end if;
 -- Połączenie sygnałów, a nie pojedynczych zwykłych słów, ogranicza fałszywe alarmy.
 if normalized ~ '(^| )samotn[a-z]* (matk[a-z]*|mam[a-z]*)( |$)' and
    normalized ~ '(^| )(zdejm[a-z]*|sciag[a-z]*) (spodn[a-z]*|ubran[a-z]*)( |$)' then return true;end if;
 compressed:=regexp_replace(normalized,'([a-z])\1{2,}','\1','g');
 padded:=' '||normalized||' ';padded_compressed:=' '||compressed||' ';
 words:=regexp_split_to_array(normalized,' +');compressed_words:=regexp_split_to_array(compressed,' +');
 repeat_words:=regexp_split_to_array(regexp_replace(normalized,'([a-z])\1+','\1','g'),' +');
 for f in select phrase,match_mode from public.rejchat_blocked_phrases loop
  if f.match_mode='substring' and position(lower(f.phrase) in lower(coalesce(p_text,'')))>0 then return true;end if;
  term:=public.rejchat_filter_normalize(f.phrase);if term='' then continue;end if;
  if term ~ '^[a-z]{4,}$' and term !~ '([a-z])\1' then
   repeat_term:=regexp_replace(term,'([a-z])\1+','\1','g');
   if f.match_mode='prefix' then
    if exists(select 1 from unnest(repeat_words) w where left(w,length(repeat_term))=repeat_term) then return true;end if;
   elsif repeat_term=any(repeat_words) then return true;end if;
  end if;
  if f.match_mode='prefix' and position(' ' in term)=0 then
   if exists(select 1 from unnest(words||compressed_words) w where left(w,length(term))=term) then return true;end if;
  elsif position(' '||term||' ' in padded)>0 or position(' '||term||' ' in padded_compressed)>0 then return true;
  end if;
 end loop;
 return false;
end $$;

create or replace function public.rejchat_text_blocked(p_text text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare decoded text;
begin
 if public.rejchat_text_blocked_core(p_text) then return true;end if;
 decoded:=public.rejchat_binary_decode(p_text);
 if decoded<>'' and public.rejchat_text_blocked_core(decoded) then return true;end if;
 if public.rejchat_joined_blocked(public.rejchat_filter_normalize(p_text)) then return true;end if;
 return false;
end $$;

-- Nick jest jednym słowem, więc wulgaryzm bywa w środku („WieslawWpierdol”).
-- Dla nicków szukamy dłuższych fraz także wewnątrz wyrazu.
create or replace function public.rejchat_nickname_blocked(p_nickname text)
returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare compact text; terms text[]; i integer;
begin
 if public.rejchat_text_blocked(p_nickname) then return true;end if;
 compact:=replace(public.rejchat_filter_normalize(p_nickname),' ','');
 if compact='' then return false;end if;
 select array_agg(t.term) into terms from (
   select public.rejchat_filter_normalize(phrase) term from public.rejchat_blocked_phrases
   where match_mode in ('prefix','word')
 ) t where t.term<>'' and position(' ' in t.term)=0 and char_length(t.term)>=4;
 if terms is null then return false;end if;
 for i in 1..cardinality(terms) loop
  if position(terms[i] in compact)>0 then return true;end if;
 end loop;
 return false;
end $$;

create or replace function public.rejchat_validate_nickname(p_nickname text)
returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare n text:=btrim(coalesce(p_nickname,''));
begin
 if n='' then return n; end if;
 if char_length(n)<2 or char_length(n)>32 or n ~ '[[:cntrl:]]' or n ~ '(.)\1{11,}' or n ~* '(https?://|www[.])' or
    n ~ ('['||chr(173)||chr(8203)||chr(8204)||chr(8205)||chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297)||chr(65279)||']') then
  raise exception 'Nick musi mieć 2–32 znaki i nie może zawierać linków ani ukrytych znaków.';
 end if;
 if public.rejchat_nickname_blocked(n) then raise exception 'Nick zawiera niedozwoloną frazę.'; end if;
 return n;
end $$;

-- Bio bywa publiczne w czacie i w profilu, więc sprawdzamy je tak samo jak wpisy.
create or replace function public.rejchat_update_profile(p_token text, p_avatar text, p_color text, p_bio text, p_frame text default 'none'::text, p_banner text default 'aurora'::text)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user record; v_bio text := trim(coalesce(p_bio,''));
begin
  select * into v_user from public.community_session_user(p_token);
  if p_avatar is null or p_avatar not in (
    'comet','planet','moon','star','rocket',
    'cat','fox','bee','panda','owl','whale',
    'leaf','flower','mushroom','cactus','wave','snow',
    'cloud','flame','heart','spark','gem','music','coffee'
  ) then raise exception 'Wybierz gotowy awatar.'; end if;
  if p_color is null or p_color not in ('mint','blue','violet','rose','amber','slate') then raise exception 'Wybierz dostępny kolor.'; end if;
  if char_length(v_bio) > 240 then raise exception 'Bio może mieć najwyżej 240 znaków.'; end if;
  if public.rejchat_text_blocked(v_bio) then raise exception 'Bio zawiera niedozwoloną frazę.'; end if;
  if p_frame is null or p_frame not in ('none','ice','violet','rose','amber','prism') then raise exception 'Wybierz dostępną ramkę.'; end if;
  if p_banner is null or p_banner not in ('aurora','ocean','dusk','ember','mono','prism') then raise exception 'Wybierz dostępne tło profilu.'; end if;
  insert into public.rejchat_profiles(user_id,avatar,color,bio,frame,banner,updated_at)
  values(v_user.user_id,p_avatar,p_color,v_bio,p_frame,p_banner,now())
  on conflict(user_id) do update set avatar=excluded.avatar,color=excluded.color,bio=excluded.bio,
    frame=excluded.frame,banner=excluded.banner,updated_at=now();
  return jsonb_build_object('username',v_user.username,'avatar',p_avatar,'color',p_color,
    'bio',v_bio,'frame',p_frame,'banner',p_banner);
end; $$;

-- Formy, które wcześniej przechodziły: „wpierdol” nie łapał się na „pierdol”,
-- bo stoi na początku wyrazu. Słowo „pedał” dodajemy w formach odmienionych,
-- żeby nie blokować zwykłego „pedałować”.
insert into public.rejchat_blocked_phrases(phrase,match_mode)
select v.phrase,v.mode from (values
 ('wpierdol','prefix'),('wypierdal','prefix'),
 ('pedal','word'),('pedala','word'),('pedalem','word'),('pedalu','word'),('pedale','word'),
 ('pedaly','word'),('pedalami','word'),('pedalach','word'),('pedalka','word'),('pedalki','word')
) v(phrase,mode)
where not exists (select 1 from public.rejchat_blocked_phrases b where lower(b.phrase)=lower(v.phrase));

revoke all on function public.rejchat_binary_decode(text) from public, anon, authenticated;
revoke all on function public.rejchat_joined_blocked(text) from public, anon, authenticated;
revoke all on function public.rejchat_text_blocked_core(text) from public, anon, authenticated;
revoke all on function public.rejchat_nickname_blocked(text) from public, anon, authenticated;

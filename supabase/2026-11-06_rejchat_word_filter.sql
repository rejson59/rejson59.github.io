-- Wbudowana, edytowalna przez administratora lista; dotychczasowe frazy zachowują semantykę substring.
-- Filtr obejmuje nową treść i edycje czatu, DM, wpisów, komentarzy i nicków. Nie zapisuje odrzuconej treści.
alter table public.rejchat_blocked_phrases add column match_mode text not null default 'substring' check (match_mode in ('substring','word','prefix'));

-- Rdzenie (prefix) obsługują odmiany, a pojedyncze słowa są ograniczone do granic wyrazów.
-- Nie blokujemy neutralnych określeń tożsamości, zdrowia i edukacji seksualnej.
insert into public.rejchat_blocked_phrases(phrase,match_mode)
select term,mode from (values
 ('kurw','prefix'),('chuj','prefix'),('huj','prefix'),('pierdoli','prefix'),('pierdol','prefix'),('pierdole','prefix'),('pierdoln','prefix'),('pierdolc','prefix'),
 ('spierdal','prefix'),('wypierdal','prefix'),('odpierd','prefix'),('przypierd','prefix'),('napierd','prefix'),('rozpierdal','prefix'),('rozpierdol','prefix'),
 ('zapierdal','prefix'),('popierdol','prefix'),('zajeb','prefix'),('jebac','prefix'),('jeban','prefix'),('jebn','prefix'),('jebne','prefix'),('wyjeb','prefix'),
 ('dojeb','prefix'),('odjeb','prefix'),('pojeb','prefix'),('przejeb','prefix'),('najeb','prefix'),('zjeb','prefix'),('jeb','word'),('jebie','prefix'),
 ('skurw','prefix'),('sukinsyn','prefix'),('sukinsynow','prefix'),('cwel','prefix'),('cweli','prefix'),('ciul','prefix'),('ciota','word'),('cioty','word'),
 ('debil','prefix'),('idiot','prefix'),('kretyn','prefix'),('imbecyl','prefix'),('glupku','word'),('glupcze','word'),('glupolu','word'),('glupia','word'),('glupi','word'),
 ('szmato','word'),('szuja','word'),('szuj','prefix'),('gnido','word'),('gnida','word'),('gnoju','word'),('gnojek','word'),
 ('suko','word'),('dziwka','word'),('dziwko','word'),('dziwki','word'),('dziwek','word'),('dziwkar','prefix'),
 ('buc','word'),('bucu','word'),('bucem','word'),('palant','prefix'),('baranie','word'),('chamie','word'),('cham','word'),('chamow','prefix'),
 ('zabij sie','word'),('zabijesz sie','word'),('powies sie','word'),('zdechnij','word'),('zdychaj','word'),('wypchaj sie','word'),
 ('ciapat','prefix'),('czarnuch','prefix'),('murzynek','word'),('nigger','prefix'),('nigga','word'),
 ('fuck','prefix'),('fucking','prefix'),('fucker','prefix'),('motherfuck','prefix'),('shit','word'),('bullshit','word'),('bitch','prefix'),('asshole','prefix'),('bastard','prefix'),
 ('dickhead','prefix'),('douchebag','prefix'),('dumbass','prefix'),('jackass','prefix'),('dick','word'),('cock','word'),('cunt','prefix'),('whore','prefix'),('slut','prefix'),
 ('faggot','prefix'),('retard','prefix'),('kill yourself','word'),('kys','word'),('go die','word'),
 ('porno','prefix'),('pornhub','prefix'),('pornografia','word'),('pornografii','word'),('pornograficzn','prefix'),('hardcore porno','word'),
 ('ruchac','word'),('ruchanie','word'),('ruchanko','word'),('ruchaj','prefix'),('wyruch','prefix'),('przeruch','prefix'),('przelece cie','word'),
 ('lizanie cipki','word'),('ssij mi','word'),('obciagnij mi','word'),('obciaganie','word'),('loda zrob','word'),('zrob mi loda','word'),('zrobic loda','word'),
 ('cipka','word'),('cipki','word'),('cipke','word'),('cipko','word'),('cipie','word'),('pizda','word'),('pizdo','word'),('pizdy','word'),('pizde','word'),
 ('cycki','word'),('cycek','word'),('cyckow','word'),('fiut','word'),('fiuta','word'),('fiuty','word'),('kutas','prefix'),('chuje','prefix'),('chuja','prefix'),
 ('spusc sie','word'),
 ('seks oralny','word'),('seks analny','word'),('seks grupowy','word'),('erotyczne zdjecia','word'),('nagie zdjecia','word'),('wyslij nudesy','word'),('wyslij nago','word'),
 ('nudes','word'),('nudesy','word'),('nude photo','word'),('send nudes','word'),('blowjob','prefix'),('handjob','prefix'),('gangbang','prefix'),('cumshot','prefix'),
 ('masturbat','prefix'),('orgasm','prefix'),('hardcore sex','word'),('oral sex','word'),('anal sex','word'),('naked pics','word'),('naked photos','word')
) as v(term,mode)
on conflict (lower(phrase)) do nothing;

-- NFKD, diakrytyki, najczęstsze podobne litery i zamiany cyfr/symboli.
-- Łączymy jedynie serie jednoliterowych elementów (k.u.r.w.a), nie całe zdania.
create function public.rejchat_filter_normalize(p_text text) returns text
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare s text; part text; acc text:=''; result text:='';
begin
 s:=lower(normalize(coalesce(p_text,''),NFKD));
 s:=translate(s, 'łđðþæœß', 'lddtaos');
 s:=translate(s, 'аесорхукіјѕԁοαεορυχκν', 'aecopxykijsdoaeopuxkv');
 s:=translate(s, '013457@$!', 'oieastasi');
 s:=regexp_replace(s, '[̀-ͯ]', '', 'g');
 s:=translate(s,chr(173)||chr(8203)||chr(8204)||chr(8205)||chr(8288)||chr(65279)||chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297),'');
 s:=regexp_replace(s,'[^a-z0-9]+',' ','g');
 foreach part in array regexp_split_to_array(btrim(s),' +') loop
  if length(part)=1 then acc:=acc||part;
  else if acc<>'' then result:=result||' '||acc;acc:='';end if; if part<>'' then result:=result||' '||part;end if; end if;
 end loop;
 if acc<>'' then result:=result||' '||acc;end if;
 return btrim(result);
end $$;

create function public.rejchat_text_blocked(p_text text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare normalized text:=public.rejchat_filter_normalize(p_text); compressed text; f record; term text; padded text; padded_compressed text; words text[]; compressed_words text[];
begin
 compressed:=regexp_replace(normalized,'([a-z])\1{2,}','\1','g');
 padded:=' '||normalized||' ';padded_compressed:=' '||compressed||' ';
 words:=regexp_split_to_array(normalized,' +');compressed_words:=regexp_split_to_array(compressed,' +');
 for f in select phrase,match_mode from public.rejchat_blocked_phrases loop
  if f.match_mode='substring' and position(lower(f.phrase) in lower(coalesce(p_text,'')))>0 then return true;end if;
  term:=public.rejchat_filter_normalize(f.phrase);if term='' then continue;end if;
  if f.match_mode='prefix' and position(' ' in term)=0 then
   if exists(select 1 from unnest(words||compressed_words) w where left(w,length(term))=term) then return true;end if;
  elsif position(' '||term||' ' in padded)>0 or position(' '||term||' ' in padded_compressed)>0 then return true;
  end if;
 end loop;
 return false;
end $$;
revoke all on function public.rejchat_filter_normalize(text),public.rejchat_text_blocked(text) from public,anon,authenticated;

create or replace function public.rejchat_enforce_moderation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.rejchat_write_blocks b where b.user_id=new.author_id and (b.until_at is null or b.until_at>now())) then raise exception 'Twoje konto ma zablokowaną możliwość pisania w RejChat.'; end if;
 if public.rejchat_text_blocked(new.content) then raise exception 'Treść zawiera niedozwoloną frazę. Zmień wiadomość i spróbuj ponownie.'; end if;
 return new;
end $$;

create or replace function public.rejchat_validate_nickname(p_nickname text) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare n text:=btrim(coalesce(p_nickname,''));
begin
 if n='' then return n; end if;
 if char_length(n)<2 or char_length(n)>32 or n ~ '[[:cntrl:]]' or n ~ '(.)\1{11,}' or n ~* '(https?://|www[.])' or
    n ~ ('['||chr(173)||chr(8203)||chr(8204)||chr(8205)||chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297)||chr(65279)||']') then
  raise exception 'Nick musi mieć 2–32 znaki i nie może zawierać linków ani ukrytych znaków.';
 end if;
 if public.rejchat_text_blocked(n) then raise exception 'Nick zawiera niedozwoloną frazę.'; end if;
 return n;
end $$;

-- Nie kompresujemy naturalnych podwójnych liter w zablokowanej frazie: np. „faggot” nie może blokować nazwy instrumentu „fagot”.
create or replace function public.rejchat_phrase_matches(p_text text,p_phrase text,p_mode text) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare normalized text:=public.rejchat_filter_normalize(p_text); term text:=public.rejchat_filter_normalize(p_phrase); compressed text; repeat_words text[]; repeat_term text;
begin
 if p_mode not in ('substring','word','prefix') then return false;end if;
 if p_mode='substring' and coalesce(p_phrase,'')<>'' and position(lower(p_phrase) in lower(coalesce(p_text,'')))>0 then return true;end if;
 if term='' then return false;end if;
 compressed:=regexp_replace(normalized,'([a-z])\1{2,}','\1','g');
 -- Dłuższe, jednolite słowa: warianty z celowym podwajaniem liter.
 -- Tylko całe słowo lub początek słowa, nigdy dowolny fragment po kompresji.
 if term ~ '^[a-z]{4,}$' and term !~ '([a-z])\1' then
  repeat_term:=regexp_replace(term,'([a-z])\1+','\1','g');
  repeat_words:=regexp_split_to_array(regexp_replace(normalized,'([a-z])\1+','\1','g'),' +');
  if p_mode='prefix' then
   if exists(select 1 from unnest(repeat_words) w where left(w,length(repeat_term))=repeat_term) then return true;end if;
  elsif repeat_term=any(repeat_words) then return true;end if;
 end if;
 if p_mode='prefix' and position(' ' in term)=0 then
  return exists(select 1 from unnest(regexp_split_to_array(normalized,' +')||regexp_split_to_array(compressed,' +')) w where left(w,length(term))=term);
 end if;
 return position(' '||term||' ' in ' '||normalized||' ')>0 or position(' '||term||' ' in ' '||compressed||' ')>0;
end $$;
revoke all on function public.rejchat_phrase_matches(text,text,text) from public,anon,authenticated;

-- Takie same zasady dopasowania dla filtra i podglądu.
create or replace function public.rejchat_text_blocked(p_text text) returns boolean
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

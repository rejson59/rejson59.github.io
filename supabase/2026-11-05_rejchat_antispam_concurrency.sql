-- Zablokuj istniejący wiersz już przy UPSERT, również podczas czyszczenia stanu.
create or replace function public.rejchat_enforce_antispam() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_kind text; v_delay interval; v_window interval; v_max integer;
 v_now timestamptz:=clock_timestamp(); v_clean text; v_links integer;
 s public.rejchat_antispam_state%rowtype; v_sig text;
begin
 v_clean:=lower(regexp_replace(translate(coalesce(new.content,''),chr(8203)||chr(8204)||chr(8205)||chr(65279)||chr(173),''),'[[:space:]]+',' ','g'));
 select count(*) into v_links from regexp_matches(v_clean,'(https?://|www[.])','g');
 if v_links>3 then raise exception 'Za dużo linków w jednej wiadomości. Zostaw najwyżej 3.'; end if;
 if v_clean ~ '(.)\1{23,}' then raise exception 'Treść zawiera zbyt długi ciąg powtarzających się znaków. Zmień ją i spróbuj ponownie.'; end if;
 -- Edycje także sprawdzamy, ale nie wliczamy ich do limitu wysyłania.
 if tg_op='UPDATE' then return new; end if;
 case tg_table_name
  when 'community_chat' then v_kind:='chat'; v_delay:=interval '2 seconds'; v_window:=interval '1 minute'; v_max:=20;
  when 'rejchat_dm_messages' then v_kind:='dm'; v_delay:=interval '2 seconds'; v_window:=interval '1 minute'; v_max:=20;
  when 'community_comments' then v_kind:='comment'; v_delay:=interval '3 seconds'; v_window:=interval '1 minute'; v_max:=10;
  when 'community_posts' then v_kind:='post'; v_delay:=interval '15 seconds'; v_window:=interval '10 minutes'; v_max:=3;
  else raise exception 'Nieznany rodzaj treści RejChat.';
 end case;
 insert into public.rejchat_antispam_state(user_id,kind) values(new.author_id,v_kind) on conflict (user_id,kind) do update set touched_at=public.rejchat_antispam_state.touched_at;
 select * into s from public.rejchat_antispam_state where user_id=new.author_id and kind=v_kind for update;
 -- Pobieramy czas dopiero po ewentualnym oczekiwaniu na blokadę wiersza.
 v_now:=clock_timestamp();
 if s.last_sent is not null and v_now < s.last_sent+v_delay then
  raise exception 'Wysyłasz zbyt szybko. Odczekaj chwilę i spróbuj ponownie.';
 end if;
 if v_now>=s.window_start+v_window then s.window_start:=v_now; s.sent_count:=0; end if;
 if s.sent_count>=v_max then raise exception 'Osiągnięto tymczasowy limit wysyłania. Spróbuj ponownie później.'; end if;
 if v_now>=s.recent_start+interval '2 minutes' then s.recent_start:=v_now; s.signatures:='{}'; end if;
 -- Krótkie odpowiedzi, np. „tak” i „hej”, nie podlegają kontroli duplikatów.
 if char_length(btrim(v_clean))>=15 then
  v_sig:=encode(extensions.hmac(convert_to(btrim(v_clean),'UTF8'),s.salt,'sha256'),'hex');
  if v_sig=any(s.signatures) then raise exception 'Ta treść została niedawno wysłana. Zmień ją lub spróbuj ponownie później.'; end if;
  s.signatures:=array_append(s.signatures,v_sig);
  if cardinality(s.signatures)>10 then s.signatures:=s.signatures[cardinality(s.signatures)-9:cardinality(s.signatures)]; end if;
 end if;
 update public.rejchat_antispam_state set last_sent=v_now,window_start=s.window_start,sent_count=s.sent_count+1,
  recent_start=s.recent_start,signatures=s.signatures,touched_at=v_now where user_id=new.author_id and kind=v_kind;
 return new;
end $$;

create index rejchat_antispam_touched_idx on public.rejchat_antispam_state(touched_at);

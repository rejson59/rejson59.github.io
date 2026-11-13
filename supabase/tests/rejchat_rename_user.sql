-- © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
--
-- Wymuszona zmiana nazwy konta (admin_rejchat_rename_user):
-- nowa nazwa przechodzi filtr, kopie w treściach idą za nią, użytkownik
-- dostaje ostrzeżenie, a konto nie jest banowane. Wszystko wycofywane.
begin;
do $$
declare a uuid:=gen_random_uuid(); admin_id uuid; name_a text:='R'||substr(replace(a::text,'-',''),1,20); r text;
begin
 insert into public.community_users(id,username,pin_hash) values(a,name_a,'test');
 insert into public.community_chat(author_id,author_name,content,room) values(a,name_a,'Wiadomość testowa','general');
 select user_id into admin_id from public.widget_admins limit 1;
 if admin_id is null then raise exception 'brak admina testowego'; end if;
 perform set_config('request.jwt.claims','{"sub":"'||admin_id::text||'","role":"authenticated"}',true);

 begin
  perform public.admin_rejchat_rename_user(name_a,'blackn1gger','test');
  raise exception 'Slur w nowej nazwie przeszedł';
 exception when raise_exception then
  if sqlerrm not like 'Nick zawiera niedozwoloną frazę%' then raise; end if;
 end;

 r:=public.admin_rejchat_rename_user(name_a,'Konto_test_1','nazwa zawierała treści dyskryminujące');
 if r<>'Konto_test_1' then raise exception 'zły wynik zmiany nazwy'; end if;
 if (select username from public.community_users where id=a)<>'Konto_test_1' then raise exception 'nazwa konta nie zmieniona'; end if;
 if (select author_name from public.community_chat where author_id=a)<>'Konto_test_1' then raise exception 'kopia w czacie nie zmieniona'; end if;
 if not exists(select 1 from public.rejchat_warnings where user_id=a and position('Konto_test_1' in reason)>0) then raise exception 'brak ostrzeżenia z nową nazwą'; end if;

 begin
  perform public.admin_rejchat_rename_user(name_a,'Konto_test_2','test');
  raise exception 'Stara nazwa nadal działa';
 exception when raise_exception then
  if sqlerrm not like 'Nie znaleziono konta%' then raise; end if;
 end;

 if public.admin_rejchat_rename_user('Konto_test_1','Konto_test_1','test')<>'Konto_test_1' then raise exception 'Zmiana na tę samą nazwę nie jest neutralna'; end if;
end $$;
rollback;

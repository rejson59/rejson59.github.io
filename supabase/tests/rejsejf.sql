-- Konta testowe i elementy są cofane.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); ta text:=gen_random_uuid()::text; tb text:=gen_random_uuid()::text; r jsonb; n uuid; f uuid; t timestamptz;
begin
 insert into public.community_users(id,username,pin_hash) values (a,'T'||substr(replace(a::text,'-',''),1,20),'test'),(b,'T'||substr(replace(b::text,'-',''),1,20),'test');
 insert into public.community_sessions(token_hash,user_id) values (encode(extensions.digest('rejson_comm_sess_v1:'||ta,'sha256'),'hex'),a),(encode(extensions.digest('rejson_comm_sess_v1:'||tb,'sha256'),'hex'),b);
 r:=public.rejsejf_save(ta,'note','A','tajna notatka',null,null); n:=(r->>'id')::uuid; t:=(r->>'updated_at')::timestamptz;
 if public.rejsejf_get(ta,n)->>'content'<>'tajna notatka' then raise exception 'zła treść'; end if;
 if jsonb_array_length(public.rejsejf_list(tb))<>0 then raise exception 'wyciek listy'; end if;
 begin perform public.rejsejf_get(tb,n); raise exception 'wyciek'; exception when raise_exception then if sqlerrm='wyciek' then raise; end if; end;
 if public.rejsejf_delete(tb,n) then raise exception 'obce usunięcie'; end if;
 perform public.rejsejf_save(ta,'note','B','zmiana',n,t);
 begin perform public.rejsejf_save(ta,'note','C','stare',n,t); raise exception 'brak ochrony konfliktu'; exception when raise_exception then if sqlerrm='brak ochrony konfliktu' then raise; end if; end;
 r:=public.rejsejf_save(ta,'file','a.bin','AAEC/w==',null,null); f:=(r->>'id')::uuid;
 if decode(public.rejsejf_get(ta,f)->>'content','base64') <> decode('AAEC/w==','base64') then raise exception 'plik różni się'; end if;
 if has_table_privilege('anon','public.rejsejf_items','SELECT') then raise exception 'dostęp do tabeli'; end if;
 begin perform public.rejsejf_list('invalid-invalid-invalid'); raise exception 'nieprawidłowy token przyjęty'; exception when raise_exception then if sqlerrm='nieprawidłowy token przyjęty' then raise; end if; end;
 begin perform public.rejsejf_save(ta,'note','duża',repeat('a',102401),null,null); raise exception 'zbyt duża notatka'; exception when raise_exception then if sqlerrm='zbyt duża notatka' then raise; end if; end;
 if not public.rejsejf_delete(ta,n) then raise exception 'brak usunięcia'; end if;
end $$;
rollback;

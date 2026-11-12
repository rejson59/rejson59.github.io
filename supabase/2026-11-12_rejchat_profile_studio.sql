-- © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
--
-- Profil 2.0 (Szklane profile):
--   • większa galeria awatarów (24 wzory w czterech kategoriach),
--   • ramka awatara (frame) i tło nagłówka profilu (banner),
--   • data ostatniej zmiany profilu w odpowiedzi publicznej.
--
-- Zmiana jest wyłącznie rozszerzająca:
--   • istniejące wiersze dostają frame='none' i banner='aurora',
--   • stary klient wysyłający 4 argumenty nadal działa (nowe mają DEFAULT),
--   • stary klient dostaje dodatkowe pola w JSON i po prostu je pomija.
-- Nie zmieniamy kont, sesji, wiadomości ani pozostałych tabel.

alter table public.rejchat_profiles
  add column if not exists frame  text not null default 'none',
  add column if not exists banner text not null default 'aurora';

alter table public.rejchat_profiles drop constraint if exists rejchat_profiles_avatar_check;
alter table public.rejchat_profiles add constraint rejchat_profiles_avatar_check check (avatar in (
  -- kosmos
  'comet','planet','moon','star','rocket',
  -- zwierzęta
  'cat','fox','bee','panda','owl','whale',
  -- natura
  'leaf','flower','mushroom','cactus','wave','snow',
  -- klimat
  'cloud','flame','heart','spark','gem','music','coffee'
));

alter table public.rejchat_profiles drop constraint if exists rejchat_profiles_frame_check;
alter table public.rejchat_profiles add constraint rejchat_profiles_frame_check
  check (frame in ('none','ice','violet','rose','amber','prism'));

alter table public.rejchat_profiles drop constraint if exists rejchat_profiles_banner_check;
alter table public.rejchat_profiles add constraint rejchat_profiles_banner_check
  check (banner in ('aurora','ocean','dusk','ember','mono','prism'));

create or replace function public.rejchat_get_profiles(p_names text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(cardinality(p_names),0) > 100 then raise exception 'Za dużo profili.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'username', u.username, 'avatar', coalesce(p.avatar,'comet'),
    'color', coalesce(p.color,'mint'), 'bio', coalesce(p.bio,''),
    'frame', coalesce(p.frame,'none'), 'banner', coalesce(p.banner,'aurora'),
    'updated_at', p.updated_at,
    'is_bot', u.is_bot, 'is_owner', u.is_owner))
    from public.community_users u left join public.rejchat_profiles p on p.user_id=u.id
    where u.username_lower in (select lower(trim(x)) from unnest(coalesce(p_names,'{}'::text[])) x
      where char_length(x) between 3 and 24)), '[]'::jsonb);
end; $$;

-- Stara, czteroargumentowa wersja ustępuje miejsca nowej z wartościami
-- domyślnymi. Bez tego PostgreSQL miałby dwie przeciążone funkcje i wybór
-- przy wywołaniu z czterema argumentami byłby niejednoznaczny.
drop function if exists public.rejchat_update_profile(text,text,text,text);

create or replace function public.rejchat_update_profile(
  p_token text, p_avatar text, p_color text, p_bio text,
  p_frame text default 'none', p_banner text default 'aurora'
)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  if p_frame is null or p_frame not in ('none','ice','violet','rose','amber','prism') then raise exception 'Wybierz dostępną ramkę.'; end if;
  if p_banner is null or p_banner not in ('aurora','ocean','dusk','ember','mono','prism') then raise exception 'Wybierz dostępne tło profilu.'; end if;
  insert into public.rejchat_profiles(user_id,avatar,color,bio,frame,banner,updated_at)
  values(v_user.user_id,p_avatar,p_color,v_bio,p_frame,p_banner,now())
  on conflict(user_id) do update set avatar=excluded.avatar,color=excluded.color,bio=excluded.bio,
    frame=excluded.frame,banner=excluded.banner,updated_at=now();
  return jsonb_build_object('username',v_user.username,'avatar',p_avatar,'color',p_color,
    'bio',v_bio,'frame',p_frame,'banner',p_banner);
end; $$;

revoke all on function public.rejchat_get_profiles(text[]) from public;
revoke all on function public.rejchat_update_profile(text,text,text,text,text,text) from public;
grant execute on function public.rejchat_get_profiles(text[]) to anon, authenticated;
grant execute on function public.rejchat_update_profile(text,text,text,text,text,text) to anon, authenticated;

-- Odśwież cache PostgREST, żeby REST od razu widział nowe pola.
notify pgrst, 'reload schema';

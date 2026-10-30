-- Publiczne, opcjonalne profile. Żadne istniejące wpisy, sesje ani wiadomości nie są zmieniane.
create table if not exists public.rejchat_profiles (
  user_id uuid primary key references public.community_users(id) on delete cascade,
  avatar text not null default 'comet' check (avatar in ('comet','planet','cat','fox','leaf','cloud','heart','spark')),
  color text not null default 'mint' check (color in ('mint','blue','violet','rose','amber','slate')),
  bio text not null default '' check (char_length(bio) <= 240),
  updated_at timestamptz not null default now()
);
alter table public.rejchat_profiles enable row level security;
revoke all on public.rejchat_profiles from anon, authenticated;

-- Tylko publiczne pola, zapytanie ograniczone do 100 podanych nazw; dane konta nie są zwracane.
create or replace function public.rejchat_get_profiles(p_names text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(cardinality(p_names),0) > 100 then raise exception 'Za dużo profili.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'username', u.username, 'avatar', coalesce(p.avatar,'comet'),
    'color', coalesce(p.color,'mint'), 'bio', coalesce(p.bio,''),
    'is_bot', u.is_bot, 'is_owner', u.is_owner))
    from public.community_users u left join public.rejchat_profiles p on p.user_id=u.id
    where u.username_lower in (select lower(trim(x)) from unnest(coalesce(p_names,'{}'::text[])) x
      where char_length(x) between 3 and 24)), '[]'::jsonb);
end; $$;

create or replace function public.rejchat_update_profile(p_token text, p_avatar text, p_color text, p_bio text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user record; v_bio text := trim(coalesce(p_bio,''));
begin
  select * into v_user from public.community_session_user(p_token);
  if p_avatar is null or p_avatar not in ('comet','planet','cat','fox','leaf','cloud','heart','spark') then raise exception 'Wybierz gotowy awatar.'; end if;
  if p_color is null or p_color not in ('mint','blue','violet','rose','amber','slate') then raise exception 'Wybierz dostępny kolor.'; end if;
  if char_length(v_bio) > 240 then raise exception 'Bio może mieć najwyżej 240 znaków.'; end if;
  insert into public.rejchat_profiles(user_id,avatar,color,bio,updated_at)
  values(v_user.user_id,p_avatar,p_color,v_bio,now())
  on conflict(user_id) do update set avatar=excluded.avatar,color=excluded.color,bio=excluded.bio,updated_at=now();
  return jsonb_build_object('username',v_user.username,'avatar',p_avatar,'color',p_color,'bio',v_bio);
end; $$;
revoke all on function public.rejchat_get_profiles(text[]) from public;
revoke all on function public.rejchat_update_profile(text,text,text,text) from public;
grant execute on function public.rejchat_get_profiles(text[]) to anon, authenticated;
grant execute on function public.rejchat_update_profile(text,text,text,text) to anon, authenticated;

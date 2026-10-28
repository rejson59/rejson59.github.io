-- ============================================================================
-- list_public_board: dopisanie updated_at do odpowiedzi
-- Data: 2026-10-28
--
-- Po co: powiadomienia w js/premium.js pokazują, KIEDY coś się stało
-- („wdrożone 5 min temu”). Funkcja nie zwracała updated_at, więc klient
-- podstawiał bieżącą godzinę — czyli czas odpytania serwera, nie zdarzenia.
-- Przy okazji: „czeka na reakcję” i sortowanie też korzystają z prawdziwej daty.
--
-- Zmiana jest addytywna (jeden nowy klucz w jsonb), reszta zachowania bez zmian,
-- łącznie z filtrem status <> 'closed' (serwer nie wysyła zamkniętych).
-- ============================================================================

create or replace function public.list_public_board(
  p_project_slug text default null::text,
  p_voter_key text default null::text,
  p_limit integer default 60
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_hash text := case
    when p_voter_key is not null and char_length(trim(p_voter_key)) >= 8
      then encode(extensions.digest(trim(p_voter_key), 'sha256'), 'hex')
    else null
  end;
  v_items jsonb;
begin
  select coalesce(jsonb_agg(item_obj), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'id', s.id,
      'project_slug', s.project_slug,
      'project_name', s.project_name,
      'type', s.type,
      'title', s.title,
      'description', s.description,
      'category', s.category,
      'severity', s.severity,
      'status', s.status,
      'is_pinned', s.is_pinned,
      'is_demo', s.is_demo,
      'upvotes_count', s.upvotes_count,
      'author_name', s.author_name,
      'admin_reply', s.admin_reply,
      'admin_replied_at', s.admin_replied_at,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'has_voted', case
        when v_hash is null then false
        else exists (
          select 1 from public.submission_votes v
          where v.submission_id = s.id and v.voter_hash = v_hash
        )
      end
    ) as item_obj
    from public.submissions s
    where s.is_public = true
      and s.status <> 'closed'
      and (
        p_project_slug is null
        or trim(p_project_slug) = ''
        or lower(s.project_slug) = lower(trim(p_project_slug))
      )
    order by s.is_pinned desc, s.upvotes_count desc, s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 60), 120))
  ) sub;

  return v_items;
end;
$function$;

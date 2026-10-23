-- Schemat bazy danych Supabase dla Rejson Widgets (projekt: hzbqzfimtroixnldzjeq)
-- Wdrożono na żywo przez migrację create_rejson_widgets_core

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.widget_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.widget_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_slug text NOT NULL CHECK (char_length(trim(project_slug)) BETWEEN 1 AND 80),
  project_name text NOT NULL CHECK (char_length(trim(project_name)) BETWEEN 1 AND 120),
  type text NOT NULL CHECK (type IN ('bug', 'idea')),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  category text NOT NULL DEFAULT 'general' CHECK (char_length(category) <= 40),
  severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high', 'critical')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'under_review', 'planned', 'in_progress', 'completed', 'closed')),
  is_public boolean NOT NULL DEFAULT true,
  is_pinned boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  upvotes_count integer NOT NULL DEFAULT 0 CHECK (upvotes_count >= 0),
  author_name text NOT NULL DEFAULT 'Anonim' CHECK (char_length(author_name) <= 60),
  author_contact text DEFAULT NULL CHECK (author_contact IS NULL OR char_length(author_contact) <= 120),
  page_url text DEFAULT NULL CHECK (page_url IS NULL OR char_length(page_url) <= 500),
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_reply text DEFAULT NULL CHECK (admin_reply IS NULL OR char_length(admin_reply) <= 2000),
  admin_replied_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.submission_votes (
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  voter_hash text NOT NULL CHECK (char_length(voter_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, voter_hash)
);

ALTER TABLE public.submission_votes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Presence na żywo — deduplikacja po stałym identyfikatorze przeglądarki (visitor_id)
-- oraz łączny licznik unikalnych osób online na całej domenie.
-- Wdrożono na żywo przez migracje: presence_visitor_dedup_and_total_online
-- oraz fix_count_total_online_volatility (2026-10-22)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.page_presence (
  project_slug text NOT NULL,
  session_key text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_slug, session_key)
);

ALTER TABLE public.page_presence ENABLE ROW LEVEL SECURITY;

-- Heartbeat obecności: jedna osoba (jedna przeglądarka) = jeden rekord,
-- nawet gdy ma otwarte kilka projektów w kilku kartach.
CREATE OR REPLACE FUNCTION public.heartbeat_page_presence(
  p_slug text,
  p_session_id text DEFAULT NULL::text,
  p_action text DEFAULT 'ping'::text,
  p_window_seconds integer DEFAULT 90,
  p_visitor_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_slug text;
  v_window integer;
  v_headers jsonb;
  v_client_ip text;
  v_user_agent text;
  v_session_hash text;
  v_active jsonb;
  v_total integer;
BEGIN
  v_slug := trim(coalesce(p_slug, ''));
  IF v_slug = '' OR char_length(v_slug) > 100 OR v_slug !~ '^[A-Za-z0-9._-]+$' THEN
    RAISE EXCEPTION 'Invalid project_slug';
  END IF;

  SELECT pv.project_slug
    INTO v_slug
    FROM public.page_views pv
   WHERE lower(pv.project_slug) = lower(v_slug)
   LIMIT 1;

  IF v_slug IS NULL THEN
    v_slug := trim(p_slug);
  END IF;

  v_window := greatest(30, least(coalesce(p_window_seconds, 90), 600));

  BEGIN
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := '{}'::jsonb;
  END;

  v_client_ip := trim(split_part(coalesce(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    v_headers ->> 'x-forwarded-for',
    ''
  ), ',', 1));
  v_user_agent := left(coalesce(v_headers ->> 'user-agent', ''), 256);

  v_session_hash := encode(
    extensions.digest(
      CASE
        WHEN p_visitor_id IS NOT NULL AND char_length(trim(p_visitor_id)) >= 8
          THEN 'rejson_presence_v2:' || trim(p_visitor_id)
        ELSE 'rejson_presence_v1:' || coalesce(nullif(trim(p_session_id), ''), v_client_ip || ':' || v_user_agent)
      END,
      'sha256'
    ),
    'hex'
  );

  DELETE FROM public.page_presence
   WHERE last_seen_at < (now() - interval '5 minutes');

  IF lower(coalesce(p_action, 'ping')) = 'leave' THEN
    DELETE FROM public.page_presence
     WHERE project_slug = v_slug
       AND session_key = v_session_hash;
  ELSE
    INSERT INTO public.page_presence (project_slug, session_key, last_seen_at)
    VALUES (v_slug, v_session_hash, now())
    ON CONFLICT (project_slug, session_key)
    DO UPDATE SET last_seen_at = now();
  END IF;

  SELECT coalesce(jsonb_object_agg(sub.project_slug, sub.cnt), '{}'::jsonb)
    INTO v_active
    FROM (
      SELECT pp.project_slug, count(DISTINCT pp.session_key)::integer AS cnt
        FROM public.page_presence pp
       WHERE pp.last_seen_at > (now() - make_interval(secs => v_window))
       GROUP BY pp.project_slug
    ) sub;

  SELECT count(DISTINCT pp.session_key)::integer
    INTO v_total
    FROM public.page_presence pp
   WHERE pp.last_seen_at > (now() - make_interval(secs => v_window));

  RETURN jsonb_build_object(
    'project_slug', v_slug,
    'active_counts', v_active,
    'total_online', v_total
  );
END;
$function$;

-- Lekki licznik łącznej liczby unikalnych osób online (szybkie odpytywanie z UI).
CREATE OR REPLACE FUNCTION public.count_total_online(p_window_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_window integer := greatest(30, least(coalesce(p_window_seconds, 90), 600));
  v_total integer;
  v_active jsonb;
BEGIN
  SELECT count(DISTINCT pp.session_key)::integer
    INTO v_total
    FROM public.page_presence pp
   WHERE pp.last_seen_at > (now() - make_interval(secs => v_window));

  SELECT coalesce(jsonb_object_agg(sub.project_slug, sub.cnt), '{}'::jsonb)
    INTO v_active
    FROM (
      SELECT pp.project_slug, count(DISTINCT pp.session_key)::integer AS cnt
        FROM public.page_presence pp
       WHERE pp.last_seen_at > (now() - make_interval(secs => v_window))
       GROUP BY pp.project_slug
    ) sub;

  RETURN jsonb_build_object(
    'total_online', v_total,
    'window_seconds', v_window,
    'active_counts', v_active,
    'updated_at', now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.heartbeat_page_presence(text, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_total_online(integer) TO anon, authenticated;

-- ============================================================
-- Społeczność (spolecznosc.html) + nazwana obecność (Aktywność)
-- Migracje wykonane na produkcji: community_portal_and_named_presence,
-- fix_community_session_user_volatility
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  username_lower text NOT NULL GENERATED ALWAYS AS (lower(username)) STORED UNIQUE,
  pin_hash text NOT NULL,               -- sha256('rejson_pin_v1:'||lower(username)||':'||pin)
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
ALTER TABLE public.community_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.community_sessions (
  token_hash text PRIMARY KEY,          -- sha256('rejson_comm_sess_v1:'||token)
  user_id uuid NOT NULL REFERENCES public.community_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.community_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.community_users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  content text NOT NULL CHECK (char_length(trim(content)) BETWEEN 3 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_posts_select_public
  ON public.community_posts FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.community_users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  content text NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_comments_select_public
  ON public.community_comments FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.page_presence ADD COLUMN IF NOT EXISTS username text;

-- RPC (SECURITY DEFINER, definicje w migracjach na produkcji):
-- community_username_valid / _status / community_register / community_login /
-- community_whoami / community_session_user / community_create_post /
-- community_list_posts / community_list_comments / community_add_comment /
-- community_delete_post / community_delete_comment /
-- heartbeat_page_presence(+p_token) / get_activity_overview(+identified_users)

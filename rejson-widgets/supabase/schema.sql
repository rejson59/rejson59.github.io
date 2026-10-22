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

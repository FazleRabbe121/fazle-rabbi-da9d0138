DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['zen_jobs','zen_job_applications','zen_rejections','zen_cover_letters','zen_cv_documents','zen_interview_participants','zen_interview_attempts','zen_interview_rubric','zen_ai_conversations','zen_ai_messages','zen_agent_state','zen_finance','zen_family_money','zen_relapses','zen_reports','zen_user_settings','zen_companies','zen_outbox','zen_suppression','zen_events','zen_ai_cache','zen_recipes']
  LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL DEFAULT auth.uid(),
      source text NOT NULL DEFAULT ''app'',
      source_id text,
      data jsonb NOT NULL DEFAULT ''{}''::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, source, source_id))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Own rows read" ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', t);
    EXECUTE format('CREATE POLICY "Own rows insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format('CREATE POLICY "Own rows update" ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format('CREATE POLICY "Own rows delete" ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t || '_touch', t);
  END LOOP;
END $$;

CREATE TABLE public.zen_gmail_tokens (
  user_id uuid PRIMARY KEY,
  google_email text,
  scopes text[] NOT NULL DEFAULT '{}',
  refresh_token_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.zen_gmail_tokens TO service_role;
ALTER TABLE public.zen_gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.zen_job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.zen_job_queue TO service_role;
ALTER TABLE public.zen_job_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX zen_job_queue_pending ON public.zen_job_queue (status, run_after);
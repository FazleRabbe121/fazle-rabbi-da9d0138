-- CareerPilot Agent Engine additive schema template.
-- IMPORTANT: inspect your host database first and adapt user_id to the existing
-- authenticated principal type. This migration deliberately does NOT create,
-- copy, replace or mutate profiles, CVs, Gmail connections, vacancies already
-- owned by the host application, or interview access-control tables.
-- Use only the agent_* tables if your project has no equivalent tables.

create extension if not exists pgcrypto;

create table if not exists public.agent_source_configs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null check (provider in ('greenhouse','lever')),
  employer_name text not null,
  board_identifier text not null,
  region text not null default 'global',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, board_identifier, region)
);

create table if not exists public.agent_vacancies (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  stable_key text not null,
  source_id text not null,
  source_type text not null,
  external_id text,
  title text not null,
  employer text not null,
  location text,
  description text,
  vacancy_url text not null,
  source_url text,
  published_at timestamptz,
  sponsorship_evidence jsonb not null default '{}'::jsonb,
  opportunity_score jsonb not null default '{}'::jsonb,
  application_status text not null default 'new',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, stable_key)
);

create table if not exists public.agent_application_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  vacancy_id uuid references public.agent_vacancies(id) on delete set null,
  existing_cv_id text not null,
  subject text not null,
  email_body text not null,
  cover_letter text not null,
  missing_facts jsonb not null default '[]'::jsonb,
  send_status text not null default 'not_sent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_approval_actions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action_type text not null,
  payload jsonb not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending','executing','executed','rejected','needs_review')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executed_at timestamptz
);

create table if not exists public.agent_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  category text not null,
  level integer not null check (level between 1 and 3),
  mode text not null check (mode in ('spoken','written')),
  question_bank_version text not null,
  rubric_version text not null,
  question_bank jsonb not null default '[]'::jsonb,
  current_question_index integer not null default 0,
  current_question text,
  target_duration_minutes integer not null default 5,
  source_material_count integer not null default 0,
  latest_evaluation jsonb,
  evaluation_status text not null default 'waiting_for_model',
  session_status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_interview_answers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id uuid not null references public.agent_interview_sessions(id) on delete cascade,
  question text not null,
  answer_text text not null,
  mode text not null,
  evaluation jsonb,
  pronunciation_assessment text not null default 'not_assessed_from_text',
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  run_type text not null,
  policy_version text not null,
  status text not null default 'running',
  report jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.agent_daily_run_locks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  run_key text not null,
  status text not null check (status in ('running','completed','failed')),
  run_id uuid references public.agent_runs(id) on delete set null,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, run_key)
);

create table if not exists public.agent_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  actor_type text not null,
  event_type text not null,
  subject_type text,
  subject_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_vacancies_user_score_idx on public.agent_vacancies (user_id, ((opportunity_score->>'score')::numeric) desc);
create index if not exists agent_runs_user_started_idx on public.agent_runs (user_id, started_at desc);
create index if not exists agent_interviews_user_started_idx on public.agent_interview_sessions (user_id, started_at desc);
create index if not exists agent_approvals_user_status_idx on public.agent_approval_actions (user_id, status, created_at desc);

alter table public.agent_source_configs enable row level security;
alter table public.agent_vacancies enable row level security;
alter table public.agent_application_drafts enable row level security;
alter table public.agent_approval_actions enable row level security;
alter table public.agent_interview_sessions enable row level security;
alter table public.agent_interview_answers enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_audit_events enable row level security;
alter table public.agent_daily_run_locks enable row level security;

-- Supabase/Postgres-auth reference policies. Adjust only if the host app uses
-- another auth principal. Service-role backend access must still enforce user_id.
do $$
declare t text;
begin
  foreach t in array array[
    'agent_source_configs','agent_vacancies','agent_application_drafts',
    'agent_approval_actions','agent_interview_sessions','agent_interview_answers',
    'agent_runs','agent_audit_events','agent_daily_run_locks'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_all', t);
    execute format('create policy %I on public.%I for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id)', t || '_owner_all', t);
  end loop;
end $$;

comment on table public.agent_vacancies is 'Agent Engine discoveries only; existing host-app vacancies remain authoritative and should be reused when equivalent.';
comment on table public.agent_application_drafts is 'Drafts reference existing CV Library IDs; CV files are not duplicated.';
comment on table public.agent_approval_actions is 'Atomic single-use approval gate for external actions.';

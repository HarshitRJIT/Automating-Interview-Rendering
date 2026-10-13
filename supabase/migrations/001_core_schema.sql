-- 001_core_schema.sql : core tables for single-owner job search platform
create extension if not exists pgcrypto;

-- Settings: every preference is data, not code
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  careers_url text,
  ats_type text not null check (ats_type in ('greenhouse','lever','rss','json_feed','other_public','unsupported')),
  board_identifier text,
  api_endpoint text,
  enabled boolean not null default true,
  auth_required boolean not null default false,
  etag text,
  last_modified text,
  last_success_at timestamptz,
  last_error text,
  last_http_status int,
  jobs_discovered int not null default 0,
  timestamp_coverage numeric,          -- share of jobs with reliable publish time
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id),
  source_job_id text not null,
  company_name text not null,
  title text not null,
  description_original text,
  description_normalized text,
  job_url text not null,
  canonical_url text,
  location text,
  work_mode text check (work_mode in ('remote','hybrid','onsite','unknown')),
  remote_eligible_india boolean,       -- null = unknown, never assumed
  employment_type text,
  experience_min numeric,
  experience_max numeric,
  skills text[] not null default '{}',
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  source_published_at timestamptz,
  source_updated_at timestamptz,
  source_timestamp_type text not null default 'none'
    check (source_timestamp_type in ('published_datetime','published_date_only','updated_only','none')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  freshness_verified boolean not null default false,
  listing_status text not null default 'open' check (listing_status in ('open','closed','unknown')),
  closed_at timestamptz,
  content_hash text,
  dedupe_key text,
  unique (source_id, source_job_id),
  -- only a real datetime publish stamp may verify freshness
  check (freshness_verified = false or (source_published_at is not null and source_timestamp_type = 'published_datetime'))
);
create index jobs_fresh_idx on jobs (source_published_at desc) where freshness_verified and listing_status='open';
create index jobs_dedupe_idx on jobs (dedupe_key);

-- Same job seen on several platforms: one job, many references
create table job_source_refs (
  job_id uuid references jobs(id) on delete cascade,
  source_id uuid references sources(id),
  source_job_id text,
  url text,
  primary key (job_id, source_id, source_job_id)
);

create table resumes (
  id uuid primary key default gen_random_uuid(),
  version_name text not null,
  filename text not null,
  storage_path text not null,          -- private bucket path, never a public URL
  skills_emphasis text[] default '{}',
  intended_roles text[] default '{}',
  change_notes text,
  active boolean not null default false,
  uploaded_at timestamptz not null default now()
);

create table candidate_profile (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid references resumes(id),
  data jsonb not null,                 -- skills, history, projects, education
  approved boolean not null default false,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table job_matches (
  job_id uuid references jobs(id) on delete cascade,
  profile_id uuid references candidate_profile(id) on delete cascade,
  settings_hash text not null,
  overall_score numeric,
  hard_eligible boolean not null,
  breakdown jsonb not null,
  reasons jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (job_id, profile_id, settings_hash)
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete set null,
  company text not null,               -- snapshot, survives listing removal
  job_title text not null,
  job_url text,
  source text,
  published_at timestamptz,
  discovered_at timestamptz,
  match_score_at_save numeric,
  resume_id uuid references resumes(id),
  preparation_status text not null default 'Saved'
    check (preparation_status in ('Saved','Preparing','Needs information','Ready for review','Skipped')),
  applied_at timestamptz,
  user_confirmed_applied boolean not null default false,
  application_status text not null default 'Saved',
  confirmation_reference text,
  recruiter_contact text,
  follow_up_date date,
  interview_date timestamptz,
  notes text,
  sheets_sync_status text not null default 'pending',
  updated_at timestamptz not null default now(),
  unique (job_id),
  -- "Applied" requires explicit user confirmation
  check (application_status <> 'Applied' or user_confirmed_applied)
);

create table application_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete cascade,
  event text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid unique references jobs(id),   -- one notification per job
  channel text not null default 'in_app',
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table discovery_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null check (status in ('running','completed','partial','failed')),
  sources_scanned int default 0,
  jobs_fetched int default 0,
  jobs_accepted int default 0,
  jobs_stale int default 0,
  jobs_unverified int default 0,
  duplicates_removed int default 0,
  errors jsonb default '[]'
);

create table queue_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null,
  idempotency_key text unique,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);

create table sheet_sync_queue (
  id uuid primary key default gen_random_uuid(),
  worksheet text not null,
  row_key text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','synced','failed')),
  attempts int not null default 0,
  last_error text,
  unique (worksheet, row_key)
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail jsonb,                         -- never store resume text or secrets
  created_at timestamptz not null default now()
);

-- Row-Level Security: lock everything; the server uses the service role.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
-- Add per-table owner policies (auth.uid() = OWNER_USER_ID) in 002_policies.sql.

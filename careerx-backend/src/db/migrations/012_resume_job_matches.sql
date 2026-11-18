create table if not exists resume_job_matches (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid not null references vision_analyses(id) on delete cascade,
  job_description text not null,
  ats_score numeric(5,2) not null check (ats_score between 0 and 100),
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_resume_job_matches_user_created on resume_job_matches(user_id, created_at desc);
alter table resume_job_matches enable row level security;
drop policy if exists resume_job_matches_owner on resume_job_matches;
create policy resume_job_matches_owner on resume_job_matches
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
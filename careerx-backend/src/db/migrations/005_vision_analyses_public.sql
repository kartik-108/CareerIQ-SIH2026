-- Vision resume analysis records and user-scoped access policies.

create table if not exists public.vision_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_url text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size integer not null check (size > 0),
  resume_hash text not null,
  analysis_json jsonb not null,
  ats_score numeric(5, 2) not null check (ats_score between 0 and 100),
  grammar_score numeric(5, 2) check (grammar_score is null or grammar_score between 0 and 100),
  confidence_score numeric(5, 2) check (confidence_score is null or confidence_score between 0 and 100),
  eye_contact_score numeric(5, 2) check (eye_contact_score is null or eye_contact_score between 0 and 100),
  emotion_summary jsonb not null default '{}'::jsonb,
  pdf_url text,
  processing_time integer,
  cache_hit boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.vision_analyses add column if not exists grammar_score numeric(5, 2);

create index if not exists idx_vision_analyses_user_created
  on public.vision_analyses(user_id, created_at desc);

create index if not exists idx_vision_analyses_hash
  on public.vision_analyses(user_id, resume_hash);

alter table public.vision_analyses enable row level security;

drop policy if exists vision_analyses_select_own on public.vision_analyses;
create policy vision_analyses_select_own
  on public.vision_analyses
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists vision_analyses_insert_own on public.vision_analyses;
create policy vision_analyses_insert_own
  on public.vision_analyses
  for insert
  to authenticated
  with check (user_id = auth.uid());
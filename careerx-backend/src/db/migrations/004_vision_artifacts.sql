create table if not exists vision_artifacts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('certificate', 'portfolio')),
  file_url text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size integer not null check (size > 0),
  file_hash text not null,
  analysis_json jsonb not null,
  score numeric(5,2) check (score between 0 and 100),
  created_at timestamptz not null default now(),
  unique(user_id, artifact_type, file_hash)
);
create index if not exists idx_vision_artifacts_user_type_created on vision_artifacts(user_id, artifact_type, created_at desc);

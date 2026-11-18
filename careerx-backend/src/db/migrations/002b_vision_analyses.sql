create table if not exists vision_analyses (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null references auth.users(id) on delete cascade,
  resume_url text not null, storage_path text not null, file_name text not null, mime_type text not null,
  size integer not null check (size > 0), resume_hash text not null, analysis_json jsonb not null,
  ats_score numeric(5,2) not null check (ats_score between 0 and 100), grammar_score numeric(5,2), confidence_score numeric(5,2), eye_contact_score numeric(5,2), emotion_summary jsonb not null default '{}'::jsonb, pdf_url text, processing_time integer, cache_hit boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists idx_vision_analyses_user_created on vision_analyses(user_id, created_at desc);
create index if not exists idx_vision_analyses_hash on vision_analyses(user_id, resume_hash);
alter table vision_analyses add column if not exists grammar_score numeric(5,2);
alter table vision_analyses add column if not exists confidence_score numeric(5,2);
alter table vision_analyses add column if not exists eye_contact_score numeric(5,2);
alter table vision_analyses add column if not exists emotion_summary jsonb not null default '{}'::jsonb;
alter table vision_analyses add column if not exists pdf_url text;
alter table vision_analyses add column if not exists processing_time integer;
alter table vision_analyses add column if not exists cache_hit boolean not null default false;

create table if not exists vision_interview_sessions (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null references auth.users(id) on delete cascade,
  interview_session_id uuid, target_role text, status text not null default 'active', started_at timestamptz not null default now(), ended_at timestamptz, analytics jsonb not null default '{}'::jsonb, feedback jsonb not null default '{}'::jsonb
);
create table if not exists vision_interview_frames (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references vision_interview_sessions(id) on delete cascade, timestamp_ms bigint not null, face_present boolean not null default false, face_count integer not null default 0, landmarks jsonb not null default '[]'::jsonb, analytics jsonb not null default '{}'::jsonb
);
create index if not exists idx_vision_interview_frames_session on vision_interview_frames(session_id, timestamp_ms);

-- ==========================================================
-- CareerX — Initial Schema Migration
-- Run against Supabase Postgres (SQL editor or `npm run migrate`)
-- ==========================================================

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ---------- SUPABASE AUTH PROFILES ----------

create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  college text,
  degree text,
  branch text,
  graduation_year int,
  target_role text,
  bio text,
  avatar_url text,
  location text,
  xp int not null default 0,
  level int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);
create index if not exists idx_profiles_user_id on profiles(user_id);

-- ---------- RESUME ----------

create table if not exists resumes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_url text not null,
  file_type text not null,
  original_filename text,
  extracted_text text,
  version int not null default 1,
  status text not null default 'uploaded' check (status in ('uploaded','processing','processed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_resumes_user_id on resumes(user_id);

create table if not exists resume_analysis (
  id uuid primary key default uuid_generate_v4(),
  resume_id uuid not null references resumes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overall_score numeric(5,2),
  ats_score numeric(5,2),
  grammar jsonb,
  technical_skills jsonb,
  soft_skills jsonb,
  missing_keywords jsonb,
  strong_keywords jsonb,
  education jsonb,
  projects jsonb,
  experience jsonb,
  improvements jsonb,
  summary text,
  raw_ai_response jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_resume_analysis_resume_id on resume_analysis(resume_id);
create index if not exists idx_resume_analysis_user_id on resume_analysis(user_id);

-- ---------- SKILL GAP / ROADMAP ----------

create table if not exists skill_analysis (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid references resumes(id) on delete set null,
  target_role text not null,
  match_score numeric(5,2),
  missing_skills jsonb,
  priority_skills jsonb,
  learning_sequence jsonb,
  estimated_weeks int,
  resources jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_skill_analysis_user_id on skill_analysis(user_id);

create table if not exists career_roadmaps (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_role text not null,
  weekly_plan jsonb,
  monthly_plan jsonb,
  quarter_milestones jsonb,
  projects jsonb,
  certifications jsonb,
  interview_goals jsonb,
  xp_map jsonb,
  progress numeric(5,2) not null default 0,
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_roadmaps_user_id on career_roadmaps(user_id);

-- ---------- INTERVIEW ----------

create table if not exists interview_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  interview_type text not null check (interview_type in ('hr','technical','behavioral','company_specific')),
  target_role text,
  company_name text,
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists idx_interview_sessions_user_id on interview_sessions(user_id);

create table if not exists interview_questions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  question_text text not null,
  question_order int not null,
  category text,
  difficulty text,
  created_at timestamptz not null default now()
);
create index if not exists idx_interview_questions_session_id on interview_questions(session_id);

create table if not exists interview_answers (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid not null references interview_questions(id) on delete cascade,
  session_id uuid not null references interview_sessions(id) on delete cascade,
  transcript text,
  filler_word_count int,
  confidence_score numeric(5,2),
  grammar_score numeric(5,2),
  answer_quality_score numeric(5,2),
  time_taken_seconds int,
  created_at timestamptz not null default now()
);
create index if not exists idx_interview_answers_session_id on interview_answers(session_id);

create table if not exists interview_reports (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overall_score numeric(5,2),
  communication_score numeric(5,2),
  confidence_score numeric(5,2),
  technical_score numeric(5,2),
  strengths jsonb,
  weaknesses jsonb,
  feedback text,
  raw_ai_response jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_interview_reports_session_id on interview_reports(session_id);

-- ---------- CAREER DNA ----------

create table if not exists career_dna (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  communication numeric(5,2),
  problem_solving numeric(5,2),
  creativity numeric(5,2),
  leadership numeric(5,2),
  learning_style text,
  technical_strength jsonb,
  career_personality text,
  risk_areas jsonb,
  growth_opportunities jsonb,
  raw_ai_response jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_career_dna_user_id on career_dna(user_id);

-- ---------- JOBS ----------

create table if not exists jobs_cache (
  id uuid primary key default uuid_generate_v4(),
  source text not null default 'mock',
  title text not null,
  company text not null,
  location text,
  is_remote boolean not null default false,
  salary_min numeric,
  salary_max numeric,
  experience_required text,
  description text,
  required_skills jsonb,
  external_url text,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_jobs_cache_location on jobs_cache(location);
create index if not exists idx_jobs_cache_title on jobs_cache(title);

create table if not exists job_matches (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references jobs_cache(id) on delete cascade,
  resume_id uuid references resumes(id) on delete set null,
  match_percentage numeric(5,2),
  missing_skills jsonb,
  salary_estimate jsonb,
  recommended_projects jsonb,
  recommended_certifications jsonb,
  interview_probability numeric(5,2),
  created_at timestamptz not null default now()
);
create index if not exists idx_job_matches_user_id on job_matches(user_id);

create table if not exists job_bookmarks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs_cache(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, job_id)
);
create index if not exists idx_job_bookmarks_user_id on job_bookmarks(user_id);

-- ---------- NOTIFICATIONS / ACTIVITY ----------

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text,
  type text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_id on notifications(user_id);

create table if not exists activity_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_logs_user_id on activity_logs(user_id);
create index if not exists idx_activity_logs_action on activity_logs(action);

-- ---------- RAG / KNOWLEDGE BASE ----------

create table if not exists knowledge_documents (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text not null,
  source text,
  file_path text,
  content_hash text unique,
  version int not null default 1,
  status text not null default 'pending' check (status in ('pending','chunked','embedded','failed')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_knowledge_documents_category on knowledge_documents(category);
create index if not exists idx_knowledge_documents_status on knowledge_documents(status);

create table if not exists knowledge_chunks (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  token_count int,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_knowledge_chunks_document_id on knowledge_chunks(document_id);

-- Vector dimension for the local nomic-embed-text model.
create table if not exists knowledge_embeddings (
  id uuid primary key default uuid_generate_v4(),
  chunk_id uuid not null references knowledge_chunks(id) on delete cascade,
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  embedding vector(768) not null,
  model text not null default 'nomic-embed-text',
  created_at timestamptz not null default now()
);
create index if not exists idx_knowledge_embeddings_document_id on knowledge_embeddings(document_id);
-- Approximate nearest-neighbour index (IVFFlat). Run `analyze knowledge_embeddings;` after bulk load.
create index if not exists idx_knowledge_embeddings_vector
  on knowledge_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------- FEEDBACK / SETTINGS / GAMIFICATION ----------

create table if not exists feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  category text,
  message text not null,
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id, key)
);

create table if not exists achievements (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  xp_awarded int not null default 0,
  earned_at timestamptz not null default now(),
  unique(user_id, code)
);
create index if not exists idx_achievements_user_id on achievements(user_id);

create table if not exists streaks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active_date date,
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- ---------- updated_at trigger helper ----------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','resumes','career_roadmaps',
    'knowledge_documents','settings'
  ])
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I;', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at();', t);
  end loop;
end $$;

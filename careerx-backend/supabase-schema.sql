-- CareerIQ SIH 2026 - Supabase PostgreSQL schema
-- Paste this file into the Supabase SQL Editor.
-- The service role bypasses RLS; client sessions are restricted to auth.uid().

create extension if not exists pgcrypto;
create extension if not exists vector;

-- Mentor RAG tables. `knowledge_chunks` is the canonical Ollama vector store.
create table if not exists public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null,
  storage_path text not null,
  text_content text not null default '',
  embedding vector(768),
  created_at timestamptz not null default now()
);
create table if not exists public.mentor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New career conversation',
  created_at timestamptz not null default now()
);
create table if not exists public.mentor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.mentor_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  document_id uuid not null,
  chunk_index integer not null default 0,
  content text not null,
  embedding vector(768),
  file_name text not null,
  mime_type text not null,
  page_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.user_context_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  context jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists idx_knowledge_chunks_embedding on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_knowledge_chunks_user on public.knowledge_chunks(user_id, document_id);
create index if not exists idx_mentor_conversations_user on public.mentor_conversations(user_id, created_at desc);
create index if not exists idx_mentor_messages_conversation on public.mentor_messages(conversation_id, created_at);

create or replace function public.match_knowledge_chunks(
  query_embedding vector(768), match_count integer, similarity_threshold float, filter_user_id uuid
)
returns table (id uuid, document_id uuid, file_name text, page_number integer, content text, score float)
language sql stable as $$
  select id, document_id, file_name, page_number, content,
    1 - (embedding <=> query_embedding) as score
  from public.knowledge_chunks
  where (user_id is null or user_id = filter_user_id)
    and embedding is not null
    and 1 - (embedding <=> query_embedding) >= similarity_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

alter table public.rag_documents enable row level security;
alter table public.mentor_conversations enable row level security;
alter table public.mentor_messages enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.user_context_cache enable row level security;
drop policy if exists rag_documents_own on public.rag_documents;
create policy rag_documents_own on public.rag_documents for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists mentor_conversations_own on public.mentor_conversations;
create policy mentor_conversations_own on public.mentor_conversations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists mentor_messages_own on public.mentor_messages;
create policy mentor_messages_own on public.mentor_messages for all to authenticated using (exists (select 1 from public.mentor_conversations c where c.id = conversation_id and c.user_id = auth.uid())) with check (exists (select 1 from public.mentor_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
drop policy if exists knowledge_chunks_own on public.knowledge_chunks;
create policy knowledge_chunks_own on public.knowledge_chunks for all to authenticated using (user_id is null or user_id = auth.uid()) with check (user_id is null or user_id = auth.uid());
drop policy if exists user_context_cache_own on public.user_context_cache;
create policy user_context_cache_own on public.user_context_cache for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keep mutable records' timestamps consistent.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  college text,
  degree text,
  branch text,
  graduation_year integer,
  target_role text,
  bio text,
  avatar_url text,
  location text,
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_url text not null,
  file_type text not null,
  original_filename text,
  extracted_text text,
  version integer not null default 1 check (version > 0),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'processed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.vision_analyses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid references public.resumes(id) on delete cascade,
  resume_url text not null, storage_path text not null, file_name text not null, mime_type text not null,
  size integer not null check (size > 0), resume_hash text not null, analysis_json jsonb not null,
  ats_score numeric(5,2) not null check (ats_score between 0 and 100), grammar_score numeric(5,2), confidence_score numeric(5,2), eye_contact_score numeric(5,2), emotion_summary jsonb not null default '{}'::jsonb, pdf_url text, processing_time integer, cache_hit boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists idx_vision_analyses_user_created on public.vision_analyses(user_id, created_at desc);
create index if not exists idx_vision_analyses_hash on public.vision_analyses(user_id, resume_hash);
create index if not exists idx_vision_analyses_resume_id on public.vision_analyses(resume_id);
create index if not exists idx_resumes_user_file_url on public.resumes(user_id, file_url);
alter table public.vision_analyses enable row level security;
drop policy if exists vision_analyses_select_own on public.vision_analyses;
create policy vision_analyses_select_own on public.vision_analyses for select to authenticated using (user_id = auth.uid());
drop policy if exists vision_analyses_insert_own on public.vision_analyses;
create policy vision_analyses_insert_own on public.vision_analyses for insert to authenticated with check (user_id = auth.uid());
drop policy if exists vision_analyses_delete_own on public.vision_analyses;
create policy vision_analyses_delete_own on public.vision_analyses for delete to authenticated using (user_id = auth.uid());

create table if not exists public.vision_interview_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  interview_session_id uuid, target_role text, status text not null default 'active', started_at timestamptz not null default now(), ended_at timestamptz, analytics jsonb not null default '{}'::jsonb, feedback jsonb not null default '{}'::jsonb
);
create table if not exists public.vision_interview_frames (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.vision_interview_sessions(id) on delete cascade, timestamp_ms bigint not null, face_present boolean not null default false, face_count integer not null default 0, landmarks jsonb not null default '[]'::jsonb, analytics jsonb not null default '{}'::jsonb
);
alter table public.vision_interview_sessions enable row level security;
alter table public.vision_interview_frames enable row level security;
drop policy if exists vision_interview_sessions_own on public.vision_interview_sessions;
create policy vision_interview_sessions_own on public.vision_interview_sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists vision_interview_frames_own on public.vision_interview_frames;
create policy vision_interview_frames_own on public.vision_interview_frames for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.skill_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid references public.resumes(id) on delete set null,
  target_role text not null,
  match_score numeric(5,2) check (match_score between 0 and 100),
  missing_skills jsonb not null default '[]'::jsonb,
  priority_skills jsonb not null default '[]'::jsonb,
  learning_sequence jsonb not null default '[]'::jsonb,
  estimated_weeks integer check (estimated_weeks is null or estimated_weeks >= 0),
  resources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.career_skill_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  target_role text not null,
  match_score numeric(5,2) not null default 0 check (match_score between 0 and 100),
  matched_skills jsonb not null default '[]'::jsonb,
  missing_skills jsonb not null default '[]'::jsonb,
  priority_skills jsonb not null default '[]'::jsonb,
  radar_scores jsonb not null default '{}'::jsonb,
  learning_resources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.career_dna (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  communication numeric(5,2) not null default 0,
  leadership numeric(5,2) not null default 0,
  creativity numeric(5,2) not null default 0,
  problem_solving numeric(5,2) not null default 0,
  technical_strength_score numeric(5,2) not null default 0,
  learning_style text,
  career_personality text,
  growth_opportunities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.career_roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_role text not null,
  weekly_plan jsonb not null default '[]'::jsonb,
  monthly_plan jsonb not null default '[]'::jsonb,
  quarter_milestones jsonb not null default '[]'::jsonb,
  projects jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  interview_goals jsonb not null default '[]'::jsonb,
  xp_map jsonb not null default '{}'::jsonb,
  progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  interview_type text not null
    check (interview_type in ('hr', 'technical', 'behavioral', 'company_specific')),
  target_role text,
  company_name text,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  overall_score numeric(5,2) check (overall_score is null or overall_score between 0 and 100),
  feedback jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create table if not exists public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid references public.resumes(id) on delete set null,
  job_id uuid,
  job_title text,
  company_name text,
  job_url text,
  match_percentage numeric(5,2) check (match_percentage is null or match_percentage between 0 and 100),
  missing_skills jsonb not null default '[]'::jsonb,
  salary_estimate jsonb not null default '{}'::jsonb,
  recommended_projects jsonb not null default '[]'::jsonb,
  recommended_certifications jsonb not null default '[]'::jsonb,
  interview_probability numeric(5,2)
    check (interview_probability is null or interview_probability between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  earned_at timestamptz not null default now(),
  unique (user_id, code)
);

create table if not exists public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  embedding vector(768) not null,
  metadata jsonb not null default '{}'::jsonb,
  source_url text,
  chunk_index integer not null default 0 check (chunk_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Timestamp triggers.
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_resumes_updated_at on public.resumes;
create trigger trg_resumes_updated_at
before update on public.resumes
for each row execute function public.set_updated_at();

drop trigger if exists trg_career_roadmaps_updated_at on public.career_roadmaps;
create trigger trg_career_roadmaps_updated_at
before update on public.career_roadmaps
for each row execute function public.set_updated_at();

drop trigger if exists trg_interviews_updated_at on public.interviews;
create trigger trg_interviews_updated_at
before update on public.interviews
for each row execute function public.set_updated_at();

drop trigger if exists trg_rag_documents_updated_at on public.rag_documents;
create trigger trg_rag_documents_updated_at
before update on public.rag_documents
for each row execute function public.set_updated_at();

-- Query indexes.
create index if not exists idx_resumes_user_created
  on public.resumes (user_id, created_at desc)
  where deleted_at is null;
create index if not exists idx_skill_analysis_user_created
  on public.skill_analysis (user_id, created_at desc);
create index if not exists idx_career_roadmaps_user_status
  on public.career_roadmaps (user_id, status);
create index if not exists idx_interviews_user_created
  on public.interviews (user_id, created_at desc);
create index if not exists idx_job_matches_user_created
  on public.job_matches (user_id, created_at desc);
create index if not exists idx_achievements_user_earned
  on public.achievements (user_id, earned_at desc);
create index if not exists idx_rag_documents_user_chunk
  on public.rag_documents (user_id, source_url, chunk_index);
create index if not exists idx_rag_documents_embedding
  on public.rag_documents using hnsw (embedding vector_cosine_ops);

-- Row Level Security.
alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.skill_analysis enable row level security;
alter table public.career_roadmaps enable row level security;
alter table public.interviews enable row level security;
alter table public.job_matches enable row level security;
alter table public.achievements enable row level security;
alter table public.rag_documents enable row level security;

-- Policies are idempotent so this file can be safely rerun.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete to authenticated using (user_id = auth.uid());

 drop policy if exists resumes_select_own on public.resumes;
create policy resumes_select_own on public.resumes
  for select to authenticated using (user_id = auth.uid());
drop policy if exists resumes_insert_own on public.resumes;
create policy resumes_insert_own on public.resumes
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists resumes_update_own on public.resumes;
create policy resumes_update_own on public.resumes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists resumes_delete_own on public.resumes;
create policy resumes_delete_own on public.resumes
  for delete to authenticated using (user_id = auth.uid());

 drop policy if exists skill_analysis_select_own on public.skill_analysis;
create policy skill_analysis_select_own on public.skill_analysis
  for select to authenticated using (user_id = auth.uid());
drop policy if exists skill_analysis_insert_own on public.skill_analysis;
create policy skill_analysis_insert_own on public.skill_analysis
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists skill_analysis_update_own on public.skill_analysis;
create policy skill_analysis_update_own on public.skill_analysis
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists skill_analysis_delete_own on public.skill_analysis;
create policy skill_analysis_delete_own on public.skill_analysis
  for delete to authenticated using (user_id = auth.uid());

 drop policy if exists career_roadmaps_select_own on public.career_roadmaps;
create policy career_roadmaps_select_own on public.career_roadmaps
  for select to authenticated using (user_id = auth.uid());
drop policy if exists career_roadmaps_insert_own on public.career_roadmaps;
create policy career_roadmaps_insert_own on public.career_roadmaps
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists career_roadmaps_update_own on public.career_roadmaps;
create policy career_roadmaps_update_own on public.career_roadmaps
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists career_roadmaps_delete_own on public.career_roadmaps;
create policy career_roadmaps_delete_own on public.career_roadmaps
  for delete to authenticated using (user_id = auth.uid());

 drop policy if exists interviews_select_own on public.interviews;
create policy interviews_select_own on public.interviews
  for select to authenticated using (user_id = auth.uid());
drop policy if exists interviews_insert_own on public.interviews;
create policy interviews_insert_own on public.interviews
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists interviews_update_own on public.interviews;
create policy interviews_update_own on public.interviews
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists interviews_delete_own on public.interviews;
create policy interviews_delete_own on public.interviews
  for delete to authenticated using (user_id = auth.uid());

 drop policy if exists job_matches_select_own on public.job_matches;
create policy job_matches_select_own on public.job_matches
  for select to authenticated using (user_id = auth.uid());
drop policy if exists job_matches_insert_own on public.job_matches;
create policy job_matches_insert_own on public.job_matches
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists job_matches_update_own on public.job_matches;
create policy job_matches_update_own on public.job_matches
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists job_matches_delete_own on public.job_matches;
create policy job_matches_delete_own on public.job_matches
  for delete to authenticated using (user_id = auth.uid());

 drop policy if exists achievements_select_own on public.achievements;
create policy achievements_select_own on public.achievements
  for select to authenticated using (user_id = auth.uid());
drop policy if exists achievements_insert_own on public.achievements;
create policy achievements_insert_own on public.achievements
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists achievements_update_own on public.achievements;
create policy achievements_update_own on public.achievements
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists achievements_delete_own on public.achievements;
create policy achievements_delete_own on public.achievements
  for delete to authenticated using (user_id = auth.uid());

 drop policy if exists rag_documents_select_own on public.rag_documents;
create policy rag_documents_select_own on public.rag_documents
  for select to authenticated using (user_id = auth.uid());
drop policy if exists rag_documents_insert_own on public.rag_documents;
create policy rag_documents_insert_own on public.rag_documents
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists rag_documents_update_own on public.rag_documents;
create policy rag_documents_update_own on public.rag_documents
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists rag_documents_delete_own on public.rag_documents;
create policy rag_documents_delete_own on public.rag_documents
  for delete to authenticated using (user_id = auth.uid());

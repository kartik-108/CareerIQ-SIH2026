-- Career Lab stores one current snapshot per user for each generated view.

create table if not exists public.career_skill_analysis (
  id uuid primary key default uuid_generate_v4(),
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

alter table public.career_roadmaps
  add column if not exists timeline jsonb not null default '[]'::jsonb,
  add column if not exists weekly_goals jsonb not null default '[]'::jsonb,
  add column if not exists monthly_goals jsonb not null default '[]'::jsonb,
  add column if not exists quarterly_milestones jsonb not null default '[]'::jsonb;

alter table public.career_dna
  add column if not exists technical_strength_score numeric(5,2) not null default 0 check (technical_strength_score between 0 and 100),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists career_roadmaps_user_id_unique on public.career_roadmaps(user_id);
create unique index if not exists career_dna_user_id_unique on public.career_dna(user_id);

drop trigger if exists career_skill_analysis_updated_at on public.career_skill_analysis;
create trigger career_skill_analysis_updated_at
before update on public.career_skill_analysis
for each row execute function public.set_updated_at();

drop trigger if exists career_roadmaps_updated_at on public.career_roadmaps;
create trigger career_roadmaps_updated_at
before update on public.career_roadmaps
for each row execute function public.set_updated_at();

drop trigger if exists career_dna_updated_at on public.career_dna;
create trigger career_dna_updated_at
before update on public.career_dna
for each row execute function public.set_updated_at();
-- Grammar analysis persistence for existing vision_analyses deployments.
-- Safe to run repeatedly against Supabase Postgres.

alter table public.vision_analyses
  add column if not exists analysis_json jsonb;

alter table public.vision_analyses
  add column if not exists grammar_score integer;

alter table public.vision_analyses
  add column if not exists updated_at timestamptz not null default now();

-- Older migrations declared grammar_score as numeric(5,2). Grammar output is an integer.
alter table public.vision_analyses
  alter column grammar_score type integer
  using case when grammar_score is null then null else round(grammar_score)::integer end;

create or replace function public.set_vision_analysis_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vision_analyses_updated_at on public.vision_analyses;
create trigger trg_vision_analyses_updated_at
before update on public.vision_analyses
for each row execute function public.set_vision_analysis_updated_at();

notify pgrst, 'reload schema';

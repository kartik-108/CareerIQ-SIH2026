-- Interview Studio live metrics and report payloads.
alter table if exists interview_sessions add column if not exists duration integer default 0;
alter table if exists interview_sessions add column if not exists communication_score integer default 0;
alter table if exists interview_sessions add column if not exists technical_score integer default 0;
alter table if exists interview_sessions add column if not exists confidence_score integer default 0;
alter table if exists interview_sessions add column if not exists eye_contact_score integer default 0;
alter table if exists interview_sessions add column if not exists posture_score integer default 0;
alter table if exists interview_sessions add column if not exists speech_score integer default 0;
alter table if exists interview_sessions add column if not exists overall_score integer default 0;
alter table if exists interview_sessions add column if not exists report jsonb default '{}'::jsonb;
alter table if exists interview_sessions add column if not exists vision_metrics jsonb default '{}'::jsonb;
alter table if exists interview_sessions add column if not exists speech_metrics jsonb default '{}'::jsonb;
alter table if exists interview_sessions add column if not exists completed_at timestamptz;
alter table if exists interview_sessions add column if not exists created_at timestamptz default now();
alter table if exists interview_sessions add column if not exists updated_at timestamptz default now();
alter table interview_sessions drop constraint if exists interview_sessions_interview_type_check;
alter table interview_sessions add constraint interview_sessions_interview_type_check check (interview_type in ('hr','technical','behavioral','company_specific','aptitude','mixed'));

alter table interview_answers add column if not exists question_number integer;
alter table interview_answers add column if not exists question text;
alter table interview_answers add column if not exists ai_feedback jsonb;
alter table interview_answers add column if not exists score numeric(5,2);
alter table interview_answers add column if not exists fillers jsonb not null default '{}'::jsonb;
alter table interview_answers add column if not exists speaking_speed numeric(6,2);
alter table interview_answers add column if not exists eye_contact numeric(5,2);
alter table interview_answers add column if not exists posture numeric(5,2);
alter table interview_answers add column if not exists confidence numeric(5,2);
create unique index if not exists idx_interview_answers_session_question_unique on interview_answers(session_id, question_number);

alter table if exists interview_reports add column if not exists report jsonb not null default '{}'::jsonb;
alter table if exists interview_reports add column if not exists summary jsonb not null default '{}'::jsonb;
alter table if exists interview_reports add column if not exists interview_session_id uuid;
alter table if exists interview_reports add column if not exists user_id uuid;
alter table if exists interview_reports add column if not exists score integer default 0;
alter table if exists interview_reports add column if not exists strengths jsonb not null default '[]'::jsonb;
alter table if exists interview_reports add column if not exists improvements jsonb not null default '[]'::jsonb;
alter table if exists interview_reports add column if not exists speech_metrics jsonb not null default '{}'::jsonb;
alter table if exists interview_reports add column if not exists vision_metrics jsonb not null default '{}'::jsonb;
alter table if exists interview_reports add column if not exists created_at timestamptz default now();
alter table if exists interview_reports add column if not exists updated_at timestamptz default now();
do $$
begin
	if to_regclass('public.interview_reports') is not null then
		update interview_reports set interview_session_id = session_id where interview_session_id is null and session_id is not null;
	end if;
end $$;
create unique index if not exists idx_interview_reports_session_unique on interview_reports(session_id);
create unique index if not exists idx_interview_reports_interview_session_unique on interview_reports(interview_session_id);

alter table interview_sessions enable row level security;
alter table interview_questions enable row level security;
alter table interview_answers enable row level security;
alter table interview_reports enable row level security;

drop policy if exists interview_sessions_owner on interview_sessions;
create policy interview_sessions_owner on interview_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists interview_questions_owner on interview_questions;
create policy interview_questions_owner on interview_questions for all using (exists (select 1 from interview_sessions s where s.id = session_id and s.user_id = auth.uid())) with check (exists (select 1 from interview_sessions s where s.id = session_id and s.user_id = auth.uid()));
drop policy if exists interview_answers_owner on interview_answers;
create policy interview_answers_owner on interview_answers for all using (exists (select 1 from interview_sessions s where s.id = session_id and s.user_id = auth.uid())) with check (exists (select 1 from interview_sessions s where s.id = session_id and s.user_id = auth.uid()));
drop policy if exists interview_reports_owner on interview_reports;
create policy interview_reports_owner on interview_reports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
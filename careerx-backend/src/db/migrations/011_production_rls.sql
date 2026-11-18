-- Production owner policies for tables reachable from authenticated flows.
-- The backend uses service-role access; these policies protect any direct client access.

do $$
begin
  if to_regclass('public.career_skill_analysis') is not null then
    alter table public.career_skill_analysis enable row level security;
    drop policy if exists career_skill_analysis_owner on public.career_skill_analysis;
    create policy career_skill_analysis_owner on public.career_skill_analysis
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if to_regclass('public.career_dna') is not null then
    alter table public.career_dna enable row level security;
    drop policy if exists career_dna_owner on public.career_dna;
    create policy career_dna_owner on public.career_dna
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if to_regclass('public.career_roadmaps') is not null then
    alter table public.career_roadmaps enable row level security;
    drop policy if exists career_roadmaps_owner on public.career_roadmaps;
    create policy career_roadmaps_owner on public.career_roadmaps
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if to_regclass('public.career_documents') is not null then
    alter table public.career_documents enable row level security;
    drop policy if exists career_documents_owner on public.career_documents;
    create policy career_documents_owner on public.career_documents
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if to_regclass('public.interview_reports') is not null then
    alter table public.interview_reports enable row level security;
    drop policy if exists interview_reports_owner on public.interview_reports;
    create policy interview_reports_owner on public.interview_reports
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if to_regclass('public.chat_history') is not null then
    alter table public.chat_history enable row level security;
    drop policy if exists chat_history_owner on public.chat_history;
    create policy chat_history_owner on public.chat_history
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if to_regclass('public.mentor_conversations') is not null then
    alter table public.mentor_conversations enable row level security;
    drop policy if exists mentor_conversations_owner on public.mentor_conversations;
    create policy mentor_conversations_owner on public.mentor_conversations
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if to_regclass('public.mentor_messages') is not null then
    alter table public.mentor_messages enable row level security;
    drop policy if exists mentor_messages_owner on public.mentor_messages;
    create policy mentor_messages_owner on public.mentor_messages
      for all to authenticated using (exists (select 1 from public.mentor_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
      with check (exists (select 1 from public.mentor_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
  end if;
end $$;

create index if not exists idx_interview_reports_user_created
  on public.interview_reports(user_id, created_at desc);

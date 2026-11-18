-- Resume Studio isolation for databases that already contain Vision analyses.
-- This migration is intentionally repeatable and safe for partially upgraded
-- deployments. The application stores raw_text/custom_sections/parser_version
-- inside analysis_json, so no separate text columns are required.

alter table if exists public.vision_analyses
  add column if not exists resume_id uuid;

do $$
begin
  if to_regclass('public.vision_analyses') is not null
     and to_regclass('public.resumes') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'vision_analyses_resume_id_fkey'
         and conrelid = 'public.vision_analyses'::regclass
     ) then
    alter table public.vision_analyses
      add constraint vision_analyses_resume_id_fkey
      foreign key (resume_id) references public.resumes(id) on delete cascade;
  end if;
end
$$;

-- Older Vision uploads did not create a row in public.resumes. Create a
-- metadata row for each such analysis, then link the analysis to that row.
do $$
begin
  if to_regclass('public.vision_analyses') is not null
     and to_regclass('public.resumes') is not null then
    insert into public.resumes (
      user_id, file_url, file_type, original_filename, extracted_text,
      version, status, created_at, updated_at
    )
    select
      va.user_id,
      va.storage_path,
      va.mime_type,
      va.file_name,
      coalesce(va.analysis_json->>'raw_text', va.analysis_json->'extraction'->>'raw_text'),
      1,
      case
        when coalesce(va.analysis_json->>'raw_text', va.analysis_json->'extraction'->>'raw_text', '') <> ''
          then 'processed'
        else 'uploaded'
      end,
      va.created_at,
      va.created_at
    from public.vision_analyses va
    where va.resume_id is null
      and not exists (
        select 1
        from public.resumes r
        where r.user_id = va.user_id
          and r.file_url = va.storage_path
      );

    update public.vision_analyses va
    set resume_id = r.id
    from public.resumes r
    where va.resume_id is null
      and r.user_id = va.user_id
      and r.file_url = va.storage_path;
  end if;
end
$$;

create index if not exists idx_vision_analyses_resume_id
  on public.vision_analyses(resume_id);

create index if not exists idx_resumes_user_file_url
  on public.resumes(user_id, file_url);

notify pgrst, 'reload schema';

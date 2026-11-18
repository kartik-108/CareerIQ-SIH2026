-- Move existing application foreign keys from the retired public users table
-- to Supabase Auth users. This is safe for databases created from the legacy schema.

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select table_schema, table_name, constraint_name
    from information_schema.table_constraints
    where constraint_type = 'FOREIGN KEY'
      and constraint_schema = 'public'
      and constraint_name in (
        select constraint_name
        from information_schema.constraint_column_usage
        where table_schema = 'public'
          and table_name = 'users'
      )
  loop
    execute format('alter table %I.%I drop constraint if exists %I', constraint_record.table_schema, constraint_record.table_name, constraint_record.constraint_name);
  end loop;
end $$;

do $$
declare
  table_record record;
begin
  for table_record in
    select table_name
    from (values
      ('profiles'), ('resumes'), ('resume_analysis'), ('skill_analysis'),
      ('career_roadmaps'), ('interview_sessions'), ('interview_reports'),
      ('career_dna'), ('job_matches'), ('job_bookmarks'), ('notifications'),
      ('activity_logs'), ('vision_analyses'), ('vision_interview_sessions'),
      ('vision_interview_frames'), ('vision_artifacts')
    ) as tables(table_name)
    where to_regclass('public.' || table_name) is not null
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and columns.table_name = table_record.table_name
        and column_name = 'user_id'
    ) and not exists (
      select 1
      from pg_constraint constraint_row
      join pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
       and attribute_row.attnum = any(constraint_row.conkey)
      where constraint_row.conrelid = ('public.' || table_record.table_name)::regclass
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = 'auth.users'::regclass
        and attribute_row.attname = 'user_id'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
        table_record.table_name,
        table_record.table_name || '_user_id_auth_users_fkey'
      );
    end if;
  end loop;
end $$;
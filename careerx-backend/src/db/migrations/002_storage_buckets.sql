-- ==========================================================
-- CareerX — Supabase Storage bucket setup
-- Run in Supabase SQL editor (requires storage extension, enabled by default)
-- ==========================================================

insert into storage.buckets (id, name, public)
values
  ('resumes', 'resumes', false),
  ('reports', 'reports', false),
  ('avatars', 'avatars', true),
  ('exports', 'exports', false)
on conflict (id) do nothing;

-- Users can only manage files inside a folder named after their own user id.
drop policy if exists "Users can upload their own resumes" on storage.objects;
create policy "Users can upload their own resumes"
on storage.objects for insert
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can read their own resumes" on storage.objects;
create policy "Users can read their own resumes"
on storage.objects for select
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can read their own reports" on storage.objects;
create policy "Users can read their own reports"
on storage.objects for select
using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

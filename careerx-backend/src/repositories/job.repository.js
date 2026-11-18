import { supabase } from '../config/supabase.js';
import { DatabaseError } from '../utils/ApiError.js';

export async function searchJobs({ location, remote, minSalary, role, experience, page, limit }) {
  let query = supabase.from('jobs_cache').select('*', { count: 'exact' });

  if (location) query = query.ilike('location', `%${location}%`);
  if (remote !== undefined) query = query.eq('is_remote', remote);
  if (minSalary) query = query.gte('salary_min', minSalary);
  if (role) query = query.ilike('title', `%${role}%`);
  if (experience) query = query.eq('experience_required', experience);

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.order('posted_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw new DatabaseError(error.message);
  return { jobs: data, total: count };
}

export async function findJobById(jobId) {
  const { data, error } = await supabase.from('jobs_cache').select('*').eq('id', jobId).maybeSingle();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function saveJobMatch(match) {
  const { data, error } = await supabase.from('job_matches').insert(match).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function saveResumeAnalysisMatch(match) {
  const { data, error } = await supabase.from('resume_job_matches').insert(match).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function bookmarkJob(userId, jobId) {
  const { data, error } = await supabase
    .from('job_bookmarks')
    .upsert({ user_id: userId, job_id: jobId }, { onConflict: 'user_id,job_id' })
    .select('*')
    .single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function removeBookmark(userId, jobId) {
  const { error } = await supabase.from('job_bookmarks').delete().eq('user_id', userId).eq('job_id', jobId);
  if (error) throw new DatabaseError(error.message);
}

export async function listBookmarks(userId) {
  const { data, error } = await supabase
    .from('job_bookmarks')
    .select('*, jobs_cache(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new DatabaseError(error.message);
  return data;
}

import { supabase } from '../config/supabase.js';
import { DatabaseError, NotFoundError } from '../utils/ApiError.js';

export async function createResume({ userId, fileUrl, fileType, originalFilename, version }) {
  const { data, error } = await supabase
    .from('resumes')
    .insert({ user_id: userId, file_url: fileUrl, file_type: fileType, original_filename: originalFilename, version })
    .select('*')
    .single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function updateResumeText(resumeId, extractedText) {
  const { error } = await supabase
    .from('resumes')
    .update({ extracted_text: extractedText, status: 'processed' })
    .eq('id', resumeId);
  if (error) throw new DatabaseError(error.message);
}

export async function findResumeById(resumeId, userId) {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', resumeId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new DatabaseError(error.message);
  if (!data) throw new NotFoundError('Resume not found');
  return data;
}

export async function listResumesByUser(userId) {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function saveResumeAnalysis(analysis) {
  const { data, error } = await supabase.from('resume_analysis').insert(analysis).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function getLatestAnalysis(resumeId, userId) {
  const { data, error } = await supabase
    .from('resume_analysis')
    .select('*')
    .eq('resume_id', resumeId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DatabaseError(error.message);
  return data;
}

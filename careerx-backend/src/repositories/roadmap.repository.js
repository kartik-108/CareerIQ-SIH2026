import { supabase } from '../config/supabase.js';
import { DatabaseError, NotFoundError } from '../utils/ApiError.js';

export async function createRoadmap(payload) {
  const { data, error } = await supabase.from('career_roadmaps').insert(payload).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function listRoadmapsByUser(userId) {
  const { data, error } = await supabase
    .from('career_roadmaps')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function findRoadmapById(id, userId) {
  const { data, error } = await supabase
    .from('career_roadmaps')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new DatabaseError(error.message);
  if (!data) throw new NotFoundError('Roadmap not found');
  return data;
}

export async function updateRoadmapProgress(id, userId, progress) {
  const status = progress >= 100 ? 'completed' : 'active';
  const { data, error } = await supabase
    .from('career_roadmaps')
    .update({ progress, status })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

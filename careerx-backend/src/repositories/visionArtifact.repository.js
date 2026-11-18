import { supabase } from '../config/supabase.js';
import { DatabaseError, NotFoundError } from '../utils/ApiError.js';

export async function findByHash(userId, type, fileHash) {
  const { data, error } = await supabase.from('vision_artifacts').select('*').eq('user_id', userId).eq('artifact_type', type).eq('file_hash', fileHash).maybeSingle();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function saveArtifact({ userId, type, fileUrl, storagePath, fileName, mimeType, size, fileHash, analysisJson, score }) {
  const { data, error } = await supabase.from('vision_artifacts').insert({ user_id: userId, artifact_type: type, file_url: fileUrl, storage_path: storagePath, file_name: fileName, mime_type: mimeType, size, file_hash: fileHash, analysis_json: analysisJson, score }).select('*').single();
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function listArtifacts(userId, type) {
  const { data, error } = await supabase.from('vision_artifacts').select('*').eq('user_id', userId).eq('artifact_type', type).order('created_at', { ascending: false });
  if (error) throw new DatabaseError(error.message);
  return data;
}

export async function getArtifact(userId, id, type) {
  const { data, error } = await supabase.from('vision_artifacts').select('*').eq('user_id', userId).eq('artifact_type', type).eq('id', id).maybeSingle();
  if (error) throw new DatabaseError(error.message);
  if (!data) throw new NotFoundError('Vision artifact not found');
  return data;
}

export async function deleteArtifact(userId, id, type) {
  const { data, error } = await supabase.from('vision_artifacts').delete().eq('user_id', userId).eq('artifact_type', type).eq('id', id).select('id').maybeSingle();
  if (error) throw new DatabaseError(error.message);
  if (!data) throw new NotFoundError('Vision artifact not found');
  return data;
}

import { supabase } from '../config/supabase.js';
import { DatabaseError } from '../utils/ApiError.js';

export async function listForUser(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new DatabaseError(error.message);
  return data || [];
}

export async function markRead(userId, notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);
  if (error) throw new DatabaseError(error.message);
}
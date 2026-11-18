import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { supabase } from '../config/supabase.js';

export const submit = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('feedback')
    .insert({ user_id: req.user?.id ?? null, ...req.body })
    .select('*')
    .single();
  if (error) throw error;
  new ApiResponse(201, data, 'Feedback submitted, thank you!').send(res);
});

import { supabase } from '../config/supabase.js';

// Central XP/level/badge engine. Other services call awardXP() after a
// meaningful action (resume analyzed, interview completed, roadmap week done)
// instead of duplicating gamification logic everywhere.

const LEVEL_XP_STEP = 500; // flat curve for MVP; swap for a curve fn later

const BADGES = {
  first_resume: { title: 'First Steps', description: 'Uploaded your first resume', xp: 20 },
  first_interview: { title: 'Mock Interview Rookie', description: 'Completed your first mock interview', xp: 30 },
  roadmap_started: { title: 'Roadmap Initiated', description: 'Generated your first career roadmap', xp: 20 },
  roadmap_completed: { title: 'Goal Crusher', description: 'Completed a full career roadmap', xp: 100 },
  streak_7: { title: '7-Day Streak', description: 'Stayed active for 7 days in a row', xp: 50 },
};

export async function awardXP(userId, amount) {
  const { data: profile } = await supabase.from('profiles').select('xp, level').eq('user_id', userId).maybeSingle();
  if (!profile) return null;

  const newXP = (profile.xp || 0) + amount;
  const newLevel = Math.floor(newXP / LEVEL_XP_STEP) + 1;

  const { data, error } = await supabase
    .from('profiles')
    .update({ xp: newXP, level: newLevel })
    .eq('user_id', userId)
    .select('xp, level')
    .single();

  if (error) throw error;
  return data;
}

export async function unlockBadge(userId, code) {
  const badge = BADGES[code];
  if (!badge) return null;

  const { data, error } = await supabase
    .from('achievements')
    .upsert(
      { user_id: userId, code, title: badge.title, description: badge.description, xp_awarded: badge.xp },
      { onConflict: 'user_id,code', ignoreDuplicates: true }
    )
    .select('*');

  if (error) throw error;
  if (data?.length) await awardXP(userId, badge.xp);
  return data;
}

export async function recordActivityForStreak(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: streak } = await supabase.from('streaks').select('*').eq('user_id', userId).maybeSingle();

  if (!streak) {
    const { data } = await supabase
      .from('streaks')
      .insert({ user_id: userId, current_streak: 1, longest_streak: 1, last_active_date: today })
      .select('*')
      .single();
    return data;
  }

  if (streak.last_active_date === today) return streak; // already logged today

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const continued = streak.last_active_date === yesterday;
  const currentStreak = continued ? streak.current_streak + 1 : 1;
  const longestStreak = Math.max(streak.longest_streak, currentStreak);

  const { data, error } = await supabase
    .from('streaks')
    .update({ current_streak: currentStreak, longest_streak: longestStreak, last_active_date: today })
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  if (currentStreak === 7) await unlockBadge(userId, 'streak_7');
  return data;
}

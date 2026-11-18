import { supabase } from '../config/supabase.js';

// Aggregates data across modules for a single dashboard payload —
// keeps the frontend to one round trip instead of N.
export async function getDashboard(userId) {
  const [profile, resumes, roadmaps, interviews, achievements, streak, jobMatches, skillAnalysis] = await Promise.all([
    supabase.from('profiles').select('xp, level, target_role').eq('user_id', userId).maybeSingle(),
    supabase.from('resumes').select('id, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
    supabase.from('career_roadmaps').select('id, target_role, progress, status').eq('user_id', userId),
    supabase.from('interview_reports').select('overall_score, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    supabase.from('achievements').select('code, title, xp_awarded, earned_at').eq('user_id', userId),
    supabase.from('streaks').select('current_streak, longest_streak').eq('user_id', userId).maybeSingle(),
    supabase.from('job_matches').select('match_percentage, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    supabase.from('skill_analysis').select('target_role, match_score').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
  ]);

  return {
    xp: profile.data?.xp ?? 0,
    level: profile.data?.level ?? 1,
    target_role: profile.data?.target_role ?? null,
    resume_status: resumes.data?.[0]?.status ?? 'not_uploaded',
    roadmap_progress: roadmaps.data ?? [],
    interview_history: interviews.data ?? [],
    achievements: achievements.data ?? [],
    streak: streak.data ?? { current_streak: 0, longest_streak: 0 },
    recent_job_matches: jobMatches.data ?? [],
    skill_progress: skillAnalysis.data?.[0] ?? null,
  };
}

export async function getAnalytics(userId) {
  const { data: activity } = await supabase
    .from('activity_logs')
    .select('action, created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const { data: roadmaps } = await supabase.from('career_roadmaps').select('progress, status').eq('user_id', userId);
  const { data: interviewReports } = await supabase
    .from('interview_reports')
    .select('overall_score, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  const { data: resumeVersions } = await supabase.from('resumes').select('id, version, created_at').eq('user_id', userId);

  const weeklyActivity = {};
  for (const log of activity || []) {
    const week = new Date(log.created_at).toISOString().slice(0, 10);
    weeklyActivity[week] = (weeklyActivity[week] || 0) + 1;
  }

  return {
    weekly_activity: weeklyActivity,
    roadmap_completion: roadmaps || [],
    interview_improvement: interviewReports || [],
    resume_versions: resumeVersions || [],
  };
}

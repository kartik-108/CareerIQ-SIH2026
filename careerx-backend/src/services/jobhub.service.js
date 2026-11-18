import * as jobRepo from '../repositories/job.repository.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import { env } from '../config/env.js';
import crypto from 'node:crypto';

export async function searchJobs(filters) {
  const cacheKey = `jobs:${crypto.createHash('sha1').update(JSON.stringify(filters)).digest('hex')}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const result = await jobRepo.searchJobs(filters);
  await cacheSet(cacheKey, result, 300); // short TTL — job listings change often
  return result;
}

export async function recommendJobsForUser(userId, profile) {
  // MVP heuristic recommender: matches jobs_cache rows against the user's
  // target_role. Swap for an embedding-similarity or ML ranker later
  // without touching the controller layer.
  const cacheKey = `job_recs:${userId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const { jobs } = await jobRepo.searchJobs({
    role: profile?.target_role || '',
    page: 1,
    limit: 10,
  });

  await cacheSet(cacheKey, jobs, env.CACHE_TTL_JOB_RECOMMENDATIONS);
  return jobs;
}

export async function bookmarkJob(userId, jobId) {
  return jobRepo.bookmarkJob(userId, jobId);
}

export async function removeBookmark(userId, jobId) {
  return jobRepo.removeBookmark(userId, jobId);
}

export async function listBookmarks(userId) {
  return jobRepo.listBookmarks(userId);
}

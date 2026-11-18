import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as jobHubService from '../services/jobhub.service.js';
import * as authService from '../services/auth.service.js';

export const search = asyncHandler(async (req, res) => {
  const result = await jobHubService.searchJobs(req.query);
  res.set('X-CareerIQ-Job-Data-Mode', 'demo');
  new ApiResponse(200, result).send(res);
});

export const recommendations = asyncHandler(async (req, res) => {
  const { profile } = await authService.getProfile(req.user.id);
  const jobs = await jobHubService.recommendJobsForUser(req.user.id, profile);
  res.set('X-CareerIQ-Job-Data-Mode', 'demo');
  new ApiResponse(200, jobs).send(res);
});

export const bookmark = asyncHandler(async (req, res) => {
  const result = await jobHubService.bookmarkJob(req.user.id, req.params.jobId);
  new ApiResponse(201, result, 'Job bookmarked').send(res);
});

export const removeBookmark = asyncHandler(async (req, res) => {
  await jobHubService.removeBookmark(req.user.id, req.params.jobId);
  new ApiResponse(200, null, 'Bookmark removed').send(res);
});

export const listBookmarks = asyncHandler(async (req, res) => {
  const result = await jobHubService.listBookmarks(req.user.id);
  new ApiResponse(200, result).send(res);
});

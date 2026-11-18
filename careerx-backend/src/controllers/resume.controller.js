import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ValidationError } from '../utils/ApiError.js';
import * as resumeService from '../services/resume.service.js';
import * as achievementService from '../services/achievement.service.js';

export const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new ValidationError('No resume file provided (field name: "resume")');
  const resume = await resumeService.uploadResume(req.user.id, req.file);
  await achievementService.unlockBadge(req.user.id, 'first_resume');
  await achievementService.recordActivityForStreak(req.user.id);
  new ApiResponse(201, resume, 'Resume uploaded successfully').send(res);
});

export const analyze = asyncHandler(async (req, res) => {
  const { resume_id, target_role } = req.body;
  const analysis = await resumeService.analyzeResume(req.user.id, resume_id, target_role);
  new ApiResponse(200, analysis, 'Resume analyzed successfully').send(res);
});

export const list = asyncHandler(async (req, res) => {
  const resumes = await resumeService.listResumes(req.user.id);
  new ApiResponse(200, resumes).send(res);
});

export const downloadUrl = asyncHandler(async (req, res) => {
  const url = await resumeService.getResumeDownloadUrl(req.user.id, req.params.id);
  new ApiResponse(200, { url }).send(res);
});

export const latestAnalysis = asyncHandler(async (req, res) => {
  const analysis = await resumeService.getLatestAnalysis(req.user.id, req.params.id);
  new ApiResponse(200, analysis).send(res);
});

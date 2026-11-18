import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as roadmapService from '../services/roadmap.service.js';
import * as achievementService from '../services/achievement.service.js';

export const generate = asyncHandler(async (req, res) => {
  const roadmap = await roadmapService.generateRoadmap(req.user.id, req.body);
  await achievementService.unlockBadge(req.user.id, 'roadmap_started');
  new ApiResponse(201, roadmap, 'Roadmap generated').send(res);
});

export const list = asyncHandler(async (req, res) => {
  const roadmaps = await roadmapService.listRoadmaps(req.user.id);
  new ApiResponse(200, roadmaps).send(res);
});

export const getById = asyncHandler(async (req, res) => {
  const roadmap = await roadmapService.getRoadmap(req.params.id, req.user.id);
  new ApiResponse(200, roadmap).send(res);
});

export const updateProgress = asyncHandler(async (req, res) => {
  const roadmap = await roadmapService.updateProgress(req.params.id, req.user.id, req.body.progress);
  if (roadmap.status === 'completed') {
    await achievementService.unlockBadge(req.user.id, 'roadmap_completed');
  }
  new ApiResponse(200, roadmap, 'Progress updated').send(res);
});

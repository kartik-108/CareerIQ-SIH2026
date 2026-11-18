import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ValidationError } from '../utils/ApiError.js';
import * as visionService from '../services/vision.service.js';
import * as visionInterviewService from '../services/visionInterview.service.js';

export const analyze = asyncHandler(async (req, res) => {
  if (!req.file) throw new ValidationError('No resume file provided (field name: "resume")');
  const analysis = await visionService.analyze(req.user.id, req.file);
  new ApiResponse(201, analysis, 'Resume vision analysis completed').send(res);
});

export const history = asyncHandler(async (req, res) => {
  new ApiResponse(200, await visionService.getHistory(req.user.id)).send(res);
});

export const getById = asyncHandler(async (req, res) => {
  new ApiResponse(200, await visionService.getAnalysisById(req.user.id, req.params.id)).send(res);
});

export const remove = asyncHandler(async (req, res) => {
  await visionService.deleteAnalysis(req.user.id, req.params.id);
  new ApiResponse(204, null, 'Vision analysis deleted').send(res);
});

export const startCamera = asyncHandler(async (req, res) => {
  new ApiResponse(201, await visionInterviewService.start(req.user.id, req.body), 'Camera interview started').send(res);
});

export const cameraFrame = asyncHandler(async (req, res) => {
  new ApiResponse(202, await visionInterviewService.saveFrame(req.user.id, req.body), 'Camera frame accepted').send(res);
});

export const endCamera = asyncHandler(async (req, res) => {
  new ApiResponse(200, await visionInterviewService.end(req.user.id, req.body), 'Camera interview completed').send(res);
});

export const report = asyncHandler(async (req, res) => {
  new ApiResponse(200, await visionService.generateReport(req.user.id, req.params.id), 'PDF report generated').send(res);
});

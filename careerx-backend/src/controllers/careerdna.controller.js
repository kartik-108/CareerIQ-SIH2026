import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as careerDnaService from '../services/careerdna.service.js';

export const generate = asyncHandler(async (req, res) => {
  const result = await careerDnaService.generateCareerDNA(req.user.id);
  new ApiResponse(201, result, 'Career DNA generated').send(res);
});

export const getLatest = asyncHandler(async (req, res) => {
  const result = await careerDnaService.getLatestCareerDNA(req.user.id);
  new ApiResponse(200, result).send(res);
});

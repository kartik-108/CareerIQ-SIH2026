import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as jobMatchService from '../services/jobmatch.service.js';

export const match = asyncHandler(async (req, res) => {
  const result = req.body.analysis_id
    ? await jobMatchService.matchVisionAnalysisToJob(req.user.id, req.body)
    : await jobMatchService.matchResumeToJob(req.user.id, req.body);
  new ApiResponse(200, result, 'Job match computed').send(res);
});

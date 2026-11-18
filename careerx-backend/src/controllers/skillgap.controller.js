import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as skillGapService from '../services/skillgap.service.js';

export const analyze = asyncHandler(async (req, res) => {
  const result = await skillGapService.analyzeSkillGap(req.user.id, req.body);
  new ApiResponse(200, result, 'Skill gap analysis complete').send(res);
});

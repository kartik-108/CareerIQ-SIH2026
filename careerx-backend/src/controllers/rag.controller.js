import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as ragService from '../services/rag.service.js';

export const ask = asyncHandler(async (req, res) => {
  const result = await ragService.askKnowledgeBase(req.body, req.user.id);
  new ApiResponse(200, result).send(res);
});

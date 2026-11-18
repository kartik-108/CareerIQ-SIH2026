import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getVectorStatus } from '../services/rag/vectorStatus.service.js';

export const vectorStatus = asyncHandler(async (req, res) => {
  const data = await getVectorStatus({
    userId: req.user?.id,
    query: typeof req.query.q === 'string' && req.query.q.trim()
      ? req.query.q.trim()
      : undefined,
  });
  new ApiResponse(200, data).send(res);
});
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as dashboardService from '../services/dashboard.service.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const result = await dashboardService.getDashboard(req.user.id);
  new ApiResponse(200, result).send(res);
});

export const getAnalytics = asyncHandler(async (req, res) => {
  const result = await dashboardService.getAnalytics(req.user.id);
  new ApiResponse(200, result).send(res);
});

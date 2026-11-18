import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as notificationService from '../services/notification.service.js';

export const list = asyncHandler(async (req, res) => {
  new ApiResponse(200, await notificationService.list(req.user.id)).send(res);
});

export const markRead = asyncHandler(async (req, res) => {
  await notificationService.markRead(req.user.id, req.params.id);
  new ApiResponse(200, null, 'Marked as read').send(res);
});

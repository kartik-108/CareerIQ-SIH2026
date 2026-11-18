import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ValidationError } from '../utils/ApiError.js';
import * as authService from '../services/auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  new ApiResponse(201, result, 'Account created successfully').send(res);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  new ApiResponse(200, result, 'Logged in successfully').send(res);
});

export const refreshToken = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refresh_token);
  new ApiResponse(200, result, 'Token refreshed').send(res);
});

export const logout = asyncHandler(async (req, res) => {
  // JWTs are stateless; logout is handled client-side by discarding tokens.
  // If a denylist is needed later, insert the token id into Redis here.
  new ApiResponse(200, null, 'Logged out successfully').send(res);
});

export const getProfile = asyncHandler(async (req, res) => {
  const result = await authService.getProfile(req.user.id);
  new ApiResponse(200, result).send(res);
});

export const updateProfile = asyncHandler(async (req, res) => {
  const result = await authService.updateProfile(req.user.id, req.body);
  new ApiResponse(200, result, 'Profile updated').send(res);
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new ValidationError('No avatar file provided (field name: "avatar")');
  const result = await authService.uploadAvatar(req.user.id, req.file);
  new ApiResponse(200, result, 'Avatar updated').send(res);
});

export const deleteAccount = asyncHandler(async (req, res) => {
  await authService.deleteAccount(req.user.id);
  new ApiResponse(200, null, 'Account deleted').send(res);
});

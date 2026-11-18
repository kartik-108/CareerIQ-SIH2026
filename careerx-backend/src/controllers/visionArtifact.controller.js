import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ValidationError } from '../utils/ApiError.js';
import * as artifactService from '../services/visionArtifact.service.js';

function handler(type) {
  return asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('No artifact file provided (field name: "file")');
    new ApiResponse(201, await artifactService.analyze(req.user.id, type, req.file), `${type} analysis completed`).send(res);
  });
}

export const analyzeCertificate = handler('certificate');
export const analyzePortfolio = handler('portfolio');

export const history = (type) => asyncHandler(async (req, res) => {
  new ApiResponse(200, await artifactService.history(req.user.id, type)).send(res);
});

export const getById = (type) => asyncHandler(async (req, res) => {
  new ApiResponse(200, await artifactService.getById(req.user.id, type, req.params.id)).send(res);
});

export const remove = (type) => asyncHandler(async (req, res) => {
  await artifactService.remove(req.user.id, type, req.params.id);
  new ApiResponse(204, null, 'Vision artifact deleted').send(res);
});

export const report = (type) => asyncHandler(async (req, res) => {
  new ApiResponse(200, await artifactService.report(req.user.id, type, req.params.id), 'PDF report generated').send(res);
});

import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as careerLabService from '../services/careerLabService.js';

const send = (res, data, message) => new ApiResponse(200, data, message).send(res);
export const status = asyncHandler(async (req, res) => send(res, await careerLabService.getStatus(req.user.id)));
export const skills = asyncHandler(async (req, res) => send(res, await careerLabService.getSkills(req.user.id)));
export const analyzeSkills = asyncHandler(async (req, res) => {
	try {
		if (!req.user?.id) return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Please sign in again.' });
		if (!req.body || typeof req.body.targetRole !== 'string' || !req.body.targetRole.trim()) return res.status(400).json({ success: false, code: 'INVALID_TARGET_ROLE', message: 'Target role is required.' });
		return send(res, await careerLabService.analyzeSkills(req.user.id, req.body.targetRole.trim()), 'Analysis completed successfully');
	} catch (error) {
		const status = error.code === 'NO_RESUME' ? 404 : error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
		return res.status(status).json({ success: false, code: error.code || 'ANALYSIS_FAILED', message: status < 500 ? error.message : 'Unable to analyze your resume.' });
	}
});
export const roadmap = asyncHandler(async (req, res) => send(res, await careerLabService.getRoadmap(req.user.id)));
export const generateRoadmap = asyncHandler(async (req, res) => send(res, await careerLabService.generateRoadmapForUser(req.user.id, req.body.targetRole), 'Roadmap generated successfully'));
export const updateRoadmap = asyncHandler(async (req, res) => send(res, await careerLabService.updateRoadmap(req.user.id, req.body), 'Roadmap updated successfully'));
export const dna = asyncHandler(async (req, res) => send(res, await careerLabService.getDna(req.user.id)));
export const analyzeDna = asyncHandler(async (req, res) => send(res, await careerLabService.analyzeDna(req.user.id), 'Career DNA analyzed successfully'));
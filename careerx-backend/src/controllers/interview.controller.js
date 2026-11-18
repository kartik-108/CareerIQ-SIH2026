import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as interviewService from '../services/interview.service.js';
import * as achievementService from '../services/achievement.service.js';

export const start = asyncHandler(async (req, res) => {
  if (req.body._studioRequest) {
    const result = await interviewService.startStudioInterview(req.user.id, { ...req.body, userName: req.user.name });
    return new ApiResponse(201, result, 'Interview session started').send(res);
  }
  const result = await interviewService.startInterview(req.user.id, req.body);
  new ApiResponse(201, result, 'Interview session started').send(res);
});

export const startStudio = asyncHandler(async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Please sign in again.' });
    const result = await interviewService.startStudioInterview(req.user.id, { ...req.body, userName: req.user.name });
    return new ApiResponse(201, result, 'Interview session started').send(res);
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, code: 'SESSION_CREATE_FAILED', message: status < 500 ? error.message : 'Unable to start interview.' });
  }
});

export const getNextQuestion = asyncHandler(async (req, res) => {
  const question = await interviewService.nextQuestion(req.params.sessionId, req.user.id);
  new ApiResponse(200, question).send(res);
});

export const submitAnswer = asyncHandler(async (req, res) => {
  const result = await interviewService.submitAnswer(req.params.sessionId, req.user.id, req.body);
  new ApiResponse(200, result, 'Answer scored').send(res);
});

export const endInterview = asyncHandler(async (req, res) => {
  const report = await interviewService.endInterviewAndGenerateReport(req.params.sessionId, req.user.id);
  await achievementService.unlockBadge(req.user.id, 'first_interview');
  await achievementService.recordActivityForStreak(req.user.id);
  new ApiResponse(200, report, 'Interview completed').send(res);
});

export const status = asyncHandler(async (req, res) => new ApiResponse(200, await interviewService.getStatus(req.user.id)).send(res));
export const history = asyncHandler(async (req, res) => new ApiResponse(200, await interviewService.getHistory(req.user.id)).send(res));
export const studioQuestion = asyncHandler(async (req, res) => new ApiResponse(200, { question: await interviewService.nextStudioQuestion(req.body.sessionId, req.user.id) }).send(res));
export const studioAnswer = asyncHandler(async (req, res) => new ApiResponse(200, await interviewService.submitStudioAnswer(req.body.sessionId, req.user.id, req.body), 'Answer evaluated').send(res));
export const studioEnd = asyncHandler(async (req, res) => new ApiResponse(200, await interviewService.endStudioInterview(req.body.sessionId, req.user.id), 'Interview completed').send(res));
export const report = asyncHandler(async (req, res) => new ApiResponse(200, await interviewService.getInterviewReport(req.params.id, req.user.id)).send(res));

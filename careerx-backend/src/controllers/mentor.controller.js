import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ValidationError } from "../utils/ApiError.js";

import * as mentorService from "../services/mentor.service.js";
import * as conversations from "../services/rag/conversationService.js";
import { processDocument } from "../services/rag/documentProcessor.js";
import { env } from "../config/env.js";

function getUserId(req) {
  return req.user?.id;
}

// ---------------- CHAT ----------------

export const chat = asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    throw new ValidationError("User not authenticated.");
  }

  const message = String(req.body.message || "").trim();

  if (!message || message.length > 8000) {
    throw new ValidationError(
      "Message is required and must be under 8000 characters."
    );
  }

  const abortController = new AbortController();
  req.on('aborted', () => abortController.abort());
  res.on('close', () => abortController.abort());

  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.flushHeaders?.();
  res.write(': connected\n\n');
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !abortController.signal.aborted) res.write('event: ping\ndata: keepalive\n\n');
  }, env.SSE_HEARTBEAT_MS);

  try {
    for await (const event of mentorService.streamChat({ userId, message, conversationId: req.body.conversationId || null, signal: abortController.signal })) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.flush?.();
    }
  } catch (error) {
    if (!abortController.signal.aborted) res.write(`event: error\ndata: ${JSON.stringify({ message: 'Mentor service is temporarily unavailable. Please try again.' })}\n\n`);
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

// ---------------- STATUS ----------------

export const status = asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  const data = await mentorService.getMentorStatus(userId);

  new ApiResponse(200, data).send(res);
});

// ---------------- HISTORY ----------------

export const history = asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  const data = await conversations.listConversations(userId);

  new ApiResponse(200, data).send(res);
});

// ---------------- CONVERSATION ----------------

export const conversation = asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  const data = await conversations.getConversation(
    userId,
    req.params.id
  );

  new ApiResponse(200, data).send(res);
});

// ---------------- RENAME ----------------

export const rename = asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  const data = await conversations.renameConversation(
    userId,
    req.params.id,
    req.body.title
  );

  new ApiResponse(200, data).send(res);
});

// ---------------- DELETE ----------------

export const removeConversation = asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  await conversations.deleteConversation(userId, req.params.id);

  new ApiResponse(200, { deleted: true }).send(res);
});

// ---------------- DOCUMENTS ----------------

export const documents = asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  const docs = await conversations.listDocuments(userId);

  new ApiResponse(200, docs).send(res);
});

// ---------------- UPLOAD ----------------

export const upload = asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  if (!req.file) {
    throw new ValidationError("Document is required.");
  }

  const doc = await processDocument({
    file: req.file,
    userId,
    title: req.body.title,
  });

  new ApiResponse(201, doc).send(res);
});

// ---------------- DELETE DOC ----------------

export const removeDocument = asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  await conversations.deleteDocument(userId, req.params.id);

  new ApiResponse(200, { deleted: true }).send(res);
});
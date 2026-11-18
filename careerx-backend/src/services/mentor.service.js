import { supabase } from "../config/supabase.js";
import { generateText, streamWithFallback } from "./ai/provider.js";
import { provider } from "./ai/provider.js";
import { env } from '../config/env.js';

import { buildMentorContext } from "./rag/contextBuilder.js";
import {
  buildMentorPrompt,
  followUpSuggestions,
} from "./rag/promptBuilder.js";

import * as conversations from "./rag/conversationService.js";
import { logger } from '../config/logger.js';

const AI_TIMEOUT_MS = env.AI_TIMEOUT_MS;
const DB_TIMEOUT_MS = 3000;

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))]);
}

function deterministicAnswer(message, citations = []) {
  const source = citations[0]?.file_name || citations[0]?.title;
  const sourceLine = source ? ` I grounded this in ${source}.` : '';
  return `I could not reach the AI provider in time, so here is a concise offline answer for: "${String(message).slice(0, 240)}".${sourceLine} Review the available career context, identify the next concrete action, and continue with a measurable result.`;
}

function fallbackContext() { return { text: '', citations: [] }; }

// --------------------------------------------------
// Career Mentor Chat Service
// --------------------------------------------------

export async function prepareChat({
  userId,
  message,
  conversationId = null,
}) {
  const currentUser =
    userId || process.env.DEV_USER_ID || process.env.RAG_USER_ID;

  let conversation;

  if (conversationId) {
    conversation = await conversations.getConversation(
      currentUser,
      conversationId
    );
  } else {
    conversation = await conversations.createConversation(
      currentUser,
      message.slice(0, 60)
    );
  }

  // Retrieve RAG context
  const context = await buildMentorContext(message, currentUser);

  // Build final prompt
  const prompt = buildMentorPrompt({
    message,
    context: context.text || "",
    history: conversation.messages || [],
  });

  // Generate the grounded answer with the local provider.
  const result = await generateText(prompt, {
    feature: "mentorChat",
  });

  const answer = result.text || "I couldn't generate a response.";

  // ---------------- Store lightweight memory ----------------

  const { data: memory } = await supabase
    .from("user_context_cache")
    .select("context")
    .eq("user_id", currentUser)
    .maybeSingle();

  await supabase.from("user_context_cache").upsert(
    {
      user_id: currentUser,
      context: {
        ...(memory?.context || {}),
        lastMentorMessage: message,
        lastCitations: context.citations || [],
      },
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  );

  // ---------------- Save conversation ----------------

  await conversations.saveMessage(conversation.id, "user", message);

  await conversations.saveMessage(
    conversation.id,
    "assistant",
    answer,
    context.citations || []
  );

  return {
    conversationId: conversation.id,
    answer,
    citations: context.citations || [],
    suggestions: followUpSuggestions,
    provider: result.provider || "ollama",
    usage: result.usage || 0,
  };
}

// --------------------------------------------------
// Mentor Dashboard Status
// --------------------------------------------------

export async function getMentorStatus(userId) {
  const currentUser =
    userId || process.env.DEV_USER_ID || process.env.RAG_USER_ID;

  const [documentsResult, historyResult, profileResult] = await Promise.allSettled([
    conversations.listDocuments(currentUser),
    conversations.listConversations(currentUser),
    supabase
      .from("profiles")
      .select("target_role, location")
      .eq("user_id", currentUser)
      .maybeSingle(),
  ]);
  const documents = documentsResult.status === "fulfilled" ? documentsResult.value : [];
  const history = historyResult.status === "fulfilled" ? historyResult.value : [];
  const profile = profileResult.status === "fulfilled" ? profileResult.value : { data: null };
  const providerHealth = await provider.health();

  return {
    activeProvider: providerHealth.activeProvider,
    resumeLoaded: !!profile?.data,
    documents: documents || [],
    conversations: history || [],

    context: {
      resumeLoaded: !!profile?.data,
      documents: documents?.length || 0,
      conversations: history?.length || 0,
      targetRole: profile?.data?.target_role || null,
      location: profile?.data?.location || null,
    },

    provider: providerHealth,
    model: process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b",
  };
}

export async function* streamChat({ userId, message, conversationId = null, signal }) {
  const currentUser = userId || process.env.DEV_USER_ID || process.env.RAG_USER_ID;
  const requestReceivedAt = Date.now();
  logger.info({ userId: currentUser, conversationId, requestReceivedAt }, '[Mentor] chat started');
  let conversation;
  try {
    conversation = conversationId
      ? await withTimeout(conversations.getConversation(currentUser, conversationId), DB_TIMEOUT_MS, 'Conversation lookup timed out')
      : await withTimeout(conversations.createConversation(currentUser, message.slice(0, 60)), DB_TIMEOUT_MS, 'Conversation creation timed out');
  } catch (error) {
    logger.warn({ err: error.stack }, '[Mentor] conversation persistence unavailable; continuing transiently');
    conversation = { id: null, messages: [] };
  }
  let context;
  try {
    context = await Promise.race([
      buildMentorContext(message, currentUser),
      new Promise((resolve) => setTimeout(() => resolve(fallbackContext()), 3000)),
    ]);
    logger.info({ ms: Date.now() - requestReceivedAt, citations: context.citations?.length || 0, retrievalMode: context.retrievalMode }, '[Mentor] context ready');
  } catch (error) {
    logger.warn({ err: error.stack }, '[Mentor] context failed; using offline context');
    context = fallbackContext();
  }
  yield {
    type: 'context',
    ragUsed: Boolean(context.citations?.length),
    retrievalMode: context.retrievalMode || 'none',
    documentsRetrieved: context.citations?.length || 0,
  };
  const prompt = buildMentorPrompt({ message, context: context.text || '', history: conversation.messages || [] });
  const chunks = [];
  let providerName = 'ollama';
  let firstTokenAt = null;
  const retrievalFinishedAt = Date.now();
  const generationStartedAt = Date.now();
  try {
    logger.info({ ms: Date.now() - requestReceivedAt, retrievalFinishedAt, retrievalMs: retrievalFinishedAt - requestReceivedAt }, '[Ollama] request started');
    for await (const event of streamWithFallback([{ role: 'user', content: prompt }], { signal, maxTokens: 256, timeout: AI_TIMEOUT_MS, startedAt: requestReceivedAt })) {
      providerName = event.provider;
      if (!firstTokenAt) {
        firstTokenAt = Date.now();
        logger.info({ ms: firstTokenAt - generationStartedAt, firstTokenAt, retrievalFinishedAt, provider: providerName }, '[Ollama] first token received');
      }
      chunks.push(event.token);
      yield { type: 'token', token: event.token };
    }
    logger.info({ ms: Date.now() - generationStartedAt, generationMs: Date.now() - generationStartedAt, provider: providerName, tokens: chunks.length }, '[Ollama] stream completed');
  } catch (error) {
    if (signal?.aborted) throw error;
    logger.warn({ ms: Date.now() - generationStartedAt, err: error.stack }, '[Mentor] AI generation failed; using offline answer');
    if (!chunks.length) {
      const fallback = deterministicAnswer(message, context.citations || []);
      chunks.push(fallback);
      yield { type: 'token', token: fallback };
    }
  }
  logger.info({ totalGenerationMs: Date.now() - generationStartedAt, firstTokenMs: firstTokenAt ? firstTokenAt - generationStartedAt : null, provider: providerName, tokens: chunks.length }, '[Mentor] total generation time');
  const answer = chunks.join('');
  if (conversation.id) {
    await Promise.allSettled([
      withTimeout(conversations.saveMessage(conversation.id, 'user', message), DB_TIMEOUT_MS, 'User message save timed out'),
      withTimeout(conversations.saveMessage(conversation.id, 'assistant', answer, context.citations || []), DB_TIMEOUT_MS, 'Assistant message save timed out'),
    ]);
  }
  yield {
    type: 'done',
    conversationId: conversation.id,
    answer,
    citations: context.citations || [],
    suggestions: followUpSuggestions,
    provider: chunks.length === 1 && chunks[0] === answer ? 'local' : providerName,
    offline: chunks.length === 1 && chunks[0] === answer,
    debug: env.DEV_RAG_INSPECTOR ? {
      ragUsed: Boolean(context.citations?.length),
      retrievalMode: context.retrievalMode || 'none',
      provider: chunks.length === 1 && chunks[0] === answer ? 'local' : providerName,
      model: providerName === 'gemini' ? env.GEMINI_MODEL : env.OLLAMA_CHAT_MODEL,
      documentsRetrieved: context.citations?.length || 0,
      citations: context.citations?.length || 0,
      embeddingModel: context.embeddingModel,
      requestReceivedAt,
      retrievalFinishedAt,
      firstTokenMs: firstTokenAt ? firstTokenAt - requestReceivedAt : null,
      generationMs: Date.now() - generationStartedAt,
    } : undefined,
  };
}
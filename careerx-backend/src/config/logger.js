import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { env } from './env.js';

const isDevelopment = env.NODE_ENV === 'development';

function canUsePrettyLogger() {
  if (!isDevelopment) return false;

  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const loggerOptions = {
  level: env.LOG_LEVEL || 'info',
};

export const logger = pino(
  canUsePrettyLogger()
    ? {
        ...loggerOptions,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : loggerOptions,
);

// Used by pino-http middleware to tag every request/response log line.
export function genReqId(req) {
  return req.headers['x-request-id'] || randomUUID();
}

// Helper for timing AI / DB / embedding calls consistently.
export function timed(label, fn) {
  return async (...args) => {
    const start = Date.now();
    try {
      const result = await fn(...args);
      logger.info({ label, ms: Date.now() - start }, 'operation completed');
      return result;
    } catch (err) {
      logger.error({ label, ms: Date.now() - start, err: err.message }, 'operation failed');
      throw err;
    }
  };
}

/**
 * Structured logger for AI gateway activity.
 *
 * NEVER pass the actual API key value here — only a key identifier/index
 * Provider metadata is limited to non-secret identifiers.
 *
 * @param {object} event
 * @param {string} event.endpoint - Name of the AI feature/endpoint invoked
 *   (e.g. 'resumeAtsAnalysis', 'careerMentorRAG').
 * @param {number|string} [event.keyIndex] - Optional provider key slot identifier.
 * @param {number} [event.retryAttempts=0] - Number of retry attempts made.
 * @param {boolean} [event.rotated=false] - Whether the gateway rotated to a
 *   different key during this call.
 * @param {boolean} [event.rotationSuccess] - Whether a rotation attempt
 *   succeeded (only meaningful when `rotated` is true).
 * @param {number} event.responseTimeMs - Total response time in ms.
 * @param {string} [event.errorReason] - Human-readable failure reason, if any.
 * @param {boolean} [event.success=true] - Overall call outcome.
 */
export function logAIGatewayEvent({
  endpoint,
  keyIndex,
  retryAttempts = 0,
  rotated = false,
  rotationSuccess,
  responseTimeMs,
  errorReason,
  success = true,
}) {
  const payload = {
    timestamp: new Date().toISOString(),
    endpoint,
    keyIndex: keyIndex != null ? `key_${keyIndex}` : undefined,
    retryAttempts,
    rotated,
    rotationSuccess: rotated ? Boolean(rotationSuccess) : undefined,
    responseTimeMs,
    success,
    errorReason: errorReason || undefined,
  };

  if (success) {
    logger.info(payload, `AI gateway: ${endpoint}`);
  } else {
    logger.error(payload, `AI gateway failed: ${endpoint}`);
  }
}

// Convenience wrapper: times an AI gateway call and logs a structured
// gateway event alongside the generic `timed` behavior. Pass a `meta`
// object describing keyIndex/endpoint; retry/rotation info can be
// attached to the thrown/returned value by the caller.
// via `err.keyIndex`, `err.retryAttempts`, `err.rotated`, `err.rotationSuccess`.
export function timedAICall(endpoint, fn) {
  return async (...args) => {
    const start = Date.now();
    try {
      const result = await fn(...args);
      logAIGatewayEvent({
        endpoint,
        keyIndex: result?.keyIndex,
        retryAttempts: result?.retryAttempts ?? 0,
        rotated: Boolean(result?.rotated),
        rotationSuccess: result?.rotationSuccess,
        responseTimeMs: Date.now() - start,
        success: true,
      });
      return result;
    } catch (err) {
      logAIGatewayEvent({
        endpoint,
        keyIndex: err?.keyIndex,
        retryAttempts: err?.retryAttempts ?? 0,
        rotated: Boolean(err?.rotated),
        rotationSuccess: err?.rotationSuccess,
        responseTimeMs: Date.now() - start,
        success: false,
        errorReason: err?.message,
      });
      throw err;
    }
  };
}
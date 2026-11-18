import { env } from '../../config/env.js';
import * as ollama from './ollama.js';
import { getCached, setCached } from './cache.js';
import crypto from 'node:crypto';
import { logger } from '../../config/logger.js';

export const DEFAULT_CHAT_MODEL =
  env.OLLAMA_CHAT_MODEL || 'llama3.1:8b';

export const DEFAULT_EMBED_MODEL =
  env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

// The provider timeout is also passed to Ollama so the underlying fetch is aborted.
const AI_TIMEOUT_MS = env.AI_TIMEOUT_MS;

let activeProvider = 'ollama';

function withTimeout(promise, timeout = AI_TIMEOUT_MS) {
  if (!timeout || timeout <= 0) return promise;

  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`AI provider timed out after ${timeout}ms`)
          ),
        timeout
      )
    ),
  ]);
}

// Cache identity: vision requests are identified by their image bytes (never by prompt alone),
// and any caller-provided scope (user + resume) is included.
function requestIdentity(method, parts = [], scope = '') {
  const payload = method === 'generateVision'
    ? parts.map((part) => `${part?.inlineData?.mimeType || ''}:${part?.inlineData?.data || ''}`).join('|')
    : '';
  const hash = payload ? crypto.createHash('sha256').update(payload).digest('hex') : '';
  return [hash, scope || ''].filter(Boolean).join(':');
}

export class AIProvider {
  async run(method, prompt, options = {}, parts = []) {
    const model =
      options.model ||
      (method === 'generateVision'
        ? env.OLLAMA_VISION_MODEL
        : method === 'generateEmbedding'
        ? DEFAULT_EMBED_MODEL
        : DEFAULT_CHAT_MODEL);

    const identity = requestIdentity(method, parts, options.cacheScope);

    const cached = getCached('ollama', prompt, model, method, identity);
    if (cached) return cached;

    const timeoutMs = options.timeout ?? AI_TIMEOUT_MS;
    const providerOptions = { ...options, model, timeout: timeoutMs };

    const result =
      method === 'generateText'
        ? await withTimeout(
            ollama.generate(prompt, providerOptions),
            timeoutMs
          )
        : method === 'generateJSON'
        ? await withTimeout(
            ollama.generateJSON(prompt, providerOptions),
            timeoutMs
          )
        : method === 'generateEmbedding'
        ? await withTimeout(
            ollama.embed(prompt, providerOptions),
            timeoutMs
          )
        : method === 'generateVision'
        ? await withTimeout(
            ollama.generateVision(prompt, parts, providerOptions),
            timeoutMs
          )
        : await Promise.reject(
            new Error(`Ollama does not support ${method}`)
          );

    activeProvider = 'ollama';

    return setCached('ollama', prompt, model, method, result, identity);
  }

  chat(messages, options = {}) {
    return ollama.chat(messages, {
      ...options,
      model: options.model || DEFAULT_CHAT_MODEL,
    });
  }

  generate(prompt, options = {}) {
    return ollama.generate(prompt, {
      ...options,
      model: options.model || DEFAULT_CHAT_MODEL,
    });
  }

  embed(text, options = {}) {
    return ollama.embed(text, {
      ...options,
      model: options.model || DEFAULT_EMBED_MODEL,
    });
  }

  stream(messages, options = {}) {
    return ollama.stream(messages, {
      ...options,
      model: options.model || DEFAULT_CHAT_MODEL,
    });
  }

  healthCheck() {
    return ollama.healthCheck();
  }

  listModels() {
    return ollama.listModels();
  }

  generateText(prompt, options = {}) {
    return this.run('generateText', prompt, options);
  }

  generateJSON(prompt, options = {}) {
    return this.run('generateJSON', prompt, options);
  }

  generateVision(prompt, parts = [], options = {}) {
    return this.run('generateVision', prompt, options, parts);
  }

  generateEmbedding(text, options = {}) {
    return this.run('generateEmbedding', text, options);
  }

  generateEmbeddingsBatch(texts) {
    return Promise.all(
      texts.map((text) =>
        this.generateEmbedding(text).then((result) => result.data)
      )
    );
  }

  async health() {
    const ollamaHealth = await ollama.healthCheck();

    return {
      status: ollamaHealth.running ? 'healthy' : 'degraded',
      primary: 'ollama',
      fallback: null,
      activeProvider,
      ollamaRunning: ollamaHealth.running,
      ollama: ollamaHealth,
    };
  }
}

export const provider = new AIProvider();

export const generateText = (...args) => provider.generateText(...args);
export const generateJSON = (...args) => provider.generateJSON(...args);
export const generateVisionJSON = (...args) => provider.generateVision(...args);
export const generateEmbedding = (...args) => provider.generateEmbedding(...args);
export const generateEmbeddingsBatch = (...args) =>
  provider.generateEmbeddingsBatch(...args);

export const health = (...args) => provider.health(...args);
export const chat = (...args) => provider.chat(...args);
export const generate = (...args) => provider.generate(...args);
export const embed = (...args) => provider.embed(...args);
export const stream = (...args) => provider.stream(...args);

export const streamWithFallback = async function* (
  messages,
  options = {}
) {
  let tokenCount = 0;

  try {
    for await (const token of provider.stream(messages, options)) {
      tokenCount += 1;
      yield { token, provider: 'ollama' };
    }
  } catch (error) {
    const eligible =
      ['OLLAMA_UNAVAILABLE', 'OLLAMA_TIMEOUT', 'OLLAMA_HTTP_ERROR'].includes(
        error.code
      ) ||
      /connection refused|timed out|model.*(load|not found)|fetch failed/i.test(
        error.message || ''
      );

    if (tokenCount || !eligible || !env.GEMINI_API_KEY) throw error;

    logger.warn(
      {
        ms: options.startedAt ? Date.now() - options.startedAt : undefined,
        reason: error.code || error.message,
      },
      '[Gemini] fallback activated'
    );

    for await (const token of geminiStream(messages, options)) {
      yield { token, provider: 'gemini' };
    }
  }
};

async function* geminiStream(messages, options = {}) {
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${env.GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens:
          options.maxTokens || env.OLLAMA_MAX_TOKENS,
      },
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Gemini HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      buffer += decoder.decode(value || new Uint8Array(), {
        stream: !done,
      });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const data = line.replace(/^data:\s?/, '').trim();

        if (!data || data === '[DONE]') continue;

        const payload = JSON.parse(data);

        const text =
          payload.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || '')
            .join('') || '';

        if (text) yield text;
      }

      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export const healthCheck = (...args) => provider.healthCheck(...args);
export const listModels = (...args) => provider.listModels(...args);
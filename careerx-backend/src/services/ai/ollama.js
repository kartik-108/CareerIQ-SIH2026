import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const baseUrl = () => String(env.OLLAMA_BASE_URL).replace(/\/$/, '');

export class AIProviderError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.cause = cause;
  }
}

async function request(path, body, options = {}) {
  const timeout = options.timeout ?? env.OLLAMA_TIMEOUT_MS ?? env.OLLAMA_TIMEOUT;
  const controller = new AbortController();
  const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
  const abortExternal = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abortExternal, { once: true });
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new AIProviderError('OLLAMA_HTTP_ERROR', `Ollama HTTP ${response.status}`, payload);
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new AIProviderError('OLLAMA_TIMEOUT', 'Ollama request timed out', error);
    if (error instanceof AIProviderError) throw error;
    throw new AIProviderError('OLLAMA_UNAVAILABLE', 'Ollama request failed', error);
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortExternal);
  }
}

function optionsFor(options = {}) {
  return {
    temperature: options.temperature ?? env.OLLAMA_TEMPERATURE,
    num_predict: options.maxTokens ?? env.OLLAMA_MAX_TOKENS,
    num_ctx: options.contextTokens ?? 4096,
    keep_alive: options.keepAlive ?? env.OLLAMA_KEEP_ALIVE,
  };
}

export async function listModels() {
  const data = await request('/api/tags');
  return data.models || [];
}

export async function healthCheck() {
  const startedAt = Date.now();
  try {
    const models = await listModels();
    return {
      running: true,
      chatModel: env.OLLAMA_CHAT_MODEL,
      embeddingModel: env.OLLAMA_EMBED_MODEL,
      visionModel: env.OLLAMA_VISION_MODEL || null,
      models,
      modelAvailable: models.some((model) => model.name === env.OLLAMA_CHAT_MODEL || model.name?.startsWith(`${env.OLLAMA_CHAT_MODEL}:`)),
      embeddingModelAvailable: models.some((model) => model.name === env.OLLAMA_EMBED_MODEL || model.name?.startsWith(`${env.OLLAMA_EMBED_MODEL}:`)),
      visionModelAvailable: Boolean(env.OLLAMA_VISION_MODEL) && models.some((model) => model.name === env.OLLAMA_VISION_MODEL || model.name?.startsWith(`${env.OLLAMA_VISION_MODEL}:`)),
      latency: Date.now() - startedAt,
    };
  } catch (error) {
    return { running: false, models: [], latency: Date.now() - startedAt, reason: error.message };
  }
}

export async function chat(messages, options = {}) {
  const startedAt = Date.now();
  const data = await request('/api/chat', {
    model: options.model || env.OLLAMA_CHAT_MODEL,
    messages,
    stream: false,
    options: optionsFor(options),
    ...(options.format ? { format: options.format } : {}),
  }, options);
  const text = data.message?.content || '';
  if (!text.trim()) throw new AIProviderError('OLLAMA_EMPTY_RESPONSE', 'Ollama returned an empty response');
  return { provider: 'ollama', text, usage: data.eval_count || 0, latency: Date.now() - startedAt };
}

export async function generate(prompt, options = {}) {
  return chat([{ role: 'user', content: String(prompt || '') }], options);
}

export async function generateText(prompt, options = {}) {
  return generate(prompt, options);
}

export async function generateJSON(prompt, options = {}) {
  const result = await generate(prompt, { ...options, format: 'json' });
  try {
    return { ...result, data: JSON.parse(result.text.replace(/```json|```/g, '').trim()) };
  } catch (error) {
    throw new AIProviderError('OLLAMA_INVALID_JSON', 'Ollama returned invalid JSON', error);
  }
}

export async function* stream(messages, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? env.OLLAMA_TIMEOUT_MS ?? env.OLLAMA_TIMEOUT);
  if (options.signal) options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  const requestUrl = `${baseUrl()}/api/chat`;
  const requestBody = {
    model: options.model || env.OLLAMA_CHAT_MODEL,
    messages,
    stream: true,
    options: optionsFor(options),
  };
  const responseState = {
    status: null,
    statusText: null,
    headers: null,
    chunksReceived: 0,
    bytesReceived: 0,
    recordsReceived: 0,
    lastRecord: null,
    pendingData: '',
  };
  const requestStartedAt = Date.now();
  let firstTokenReceived = false;
  const noTokenTimer = setTimeout(() => {
    if (firstTokenReceived) return;
    logger.warn({
      elapsedMs: Date.now() - requestStartedAt,
      request: {
        url: requestUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        model: requestBody.model,
      },
      response: responseState,
    }, '[Ollama] no token received within 15 seconds; request/response state');
  }, 15000);
  let response;
  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new AIProviderError('OLLAMA_HTTP_ERROR', `Ollama HTTP ${response.status}`);
    responseState.status = response.status;
    responseState.statusText = response.statusText;
    responseState.headers = Object.fromEntries(response.headers.entries());
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const value of response.body) {
      responseState.chunksReceived += 1;
      responseState.bytesReceived += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      responseState.pendingData = buffer;
      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line);
        responseState.recordsReceived += 1;
        responseState.lastRecord = data;
        if (data.message?.content) {
          firstTokenReceived = true;
          clearTimeout(noTokenTimer);
          yield data.message.content;
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const data = JSON.parse(buffer);
      responseState.recordsReceived += 1;
      responseState.lastRecord = data;
      if (data.message?.content) {
        firstTokenReceived = true;
        clearTimeout(noTokenTimer);
        yield data.message.content;
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new AIProviderError('OLLAMA_TIMEOUT', 'Ollama request timed out', error);
    if (error instanceof AIProviderError) throw error;
    throw new AIProviderError('OLLAMA_UNAVAILABLE', 'Ollama request failed', error);
  } finally {
    clearTimeout(noTokenTimer);
    await response?.body?.cancel?.().catch(() => {});
    clearTimeout(timer);
  }
}

export async function embed(text, options = {}) {
  const data = await request('/api/embed', {
    model: options.model || env.OLLAMA_EMBED_MODEL,
    input: String(text || ''),
  }, options);
  const embedding = Array.isArray(data.embeddings) ? data.embeddings[0] : data.embedding;
  if (!Array.isArray(embedding)) throw new AIProviderError('OLLAMA_INVALID_EMBEDDING', 'Ollama returned no embedding');
  if (env.OLLAMA_EMBED_DIM && embedding.length !== env.OLLAMA_EMBED_DIM) {
    throw new AIProviderError('OLLAMA_INVALID_EMBEDDING', `Ollama returned ${embedding.length} dimensions; expected ${env.OLLAMA_EMBED_DIM}`);
  }
  return { provider: 'ollama', data: embedding, usage: 0, latency: 0 };
}

export async function generateEmbedding(text, options = {}) {
  return embed(text, options);
}

// Sends the image(s) to a multimodal Ollama model. Ollama's chat API takes base64 image data in `images`.
export async function generateVision(prompt, parts = [], options = {}) {
  const images = parts.map((part) => part?.inlineData?.data).filter((data) => typeof data === 'string' && data.length > 0);
  if (!images.length) throw new AIProviderError('OLLAMA_INVALID_INPUT', 'Vision request contained no image data');
  if (!options.model && !env.OLLAMA_VISION_MODEL) {
    throw new AIProviderError(
      'OLLAMA_VISION_MODEL_REQUIRED',
      'Ollama vision analysis requires OLLAMA_VISION_MODEL to name a multimodal model'
    );
  }
  const textParts = parts.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n');
  const startedAt = Date.now();
  const data = await request('/api/chat', {
    model: options.model || env.OLLAMA_VISION_MODEL,
    messages: [{ role: 'user', content: textParts ? `${prompt}\n${textParts}` : prompt, images }],
    stream: false,
    format: 'json',
    options: optionsFor(options),
  }, options);
  const text = data.message?.content || '';
  if (!text.trim()) throw new AIProviderError('OLLAMA_EMPTY_RESPONSE', 'Ollama returned an empty response');
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (error) {
    throw new AIProviderError('OLLAMA_INVALID_JSON', 'Ollama returned invalid JSON', error);
  }
  return { provider: 'ollama', text, data: parsed, usage: data.eval_count || 0, latency: Date.now() - startedAt };
}

export const health = healthCheck;

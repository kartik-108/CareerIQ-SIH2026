// Lightweight token estimator (no external tokenizer dependency).
// ~4 chars per token is the standard approximation for English text,
// good enough for chunk-sizing decisions.
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

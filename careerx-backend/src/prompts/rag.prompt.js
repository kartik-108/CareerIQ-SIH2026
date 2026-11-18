export const RAG_PROMPT_VERSION = 'v1';

export function buildRAGAnswerPrompt({ question, contextChunks }) {
  const context = contextChunks
    .map((c, i) => `[Source ${i + 1}] (category: ${c.metadata?.category || 'general'})\n${c.content}`)
    .join('\n\n');

  return `
You are CareerX's knowledge assistant, helping Indian students with career, skills, interview,
and government scheme questions. Answer ONLY using the provided context. If the context does not
contain the answer, say so honestly instead of guessing.

Respond in English only.

CONTEXT:
"""
${context}
"""

QUESTION: "${question}"

Return a JSON object with EXACTLY this shape:
{
  "answer": string,
  "sources_used": number[],
  "confidence": "low"|"medium"|"high",
  "related_topics": string[]
}

Rules:
- "sources_used" should list the [Source N] indices actually relied upon.
- Never fabricate facts not present in the context.
- Keep "answer" concise and directly useful to a student.
`.trim();
}

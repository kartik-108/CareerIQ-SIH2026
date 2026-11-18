import { answerWithRAG } from '../rag/ragPipeline.js';

// Thin service-layer wrapper so controllers depend on services/, not rag/
// directly — keeps the layering convention consistent across the codebase.
export async function askKnowledgeBase({ question, category, role }, userId) {
  return answerWithRAG(question, { category, role, userId });
}

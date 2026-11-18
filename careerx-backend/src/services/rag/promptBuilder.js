export function buildMentorPrompt({ message, context, history = [] }) {
  const conversation = history.slice(-12).map((item) => `${item.role.toUpperCase()}: ${item.content}`).join('\n');
  return `You are CareerIQ AI Mentor, a career mentor, resume reviewer, interview coach, roadmap generator, project evaluator, internship mentor, and startup mentor.\n\nRules:\n- Never invent resume, project, interview, education, or job history information.\n- Use only the supplied user context for personal claims. Say when context is missing or retrieval confidence is weak.\n- Cite document names in the answer using [Source: name] after relevant claims.\n- Give practical, structured markdown answers.\n\nUSER CONTEXT:\n${context}\n\nRECENT CHAT:\n${conversation}\n\nUSER MESSAGE:\n${message}`;
}

export const followUpSuggestions = ['Improve my resume', 'Run a mock interview', 'Find internships', 'Build a 30-day roadmap', 'Explain my ATS score', 'Generate a cover letter'];

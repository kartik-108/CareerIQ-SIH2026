export const INTERVIEW_PROMPT_VERSION = 'v1';

export function buildInterviewQuestionPrompt({ interviewType, targetRole, companyName, previousQA = [] }) {
  return `
You are conducting a ${interviewType} interview${companyName ? ` for ${companyName}` : ''} for the role of
"${targetRole}". This is an adaptive interview: use the candidate's previous answers to decide the next question's
difficulty and focus area.

PREVIOUS Q&A (may be empty for the first question):
${JSON.stringify(previousQA)}

Return a JSON object with EXACTLY this shape:
{
  "question": string,
  "category": string,
  "difficulty": "easy"|"medium"|"hard",
  "reasoning": string
}

Rules:
- If PREVIOUS_QA is empty, ask a warm-up question appropriate to ${interviewType}.
- If the candidate's last answer was weak, probe the same topic at a lower difficulty rather than jumping ahead.
- If the candidate's last answer was strong, escalate difficulty or move to a new relevant topic.
- "reasoning" is internal — explain briefly why you chose this question (not shown to candidate).
`.trim();
}

export function buildInterviewAnswerScoringPrompt({ question, transcript }) {
  return `
You are scoring a candidate's spoken interview answer (given as a transcript).

QUESTION: "${question}"
TRANSCRIPT: """
${transcript}
"""

Return a JSON object with EXACTLY this shape:
{
  "filler_word_count": number,
  "confidence_score": number (0-100),
  "grammar_score": number (0-100),
  "answer_quality_score": number (0-100),
  "feedback": string
}

Rules:
- Count filler words like "um", "uh", "like", "you know", "basically" (case-insensitive).
- "feedback" should be 2-3 sentences of specific, constructive feedback.
`.trim();
}

export function buildInterviewStudioQuestionPrompt({ interviewType, targetRole, resumeText, previousQA = [], questionNumber, userName = '' }) {
  const progression = ['Easy', 'Easy-Medium', 'Medium', 'Practical', 'Scenario', 'Debugging', 'System Thinking', 'Reflection'];
  const stages = ['Icebreaker', 'Resume/project', 'Core technical', 'Practical scenario', 'Debugging challenge', 'System thinking', 'Behavioral/teamwork', 'Reflection'];
  const candidateName = String(userName || '').trim().split(/\s+/)[0];
  return `You are a friendly, experienced human recruiter conducting a realistic ${interviewType} interview for the role of "${targetRole}". Speak naturally, as if you are talking to a candidate in a live interview. Never sound like an exam, textbook, quiz, or scripted assessment.

This is question ${questionNumber}, stage ${stages[Math.min(Math.max(Number(questionNumber) - 1, 0), stages.length - 1)]}. Use difficulty: ${progression[Math.min(Math.max(Number(questionNumber) - 1, 0), progression.length - 1)]}.
Candidate first name, if available: ${candidateName || 'not available'}
Resume context: ${resumeText || 'No resume text is available; tailor the question to the role.'}
Previous Q&A, including prior question text: ${JSON.stringify(previousQA)}

Rules:
- For question 1, use spokenIntro to greet the candidate, use their first name when available, and ask permission to begin. Keep it under 15 words.
- For later questions, spokenIntro must be a brief natural reaction or transition to the previous answer, under 15 words.
- Ask one conversational question under 35 words; never write a textbook, exam, or trivia question.
- Mention "${targetRole}" naturally when it helps, without awkward repetition.
- Vary openings: Tell me about, Walk me through, Suppose you're working on, Imagine you're building, Have you ever, How would you.
- If the previous answer mentions a technology, project, or decision, ask a relevant follow-up about it.
- Build from the candidate's previous answer and never repeat a previous question.
- Adapt to the candidate's resume when useful; do not invent resume facts.

Return JSON only with exactly these fields:
{"question":string,"spokenIntro":string,"difficulty":"Easy"|"Easy-Medium"|"Medium"|"Practical"|"Scenario"|"Debugging"|"System Thinking"|"Reflection","expectedTopics":string[],"followUpHint":string,"category":string}`;
}

export function buildInterviewStudioEvaluationPrompt({ question, transcript, resumeText, visionMetrics, speechMetrics }) {
  return `Evaluate this spoken interview answer for a ${question.type || 'professional'} interview.
Question: ${question.question}
Resume: ${resumeText || 'not provided'}
Transcript: ${transcript}
Vision metrics: ${JSON.stringify(visionMetrics || {})}
Speech metrics: ${JSON.stringify(speechMetrics || {})}
Return JSON only: {"score":number,"technical":number,"communication":number,"confidence":number,"strengths":string[],"improvements":string[],"followupQuestion":string}. Scores are 0-100.`;
}

export function buildInterviewStudioReportPrompt({ targetRole, interviewType, answers, metrics }) {
  return `Create a final mock interview report for ${targetRole} (${interviewType}).
Answers: ${JSON.stringify(answers)}
Live metrics: ${JSON.stringify(metrics || {})}
Return JSON only with overall_score, confidence_score, communication_score, posture_score, eye_contact_score, technical_score, speech, strengths, weaknesses, suggestions, readiness, xp_earned, badge.`;
}

export function buildInterviewReportPrompt({ interviewType, targetRole, qaPairs }) {
  return `
You are generating a final interview performance report for a ${interviewType} interview for the role
"${targetRole}".

FULL Q&A + SCORES:
${JSON.stringify(qaPairs)}

Return a JSON object with EXACTLY this shape:
{
  "overall_score": number (0-100),
  "communication_score": number (0-100),
  "confidence_score": number (0-100),
  "technical_score": number (0-100),
  "strengths": string[],
  "weaknesses": string[],
  "feedback": string
}
`.trim();
}

import crypto from 'node:crypto';
import { cacheGet, cacheSet } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as aiProvider from './ai/provider.js';
import { buildVisionAnalysisPrompt } from '../prompts/vision.prompt.js';
import { buildResumeAnalysisPrompt } from '../prompts/resume.prompt.js';
import { preprocessResumeFile } from '../utils/imagePreprocess.js';
import { extractTextWithOcr } from '../utils/ocr.js';
import { parseStructuredResume, parseResumeText, isQualifiedAchievement } from './resumeParser.js';
import { visionExtractionSchema } from '../validators/vision.validator.js';
import { AIError } from '../utils/ApiError.js';

export const RESUME_PARSER_VERSION = 'resume-studio-v5';

// Fixed reference count of distinct ATS-relevant terms for a full keyword score.
export const KEYWORD_TARGET_TERMS = 12;

export { parseResumeText } from './resumeParser.js';

function normalizeResumeText(text) {
  return String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function extractLocalResumeTextWithMetadata(file) {
  const mimeType = file.mimetype || '';
  const fileName = file.originalname || 'resume';

  try {
    if (mimeType === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const extractedText = (await pdfParse(file.buffer)).text || '';
      const text = String(extractedText || '').replace(/\r/g, '\n').trim();
      if (text.length >= 80) {
        logger.info({ fileName, mimeType, method: 'pdf', textLength: text.length }, 'resume local PDF text extraction succeeded');
        return { text, rawText: text, layoutLines: null, method: 'pdf', textLength: text.length, fallbackReason: null };
      }
      logger.warn({ fileName, mimeType, textLength: text.length }, 'resume PDF text extraction returned too little text; OCR fallback enabled');
      const ocrResult = await extractTextWithOcr(file.buffer, { mimeType, timeoutMs: 45000, language: 'eng' });
      return {
        text: ocrResult.layoutText || ocrResult.text || '',
        rawText: ocrResult.text || '',
        layoutLines: ocrResult.layout?.lines?.length ? ocrResult.layout.lines : null,
        layoutColumns: ocrResult.layout?.columnCount ?? null,
        ocrConfidence: ocrResult.confidence ?? null,
        method: ocrResult.text ? 'ocr' : 'failed',
        textLength: ocrResult.textLength || 0,
        fallbackReason: text.length ? 'text content was too sparse' : 'no text content detected',
      };
    }

    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const extractedText = (await mammoth.extractRawText({ buffer: file.buffer })).value || '';
      const text = String(extractedText || '').replace(/\r/g, '\n').trim();
      logger.info({ fileName, mimeType, method: 'docx', textLength: text.length }, 'resume DOCX text extraction completed');
      return { text, rawText: text, layoutLines: null, method: 'docx', textLength: text.length, fallbackReason: null };
    }

    if (mimeType?.startsWith('text/')) {
      const text = String(file.buffer.toString('utf8') || '').trim();
      logger.info({ fileName, mimeType, method: 'text', textLength: text.length }, 'resume text file extraction completed');
      return { text, rawText: text, layoutLines: null, method: 'text', textLength: text.length, fallbackReason: null };
    }

    if (mimeType?.startsWith('image/')) {
      // OCR receives the original buffer: it performs its own single lossless preprocessing pass.
      const ocrResult = await extractTextWithOcr(file.buffer, { mimeType, timeoutMs: 45000, language: 'eng' });
      return {
        // Falls back to plain text when an OCR result has no layout (older contract): parsing still runs.
        text: ocrResult.layoutText || ocrResult.text || '',
        rawText: ocrResult.text || '',
        layoutLines: ocrResult.layout?.lines?.length ? ocrResult.layout.lines : null,
        layoutColumns: ocrResult.layout?.columnCount ?? null,
        ocrConfidence: ocrResult.confidence ?? null,
        method: ocrResult.text ? 'ocr' : 'failed',
        textLength: ocrResult.textLength || 0,
        fallbackReason: ocrResult.status === 'failed' ? ocrResult.error : null,
      };
    }

    return { text: '', rawText: '', layoutLines: null, method: 'unsupported', textLength: 0, fallbackReason: `Unsupported mime type: ${mimeType || 'unknown'}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ fileName, mimeType, err: message }, 'resume local extraction failed');
    return { text: '', rawText: '', layoutLines: null, method: 'failed', textLength: 0, fallbackReason: message };
  }
}

async function extractLocalResumeText(file) {
  return (await extractLocalResumeTextWithMetadata(file)).text;
}

function deterministicExtraction(structured, text) {
  const skills = findKnownSkills(text);
  const structuredSkills = structured.skills || [];
  const allSkills = [...new Set([...structuredSkills, ...skills])];
  return {
    candidate_name: structured.candidate_name || '',
    email: structured.email || '',
    phone: structured.phone || '',
    linkedin: structured.linkedin || '',
    github: structured.github || '',
    portfolio: '',
    summary: structured.summary || '',
    skills: allSkills,
    keywords: skills,
    soft_skills: [],
    education: structured.education,
    projects: structured.projects,
    experience: structured.experience,
    certifications: structured.certifications,
    achievements: structured.achievements,
    awards: structured.awards,
    quantified_achievements: [...new Set((structured.experience || []).flatMap((item) => item.metrics || []))],
    section_names: structured.section_names,
    custom_sections: structured.custom_sections,
    core_strengths: structured.core_strengths,
    ats_keywords_found: allSkills,
    ats_keywords_missing: [],
    strengths: allSkills.length ? ['Technical skills were detected in the resume text.'] : [],
    weaknesses: [],
    improvements: buildPersonalizedSuggestions({ skills: allSkills, education: structured.education, projects: structured.projects, experience: structured.experience, achievements: structured.achievements }),
  };
}

export async function getResumeContentHash(file) {
  let content = file.buffer;
  if (file.mimetype === 'application/pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      content = Buffer.from(normalizeResumeText((await pdfParse(file.buffer)).text));
    } catch {
      content = Buffer.from(normalizeResumeText(file.buffer.toString('utf8')));
    }
  } else if (file.mimetype?.startsWith('text/')) {
    content = Buffer.from(normalizeResumeText(file.buffer.toString('utf8')));
  }
  return crypto.createHash('sha256').update(content).digest('hex');
}

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(cleanText).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function uniqueLowercaseStrings(values) {
  return uniqueStrings((values || []).map((value) => cleanText(value).toLowerCase()));
}

const SKILL_ALIASES = new Map([
  ['nodejs', 'Node.js'], ['node js', 'Node.js'], ['node.js', 'Node.js'],
  ['rest api', 'REST APIs'], ['rest apis', 'REST APIs'],
  ['opensearch', 'Elasticsearch'], ['elastic search', 'Elasticsearch'], ['elasticsearch', 'Elasticsearch'],
  ['js', 'JavaScript'], ['javascript', 'JavaScript'], ['ts', 'TypeScript'], ['typescript', 'TypeScript'],
  ['postgres', 'PostgreSQL'], ['postgresql', 'PostgreSQL'], ['mongo', 'MongoDB'], ['mongodb', 'MongoDB'],
  ['amazon web services', 'AWS'], ['google cloud platform', 'GCP'], ['google cloud', 'GCP'],
  ['k8s', 'Kubernetes'], ['ml', 'Machine Learning'], ['ai/ml', 'AI/ML'],
]);

const SKILL_SYNONYMS = [
  [/\b(ai|artificial intelligence)\b.*\b(machine learning|ml)\b|\b(machine learning|ml)\b.*\b(ai|artificial intelligence)\b/, 'machine_learning'],
  [/\bev powertrains?\b|\belectric vehicle powertrains?\b/, 'electric_vehicles'],
  [/\bsoftware\s*(?:&|and)\s*controls?\b/, 'software_engineering'],
  [/\bproduct engineering\b/, 'product_design'],
  [/\brobotics\s*(?:&|and)\s*automation\b/, 'robotics'],
];

function canonicalSkill(value) {
  const normalized = cleanText(value).toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');
  const alias = SKILL_ALIASES.get(normalized);
  if (alias) return alias;
  const synonym = SKILL_SYNONYMS.find(([pattern]) => pattern.test(normalized));
  return synonym ? synonym[1] : normalized;
}

const KNOWN_SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Ruby', 'Kotlin', 'Swift',
  'React', 'Next.js', 'Angular', 'Vue.js', 'HTML', 'CSS', 'Tailwind CSS', 'Bootstrap', 'Node.js', 'Express.js',
  'REST APIs', 'GraphQL', 'Microservices', 'Spring Boot', 'Django', 'Flask', 'FastAPI', '.NET', 'SQL', 'PostgreSQL',
  'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Firebase', 'Supabase', 'DynamoDB', 'Oracle', 'SQLite',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'GitHub Actions', 'CI/CD', 'Linux', 'Git',
  'Machine Learning', 'Deep Learning', 'AI/ML', 'NLP', 'Computer Vision', 'TensorFlow', 'PyTorch', 'Scikit-learn',
  'Pandas', 'NumPy', 'Data Structures', 'Algorithms', 'System Design', 'Object-Oriented Programming',
  'Agile', 'Jest', 'Mocha', 'Playwright', 'Cypress', 'Postman', 'Swagger', 'OpenAPI', 'Kafka', 'RabbitMQ',
  'WebSockets', 'HTML5', 'CSS3', 'Figma', 'Power BI', 'Tableau', 'OAuth', 'JWT', 'Linux', 'Bash', 'MATLAB',
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findKnownSkills(text) {
  const found = KNOWN_SKILLS.filter((skill) => new RegExp(`(^|[^a-z0-9])${escapeRegex(skill)}($|[^a-z0-9])`, 'i').test(text));
  return [...new Set(found.map(canonicalSkill))];
}

function stemToken(token) {
  if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function canonicalTokens(value) {
  let normalized = cleanText(value).toLowerCase();
  for (const [alias, canonical] of [...SKILL_ALIASES.entries()].sort(([left], [right]) => right.length - left.length)) {
    normalized = normalized.replace(new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}(?=$|[^a-z0-9])`, 'g'), `$1${canonical.toLowerCase()}`);
  }
  return normalized.match(/[a-z0-9]+/g)?.map(stemToken) || [];
}

function containsCanonicalKeyword(keyword, corpus) {
  const expected = canonicalTokens(keyword);
  const actual = canonicalTokens(corpus);
  if (!expected.length || expected.length > actual.length) return false;
  return actual.some((_, start) => expected.every((token, offset) => actual[start + offset] === token));
}

function buildPersonalizedSuggestions(extraction) {
  const suggestions = [];
  if (extraction.experience.length) {
    const company = extraction.experience[0].company || 'your most recent role';
    const quantified = extraction.experience.some((item) => /\d/.test(JSON.stringify(item.highlights || [])));
    suggestions.push(quantified ? `Bring the strongest measurable result from ${company} into the first bullet for that role.` : `Add a measurable outcome to a bullet from ${company}, such as latency, users, reliability, or delivery time.`);
  } else if (extraction.projects.length) {
    suggestions.push(`Lead with ${extraction.projects[0].title} and quantify its users, performance, or implementation scope.`);
  }
  if (extraction.projects.length) suggestions.push(`For ${extraction.projects[0].title}, place the core technologies beside the title and add a working GitHub or demo link.`);
  if (!extraction.education.length) suggestions.push('Add your degree, institution, and attendance dates so recruiters can verify your education at a glance.');
  if (!extraction.skills.length) suggestions.push('Add a Technical Skills section with the tools and languages used in your experience and projects.');
  if (extraction.achievements?.length) suggestions.push(`Move ${extraction.achievements[0]} into a concise Achievements section near the top of the resume.`);
  return suggestions;
}

function normalizeItems(items) {
  return (items || []).map((item) => {
    if (typeof item === 'string') return cleanText(item).toLowerCase();
    return Object.fromEntries(Object.entries(item || {}).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, typeof value === 'string' ? cleanText(value) : value]));
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function mergeNonEmptyArrays(...collections) {
  const items = collections.flatMap((collection) => Array.isArray(collection) ? collection : []);
  const deduped = [];
  const seen = new Set();

  for (const item of items) {
    if (item == null || (typeof item === 'string' && !item.trim())) continue;
    const signature = typeof item === 'string' ? item.trim().toLowerCase() : JSON.stringify(item);
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(item);
  }

  return deduped;
}

export function normalizeResumeExtraction(extraction = {}, resumeText = '') {
  const textParsed = parseResumeText(resumeText);
  const source = extraction && typeof extraction === 'object' ? extraction : {};
  const sourceArray = (value) => Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined && (!String(item).trim || String(item).trim() !== '')) : [];
  const corpus = [resumeText, source.summary, source.skills, source.keywords, source.ats_keywords_found, source.education, source.projects, source.experience, source.achievements, source.awards, source.quantified_achievements].flat(Infinity).join(' ');
  const fallbackSkills = [...new Set([...findKnownSkills(resumeText), ...findKnownSkills(JSON.stringify(source.experience || [])), ...findKnownSkills(JSON.stringify(source.projects || []))])];
  const skillKey = (value) => String(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const skills = [...new Map([
    ...uniqueLowercaseStrings(source.skills).map(canonicalSkill),
    ...fallbackSkills,
    ...uniqueLowercaseStrings(textParsed.skillNames).map(canonicalSkill),
  ].map((skill) => [skillKey(skill), skill])).values()].sort((left, right) => left.localeCompare(right));

  const education = normalizeItems(mergeNonEmptyArrays(textParsed.education, source.education));
  const projects = normalizeItems(mergeNonEmptyArrays(textParsed.projects, source.projects));
  const experience = normalizeItems(mergeNonEmptyArrays(textParsed.experience, source.experience));
  // Achievements are real achievement statements only. Awards & Honors are kept in their own list.
  const isAchievementItem = (item) => (typeof item === 'string' ? isQualifiedAchievement(item) : Boolean(item && typeof item === 'object'));
  // Display text keeps its original casing; only the structure is deduplicated.
  const keepCase = (items) => {
    const seen = new Set();
    return items.map((item) => (typeof item === 'string' ? cleanText(item) : item)).filter((item) => {
      const key = typeof item === 'string' ? item.toLowerCase() : JSON.stringify(item);
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const achievements = keepCase(mergeNonEmptyArrays(textParsed.achievements, source.achievements).filter(isAchievementItem));
  const awards = keepCase(mergeNonEmptyArrays(textParsed.awards, source.awards));

  const missingKeywords = uniqueLowercaseStrings(source.ats_keywords_missing)
    .map(canonicalSkill)
    .filter((keyword) => !containsCanonicalKeyword(keyword, corpus));

  return {
    candidate_name: cleanText(source.candidate_name),
    email: cleanText(source.email).toLowerCase(),
    phone: cleanText(source.phone),
    linkedin: cleanText(source.linkedin).toLowerCase(),
    github: cleanText(source.github).toLowerCase(),
    portfolio: cleanText(source.portfolio).toLowerCase(),
    summary: cleanText(source.summary || textParsed.summary || ''),
    raw_text: String(source.raw_text || source.rawText || resumeText || ''),
    education,
    projects,
    experience,
    certifications: normalizeItems(source.certifications),
    awards,
    quantified_achievements: uniqueStrings(source.quantified_achievements),
    achievements,
    custom_sections: normalizeItems(mergeNonEmptyArrays(textParsed.custom_sections, source.custom_sections)),
    keywords: uniqueLowercaseStrings(source.keywords).map(canonicalSkill),
    section_names: uniqueStrings(source.section_names || textParsed.section_names),
    core_strengths: uniqueLowercaseStrings([...(source.core_strengths || []), ...(textParsed.core_strengths || [])]),
    soft_skills: uniqueLowercaseStrings(source.soft_skills),
    skills,
    ats_keywords_found: [...new Set([...uniqueLowercaseStrings(source.ats_keywords_found).map(canonicalSkill), ...skills])],
    ats_keywords_missing: missingKeywords,
    strengths: uniqueStrings([...(source.strengths || []), ...(source.core_strengths || [])]),
    weaknesses: uniqueStrings(source.weaknesses),
    improvements: uniqueStrings((source.improvements || []).filter((item) => !/retry analysis|try again/i.test(item))),
  };
}

export function calculateATSScore(input) {
  const hasExtraction = Boolean(input && typeof input === 'object' && input.extraction);
  const resumeText = typeof input === 'object' ? String(input.raw_text || input.rawText || '') : '';
  const layoutText = typeof input === 'object' ? String(input.layout_text || '') : '';
  const corpusText = [resumeText, layoutText].filter(Boolean).join('\n');
  // A pre-normalized extraction is not re-parsed; flat input is parsed from the layout (or raw) text.
  const extraction = normalizeResumeExtraction(input?.extraction || input, hasExtraction ? '' : (layoutText || resumeText));
  const quantifiedPattern = /(?:\b\d[\d,.]*(?:\s*(?:%|x\b|m\b|b\b|million\b|billion\b|thousand\b|users?\b|vehicles?\b|patents?\b|publications?\b|requests?\b|ms\b|seconds?\b))?|[$€£]\s*\d)/i;
  const experienceItems = Array.isArray(extraction.experience) ? extraction.experience : [];
  const projectItems = Array.isArray(extraction.projects) ? extraction.projects : [];
  const educationItems = Array.isArray(extraction.education) ? extraction.education : [];
  const achievementItems = Array.isArray(extraction.achievements) ? extraction.achievements : [];
  const uniqueSkills = [...new Set((extraction.skills || []).map((skill) => String(skill).trim().toLowerCase()).filter(Boolean))];

  const skills = uniqueSkills.length === 0 ? 0 : Math.min(100, Math.round((Math.min(uniqueSkills.length, 12) / 12) * 60 + (uniqueSkills.length >= 5 ? 25 : uniqueSkills.length * 5)));

  const validExperience = experienceItems.filter((item) => {
    const value = JSON.stringify(item || {}).toLowerCase();
    return value.includes('role') || value.includes('company') || value.includes('experience') || value.includes('engineer') || value.includes('developer') || value.includes('manager');
  });

  let experience = 0;
  if (validExperience.length > 0) {
    const roleScore = validExperience.filter((item) => String(item.role || item.title || '').trim()).length * 20;
    const companyScore = validExperience.filter((item) => String(item.company || '').trim()).length * 10;
    const dateScore = validExperience.filter((item) => String(item.dates || item.duration || '').trim()).length * 10;
    const quantifiedScore = validExperience.filter((item) => quantifiedPattern.test(JSON.stringify(item))).length * 15;
    const detailScore = validExperience.filter((item) => JSON.stringify(item).length >= 120).length * 15;
    experience = Math.min(100, roleScore + companyScore + dateScore + quantifiedScore + detailScore);
  }

  let projects = 0;
  if (projectItems.length > 0) {
    const countScore = Math.min(40, projectItems.length * 12) + 35;
    const technologyScore = Math.min(25, projectItems.filter((item) => Array.isArray(item.technologies) && item.technologies.length > 0).length * 8);
    const metricsScore = Math.min(20, projectItems.filter((item) => (Array.isArray(item.metrics) && item.metrics.length > 0) || quantifiedPattern.test(JSON.stringify(item))).length * 8);
    const linkScore = Math.min(20, projectItems.filter((item) => item.github_url || item.githubUrl || item.demo_url || item.demoUrl).length * 10);
    projects = Math.min(100, countScore + technologyScore + metricsScore + linkScore);
  }

  let education = 0;
  if (educationItems.length > 0) {
    let score = 35;
    const educationText = JSON.stringify(educationItems).toLowerCase();
    if (/\b(?:b\.tech|b\.e|bachelor|master|m\.tech|m\.e|ph\.d|degree)\b/i.test(educationText)) score += 25;
    if (/\b(?:institution|college|university|school)\b/i.test(educationText)) score += 20;
    if (/\b(?:20\d{2}|19\d{2})\b/.test(educationText)) score += 10;
    if (/\b(?:cgpa|gpa|grade|percentage|marks)\b/i.test(educationText)) score += 10;
    education = Math.min(100, score);
  }

  // Keywords = distinct ATS-relevant terms actually detected in the resume (skills, core strengths,
  // known technical terms in the text), scored against a fixed reference of KEYWORD_TARGET_TERMS.
  const termKey = (item) => cleanText(item).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const detectedTerms = new Set([
    ...(extraction.skills || []),
    ...(extraction.core_strengths || []),
    ...(extraction.ats_keywords_found || []),
    ...(extraction.keywords || []),
    ...(corpusText ? findKnownSkills(corpusText) : []),
  ].map(termKey).filter(Boolean));
  const foundKeywords = [...detectedTerms];
  const keywords = Math.min(100, Math.round((detectedTerms.size / KEYWORD_TARGET_TERMS) * 100));

  let achievements = 0;
  if (achievementItems.length > 0) {
    const countScore = Math.min(60, achievementItems.length * 20);
    const quantifiedScore = Math.min(40, achievementItems.filter((item) => quantifiedPattern.test(JSON.stringify(item))).length * 20);
    achievements = Math.min(100, countScore + quantifiedScore);
  }

  const weaknesses = extraction.weaknesses || [];
  let formatting = 70;
  if ((extraction.section_names || []).length >= 4) formatting += 10;
  if (extraction.summary) formatting += 10;
  if (weaknesses.some((item) => /layout|column|format|readab|heading|section/i.test(String(item)))) formatting -= 20;
  const importantSections = [Boolean(uniqueSkills.length), Boolean(educationItems.length), Boolean(validExperience.length), Boolean(projectItems.length)];
  if (importantSections.filter(Boolean).length <= 1) formatting -= 20;
  formatting = Math.max(0, Math.min(100, formatting));

  const completenessChecks = [Boolean(uniqueSkills.length), Boolean(educationItems.length), Boolean(validExperience.length), Boolean(projectItems.length), Boolean(achievementItems.length)];
  const completeness = Math.round((completenessChecks.filter(Boolean).length / completenessChecks.length) * 100);

  const categories = { experience, projects, skills, keywords, education, achievements, formatting, completeness };
  const weights = { experience: 0.22, projects: 0.18, skills: 0.2, keywords: 0.15, education: 0.08, achievements: 0.07, formatting: 0.05, completeness: 0.05 };

  let overall_score = Math.round(Object.entries(weights).reduce((total, [category, weight]) => total + categories[category] * weight, 0));
  const extractedContent = uniqueSkills.length + validExperience.length + projectItems.length + educationItems.length + achievementItems.length + foundKeywords.length + (corpusText.trim() ? 1 : 0);
  if (extractedContent === 0) overall_score = 0;

  return { overall_score: Math.max(0, Math.min(100, overall_score)), categories, weights };
}

const skillGroups = { 'AI / ML': ['python', 'tensorflow', 'pytorch', 'machine learning', 'deep learning', 'nlp', 'computer vision', 'llm'], Frontend: ['react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css', 'next.js'], Backend: ['node.js', 'node', 'express', 'java', 'spring', 'python', 'django', 'fastapi', 'graphql'], Cloud: ['aws', 'azure', 'gcp', 'lambda', 'ec2', 's3', 'cloud functions'], DevOps: ['docker', 'kubernetes', 'jenkins', 'terraform', 'github actions', 'ci/cd'], 'Data Science': ['pandas', 'numpy', 'sql', 'tableau', 'power bi', 'scikit-learn'], Mobile: ['android', 'kotlin', 'swift', 'flutter', 'react native'], Cybersecurity: ['penetration testing', 'owasp', 'siem', 'network security', 'cybersecurity'], 'UI/UX': ['figma', 'wireframing', 'prototyping', 'user research', 'sketch'] };

function groupSkills(skills) {
  const normalized = skills.map((skill) => skill.toLowerCase());
  return Object.fromEntries(Object.entries(skillGroups).map(([group, terms]) => [group, skills.filter((skill, index) => terms.some((term) => normalized[index].includes(term))) ]));
}

function buildImprovements(extraction, atsScore) {
  const grammar = extraction.weaknesses.filter((item) => /grammar|spelling|tense|sentence/i.test(item));
  const actionVerbs = [extraction.experience.length ? 'Replace passive phrasing with measurable verbs such as engineered, optimized, automated, and delivered.' : 'Use action verbs such as built, analyzed, designed, and shipped in project bullets.'];
  const bulletRewrites = [extraction.experience.length ? 'Rewrite each experience bullet as action + scope + measurable result.' : 'Rewrite project bullets to include the technology, your contribution, and an outcome.'];
  const missingSections = ['certifications', 'achievements'].filter((section) => !extraction[section].length);
  return { missing_keywords: extraction.ats_keywords_missing, missing_sections: missingSections, grammar_suggestions: grammar, better_action_verbs: actionVerbs, strong_bullet_rewrites: bulletRewrites, project_suggestions: [extraction.projects.length ? 'Add scale, users, performance, or business impact to each project.' : 'Add two relevant projects with a live demo and measurable outcome.'], improvements: extraction.improvements, ats_score: atsScore };
}

function buildReadiness(extraction, ats) {
  const strengths = extraction.strengths.length ? extraction.strengths : [extraction.skills.length ? 'Relevant technical skills are present.' : 'Resume content is ready for skill enrichment.'];
  const weaknesses = extraction.weaknesses.length ? extraction.weaknesses : ['Add more measurable outcomes and role-specific keywords.'];
  return { top_strengths: strengths.slice(0, 5), top_weaknesses: weaknesses.slice(0, 5), career_readiness_score: ats.overall_score, confidence_score: Math.min(100, 60 + extraction.skills.length * 3 + (extraction.summary ? 10 : 0)), recommended_job_roles: extraction.skills.length ? ['Software Engineer', 'Full Stack Developer', 'Backend Developer'] : ['Entry-level Technology Associate'], recommended_learning_roadmap: extraction.ats_keywords_missing.slice(0, 8).map((skill) => `Learn and demonstrate ${skill}.`) };
}

function buildReport(extraction, ats, groupedSkills, improvements, readiness) {
  return `# Resume Analysis Report\n\n## ATS Score\n${ats.overall_score}/100\n\n## Summary\n${extraction.summary || 'No summary was detected.'}\n\n## Skills\n${Object.entries(groupedSkills).map(([key, values]) => `- **${key}:** ${values.join(', ') || 'None detected'}`).join('\n')}\n\n## Projects\n${extraction.projects.map((item) => `- ${typeof item === 'string' ? item : item.title || item.name || JSON.stringify(item)}`).join('\n') || '- None detected'}\n\n## Experience\n${extraction.experience.map((item) => `- ${typeof item === 'string' ? item : item.role || item.title || JSON.stringify(item)}`).join('\n') || '- None detected'}\n\n## Strengths\n${readiness.top_strengths.map((item) => `- ${item}`).join('\n')}\n\n## Weaknesses\n${readiness.top_weaknesses.map((item) => `- ${item}`).join('\n')}\n\n## Recommendations\n${improvements.improvements.concat(improvements.strong_bullet_rewrites).map((item) => `- ${item}`).join('\n')}\n\n## Missing Keywords\n${improvements.missing_keywords.map((item) => `- ${item}`).join('\n') || '- None detected'}\n\n## Suggested Next Steps\n${readiness.recommended_learning_roadmap.map((item) => `- ${item}`).join('\n') || '- Add measurable outcomes to your strongest resume bullets.'}`;
}

function countStructuredItems(extraction) {
  const listKeys = ['experience', 'education', 'projects', 'achievements', 'core_strengths', 'certifications'];
  return listKeys.reduce((total, key) => total + (Array.isArray(extraction[key]) ? extraction[key].length : 0), 0) + (extraction.skills?.length || 0);
}

export async function analyzeResumeVision(file, { cacheScope = '' } = {}) {
  const start = Date.now();
  const resumeHash = await getResumeContentHash(file);
  const cacheKey = `vision_analysis:${RESUME_PARSER_VERSION}:${cacheScope || resumeHash}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    logger.info({ resumeHash, cacheHit: true, scoreRecalculated: false, categories: cached.ats_score?.categories, atsScore: cached.ats_score?.overall_score }, 'resume ATS cache hit');
    return { ...cached, cached: true };
  }

  logger.info({ fileName: file.originalname, mimeType: file.mimetype, size: file.size }, 'vision upload started');
  const extractionDetails = await extractLocalResumeTextWithMetadata(file);
  // rawText: complete extracted/OCR text, never reduced. layoutText: reading-order text used for parsing.
  const layoutText = extractionDetails.text || '';
  const rawText = extractionDetails.rawText || layoutText;
  // Structured parse uses geometry-aware lines when available. It never throws; unmatched content is kept.
  const structured = parseStructuredResume(extractionDetails.layoutLines?.length ? extractionDetails.layoutLines : layoutText);

  let aiRaw = null;
  try {
    if (layoutText.trim().length >= 80) {
      aiRaw = (await aiProvider.generateJSON(buildResumeAnalysisPrompt({ resumeText: layoutText, targetRole: '' }), { temperature: 0, feature: 'resumeTextAnalysis', timeout: env.AI_TIMEOUT_MS, cacheScope })).data;
    } else {
      const prepared = await preprocessResumeFile(file);
      logger.warn({ fileName: file.originalname, method: extractionDetails.method, textLength: layoutText.length }, 'resume text extraction was insufficient; falling back to image Vision analysis');
      aiRaw = (await aiProvider.generateVisionJSON(buildVisionAnalysisPrompt(), prepared.parts, { temperature: 0, feature: 'visionResumeAnalysis', timeout: env.AI_TIMEOUT_MS, cacheScope })).data;
    }
  } catch (error) {
    logger.warn({ err: error?.stack || error?.message, fileName: file.originalname, method: extractionDetails.method, textLength: layoutText.length }, 'resume AI analysis unavailable; using deterministic structured extraction');
    aiRaw = null;
  }

  const aiParsed = aiRaw ? visionExtractionSchema.safeParse(aiRaw) : null;
  if (aiRaw && !aiParsed.success) {
    logger.warn({ fileName: file.originalname, reason: 'invalid AI schema', issues: aiParsed.error.issues.slice(0, 5).map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }, 'resume AI returned an unexpected shape; using deterministic extraction');
  }
  const aiExtraction = aiParsed?.success ? aiParsed.data : null;
  const deterministic = deterministicExtraction(structured, layoutText);
  const modelExtraction = aiExtraction || deterministic;

  // Projects come only from an explicit Projects section. Companies, ventures and products are never projects here.
  const hasProjectsSection = structured.section_names.includes('projects') || structured.custom_sections.some((section) => /project/i.test(section.name));
  const modelProjects = hasProjectsSection && aiExtraction ? aiExtraction.projects : [];

  const mergedExtraction = {
    ...modelExtraction,
    candidate_name: modelExtraction.candidate_name || structured.candidate_name,
    email: modelExtraction.email || structured.email,
    phone: modelExtraction.phone || structured.phone,
    linkedin: modelExtraction.linkedin || structured.linkedin,
    github: modelExtraction.github || structured.github,
    summary: modelExtraction.summary || structured.summary,
    skills: [...new Set([...(aiExtraction?.skills || []), ...deterministic.skills])],
    core_strengths: [...new Set([...(aiExtraction?.core_strengths || []), ...structured.core_strengths])],
    education: mergeNonEmptyArrays(structured.education, aiExtraction?.education),
    projects: mergeNonEmptyArrays(structured.projects, modelProjects),
    experience: mergeNonEmptyArrays(structured.experience, aiExtraction?.experience),
    achievements: mergeNonEmptyArrays(structured.achievements, aiExtraction?.achievements),
    awards: mergeNonEmptyArrays(structured.awards, aiExtraction?.awards),
    certifications: mergeNonEmptyArrays(structured.certifications, aiExtraction?.certifications),
    custom_sections: structured.custom_sections,
    section_names: [...new Set([...structured.section_names, ...(aiExtraction?.section_names || [])])],
    weaknesses: [...(modelExtraction.weaknesses || [])],
    raw_text: rawText,
  };
  if (structured.parse_quality.headings_found === 0 && layoutText.trim().length >= 80) {
    mergedExtraction.weaknesses = [...mergedExtraction.weaknesses, 'Section headings could not be identified; the full extracted text is preserved for review.'];
  }

  // Normalization operates on the already-parsed extraction; the text is not parsed a second time.
  const extraction = normalizeResumeExtraction(mergedExtraction, '');
  const ats = calculateATSScore({ extraction, raw_text: rawText, layout_text: layoutText });
  const groupedSkills = groupSkills(extraction.skills);
  const improvements = buildImprovements(extraction, ats);
  const readiness = buildReadiness(extraction, ats);
  const report = buildReport(extraction, ats, groupedSkills, improvements, readiness);

  const hasStructure = structured.parse_quality.headings_found > 0 || countStructuredItems(extraction) > 0;
  const extractionStatus = !rawText.trim() ? 'failed' : (hasStructure ? 'success' : 'partial');
  const extractionMessage = {
    success: 'Resume text was extracted and parsed into structured sections.',
    partial: 'Resume text was extracted, but its sections could not be identified. The full text is preserved.',
    failed: 'No readable resume text could be extracted.',
  }[extractionStatus];

  logger.info({
    textLength: rawText.length,
    layoutLineCount: structured.parse_quality.line_count,
    headingsFound: structured.parse_quality.headings_found,
    sectionNames: extraction.section_names,
    experienceCount: extraction.experience.length,
    educationCount: extraction.education.length,
    projectCount: extraction.projects.length,
    skillCount: extraction.skills.length,
    achievementCount: extraction.achievements.length,
    aiUsed: Boolean(aiExtraction),
  }, 'resume NLP diagnostics');

  const result = {
    parser_version: RESUME_PARSER_VERSION,
    extraction_status: extractionStatus,
    extraction_message: extractionMessage,
    raw_text: rawText,
    layout_text: layoutText,
    layout: {
      method: extractionDetails.method,
      columns: extractionDetails.layoutColumns ?? null,
      line_count: structured.parse_quality.line_count,
      headings_found: structured.parse_quality.headings_found,
      ocr_confidence: extractionDetails.ocrConfidence ?? null,
    },
    extraction: { ...extraction, raw_text: rawText, layout_text: layoutText },
    ats_score: ats,
    skill_categories: groupedSkills,
    improvements,
    strength_analyzer: readiness,
    report,
  };

  await cacheSet(cacheKey, result, env.CACHE_TTL_RESUME_ANALYSIS);
  logger.info({ durationMs: Date.now() - start, resumeHash, cacheHit: false, scoreRecalculated: true, categories: ats.categories, atsScore: ats.overall_score, extractionMethod: extractionDetails.method, textLength: rawText.length }, 'resume ATS analysis completed');
  return { ...result, resumeHash };
}

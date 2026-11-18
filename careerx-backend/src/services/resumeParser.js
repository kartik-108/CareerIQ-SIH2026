// Semantic resume parser.
//
// Operates on reading-ordered lines: { text, x0?, x1?, y0?, y1?, confidence? }.
// Coordinates are optional; plain text input is accepted and parsed with text-only cues.
//
// Design rules (all generic, no resume-specific content):
//   - A heading is a short line that matches a known section alias after OCR icon noise
//     is stripped. Substring matches are never headings, so body text cannot open a section.
//   - Experience entries are anchored on date ranges. The role is the title line directly above
//     the date line, the company comes from the same line or the line above the role, and
//     logo/brand labels (short all-caps or single-token lines) are ignored as noise.
//   - Education entries start at institutions; sub-units ("The Wharton School") attach to the entry.
//   - Continuation lines (wrapped bullets, wrapped award titles) are joined to the previous item.
//   - Nothing is discarded silently: unmatched content is kept in custom_sections.

const SECTION_ALIASES = {
  summary: ['summary', 'professional summary', 'executive summary', 'profile', 'professional profile', 'objective', 'career objective', 'about me', 'about'],
  experience: ['experience', 'professional experience', 'work experience', 'employment', 'employment history', 'career history', 'work history', 'internship', 'internships', 'relevant experience'],
  education: ['education', 'academic background', 'academic qualifications', 'education background', 'educational background'],
  projects: ['projects', 'personal projects', 'technical projects', 'academic projects', 'project work', 'selected projects'],
  skills: ['skills', 'technical skills', 'core skills', 'technologies', 'technical proficiencies', 'tools', 'tools and technologies', 'key skills', 'skill set', 'areas of expertise'],
  core_strengths: ['core strengths', 'strengths', 'key strengths', 'core competencies', 'competencies', 'core competences'],
  awards: ['awards', 'awards and honors', 'honors', 'honors and awards', 'awards honors', 'honours', 'awards and recognition', 'recognition'],
  achievements: ['achievements', 'selected achievements', 'accomplishments', 'key achievements', 'notable achievements'],
  certifications: ['certifications', 'certificates', 'licenses', 'licences', 'certifications and licenses', 'certification'],
  courses: ['courses', 'coursework', 'professional courses', 'training'],
  languages: ['languages', 'language skills'],
  contact: ['contact', 'contact information', 'contact details', 'personal details'],
};

// Keys are matched in two forms: words ("core strengths") and compact ("corestrengths"), because OCR often drops spaces.
const compactKey = (text) => String(text).replace(/\s+/g, '');
const ALIAS_TO_SECTION = new Map(Object.entries(SECTION_ALIASES).flatMap(([section, aliases]) => aliases.flatMap((alias) => [[alias, section], [compactKey(alias), section]])));
const COMPACT_KEYS = [...new Set(Object.values(SECTION_ALIASES).flat().map(compactKey))].filter((key) => key.length >= 7);

function levenshteinWithin(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length] <= limit;
}

const ROLE_KEYWORD = /\b(engineer|developer|intern|analyst|manager|designer|scientist|consultant|lead|architect|specialist|founder|co-?founder|ceo|cto|cfo|coo|president|director|chairman|chair|officer|head|partner|associate|assistant|coordinator)\b/i;
const LOCATION_PATTERN = /\b(remote|hybrid|[A-Z][a-zA-Z .'-]+,\s*[A-Z]{2,})\b/;
const BULLET_PREFIX = /^\s*[-•*+·◦▪►«»~]+\s*/;
const DATE_RANGE = /((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+)?(?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+)?(?:(?:19|20)\d{2}|present|current))\b/gi;
const METRIC_PATTERN = /(?:\b\d[\d,.]*\s*(?:%|k\b|m\b|b\b|million\b|billion\b|thousand\b|users?\b|requests?\b|customers?\b|vehicles?\b|patents?\b|ms\b|seconds?\b|hours?\b|days?\b)|\b\d+(?:\.\d+)?x\b|[$€£]\s?\d[\d,.]*(?:\s?(?:k|m|b|million|billion))?|\b\d[\d,.]*\+)/gi;

export function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// OCR glyph repairs that are safe in resume text ("Al" is almost always "AI").
function repairOcrGlyphs(text) {
  return text
    .replace(/\bxAl\b/g, 'xAI')
    .replace(/\bXAl\b/g, 'XAI')
    .replace(/\bAl\b/g, 'AI')
    .replace(/\b([A-Za-z]\.)in\b/g, '$1 in')
    .replace(/\s*\|\s*/g, ' | ');
}

function stripBullet(text) {
  return text.replace(BULLET_PREFIX, '').trim();
}

function isBullet(text) {
  return BULLET_PREFIX.test(text);
}

function wordsOf(text) {
  return cleanText(text).split(/\s+/).filter(Boolean);
}

// Leading OCR icon/glyph tokens before a heading, e.g. "Bl EXECUTIVE SUMMARY", "#8 PROFESSIONAL EXPERIENCE".
function stripHeadingNoise(text) {
  let value = cleanText(text);
  for (let pass = 0; pass < 3; pass += 1) {
    const match = value.match(/^(?:#\d*|[^\p{L}\p{N}\s]+|\p{L}{1,2}|\d{1,2})\s+(?=\S)/u);
    if (!match) break;
    const rest = value.slice(match[0].length);
    if (!/\p{L}/u.test(rest)) break;
    value = rest;
  }
  return value.replace(/[:#|]+$/g, '').trim();
}

function normalizeHeadingKey(text) {
  return cleanText(text).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns { section } for a known heading, or null.
// Tolerates OCR damage: leading glyph tokens, dropped spaces, and a single-character error in longer headings.
export function matchKnownHeading(text) {
  const cleaned = stripHeadingNoise(text);
  const words = wordsOf(cleaned);
  for (const drop of [0, 1, 2]) {
    if (words.length - drop < 1 || words.length - drop > 5) continue;
    if (drop > 0 && words.slice(0, drop).some((word) => word.length > 2)) break;
    const candidate = words.slice(drop).join(' ');
    const key = normalizeHeadingKey(candidate);
    if (!key) continue;
    const section = ALIAS_TO_SECTION.get(key) || ALIAS_TO_SECTION.get(compactKey(key));
    if (section) return { section, label: candidate };
    const compact = compactKey(key);
    if (compact.length >= 7) {
      const fuzzy = COMPACT_KEYS.find((alias) => levenshteinWithin(compact, alias, 1));
      if (fuzzy) return { section: ALIAS_TO_SECTION.get(fuzzy), label: candidate };
    }
  }
  return null;
}

function isAllCapsHeading(text) {
  const cleaned = stripHeadingNoise(text);
  const words = wordsOf(cleaned);
  return words.length >= 2 && words.length <= 4 && /^[A-Z][A-Z &/'-]*$/.test(cleaned) && !/\d/.test(cleaned);
}

function customHeadingName(text) {
  const cleaned = stripHeadingNoise(text).replace(/:$/, '').trim();
  if (!cleaned || cleaned.length > 60) return null;
  const words = wordsOf(cleaned);
  if (words.length > 4) return null;
  if (isAllCapsHeading(cleaned)) return cleaned;
  if (/:$/.test(cleanText(text)) && words.length <= 4 && /^[A-Za-z]/.test(cleaned)) return cleaned;
  return null;
}

// Logo / brand / icon labels that appear beside content in designed resumes.
export function isNoiseLine(text) {
  const value = cleanText(text);
  if (!value || value.length <= 1) return true;
  if (!/[\p{L}\p{N}]/u.test(value)) return true;
  if (/\d{4}/.test(value) || ROLE_KEYWORD.test(value)) return false;
  const words = wordsOf(value);
  if (words.length > 2 || value.length > 25) return false;
  if (!/[a-z]/.test(value)) return true;
  // Single token with interior capitals ("TEsLA", "xAI") is a brand label.
  return words.length === 1 && /^[A-Za-z][a-z]?[A-Z]/.test(value);
}

// Remove a leading logo label that OCR merged into a bullet line ("SPACEX    + Developed ...").
function stripMergedLogo(text) {
  return text
    .replace(/^[A-Z][A-Z0-9 .'&-]{1,25}?\s{2,}(?=[-•*+·◦▪►«»~])/, '')
    .replace(/^[A-Z]{3,}\s+(?=[+•*·◦▪►«»~])/, '')
    .replace(/^[^\s+•*·◦▪►«»~|]{1,8}\s+(?=\+\s)/, '')
    .replace(/^[®©]\s*/, '');
}

// Lines of text plus optional geometry, normalized and in reading order.
export function toStructuredLines(input) {
  if (Array.isArray(input)) {
    return input
      .map((line) => ({ ...line, raw: String(line.raw ?? line.text), text: repairOcrGlyphs(cleanText(line.text)) }))
      .filter((line) => line.text);
  }
  return String(input || '').split(/\r?\n/).map((raw) => ({ raw, text: repairOcrGlyphs(cleanText(raw)), x0: null })).filter((line) => line.text);
}

function dateMatches(text) {
  return [...String(text).matchAll(new RegExp(DATE_RANGE.source, 'gi'))];
}

function hasDateRange(text) {
  return dateMatches(text).length > 0;
}

function singleYearLine(text) {
  return /^(?:19|20)\d{2}(?:\s*(?:-|–|—|to)\s*(?:(?:19|20)\d{2}|present|current))?$/i.test(cleanText(text));
}

// Strip OCR leftovers from a company/role fragment: bullets, separators, symbol tokens,
// logo words that precede the real name, and repeated leading words.
const ROLE_ABBREVIATIONS = new Set(['CEO', 'CTO', 'CFO', 'COO', 'CIO', 'CMO', 'CPO', 'VP', 'SVP', 'EVP', 'PM', 'HR', 'IT', 'QA', 'PHD', 'MBA']);

function cleanRole(value) {
  let text = cleanEntryPart(value, { roleMode: true });
  const words = text.split(' ');
  if (words.length > 1 && /^[A-Z]{2,3}$/.test(words[0]) && !ROLE_ABBREVIATIONS.has(words[0]) && /^[A-Z][a-z]/.test(words[1])) text = words.slice(1).join(' ');
  return text;
}

function cleanEntryPart(value, { roleMode = false } = {}) {
  let text = cleanText(value).replace(/^[|+•\-–—·,;:]+\s*/, '').replace(/\s*[|•\-–—·,;:]+$/, '').replace(/\s+\+$/, '');
  for (let pass = 0; pass < 4; pass += 1) {
    const before = text;
    text = text.replace(/^(?:[^\p{L}\p{N}\s]+\s*)+/u, '').replace(/^[A-Za-z]{1,2}\s+(?=\p{Lu})/u, '');
    const words = text.split(' ');
    if (!roleMode && words.length > 1 && /^[A-Z]{2,}$/.test(words[0]) && /[a-z]/.test(words.slice(1).join(' '))) text = words.slice(1).join(' ');
    if (words.length > 1 && words[0].toLowerCase() === words[1].toLowerCase()) text = words.slice(1).join(' ');
    if (words.length > 2 && /^[a-z]+[A-Z]/.test(words[0])) text = words.slice(1).join(' ');
    if (text === before) break;
  }
  return text.trim();
}

function metricsIn(text) {
  return String(text).match(METRIC_PATTERN) || [];
}

// ---------- Experience ----------

function locationFrom(parts) {
  return parts.find((part) => LOCATION_PATTERN.test(part) && !ROLE_KEYWORD.test(part) && !hasDateRange(part)) || '';
}

// Split one date-bearing line into one or more (company, dates, role, location) records.
function experienceRecordsFromDateLine(text, pendingRole, pendingCompany) {
  const matches = dateMatches(text);
  const records = [];
  let cursor = 0;
  for (const match of matches) {
    const before = text.slice(cursor, match.index);
    const dates = match[0].replace(/\s+/g, ' ').trim();
    const parts = before.split(/\s*\|\s*/).map(cleanEntryPart).filter(Boolean);
    const role = parts.find((part) => ROLE_KEYWORD.test(part) && !hasDateRange(part)) || '';
    const location = locationFrom(parts);
    const company = parts.find((part) => part !== role && part !== location && !hasDateRange(part) && part.length > 1)
      || (records.length === 0 ? pendingCompany : records.at(-1).company)
      || '';
    records.push({ company: cleanEntryPart(company), role: cleanRole(role || (records.length ? records.at(-1).role : pendingRole) || ''), location, duration: dates, dates });
    cursor = match.index + match[0].length;
  }
  return records;
}

function parseExperience(lines) {
  const entries = [];
  let pendingRole = '';
  let candidateCompany = '';
  let lastBulletEntry = null;
  let lastWasBullet = false;
  const nextMeaningful = (index) => lines.slice(index + 1).find((line) => !isNoiseLine(line.text));

  lines.forEach((line, index) => {
    const raw = line.text;
    if (isNoiseLine(raw)) return;
    const text = stripMergedLogo(raw);

    if (hasDateRange(text) && !isBullet(text)) {
      const records = experienceRecordsFromDateLine(text.replace(/[|]+\s*$/, ''), pendingRole, candidateCompany);
      for (const record of records) {
        const entry = { company: record.company, role: record.role, location: record.location, duration: record.duration, dates: record.dates, highlights: [], metrics: [] };
        entries.push(entry);
        lastBulletEntry = entry;
      }
      pendingRole = '';
      candidateCompany = '';
      lastWasBullet = false;
      return;
    }

    if (isBullet(text)) {
      const body = stripBullet(text);
      if (!body) return;
      if (!lastBulletEntry || pendingRole || candidateCompany) {
        // A role or company named without dates opens its own entry.
        const entry = { company: candidateCompany, role: pendingRole, location: '', duration: '', dates: '', highlights: [], metrics: [] };
        entries.push(entry);
        lastBulletEntry = entry;
        pendingRole = '';
        candidateCompany = '';
      }
      lastBulletEntry.highlights.push(body);
      lastWasBullet = true;
      return;
    }

    const following = nextMeaningful(index);
    const followedByDate = Boolean(following && hasDateRange(stripMergedLogo(following.text)) && !isBullet(following.text));
    if (followedByDate) {
      if (!ROLE_KEYWORD.test(text) && pendingRole) {
        // Role on the line above, company on this line, dates below: the company belongs to the pending role.
        candidateCompany = text;
      } else {
        pendingRole = cleanRole(text);
      }
      lastWasBullet = false;
      return;
    }
    if (lastBulletEntry && !followedByDate && !ROLE_KEYWORD.test(text) && wordsOf(text).length >= 6 && !/^[A-Z]{2,}\b/.test(text)) {
      lastBulletEntry.highlights.push(text);
      lastWasBullet = true;
      return;
    }
    if (lastWasBullet && lastBulletEntry) {
      const continuationIndent = line.x0 != null && lastBulletEntry.highlights.length && line.x0 > (lastBulletEntry.indentX ?? line.x0) + 8;
      const looksContinued = /^[a-z(]/.test(text) || continuationIndent;
      if (looksContinued) {
        const highlights = lastBulletEntry.highlights;
        highlights[highlights.length - 1] = cleanText(`${highlights[highlights.length - 1]} ${text}`);
        return;
      }
    }
    if (ROLE_KEYWORD.test(text) && !hasDateRange(text)) {
      pendingRole = cleanRole(text);
      lastWasBullet = false;
      return;
    }
    candidateCompany = text;
    lastWasBullet = false;
  });

  return entries
    .map((entry) => ({ ...entry, highlights: entry.highlights.filter(Boolean), metrics: [...new Set(entry.highlights.flatMap(metricsIn))] }))
    .filter((entry) => entry.company || entry.role || entry.highlights.length);
}

// ---------- Education ----------

const DEGREE_PATTERN = /\b(?:B\.?\s?Tech|M\.?\s?Tech|B\.?\s?E\.?|M\.?\s?E\.?|B\.?\s?S\.?|M\.?\s?S\.?|B\.?\s?A\.?|M\.?\s?A\.?|BCA|MCA|Ph\.?\s?D\.?|Bachelor(?:'s)?|Master(?:'s)?|Associate(?:'s)?|Diploma|[A-Za-z.]+\s+in\s+[A-Za-z][\w &/-]+)/i;
const STRONG_INSTITUTION = /\b(?:university|college of|institute of|institute|academy|college)\b/i;
const WEAK_INSTITUTION = /\bschool\b/i;

function newEducation() {
  return { degree: '', institution: '', college: '', gpa: '', start_year: '', end_year: '', year: '', school: '', notes: '' };
}

function finishEducation(entry, out) {
  if (!entry || (!entry.institution && !entry.degree)) return;
  out.push({
    degree: cleanText(entry.degree),
    institution: cleanText(entry.institution),
    college: cleanText(entry.institution),
    gpa: entry.gpa || '',
    start_year: entry.start_year || '',
    end_year: entry.end_year || '',
    year: entry.year || '',
    ...(entry.school ? { school: cleanText(entry.school) } : {}),
    ...(entry.notes ? { notes: cleanText(entry.notes) } : {}),
  });
}

function parseEducation(lines) {
  const out = [];
  let entry = null;
  let complete = false;
  const inlineDegree = (text) => text.match(/^\s*(.+?)\s+(?:[—–-]|\|)\s+(.+?)(?:\s*\(([^)]*)\))?(?:\s*,?\s*(?:GPA|CGPA|CPI)\s*[:=-]?\s*([0-9.]+(?:\s*\/\s*[0-9.]+)?))?\s*$/i);

  for (const line of lines) {
    if (isNoiseLine(line.text)) continue;
    const text = stripBullet(line.text);
    if (!text) continue;
    const years = text.match(/\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current)\b/i);
    const singleYear = text.match(/\b((?:19|20)\d{2})\b/);
    const gpa = text.match(/\b(?:GPA|CGPA|CPI)\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?(?:\s*\/\s*[0-9]+(?:\.[0-9]+)?)?)/i)?.[1] || '';
    const degree = text.match(DEGREE_PATTERN);
    const inline = inlineDegree(text);

    if (inline && degree && (years || singleYear)) {
      const pipeParts = text.split(/\s*\|\s*/).map(cleanText).filter(Boolean);
      const institution = pipeParts.length >= 2 ? pipeParts[1].replace(/\s+(?:19|20)\d{2}\b.*$/i, '').trim() : inline[2].trim();
      finishEducation(entry, out);
      entry = { ...newEducation(), degree: inline[1].trim(), institution, year: years ? `${years[1]}-${years[2]}` : singleYear[1], start_year: years?.[1] || singleYear?.[1] || '', end_year: years?.[2] || singleYear?.[1] || '', gpa: gpa || inline[4] || '' };
      complete = true;
      continue;
    }

    if (singleYearLine(text)) {
      entry ||= newEducation();
      entry.year = years ? `${years[1]}-${years[2]}` : singleYear[1];
      entry.start_year = years?.[1] || singleYear?.[1] || '';
      entry.end_year = years?.[2] || singleYear?.[1] || '';
      complete = true;
      continue;
    }

    if (text.startsWith('(') || (entry?.notes && !entry.notes.endsWith(')'))) {
      if (entry) entry.notes = cleanText(`${entry.notes || ''} ${text}`);
      continue;
    }

    if (STRONG_INSTITUTION.test(text) && !DEGREE_PATTERN.test(text)) {
      if (!entry || complete) {
        finishEducation(entry, out);
        entry = { ...newEducation(), institution: text };
        complete = false;
      } else if (!entry.institution) {
        entry.institution = text;
      } else {
        entry.school = text;
      }
      continue;
    }

    if (WEAK_INSTITUTION.test(text) && !DEGREE_PATTERN.test(text)) {
      entry ||= newEducation();
      if (!entry.institution) entry.institution = text;
      else entry.school = text;
      continue;
    }

    if (degree) {
      if (!entry || complete) {
        finishEducation(entry, out);
        entry = newEducation();
        complete = false;
      }
      entry.degree = (entry.degree && /\bin$/i.test(entry.degree)) ? `${entry.degree} ${text}` : text;
      if (gpa) entry.gpa = gpa;
      continue;
    }

    if (entry && entry.degree && /\bin$/i.test(entry.degree)) {
      entry.degree = `${entry.degree} ${text}`;
      continue;
    }

    if (gpa && entry) entry.gpa = gpa;
  }
  finishEducation(entry, out);
  return out;
}

// ---------- Projects (explicit Projects section only) ----------

function parseProjects(lines) {
  const projects = [];
  const projectLines = lines.map((line) => line.text).filter((text) => !isNoiseLine(text));
  for (let index = 0; index < projectLines.length; index += 1) {
    const rawLine = projectLines[index].trim();
    if (/^[-*•]\s*/.test(rawLine) && projects.length) {
      const detail = rawLine.replace(/^[-*•]\s*/, '').trim();
      const currentProject = projects.at(-1);
      currentProject.description = cleanText([currentProject.description, detail].filter(Boolean).join(' '));
      currentProject.metrics.push(...metricsIn(detail));
      currentProject.github_url ||= detail.match(/https?:\/\/github\.com\/[^\s)]+/i)?.[0] || '';
      continue;
    }
    const line = rawLine.replace(/^[-*•]\s*/, '').trim();
    if (!line) continue;
    const separator = line.match(/^(.{3,100}?)\s*(?:\||\s[-–—:]\s)\s*(.{3,})$/);
    const title = (separator?.[1] || line).replace(/\s*\([^)]*\)\s*$/, '').trim();
    const explicitStack = line.match(/\b(?:tech(?:nologies)?|stack)\s*[:=-]\s*([^|]+)/i)?.[1] || line.match(/\(([^)]*)\)/)?.[1] || '';
    const techStack = explicitStack || (separator?.[2] && /\b(?:node|python|react|java|aws|sql|docker|kubernetes|postgres)/i.test(separator[2]) ? separator[2] : '');
    if (title && !projects.some((project) => project.title.toLowerCase() === title.toLowerCase())) {
      const nextLine = projectLines[index + 1];
      const description = nextLine && /^[-*•]/.test(nextLine) ? nextLine.replace(/^[-*•]\s*/, '') : techStack ? '' : separator?.[2] || '';
      const urls = `${line} ${description}`.match(/https?:\/\/github\.com\/[^\s)]+/i);
      projects.push({
        title,
        description: cleanText(description),
        technologies: techStack ? techStack.split(/\s*[,;|]\s*/).map(cleanText).filter(Boolean) : [],
        metrics: metricsIn(line),
        github_url: urls?.[0] || '',
      });
    }
  }
  return projects;
}

// ---------- Lists: skills, strengths, awards, achievements ----------

function splitSkillLine(text) {
  const body = stripBullet(text);
  const afterLabel = body.includes(':') && body.indexOf(':') < 40 ? body.slice(body.indexOf(':') + 1) : body;
  return afterLabel.split(/\s*[,;|]\s*/).map(cleanEntryPart).filter((item) => item && item.length <= 80 && isSkillFragment(item));
}

const isSkillFragment = (text) => /[\p{L}\p{N}]/u.test(text) && cleanText(text).length > 1;

function parseSkillList(lines) {
  return lines.flatMap((line) => (isSkillFragment(line.text) ? splitSkillLine(line.text) : []));
}

function inferUnheadedSkillLines(lines) {
  return lines.filter((line) => {
    const text = cleanText(line.text);
    const parts = text.split(/\s*\|\s*/).map(cleanText).filter(Boolean);
    return parts.length >= 3
      && !/\b(?:19|20)\d{2}\b/.test(text)
      && !parts.some((part) => ROLE_KEYWORD.test(part) && parts.length <= 4);
  });
}

function inferUnheadedEducationLines(lines) {
  return lines.filter((line) => {
    const text = cleanText(line.text);
    const firstPart = text.split(/\s*\|\s*/, 1)[0] || '';
    return /\|/.test(text)
      && !hasDateRange(text)
      && DEGREE_PATTERN.test(firstPart)
      && /\b(?:19|20)\d{2}\b/.test(text);
  });
}

// Items with continuation lines joined; indentation (x0) decides continuation when geometry exists.
function parseItemList(lines) {
  const items = [];
  const indents = lines.map((line) => line.x0).filter((value) => Number.isFinite(value));
  const baseX = indents.length ? Math.min(...indents) : null;
  let last = null;
  for (const line of lines) {
    if (isNoiseLine(line.text)) continue;
    const body = stripBullet(line.text);
    if (!body) continue;
    const indented = baseX != null && Number.isFinite(line.x0) && line.x0 > baseX + 8;
    const continuation = last !== null && (indented || (baseX == null && /^[a-z(]/.test(body)));
    if (continuation) {
      const dashLed = /^[-–—]\s*/.test(line.raw ?? line.text);
      const joiner = dashLed ? ' – ' : ' ';
      items[items.length - 1] = cleanText(`${items[items.length - 1]}${joiner}${body.replace(/^[-–—]\s*/, '')}`);
    } else {
      items.push(body.replace(/^[-–—]\s*/, ''));
    }
    last = items.length - 1;
  }
  return items.filter((item) => item.length > 1);
}

// Achievement fragments from designed footer bands: split on wide gutters between cells.
function splitCells(text) {
  return text.split(/\s{3,}/).map(cleanText).filter(Boolean);
}

// A real achievement is a sentence-like statement: at least four words, mostly letters, starting
// (case-insensitive: lowercased items are re-normalized). Dollar amounts, multipliers, years and OCR debris are not achievements.
export function isQualifiedAchievement(text) {
  const value = cleanText(text);
  if (wordsOf(value).length < 4) return false;
  const letters = (value.match(/\p{L}/gu) || []).length;
  const alnum = (value.match(/[\p{L}\p{N}]/gu) || []).length;
  if (alnum === 0 || letters / alnum < 0.7) return false;
  return /^[\p{L}\p{N}"'(]/u.test(value);
}

// Achievement cells in a multi-column band. Each cell is placed by its horizontal position, so a cell
// whose text wraps across several OCR lines is reassembled top to bottom. Without geometry, each
// wide-gutter cell is taken as-is.
function parseAchievementList(lines) {
  const pieces = [];
  for (const line of lines) {
    if (isNoiseLine(line.text)) continue;
    const raw = stripBullet(line.raw ?? line.text);
    const hasGeometry = Number.isFinite(line.x0) && Number.isFinite(line.x1) && raw.length > 0;
    let offset = 0;
    for (const match of raw.matchAll(/\S(?:.*?\S)?(?=\s{3,}|$)/g)) {
      const cell = cleanText(match[0]).replace(/^[^\p{L}\p{N}"'(]+\s*/u, '').replace(/^[-–—]\s*/, '').replace(/\s[^\p{L}\p{N}\s]{1,2}(?=\s|$)/gu, ' ').replace(/\s+/g, ' ').trim();
      // Fewer than three letters is OCR debris ("=", "$B", "mn"), never an achievement cell.
      if ((cell.match(/\p{L}/gu) || []).length < 3) continue;
      const start = raw.indexOf(match[0], offset);
      offset = start + match[0].length;
      const x = hasGeometry ? line.x0 + ((start + match[0].length / 2) / raw.length) * (line.x1 - line.x0) : null;
      pieces.push({ text: cell, x });
    }
  }
  if (!pieces.length) return [];

  const positioned = pieces.filter((piece) => piece.x != null);
  const span = positioned.length ? Math.max(...positioned.map((piece) => piece.x)) - Math.min(...positioned.map((piece) => piece.x)) : 0;
  const tolerance = Math.max(24, span * 0.06);
  const columns = [];
  for (const piece of pieces) {
    const column = piece.x == null ? null : columns.find((candidate) => candidate.x != null && Math.abs(candidate.x - piece.x) <= tolerance);
    if (column) {
      column.parts.push(piece.text);
      column.x = (column.x * (column.parts.length - 1) + piece.x) / column.parts.length;
    } else {
      columns.push({ x: piece.x, parts: [piece.text] });
    }
  }
  return columns
    .sort((left, right) => (left.x ?? 0) - (right.x ?? 0))
    .map((column) => cleanText(column.parts.join(' ')))
    .filter(isQualifiedAchievement);
}

// ---------- Header, contact, summary ----------

function extractContact(fullText) {
  const email = fullText.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || '';
  const phoneCandidate = [...fullText.matchAll(/(?:\+?\d[\d\s().-]{8,}\d)/g)].map((m) => m[0].trim()).find((value) => value.replace(/\D/g, '').length >= 10) || '';
  const phone = phoneCandidate;
  const linkedin = fullText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|]+/i)?.[0] || '';
  const github = fullText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|]+/i)?.[0] || '';
  return { email, phone, linkedin, github };
}

function candidateNameFrom(introLines) {
  for (const line of introLines.slice(0, 3)) {
    const text = cleanText(line.text);
    if (/\d|@|https?:/i.test(text)) continue;
    const words = wordsOf(text);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z][A-Za-z .'-]+$/.test(text)) {
      return words.map((word) => (word === word.toUpperCase() ? word.charAt(0) + word.slice(1).toLowerCase() : word)).join(' ');
    }
  }
  return '';
}

// ---------- Orchestration ----------

/**
 * Parse reading-ordered lines into structured resume sections.
 * Never throws for unrecognized layouts: unmatched content is preserved in custom_sections.
 */
export function parseStructuredResume(input) {
  const lines = toStructuredLines(input);
  const fullText = lines.map((line) => line.text).join('\n');
  const sectionLines = new Map();
  const customSections = new Map();
  const introLines = [];
  const sectionNames = [];
  let active = null;
  let headingsFound = 0;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const next = lines[index + 1];
    let known = matchKnownHeading(line.text);
    let consumed = 1;
    if (!known && next && wordsOf(stripHeadingNoise(line.text)).length <= 2) {
      const joined = matchKnownHeading(`${stripHeadingNoise(line.text)} ${stripHeadingNoise(next.text)}`);
      if (joined) {
        known = joined;
        consumed = 2;
      }
    }
    if (known) {
      active = { type: 'known', key: known.section };
      headingsFound += 1;
      if (!sectionNames.includes(known.section)) sectionNames.push(known.section);
      if (!sectionLines.has(known.section)) sectionLines.set(known.section, []);
      index += consumed;
      continue;
    }

    const custom = headingsFound > 0 ? customHeadingName(line.text) : null;
    if (custom && next && !isNoiseLine(next.text)) {
      const key = `custom:${normalizeHeadingKey(custom).replace(/\s+/g, '-')}`;
      active = { type: 'custom', key };
      headingsFound += 1;
      if (!sectionNames.includes(custom)) sectionNames.push(custom);
      if (!customSections.has(key)) customSections.set(key, { name: custom, lines: [] });
      index += 1;
      continue;
    }

    if (!active) {
      introLines.push(line);
    } else if (active.type === 'known') {
      sectionLines.get(active.key).push(line);
    } else {
      customSections.get(active.key).lines.push(line);
    }
    index += 1;
  }

  const contact = extractContact(fullText);
  const introSummary = introLines.filter((line) => line.text.length >= 40 && !/@|https?:/i.test(line.text) && !/^[A-Z\s+•·&|/-]+$/.test(line.text)).map((line) => line.text);
  const summarySection = (sectionLines.get('summary') || []).map((line) => line.text);
  const summary = cleanText([...introSummary, ...summarySection].join(' ')).slice(0, 600);

  const experience = parseExperience(sectionLines.get('experience') || []);
  const unheadedEducationLines = inferUnheadedEducationLines(lines);
  const education = parseEducation(sectionLines.get('education')?.length ? sectionLines.get('education') : unheadedEducationLines);
  const projects = parseProjects(sectionLines.get('projects') || []);
  const unheadedSkillLines = inferUnheadedSkillLines(lines);
  const skills = [...new Set(parseSkillList(sectionLines.get('skills')?.length ? sectionLines.get('skills') : unheadedSkillLines))];
  const coreStrengths = [...new Set(parseSkillList(sectionLines.get('core_strengths') || []))];
  // Awards & Honors and Selected Achievements are separate categories; an award is never counted as an achievement.
  const awards = parseItemList(sectionLines.get('awards') || []).filter((item) => wordsOf(item).length >= 2);
  const achievementLines = sectionLines.get('achievements') || [];
  const confidentAchievementLines = achievementLines.filter((line) => !Number.isFinite(line.confidence) || line.confidence >= 50);
  const lowConfidenceAchievementLines = achievementLines.filter((line) => Number.isFinite(line.confidence) && line.confidence < 50);
  const achievements = [...new Set(parseAchievementList(confidentAchievementLines))];
  const achievementsLowConfidence = [...new Set(parseAchievementList(lowConfidenceAchievementLines))].filter((item) => !achievements.includes(item));
  const certifications = parseItemList(sectionLines.get('certifications') || []);
  const contactLines = (sectionLines.get('contact') || []).map((line) => line.text);

  const customOut = [...customSections.values()]
    .map((section) => ({ name: section.name, text: section.lines.map((line) => line.text).join('\n').trim() }))
    .filter((section) => section.text);

  const unmatchedIntro = introLines.map((line) => line.text).join('\n').trim();
  if (headingsFound === 0 && unmatchedIntro) {
    customOut.push({ name: 'Unstructured text', text: unmatchedIntro });
  }

  const inferredSections = [];
  if (!sectionLines.get('skills')?.length && unheadedSkillLines.length) inferredSections.push('skills');
  if (!sectionLines.get('education')?.length && unheadedEducationLines.length) inferredSections.push('education');

  return {
    candidate_name: candidateNameFrom(introLines),
    ...contact,
    summary,
    contact_lines: contactLines,
    experience,
    education,
    projects,
    skills,
    core_strengths: coreStrengths,
    awards,
    achievements,
    awards,
    achievements_low_confidence: achievementsLowConfidence,
    certifications,
    section_names: [...new Set([...sectionNames, ...inferredSections])],
    custom_sections: customOut,
    parse_quality: {
      line_count: lines.length,
      headings_found: headingsFound,
      sections_with_content: sectionNames.filter((name) => (sectionLines.get(name) || []).length > 0).length,
      intro_line_count: introLines.length,
    },
  };
}

/**
 * Backward-compatible shape used by the ATS pipeline and existing callers.
 */
export function parseResumeText(text) {
  const parsed = parseStructuredResume(text);
  return {
    education: parsed.education,
    projects: parsed.projects,
    experience: parsed.experience,
    achievements: parsed.achievements,
    awards: parsed.awards,
    skillNames: parsed.skills,
    core_strengths: parsed.core_strengths,
    custom_sections: parsed.custom_sections,
    section_names: parsed.section_names,
    summary: parsed.summary,
    parse_quality: parsed.parse_quality,
  };
}

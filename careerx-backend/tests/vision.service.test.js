import { jest } from '@jest/globals';
import { PDFDocument, StandardFonts } from 'pdf-lib';

jest.unstable_mockModule('../src/services/ai/provider.js', () => ({ generateJSON: jest.fn(), generateVisionJSON: jest.fn() }));
jest.unstable_mockModule('../src/config/redis.js', () => ({ cacheGet: jest.fn().mockResolvedValue(null), cacheSet: jest.fn().mockResolvedValue(undefined) }));
jest.unstable_mockModule('../src/utils/ocr.js', () => ({ extractTextWithOcr: jest.fn() }));

const { generateJSON, generateVisionJSON } = await import('../src/services/ai/provider.js');
const { cacheGet } = await import('../src/config/redis.js');
const { extractTextWithOcr } = await import('../src/utils/ocr.js');
const { calculateATSScore, analyzeResumeVision, getResumeContentHash, normalizeResumeExtraction, parseResumeText } = await import('../src/services/resumeVision.service.js');
const { parseStructuredResume } = await import('../src/services/resumeParser.js');
const { preprocessResumeFile } = await import('../src/utils/imagePreprocess.js');
const { visionIdSchema } = await import('../src/validators/vision.validator.js');

const extraction = { candidate_name: 'Test User', email: 'test@example.com', phone: '123', linkedin: 'https://linkedin.com/in/test', github: 'https://github.com/test', portfolio: '', education: [{ degree: 'B.Tech' }], skills: ['React', 'Node.js', 'Docker'], projects: [{ title: 'App' }], experience: [{ role: 'Engineer' }], certifications: [], achievements: [], soft_skills: ['Communication'], ats_keywords_found: ['React'], ats_keywords_missing: ['Kubernetes'], strengths: ['Strong projects'], weaknesses: [], improvements: [], summary: 'Engineer.' };

describe('resume vision service', () => {
  it('extracts skills and education from a one-column resume without explicit OCR headings', () => {
    const parsed = parseStructuredResume([
      { text: 'An experienced closing manager with a proven track record.' },
      { text: 'Strategic Planning | Regulatory Compliance | RESPA | TRID | Financial Acumen | Risk Management | Quality Assurance | Technology Integration | Customer Relationship Management (CRM) | Supervision | Leadership' },
      { text: 'EMPLOYMENT HISTORY' },
      { text: 'Closing Manager | ABC Corporation, Gurgaon Sep 2022 - Present' },
      { text: 'MBA in Finance | FORE School of Management, New Delhi 2018' },
      { text: 'BBA in Finance | Jawaharlal Nehru University, Delhi 2016' },
      { text: 'LANGUAGES' },
      { text: 'English | Hindi' },
    ]);

    expect(parsed.skills).toEqual(expect.arrayContaining(['Strategic Planning', 'RESPA', 'Leadership']));
    expect(parsed.education).toHaveLength(2);
    expect(parsed.education.map((entry) => entry.institution)).toEqual([
      'FORE School of Management, New Delhi',
      'Jawaharlal Nehru University, Delhi',
    ]);
    expect(parsed.experience).toHaveLength(1);
    expect(parsed.projects).toHaveLength(0);
  });

  it('calculates deterministic ATS categories and score', () => {
    const score = calculateATSScore(extraction);
    // Keywords now count distinct ATS terms detected in the resume against a fixed reference of 12
    // (3 detected terms -> 25). The previous found/(found+missing) rule returned 75 for the same input,
    // because the missing list was empty; that was not a measure of resume content.
    expect(score.categories).toEqual({ experience: 20, projects: 47, skills: 30, keywords: 25, education: 60, achievements: 0, formatting: 80, completeness: 80 });
    expect(score.overall_score).toBe(35);
    expect(score.weights).toEqual({ experience: 0.22, projects: 0.18, skills: 0.2, keywords: 0.15, education: 0.08, achievements: 0.07, formatting: 0.05, completeness: 0.05 });
  });

  it('does not use an LLM-generated score', () => {
    const first = calculateATSScore(extraction);
    const second = calculateATSScore(structuredClone(extraction));
    expect(second).toEqual(first);
  });

  it('normalizes duplicate and differently-cased extracted values', () => {
    const normalized = normalizeResumeExtraction({ ...extraction, skills: [' React ', 'react', 'Node.js', 'Docker'], keywords: ['SQL', ' sql '] });
    expect(normalized.skills).toEqual(['docker', 'Node.js', 'react']);
    expect(normalized.keywords).toEqual(['sql']);
  });

  it('canonicalizes aliases and removes present skills from missing keywords', () => {
    const normalized = normalizeResumeExtraction({
      skills: ['NodeJS', 'REST API', 'OpenSearch'],
      ats_keywords_missing: ['Node.js', 'REST APIs', 'Elasticsearch', 'Python'],
    }, 'Built services with NodeJS, REST API, and OpenSearch.');
    expect(normalized.skills).toEqual(['Elasticsearch', 'Node.js', 'REST APIs']);
    expect(normalized.ats_keywords_missing).toEqual(['python']);
  });

  it('extracts education, three company blocks, project metadata, and metrics from text', () => {
    const parsed = parseResumeText(`Education
B.Tech Artificial Intelligence — Example College (2020–2024), GPA: 3.8
Professional Experience
Google | Software Engineer | Mountain View, CA | Jun 2022 - Present
- Improved API latency by 40%.
Microsoft
Software Engineer
Jan 2020 - May 2022
- Built services for 10k users.
Acme
Backend Developer
2018 - 2019
- Reduced processing time by 25%.
Projects
Realtime API | Node.js, PostgreSQL
- Served 10k requests per day. https://github.com/example/realtime-api
Analytics Platform | Python, AWS
- Processed 2M records.
Notification Service | Node.js, Redis
- Delivered alerts 30% faster.
`);

    expect(parsed.education[0]).toMatchObject({ degree: 'B.Tech Artificial Intelligence', institution: 'Example College', gpa: '3.8', start_year: '2020', end_year: '2024' });
    expect(parsed.experience).toHaveLength(3);
    expect(parsed.experience[0]).toMatchObject({ company: 'Google', role: 'Software Engineer', location: 'Mountain View, CA', duration: 'Jun 2022 - Present' });
    expect(parsed.experience[0].metrics).toContain('40%');
    expect(parsed.projects).toHaveLength(3);
    expect(parsed.projects[0]).toMatchObject({ title: 'Realtime API', github_url: 'https://github.com/example/realtime-api' });
    expect(parsed.projects[0].technologies).toEqual(['Node.js', 'PostgreSQL']);
    expect(parsed.projects[0].metrics).toContain('10k');
  });

  it('preserves OCR-detected experience and education when AI extraction is empty', () => {
    const text = `PROFESSIONAL EXPERIENCE
Founder & CEO
SpaceX | 2002 - Present
- Built reusable rockets and launched 100+ missions.

EDUCATION
University of Pennsylvania
B.S. in Physics
1997

TECHNICAL SKILLS
Python, C++, JavaScript, AI/ML

AWARDS & HONORS
100+ patents
`;

    const normalized = normalizeResumeExtraction({ experience: [], education: [], skills: [], keywords: [], achievements: [], section_names: [] }, text);

    expect(normalized.experience.length).toBeGreaterThan(0);
    expect(normalized.education.length).toBeGreaterThan(0);
    expect(normalized.skills.length).toBeGreaterThan(0);
    // "100+ patents" under Awards & Honors is an award, not a selected achievement. Awards are kept separately.
    expect(normalized.awards.length).toBeGreaterThan(0);
    expect(normalized.achievements).toEqual([]);
  });

  it('extracts 20 or more recognized skills from a technical skills section', () => {
    const skillsText = 'JavaScript TypeScript Python Java C++ C# Go Rust PHP Ruby React Next.js Angular Vue.js HTML CSS Tailwind CSS Bootstrap Node.js Express.js REST APIs GraphQL Spring Boot Django FastAPI SQL PostgreSQL MongoDB Redis AWS Azure GCP Docker Kubernetes Terraform Git Linux';
    const normalized = normalizeResumeExtraction({ skills: [] }, skillsText);
    expect(normalized.skills.length).toBeGreaterThanOrEqual(20);
    expect(normalized.skills).toContain('Node.js');
    expect(normalized.skills).toContain('REST APIs');
  });

  it('canonicalizes equivalent technical terms', () => {
    const normalized = normalizeResumeExtraction({
      skills: ['AI / Machine Learning', 'EV Powertrains', 'Software & Controls', 'Product Engineering', 'Robotics & Automation'],
    });
    expect(normalized.skills).toEqual(['electric_vehicles', 'machine_learning', 'product_design', 'robotics', 'software_engineering']);
  });

  it('scores quantified leadership and company-built projects above 90', () => {
    const elonStyleResume = {
      email: 'leader@example.com', phone: '+1 555 0100', linkedin: 'linkedin.com/in/leader',
      skills: ['Python', 'C++', 'JavaScript', 'AI / Machine Learning', 'EV Powertrains', 'Software & Controls', 'Product Engineering', 'Robotics & Automation', 'distributed systems', 'cloud', 'embedded systems', 'battery technology', 'aerospace', 'manufacturing', 'autonomous systems', 'computer vision'],
      experience: [
        { role: 'Founder and CEO', company: 'Company One', highlights: ['$250B+ valuation and 100M+ users'] },
        { role: 'Founder and CTO', company: 'Company Two', highlights: ['Built infrastructure for 1M vehicles'] },
        { role: 'Principal Engineer', company: 'Company Three', highlights: ['Shipped products used by 5000+ customers'] },
        { role: 'Research Scientist', company: 'Company Four', highlights: ['Published 20 papers and filed 12 patents'] },
      ],
      education: [{ degree: 'Physics' }, { degree: 'Economics' }],
      projects: [{ title: 'Electric vehicle platform' }, { title: 'Reusable launch infrastructure' }, { title: 'Autonomous product' }, { title: 'AI platform' }],
      achievements: ['$250B+ valuation', '100M+ users', '1M vehicles', '12 patents'],
      keywords: ['founder', 'product', 'platform', 'infrastructure'],
    };
    const score = calculateATSScore(elonStyleResume);
    expect(score.overall_score).toBeGreaterThan(65);
    // Fragments such as "$250B+ valuation" or "12 patents" are not achievement statements and must not score.
    expect(score.categories.achievements).toBe(0);
    expect(score.categories.projects).toBeGreaterThan(70);
    const withStatements = calculateATSScore({ ...elonStyleResume, achievements: ['Launched a reusable rocket that reached orbit.', 'Built a battery platform for one million vehicles.', 'Shipped infrastructure used by five thousand customers.', 'Led a team that delivered a grid storage product.'] });
    // Four qualified statements: the count component is capped at 60 by the existing formula.
    expect(withStatements.categories.achievements).toBe(60);
  });

  it('generates the same hash for whitespace-only content changes', async () => {
    const first = await getResumeContentHash({ buffer: Buffer.from('Resume  content\n'), mimetype: 'text/plain' });
    const second = await getResumeContentHash({ buffer: Buffer.from('  resume content  '), mimetype: 'text/plain' });
    const changed = await getResumeContentHash({ buffer: Buffer.from('different resume'), mimetype: 'text/plain' });
    expect(second).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('parses mocked local AI JSON and builds a report', async () => {
    generateVisionJSON.mockResolvedValue({ data: extraction });
    const result = await analyzeResumeVision({ buffer: Buffer.from('resume'), mimetype: 'application/pdf', originalname: 'resume.pdf', size: 6 });
    expect(result.extraction.candidate_name).toBe('Test User');
    expect(result.report).toContain('# Resume Analysis Report');
    expect(generateVisionJSON).toHaveBeenCalled();
    expect(generateVisionJSON.mock.calls.at(-1)[2]).toEqual(expect.objectContaining({ temperature: 0 }));
  });

  it('uses extracted PDF text for structured resume analysis when available', async () => {
    const document = await PDFDocument.create();
    const page = document.addPage();
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText('Google | Software Engineer | Mountain View, CA | Jun 2022 - Present. Built backend services and improved API latency by 40%.', { x: 40, y: 740, size: 12, font });
    const buffer = Buffer.from(await document.save());
    generateJSON.mockResolvedValueOnce({ data: extraction });
    const visionCallCount = generateVisionJSON.mock.calls.length;

    await analyzeResumeVision({ buffer, mimetype: 'application/pdf', originalname: 'google-resume.pdf', size: buffer.length });

    expect(generateJSON).toHaveBeenCalledWith(expect.stringContaining('Google'), expect.objectContaining({ feature: 'resumeTextAnalysis' }));
    expect(generateVisionJSON).toHaveBeenCalledTimes(visionCallCount);
  });

  it('preprocesses a raster image before Vision analysis', async () => {
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const prepared = await preprocessResumeFile({ buffer: tinyPng, mimetype: 'image/png' });
    expect(prepared.mimeType).toBe('image/jpeg');
    expect(prepared.parts[0].inlineData.mimeType).toBe('image/jpeg');
  });

  it('falls back to OCR for readable image resumes when AI analysis times out', async () => {
    extractTextWithOcr.mockResolvedValue({
      text: 'Professional Experience\nSenior Software Engineer at Acme\n- Built API platform serving 50k users.\nEducation\nB.Tech Computer Science\nSkills\nPython, React, Node.js',
      method: 'ocr',
      textLength: 200,
      confidence: 0.9,
      metadata: { engine: 'tesseract', language: 'eng' },
    });
    generateJSON.mockRejectedValueOnce(new Error('timed out'));
    generateVisionJSON.mockRejectedValueOnce(new Error('timed out'));

    const result = await analyzeResumeVision({ buffer: Buffer.from('fake-image'), mimetype: 'image/png', originalname: 'resume.png', size: 12 });

    expect(extractTextWithOcr).toHaveBeenCalled();
    expect(result.extraction.experience.length).toBeGreaterThan(0);
    expect(result.extraction.skills.some((skill) => String(skill).toLowerCase() === 'react')).toBe(true);
    expect(result.extraction.education.length).toBeGreaterThan(0);
    expect(result.ats_score.overall_score).toBeGreaterThan(0);
  });

  it('returns an identical-resume cache hit without calling local AI', async () => {
    cacheGet.mockResolvedValueOnce({ cachedResult: true });
    generateVisionJSON.mockClear();
    const result = await analyzeResumeVision({ buffer: Buffer.from('same-resume'), mimetype: 'application/pdf', originalname: 'resume.pdf', size: 11 });
    expect(result).toEqual({ cachedResult: true, cached: true });
    expect(generateVisionJSON).not.toHaveBeenCalled();
  });

  it('rejects invalid history ids', () => {
    expect(visionIdSchema.safeParse({ params: { id: 'bad-id' } }).success).toBe(false);
  });
});
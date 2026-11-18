// resume-studio.js — page-specific logic for pages/resume-studio.html
import { api } from './api/client.js';
import { renderRing } from './charts.js';
import { toast } from './toast.js';

let currentAnalysisId = null;
let currentResumeId = null;
let processingTimer = null;
let uploadRequestId = 0;
let currentFile = null;
let lastJobMatch = null;

const PROCESSING_STAGES = [
  'Uploading resume...',
  'Extracting resume text...',
  'Calculating ATS score...',
  'Generating AI insights...',
  'Preparing report...',
];

function chip(text, kind) {
  return `<span class="skill-chip ${kind}">${escapeHtml(text)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function safeGithubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'github.com' ? url.href : '';
  } catch { return ''; }
}

/* ---------- Upload region state machine ---------- */

function showDropzone() {
  clearInterval(processingTimer);
  document.getElementById('processing-progress-fill').style.width = '0%';
  document.getElementById('dropzone').hidden = false;
  document.getElementById('upload-processing').hidden = true;
  document.getElementById('resume-active').hidden = true;
}

function showProcessing() {
  clearInterval(processingTimer);
  document.getElementById('dropzone').hidden = true;
  document.getElementById('resume-active').hidden = true;

  const panel = document.getElementById('upload-processing');
  const stageText = document.getElementById('processing-stage-text');
  const fill = document.getElementById('processing-progress-fill');
  panel.hidden = false;
  fill.style.width = '0%';

  let stageIndex = 0;
  stageText.textContent = PROCESSING_STAGES[0];
  requestAnimationFrame(() => { fill.style.width = '18%'; });

  processingTimer = setInterval(() => {
    stageIndex = Math.min(stageIndex + 1, PROCESSING_STAGES.length - 1);
    stageText.style.opacity = '0';
    setTimeout(() => {
      stageText.textContent = PROCESSING_STAGES[stageIndex];
      stageText.style.opacity = '1';
    }, 150);
    const pct = Math.min(90, 18 + stageIndex * 18);
    fill.style.width = `${pct}%`;
    if (stageIndex === PROCESSING_STAGES.length - 1) clearInterval(processingTimer);
  }, 1100);
}

function clearAnalysisState() {
  currentAnalysisId = null;
  currentResumeId = null;
  lastJobMatch = null;
  document.getElementById('resume-content').style.display = 'none';
  document.getElementById('ats-score-breakdown').innerHTML = '';
  document.getElementById('skills-found').innerHTML = '';
  document.getElementById('skills-missing').innerHTML = '';
  document.getElementById('keyword-suggestions').innerHTML = '';
  document.getElementById('keyword-missing').innerHTML = '';
  document.getElementById('job-match-status').textContent = '';
  document.getElementById('download-job-match-btn').disabled = true;
  document.getElementById('job-match-result').innerHTML = '';
  document.getElementById('download-report-btn').disabled = true;
}

function showResumeActive({ fileName, uploadedOn, score }) {
  clearInterval(processingTimer);
  const fill = document.getElementById('processing-progress-fill');
  fill.style.width = '0%';
  document.getElementById('upload-processing').hidden = true;
  document.getElementById('dropzone').hidden = true;
  document.getElementById('active-resume-name').textContent = fileName || 'Resume';
  document.getElementById('active-resume-meta').textContent = uploadedOn ? `Uploaded ${uploadedOn}` : '';
  document.getElementById('active-resume-score').textContent = `ATS ${score ?? 0}%`;
  const activeCard = document.getElementById('resume-active');
  activeCard.hidden = false;
  if (window.lucide) window.lucide.createIcons();

  const resumeContent = document.getElementById('resume-content');
  resumeContent.style.display = 'block';
  resumeContent.classList.add('fade-in');
}

/* ---------- Rendering ---------- */

function renderResume(data) {
  const r = data.currentResume;
  document.getElementById('resume-filename').textContent = r.fileName;
  document.getElementById('resume-uploaded-on').textContent = `Uploaded ${r.uploadedOn}`;
  document.getElementById('grammar-score').textContent = r.grammarUnavailable ? 'Unavailable' : (r.grammarScore == null ? 'Not analyzed' : `${r.grammarScore}%`);
  document.getElementById('overall-score').textContent = `${r.overallScore}%`;
  document.getElementById('ats-percentile').textContent = `${r.atsScore}%`;

  renderRing(document.getElementById('ats-ring'), { value: r.atsScore, caption: 'ATS Score', label: `${r.atsScore}` });
  const scoreLabels = { experience: 'Experience', projects: 'Projects', skills: 'Skills', keywords: 'Keywords', education: 'Education', achievements: 'Achievements', formatting: 'Formatting' };
  document.getElementById('ats-score-breakdown').innerHTML = Object.entries(data.scoreBreakdown || {}).map(([key, value]) => {
    const score = Math.max(0, Math.min(100, Number(value) || 0));
    const weight = Number(data.scoreWeights?.[key] || 0);
    return `<div style="display:grid; grid-template-columns:minmax(90px,1fr) 2fr auto; gap:var(--space-3); align-items:center; margin-top:var(--space-3); font-size:var(--text-xs);"><span>${scoreLabels[key] || escapeHtml(key)}</span><div class="progress-track"><div class="progress-fill" style="width:${score}%;"></div></div><strong>${score}% <span class="text-tertiary">(${Math.round(score * weight)} pts)</span></strong></div>`;
  }).join('') || '<span class="text-tertiary">Score details unavailable.</span>';

  document.getElementById('skills-found').innerHTML = data.skillsFound.map((s) => chip(s, 'have')).join('');
  document.getElementById('skills-missing').innerHTML = data.missingSkills.map((s) => chip(s, 'missing')).join('');
  document.getElementById('keyword-suggestions').innerHTML = data.keywordSuggestions.map((s) => `<span class="badge badge-blue">${escapeHtml(s)}</span>`).join('');
  document.getElementById('keyword-missing').innerHTML = data.missingKeywords.map((s) => `<span class="badge badge-rose">${escapeHtml(s)}</span>`).join('');

  document.getElementById('education-list').innerHTML = data.education
    .map((e) => {
      const years = e.year || [e.start_year, e.end_year].filter(Boolean).join(' - ');
      const institution = e.institution || e.college || '';
      return `<div style="margin-bottom: var(--space-4);"><div style="font-weight:600; font-size: var(--text-sm);">${escapeHtml(e.degree || 'Education')}</div><div class="text-secondary" style="font-size: var(--text-xs);">${escapeHtml(institution)}</div><div class="text-tertiary" style="font-size: var(--text-xs);">${escapeHtml(years)}${e.gpa ? ` · GPA ${escapeHtml(e.gpa)}` : ''}</div></div>`;
    })
    .join('');

  document.getElementById('projects-list').innerHTML = data.projects
    .map(
      (p) => `<div style="margin-bottom: var(--space-4);">
        <div style="font-weight:600; font-size: var(--text-sm);">${escapeHtml(p.title)}</div>
        <p style="font-size: var(--text-xs); margin-bottom: var(--space-2);">${escapeHtml(p.description)}</p>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">${p.technologies.map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join('')}</div>
        ${(p.metrics || []).length ? `<ul style="padding-left:var(--space-4); font-size:var(--text-xs); margin-top:var(--space-2);">${p.metrics.map((metric) => `<li>${escapeHtml(metric)}</li>`).join('')}</ul>` : ''}
        ${safeGithubUrl(p.github_url) ? `<a href="${escapeHtml(safeGithubUrl(p.github_url))}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:var(--space-2); font-size:var(--text-xs);">GitHub repository</a>` : ''}
      </div>`
    )
    .join('');

  document.getElementById('experience-list').innerHTML = data.experience
    .map(
      (e) => `<div style="margin-bottom: var(--space-4);">
        <div style="font-weight:600; font-size: var(--text-sm);">${escapeHtml(e.role)}${e.company ? ` · ${escapeHtml(e.company)}` : ''}</div>
        <div class="text-tertiary" style="font-size: var(--text-xs); margin-bottom: var(--space-2);">${escapeHtml([e.location, e.duration || e.dates].filter(Boolean).join(' · '))}</div>
        <ul style="padding-left: var(--space-4); font-size: var(--text-xs); color: var(--text-secondary); display:flex; flex-direction:column; gap:4px;">
          ${e.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}
        </ul>
        ${(e.metrics || []).length ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:var(--space-2);">${e.metrics.map((metric) => `<span class="badge badge-blue">${escapeHtml(metric)}</span>`).join('')}</div>` : ''}
      </div>`
    )
    .join('') || '<p style="font-size:var(--text-sm);">No experience listed yet — projects and internships count too.</p>';

  document.getElementById('achievements-list').innerHTML = data.achievements.map((item) => `<li style="font-size:var(--text-xs); color:var(--text-secondary);">${escapeHtml(typeof item === 'string' ? item : item.title || item.description || JSON.stringify(item))}</li>`).join('') || '<li class="text-tertiary" style="font-size:var(--text-sm);">No achievements detected.</li>';

  const priorityColor = { high: 'rose', medium: 'amber', low: 'blue' };
  document.getElementById('suggestions-grid').innerHTML = data.aiSuggestions
    .map(
      (s) => `<div class="card" style="background: var(--surface-input);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: var(--space-2);">
          <h5 style="font-size: var(--text-sm);">${escapeHtml(s.title)}</h5>
          <span class="badge badge-${priorityColor[s.priority] || 'blue'}">${escapeHtml(s.priority)}</span>
        </div>
        <p style="font-size: var(--text-xs);">${escapeHtml(s.detail)}</p>
      </div>`
    )
    .join('');

  document.getElementById('improvement-timeline').innerHTML = data.improvementTimeline.length ? data.improvementTimeline
    .map(
      (item, i) => `<li style="display:flex; gap: var(--space-4);">
        <div style="display:flex; flex-direction:column; align-items:center;">
          <span style="width:10px;height:10px;border-radius:50%;background:${i === 0 ? 'var(--emerald)' : 'var(--border-strong)'};"></span>
          ${i < data.improvementTimeline.length - 1 ? '<span style="width:1px;flex:1;background:var(--border-subtle);margin-top:4px;"></span>' : ''}
        </div>
        <div style="padding-bottom: var(--space-4);">
          <div style="font-size: var(--text-sm); font-weight:500;">${escapeHtml(item.milestone)}</div>
          <div class="text-tertiary" style="font-size: var(--text-xs);">${escapeHtml(item.date)}</div>
        </div>
      </li>`
    )
    .join('') : '<li class="text-tertiary" style="display:flex; align-items:center; gap:var(--space-3);"><i data-lucide="history" width="18" height="18"></i><span><strong style="display:block; color:var(--text-secondary);">No improvement history yet.</strong><span>Upload a resume to start tracking your progress.</span></span></li>';

  document.getElementById('resume-history').innerHTML = data.history.length ? data.history
    .map(
      (h) => `<li style="display:flex; justify-content:space-between; align-items:center; gap:var(--space-3); min-width:0; overflow:hidden; padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--surface-input);">
        <div style="min-width:0; flex:1; overflow:hidden;">
          <button class="btn btn-ghost btn-sm" data-history-id="${escapeHtml(h.id)}" style="display:block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; font-size: var(--text-sm); text-align:left;">${escapeHtml(h.version)}</button>
          <div class="text-tertiary" style="font-size: var(--text-xs);">${escapeHtml(h.date)}</div>
        </div>
        <div style="display:flex; align-items:center; justify-content:flex-end; gap:var(--space-2); flex:0 0 auto; padding-right:var(--space-1);"><span class="badge badge-blue">${Number(h.score) || 0}%</span><button class="btn-icon" data-delete-id="${escapeHtml(h.id)}" aria-label="Delete report"><i data-lucide="trash-2" width="15" height="15"></i></button></div>
      </li>`
    )
    .join('') : '<li class="text-tertiary" style="font-size:var(--text-sm);">No saved resume reports yet.</li>';

  document.querySelectorAll('[data-history-id]').forEach((button) => button.addEventListener('click', () => loadAnalysis(button.dataset.historyId)));
  document.querySelectorAll('[data-delete-id]').forEach((button) => button.addEventListener('click', () => deleteAnalysis(button.dataset.deleteId)));

  if (window.lucide) window.lucide.createIcons();
}

function renderJobMatch(result) {
  const score = Number(result.ats_compatibility_score || result.match_percentage || 0);
  const metrics = [
    ['ATS compatibility', score],
    ['Keyword coverage', result.keyword_match_score],
    ['Technical skills', result.technical_skills_match],
    ['Experience', result.experience_match],
  ];
  const list = (items, kind = '') => (items || []).map((item) => chip(item, kind)).join('') || '<span class="text-tertiary">None identified</span>';
  document.getElementById('job-match-result').innerHTML = `<div class="grid-2">
    <div><div style="display:flex; flex-wrap:wrap; gap:var(--space-4);">${metrics.map(([label, value]) => `<div style="min-width:120px; flex:1;"><div style="display:flex; justify-content:space-between; font-size:var(--text-xs);"><span>${label}</span><strong>${Number(value || 0)}%</strong></div><div class="progress-track" style="margin-top:6px;"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%;"></div></div></div>`).join('')}</div>
      <div style="margin-top:var(--space-5);"><strong>Matching keywords</strong><div style="display:flex; flex-wrap:wrap; gap:var(--space-2); margin-top:var(--space-2);">${list(result.matching_keywords, 'have')}</div></div>
      <div style="margin-top:var(--space-4);"><strong>Missing keywords</strong><div style="display:flex; flex-wrap:wrap; gap:var(--space-2); margin-top:var(--space-2);">${list(result.missing_keywords || result.missing_skills, 'missing')}</div></div>
    </div>
    <div><strong>Priority improvements</strong><ul style="padding-left:var(--space-4); margin-top:var(--space-2); color:var(--text-secondary);">${(result.priority_improvements || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No priority improvements returned.</li>'}</ul><strong style="display:block; margin-top:var(--space-4);">AI summary</strong><p class="text-secondary" style="margin-top:var(--space-2);">${escapeHtml(result.summary_rewrite || result.resume_strengths?.[0] || 'Comparison complete.')}</p></div>
  </div>`;
}

async function analyzeJobMatch() {
  const description = document.getElementById('job-description-input').value.trim();
  if (!currentAnalysisId) return toast.error('Upload and analyze a resume first.');
  if (description.length < 20) return toast.error('Paste at least 20 characters of job description.');
  const analysisId = currentAnalysisId;
  const lifecycleId = uploadRequestId;
  const button = document.getElementById('analyze-job-match-btn');
  const status = document.getElementById('job-match-status');
  button.disabled = true;
  status.textContent = 'Analyzing with Ollama...';
  try {
    const result = await api.post('/job-match', { analysis_id: analysisId, job_description: description });
    if (lifecycleId !== uploadRequestId || currentAnalysisId !== analysisId) return;
    lastJobMatch = result;
    renderJobMatch(lastJobMatch);
    document.getElementById('download-job-match-btn').disabled = false;
    status.textContent = 'Comparison saved.';
    toast.success('Job match analysis complete.');
  } catch (error) {
    status.textContent = '';
    toast.error(error.message || 'Unable to compare the resume with this job description.');
  } finally { button.disabled = false; }
}

function downloadJobMatch() {
  if (!lastJobMatch) return;
  const blob = new Blob([JSON.stringify(lastJobMatch, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'careeriq-ats-job-match.json';
  link.click();
  URL.revokeObjectURL(url);
}

function mapVisionAnalysis(analysis) {
  const extraction = analysis.extraction || {};
  const improvements = analysis.improvements || {};
  const readiness = analysis.strength_analyzer || {};
  const atsScore = analysis.ats_score?.overall_score ?? 0;
  const suggestions = (improvements.improvements || []).filter((item) => typeof item === 'string' && !/retry analysis|try again/i.test(item));
  const personalized = suggestions.length ? suggestions : [
    extraction.experience?.length ? `Add a measurable result to a bullet from ${extraction.experience[0].company || 'your most relevant role'}.` : '',
    extraction.projects?.length ? `Quantify the impact of ${extraction.projects[0].title || 'your strongest project'} and include its repository link.` : '',
    !extraction.education?.length ? 'Add your degree, institution, and dates to the Education section.' : '',
    extraction.achievements?.length ? `Bring ${typeof extraction.achievements[0] === 'string' ? extraction.achievements[0] : extraction.achievements[0].title || 'a quantified achievement'} closer to the top of the resume.` : '',
  ].filter(Boolean);

  return {
    currentResume: {
      fileName: analysis.file_name || 'Analyzed resume',
      uploadedOn: analysis.created_at ? new Date(analysis.created_at).toLocaleDateString() : '',
      grammarScore: Number.isFinite(analysis.grammar?.grammar_score) ? analysis.grammar.grammar_score : (Number.isFinite(analysis.grammar_score) ? analysis.grammar_score : null),
      grammarUnavailable: analysis.grammar?.status === 'unavailable',
      overallScore: atsScore,
      atsScore,
    },
    skillsFound: extraction.skills || [],
    missingSkills: improvements.missing_keywords || extraction.ats_keywords_missing || [],
    keywordSuggestions: extraction.ats_keywords_found || [],
    missingKeywords: improvements.missing_keywords || extraction.ats_keywords_missing || [],
    education: (extraction.education || []).map((item) => typeof item === 'string' ? { degree: item, institution: '', year: '' } : item),
    projects: (extraction.projects || []).map((item) => typeof item === 'string' ? { title: item, description: '', technologies: [], metrics: [], github_url: '' } : { ...item, title: item.title || item.name || 'Project', description: item.description || '', technologies: item.technologies || item.tech_stack || [], metrics: item.metrics || [], github_url: item.github_url || item.github || '' }),
    experience: (extraction.experience || []).map((item) => typeof item === 'string' ? { role: item, company: '', location: '', duration: '', highlights: [], metrics: [] } : { ...item, role: item.role || item.title || 'Experience', company: item.company || '', location: item.location || '', duration: item.duration || item.dates || '', highlights: item.highlights || item.bullets || [], metrics: item.metrics || [] }),
    achievements: [...(extraction.achievements || []), ...(extraction.awards || []), ...(extraction.quantified_achievements || [])],
    scoreBreakdown: analysis.ats_score?.categories || {},
    scoreWeights: analysis.ats_score?.weights || {},
    aiSuggestions: personalized.map((detail) => ({ title: 'Resume improvement', detail, priority: /missing|add your/i.test(detail) ? 'high' : 'medium' })),
    improvementTimeline: [{ milestone: 'Resume uploaded', date: new Date(analysis.created_at || Date.now()).toLocaleDateString() }, { milestone: 'ATS analysis completed', date: new Date(analysis.created_at || Date.now()).toLocaleDateString() }],
    history: [],
    readiness,
  };
}

/* ---------- Upload handling ---------- */

function initUpload(onUploaded) {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse-btn');

  browseBtn.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (e) => {
    if (e.target !== fileInput && e.target !== browseBtn) fileInput.click();
  });

  ['dragover', 'dragenter'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--blue)'; })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--border-strong)'; })
  );
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, onUploaded);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0], onUploaded);
  });

  document.getElementById('replace-resume-btn').addEventListener('click', () => fileInput.click());
  document.getElementById('reanalyze-resume-btn').addEventListener('click', () => {
    if (currentFile) handleFile(currentFile, onUploaded);
    else fileInput.click();
  });
  document.getElementById('remove-resume-btn').addEventListener('click', async () => {
    if (!currentAnalysisId) return;
    await deleteAnalysis(currentAnalysisId);
  });
}

async function handleFile(file, onUploaded) {
  const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!allowed.includes(file.type) && !['pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
    toast.error('Unsupported file type. Please upload a PDF, DOCX, PNG, JPG, or WEBP.');
    return;
  }
  const formData = new FormData();
  formData.append('resume', file);
  currentFile = file;
  const requestId = ++uploadRequestId;
  clearAnalysisState();
  showProcessing();
  try {
    const analysis = await api.upload('/vision/analyze', formData);
    if (requestId !== uploadRequestId) return;
    currentAnalysisId = analysis.id;
    currentResumeId = analysis.resumeId || analysis.resume_id || null;
    toast.success('Resume analysis complete!');
    onUploaded(analysis);
  } catch (error) {
    if (requestId !== uploadRequestId) return;
    showDropzone();
    toast.error(error.message || 'Something went wrong analyzing your resume. Please try again.');
  }
}

async function loadAnalysis(id) {
  const lifecycleId = uploadRequestId;
  try {
    const detail = await api.get(`/vision/history/${id}`);
    const history = await api.get('/vision/history').catch(() => []);
    if (lifecycleId !== uploadRequestId) return;
    currentAnalysisId = id;
    currentResumeId = detail.resume_id || detail.resumeId || null;
    document.getElementById('download-report-btn').disabled = false;
    const historyItems = history.map((item) => ({ id: item.id, version: item.file_name, date: new Date(item.created_at).toLocaleDateString(), score: item.ats_score || 0 }));
    const mapped = mapVisionAnalysis({ ...(detail.analysis_json || {}), id, file_name: detail.file_name, created_at: detail.created_at });
    mapped.history = historyItems;
    mapped.improvementTimeline = historyItems.flatMap((item, index) => [
      { milestone: index === 0 ? 'Resume uploaded' : 'Resume analyzed again', date: item.date },
      { milestone: index === 0 ? 'ATS analysis completed' : 'ATS score updated', date: item.date },
    ]);
    renderResume(mapped);
  } catch (error) { toast.error(error.message); }
}

async function deleteAnalysis(id) {
  try {
    if (id !== currentAnalysisId) return;
    const lifecycleId = ++uploadRequestId;
    await api.request(`/vision/history/${id}`, { method: 'DELETE' });
    if (lifecycleId !== uploadRequestId) return;
    toast.success('Resume report deleted.');
    clearAnalysisState();
    currentFile = null;
    showDropzone();
  } catch (error) { toast.error(error.message); }
}

function renderArtifact(type, result) {
  const target = document.getElementById(`${type}-result`);
  const analysis = result || {};
  if (type === 'certificate') {
    target.innerHTML = `<strong>${analysis.certificate_name || 'Certificate'}</strong><div class="text-secondary">${analysis.issuer || 'Issuer unavailable'}</div><div style="margin-top:var(--space-2);">${(analysis.skills || []).map((skill) => chip(skill, 'have')).join(' ')}</div><div class="badge badge-blue" style="margin-top:var(--space-2);">Relevance ${analysis.relevance_score || 0}%</div><br><button class="btn btn-ghost btn-sm" data-artifact-report="certificate" data-artifact-id="${analysis.id}">Download PDF</button>`;
  } else {
    target.innerHTML = `<strong>Portfolio score: ${analysis.portfolio_score || 0}%</strong><div class="text-secondary">${(analysis.tech_stack || []).join(', ') || 'No stack detected'}</div><ul style="margin-top:var(--space-2); padding-left:var(--space-4);">${(analysis.improvement_suggestions || []).slice(0, 3).map((item) => `<li>${item}</li>`).join('')}</ul><button class="btn btn-ghost btn-sm" data-artifact-report="portfolio" data-artifact-id="${analysis.id}">Download PDF</button>`;
  }
  target.querySelector('[data-artifact-report]')?.addEventListener('click', async (event) => {
    try {
      const kind = event.currentTarget.dataset.artifactReport;
      const report = await api.get(`/vision/${kind === 'certificate' ? 'certificates' : 'portfolio'}/report/${event.currentTarget.dataset.artifactId}`);
      window.open(report.url, '_blank', 'noopener,noreferrer');
    } catch (error) { toast.error(error.message); }
  });
}

function initArtifactUpload(type) {
  const input = document.getElementById(`${type}-input`);
  document.getElementById(`${type}-upload-btn`).addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      toast.info(`Analyzing ${type}...`);
      const result = await api.upload(`/vision/${type === 'certificate' ? 'certificates' : 'portfolio'}/analyze`, formData);
      renderArtifact(type, result);
      loadArtifactHistory(type);
      toast.success(`${type[0].toUpperCase()}${type.slice(1)} analysis complete.`);
    } catch (error) { toast.error(error.message); }
  });
}

async function loadArtifactHistory(type) {
  try {
    const resource = type === 'certificate' ? 'certificates' : 'portfolio';
    const history = await api.get(`/vision/${resource}/history`);
    const list = document.getElementById(`${type}-history`);
    list.innerHTML = history.map((item) => `<li style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-input); padding:var(--space-2); border-radius:var(--radius-md);"><button class="btn btn-ghost btn-sm" data-artifact-open="${type}" data-artifact-id="${item.id}">${item.file_name}</button><div style="display:flex; gap:var(--space-2); align-items:center;"><span class="badge badge-blue">${item.score || 0}%</span><button class="btn-icon" data-artifact-delete="${type}" data-artifact-id="${item.id}" aria-label="Delete ${type} history"><i data-lucide="trash-2" width="14" height="14"></i></button></div></li>`).join('');
    list.querySelectorAll('[data-artifact-open]').forEach((button) => button.addEventListener('click', async () => {
      const detail = await api.get(`/vision/${resource}/history/${button.dataset.artifactId}`);
      renderArtifact(type, { ...(detail.analysis_json || {}), id: detail.id });
    }));
    list.querySelectorAll('[data-artifact-delete]').forEach((button) => button.addEventListener('click', async () => {
      try {
        await api.request(`/vision/${resource}/history/${button.dataset.artifactId}`, { method: 'DELETE' });
        await loadArtifactHistory(type);
        toast.success(`${type[0].toUpperCase()}${type.slice(1)} history deleted.`);
      } catch (error) { toast.error(error.message); }
    }));
    if (window.lucide) window.lucide.createIcons();
  } catch (error) { toast.error(error.message); }
}

async function downloadReport() {
  if (!currentAnalysisId) throw new Error('Analyze a resume before downloading its report.');
  const report = await api.get(`/vision/report/${currentAnalysisId}`);
  if (!report?.url) throw new Error('The report URL was not returned.');
  window.open(report.url, '_blank', 'noopener,noreferrer');
}

async function loadVisionHistory() {
  const lifecycleId = uploadRequestId;
  const history = await api.get('/vision/history');
  if (lifecycleId !== uploadRequestId) return null;
  const current = history?.find((item) => item?.id && (item.resume_id || item.resumeId));
  if (!current) return null;
  currentAnalysisId = current.id;
  const detail = await api.get(`/vision/history/${current.id}`);
  if (lifecycleId !== uploadRequestId) return null;
  if (detail.id && detail.id !== current.id) return null;
  document.getElementById('download-report-btn').disabled = false;
  const historyItems = history.map((item) => ({ id: item.id, version: item.file_name, date: new Date(item.created_at).toLocaleDateString(), score: item.ats_score || 0 }));
  currentResumeId = current.resume_id || current.resumeId || null;
  const mapped = mapVisionAnalysis({ ...(detail.analysis_json || {}), id: current.id, file_name: current.file_name, created_at: current.created_at });
  mapped.improvementTimeline = historyItems.flatMap((item, index) => [
    { milestone: index === 0 ? 'Resume uploaded' : 'Resume analyzed again', date: item.date },
    ...(index === 0 ? [] : [{ milestone: 'Resume replaced', date: item.date }]),
    { milestone: index === 0 ? 'ATS analyzed' : 'ATS score updated', date: item.date },
  ]);
  return { ...mapped, history: historyItems };
}

async function init() {
  try {
    const data = await loadVisionHistory();
    if (data) {
      renderResume(data);
      document.getElementById('resume-content').style.display = 'block';
      showResumeActive({
        fileName: data.currentResume.fileName,
        uploadedOn: data.currentResume.uploadedOn,
        score: data.currentResume.atsScore,
      });
    }
  } catch (error) {
    toast.error(error.message);
  }

  initUpload(async (analysis) => {
    const mapped = mapVisionAnalysis(analysis);
    let report = { ...mapped, history: [{ id: analysis.id, version: mapped.currentResume.fileName, date: mapped.currentResume.uploadedOn, score: mapped.currentResume.atsScore }] };
    try { report = await loadVisionHistory() || report; } catch {}
    renderResume(report);
    showResumeActive({
      fileName: report.currentResume.fileName,
      uploadedOn: report.currentResume.uploadedOn,
      score: report.currentResume.atsScore,
    });
  });

  document.getElementById('download-report-btn').addEventListener('click', async () => {
    try {
      await downloadReport();
    } catch (error) {
      toast.error(error.message);
    }
  });
  document.getElementById('analyze-job-match-btn').addEventListener('click', analyzeJobMatch);
  document.getElementById('download-job-match-btn').addEventListener('click', downloadJobMatch);
  initArtifactUpload('certificate');
  initArtifactUpload('portfolio');
  loadArtifactHistory('certificate');
  loadArtifactHistory('portfolio');
}

document.addEventListener('DOMContentLoaded', init);
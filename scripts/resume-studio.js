// resume-studio.js — page-specific logic for pages/resume-studio.html
import { api } from './api/client.js';
import { renderRing } from './charts.js';
import { toast } from './toast.js';

function chip(text, kind) {
  return `<span class="skill-chip ${kind}">${text}</span>`;
}

function renderResume(data) {
  const r = data.currentResume;
  document.getElementById('resume-filename').textContent = r.fileName;
  document.getElementById('resume-uploaded-on').textContent = `Uploaded ${r.uploadedOn}`;
  document.getElementById('grammar-score').textContent = `${r.grammarScore}%`;
  document.getElementById('overall-score').textContent = `${r.overallScore}%`;
  document.getElementById('ats-percentile').textContent = `${r.atsScore}%`;

  renderRing(document.getElementById('ats-ring'), { value: r.atsScore, caption: 'ATS Score', label: `${r.atsScore}` });

  document.getElementById('skills-found').innerHTML = data.skillsFound.map((s) => chip(s, 'have')).join('');
  document.getElementById('skills-missing').innerHTML = data.missingSkills.map((s) => chip(s, 'missing')).join('');
  document.getElementById('keyword-suggestions').innerHTML = data.keywordSuggestions.map((s) => `<span class="badge badge-blue">${s}</span>`).join('');
  document.getElementById('keyword-missing').innerHTML = data.missingKeywords.map((s) => `<span class="badge badge-rose">${s}</span>`).join('');

  document.getElementById('education-list').innerHTML = data.education
    .map((e) => `<div style="margin-bottom: var(--space-4);"><div style="font-weight:600; font-size: var(--text-sm);">${e.degree}</div><div class="text-secondary" style="font-size: var(--text-xs);">${e.institution}</div><div class="text-tertiary" style="font-size: var(--text-xs);">${e.year}</div></div>`)
    .join('');

  document.getElementById('projects-list').innerHTML = data.projects
    .map(
      (p) => `<div style="margin-bottom: var(--space-4);">
        <div style="font-weight:600; font-size: var(--text-sm);">${p.title}</div>
        <p style="font-size: var(--text-xs); margin-bottom: var(--space-2);">${p.description}</p>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">${p.technologies.map((t) => `<span class="badge">${t}</span>`).join('')}</div>
      </div>`
    )
    .join('');

  document.getElementById('experience-list').innerHTML = data.experience
    .map(
      (e) => `<div style="margin-bottom: var(--space-4);">
        <div style="font-weight:600; font-size: var(--text-sm);">${e.role} · ${e.company}</div>
        <div class="text-tertiary" style="font-size: var(--text-xs); margin-bottom: var(--space-2);">${e.duration}</div>
        <ul style="padding-left: var(--space-4); font-size: var(--text-xs); color: var(--text-secondary); display:flex; flex-direction:column; gap:4px;">
          ${e.highlights.map((h) => `<li>${h}</li>`).join('')}
        </ul>
      </div>`
    )
    .join('') || '<p style="font-size:var(--text-sm);">No experience listed yet — projects and internships count too.</p>';

  const priorityColor = { high: 'rose', medium: 'amber', low: 'blue' };
  document.getElementById('suggestions-grid').innerHTML = data.aiSuggestions
    .map(
      (s) => `<div class="card" style="background: var(--surface-input);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: var(--space-2);">
          <h5 style="font-size: var(--text-sm);">${s.title}</h5>
          <span class="badge badge-${priorityColor[s.priority]}">${s.priority}</span>
        </div>
        <p style="font-size: var(--text-xs);">${s.detail}</p>
      </div>`
    )
    .join('');

  document.getElementById('improvement-timeline').innerHTML = data.improvementTimeline
    .map(
      (item, i) => `<li style="display:flex; gap: var(--space-4);">
        <div style="display:flex; flex-direction:column; align-items:center;">
          <span style="width:10px;height:10px;border-radius:50%;background:${i === 0 ? 'var(--emerald)' : 'var(--border-strong)'};"></span>
          ${i < data.improvementTimeline.length - 1 ? '<span style="width:1px;flex:1;background:var(--border-subtle);margin-top:4px;"></span>' : ''}
        </div>
        <div style="padding-bottom: var(--space-4);">
          <div style="font-size: var(--text-sm); font-weight:500;">${item.milestone}</div>
          <div class="text-tertiary" style="font-size: var(--text-xs);">${item.date}</div>
        </div>
      </li>`
    )
    .join('');

  document.getElementById('resume-history').innerHTML = data.history
    .map(
      (h) => `<li style="display:flex; justify-content:space-between; align-items:center; padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-input);">
        <div>
          <div style="font-weight:600; font-size: var(--text-sm);">${h.version}</div>
          <div class="text-tertiary" style="font-size: var(--text-xs);">${h.date}</div>
        </div>
        <span class="badge badge-blue">${h.score}%</span>
      </li>`
    )
    .join('');

  if (window.lucide) window.lucide.createIcons();
}

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
}

function handleFile(file, onUploaded) {
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!allowed.includes(file.type) && !['pdf', 'png', 'jpg', 'jpeg'].includes(extension)) {
    toast.error('Unsupported file type. Please upload a PDF, PNG, or JPG.');
    return;
  }
  const formData = new FormData();
  formData.append('resume', file);
  toast.info(`Uploading "${file.name}"...`);
  api.upload('/resumes/upload', formData)
    .then(async (resume) => {
      toast.success('Resume uploaded — running AI analysis...');
      const analysis = await api.post('/resumes/analyze', { resume_id: resume.id });
      onUploaded({ resume, analysis });
      toast.success('Analysis complete!');
    })
    .catch((error) => toast.error(error.message));
}

async function init() {
  const resumes = await api.get('/resumes');
  const current = resumes?.[0];
  const analysis = current ? await api.get(`/resumes/${current.id}/analysis`) : null;
  const data = current && analysis ? { currentResume: {
    fileName: current.original_filename,
    uploadedOn: new Date(current.created_at).toLocaleDateString(),
    grammarScore: analysis.grammar?.score || 0,
    overallScore: analysis.overall_score || 0,
    atsScore: analysis.ats_score || 0,
  }, skillsFound: analysis.technical_skills || [], missingSkills: analysis.missing_keywords || [], keywordSuggestions: analysis.strong_keywords || [], missingKeywords: analysis.missing_keywords || [], education: analysis.education || [], projects: analysis.projects || [], experience: analysis.experience || [], aiSuggestions: (analysis.improvements || []).map((detail) => ({ title: 'AI suggestion', detail, priority: 'medium' })), improvementTimeline: [], history: resumes.map((resume) => ({ version: `Version ${resume.version}`, date: new Date(resume.created_at).toLocaleDateString(), score: analysis.overall_score || 0 })), } : {
    currentResume: { fileName: 'No resume uploaded', uploadedOn: '', grammarScore: 0, overallScore: 0, atsScore: 0 }, skillsFound: [], missingSkills: [], keywordSuggestions: [], missingKeywords: [], education: [], projects: [], experience: [], aiSuggestions: [], improvementTimeline: [], history: [],
  };

  initUpload((uploaded) => {
    if (uploaded?.resume && uploaded?.analysis) renderResume({ ...data, currentResume: { ...data.currentResume, fileName: uploaded.resume.original_filename, overallScore: uploaded.analysis.overall_score, atsScore: uploaded.analysis.ats_score, grammarScore: uploaded.analysis.grammar?.score || 0 } });
    document.getElementById('resume-content').style.display = 'block';
    document.getElementById('resume-content').setAttribute('data-reveal', '');
    requestAnimationFrame(() => document.getElementById('resume-content').classList.add('is-visible'));
  });

  if (current) {
    renderResume(data);
    document.getElementById('resume-content').style.display = 'block';
  }

  document.getElementById('download-report-btn').addEventListener('click', () => {
    toast.info('Generating PDF report... (connect a backend export endpoint to enable real downloads)');
  });
}

document.addEventListener('DOMContentLoaded', init);

// career-lab.js — page-specific logic for pages/career-lab.html
// Handles the 3 tabs: Skill Gap Analyzer, AI Career Roadmap, Career DNA.
import { api } from './api/client.js';
import { renderRing, renderRadarChart, renderLineChart } from './charts.js';
import { toast } from './toast.js';

function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const selectTab = (btn) => {
    buttons.forEach((b) => {
      const selected = b === btn;
      b.classList.toggle('is-active', selected);
      b.setAttribute('aria-selected', String(selected));
      b.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      const active = p.id === `panel-${btn.dataset.tab}`;
      p.classList.toggle('is-active', active);
      p.hidden = !active;
    });
  };
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn));
    btn.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = [...buttons].indexOf(btn);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      selectTab(buttons[next]);
    });
  });
}

const priorityColor = { high: 'rose', medium: 'amber', low: 'blue' };

function renderSkillGap(skillsData) {
  const gap = skillsData.skillGap;

  const select = document.getElementById('target-role-select');
  select.innerHTML = skillsData.targetRoles.map((r) => `<option ${r === gap.targetRole ? 'selected' : ''}>${r}</option>`).join('');

  document.getElementById('match-role-label').textContent = gap.targetRole;
  renderRing(document.getElementById('match-score-ring'), { value: gap.matchScore, caption: 'Match Score', label: `${gap.matchScore}%`, colorFrom: '#5B7CFA', colorTo: '#9B6BFF' });
  renderRadarChart(document.getElementById('skill-radar'), gap.radar, { color: '#5B7CFA' });

  document.getElementById('missing-skills-list').innerHTML = gap.missingSkills.map((s) => `<span class="skill-chip missing">${s}</span>`).join('');

  document.getElementById('priority-skills-list').innerHTML = gap.prioritySkills
    .map(
      (p) => `<div style="display:flex; justify-content:space-between; align-items:flex-start; padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-input);">
        <div>
          <div style="font-weight:600; font-size: var(--text-sm);">${p.skill}</div>
          <div class="text-tertiary" style="font-size: var(--text-xs);">${p.reason}</div>
        </div>
        <span class="badge badge-${priorityColor[p.priority]}">${p.priority}</span>
      </div>`
    )
    .join('');

  document.getElementById('learning-suggestions-grid').innerHTML = gap.learningSuggestions
    .map(
      (l) => `<div class="card" style="background: var(--surface-input);">
        <div class="card-icon" style="width:36px;height:36px; margin-bottom: var(--space-3);"><i data-lucide="${l.type === 'course' ? 'book-open' : 'code-2'}" width="16" height="16"></i></div>
        <h5 style="font-size: var(--text-sm); margin-bottom: var(--space-1);">${l.title}</h5>
        <span class="text-tertiary" style="font-size: var(--text-xs);">${l.duration}</span>
      </div>`
    )
    .join('');

  document.getElementById('run-skillgap-btn').onclick = async () => {
    toast.info('Re-running skill gap analysis against the latest market data...');
    try {
      const updated = await api.post('/skill-gap/analyze', { resume_id: skillsData.resumeId, target_role: select.value });
      renderSkillGap({ ...skillsData, skillGap: normalizeSkillGap(updated, select.value) });
      toast.success('Skill gap analysis updated.');
    } catch (error) { toast.error(error.message); }
  };

  if (window.lucide) window.lucide.createIcons();
}

function renderRoadmap(roadmap) {
  document.getElementById('roadmap-progress-label').textContent = `${roadmap.progress}% complete`;
  requestAnimationFrame(() => {
    document.getElementById('roadmap-progress-fill').style.width = `${roadmap.progress}%`;
  });

  renderLineChart(document.getElementById('roadmap-timeline-chart'), roadmap.learningTimeline, { color: '#34D9E8' });

  document.getElementById('weekly-goals-list').innerHTML = roadmap.weeklyGoals
    .map(
      (w) => `<li style="padding: var(--space-4); border-radius: var(--radius-md); background: var(--surface-input);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: var(--space-2);">
          <strong style="font-size: var(--text-sm);">Week ${w.week}: ${w.focus}</strong>
          ${w.done ? '<span class="badge badge-emerald">Done</span>' : '<span class="badge">In progress</span>'}
        </div>
        <ul style="font-size: var(--text-xs); color: var(--text-secondary); padding-left: var(--space-4); display:flex; flex-direction:column; gap:4px;">
          ${w.tasks.map((t) => `<li>${t}</li>`).join('')}
        </ul>
      </li>`
    )
    .join('');

  document.getElementById('monthly-goals-list').innerHTML = roadmap.monthlyGoals
    .map(
      (m) => `<li>
        <div style="font-weight:600; font-size: var(--text-sm); margin-bottom: var(--space-1);">Month ${m.month}: ${m.theme}</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">${m.goals.map((g) => `<span class="badge badge-blue">${g}</span>`).join('')}</div>
      </li>`
    )
    .join('');

  document.getElementById('milestones-list').innerHTML = roadmap.quarterMilestones
    .map(
      (m) => `<div style="margin-bottom: var(--space-4);">
        <div style="font-weight:600; font-size: var(--text-sm);">Q${m.quarter}: ${m.milestone}</div>
        <ul style="font-size: var(--text-xs); color: var(--text-secondary); padding-left: var(--space-4); margin-top:4px;">
          ${m.successCriteria.map((c) => `<li>${c}</li>`).join('')}
        </ul>
      </div>`
    )
    .join('');

  document.getElementById('roadmap-projects-list').innerHTML = roadmap.projects
    .map(
      (p) => `<div style="margin-bottom: var(--space-4);">
        <div style="font-weight:600; font-size: var(--text-sm);">${p.title}</div>
        <span class="badge badge-purple" style="margin:4px 0; display:inline-flex;">${p.difficulty}</span>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">${p.skillsPracticed.map((s) => `<span class="badge">${s}</span>`).join('')}</div>
      </div>`
    )
    .join('');

  document.getElementById('certifications-list').innerHTML = roadmap.certifications
    .map(
      (c) => `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: var(--space-3);">
        <span style="font-size: var(--text-sm);">${c.name}</span>
        <span class="badge badge-${priorityColor[c.priority]}">${c.priority}</span>
      </div>`
    )
    .join('');
}

function renderCareerDNA(dna) {
  const traits = [
    { key: 'communication', label: 'Communication', color: '#5B7CFA' },
    { key: 'leadership', label: 'Leadership', color: '#9B6BFF' },
    { key: 'creativity', label: 'Creativity', color: '#34D9E8' },
    { key: 'problemSolving', label: 'Problem Solving', color: '#34D399' },
  ];

  document.getElementById('dna-traits-list').innerHTML = traits
    .map(
      (t) => `<div>
        <div style="display:flex; justify-content:space-between; margin-bottom: var(--space-2); font-size: var(--text-sm);">
          <span>${t.label}</span><strong>${dna[t.key]}%</strong>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:0%; background:${t.color};" data-target="${dna[t.key]}"></div></div>
      </div>`
    )
    .join('');

  requestAnimationFrame(() => {
    document.querySelectorAll('#dna-traits-list [data-target]').forEach((el) => {
      el.style.width = `${el.getAttribute('data-target')}%`;
    });
  });

  renderRadarChart(
    document.getElementById('dna-radar'),
    traits.map((t) => ({ label: t.label, value: dna[t.key] })),
    { color: '#9B6BFF' }
  );

  document.getElementById('learning-style-value').textContent = dna.learningStyle;
  document.getElementById('technical-strength-list').innerHTML = dna.technicalStrength.map((s) => `<span class="badge badge-blue">${s}</span>`).join('');
  document.getElementById('career-personality-value').textContent = dna.careerPersonality;
  document.getElementById('growth-opportunities-list').innerHTML = dna.growthOpportunities
    .map((g) => `<li style="display:flex; gap: var(--space-2); font-size: var(--text-sm);"><i data-lucide="arrow-up-right" width="16" height="16" style="color:var(--emerald); flex-shrink:0; margin-top:2px;"></i>${g}</li>`)
    .join('');

  if (window.lucide) window.lucide.createIcons();
}

async function init() {
  initTabs();
  const [profile, resumes, roadmaps, dna] = await Promise.all([
    api.get('/auth/profile'), api.get('/resumes'), api.get('/roadmaps'), api.get('/career-dna/latest'),
  ]);
  const targetRole = profile.profile?.target_role || 'Frontend Developer';
  const resumeId = resumes?.[0]?.id;
  let skillGap;
  try {
    skillGap = await api.post('/skill-gap/analyze', { resume_id: resumeId, target_role: targetRole });
  } catch {
    skillGap = { target_role: targetRole, match_score: 0, missing_skills: [], priority_skills: [], learning_sequence: [], resources: [] };
  }
  const roadmap = roadmaps?.[0] || await api.post('/roadmaps/generate', { target_role: targetRole, weeks: 12 });
  const careerDna = dna || await api.post('/career-dna/generate', {});
  renderSkillGap({ resumeId, targetRoles: [targetRole], skillGap: normalizeSkillGap(skillGap, targetRole) });
  renderRoadmap(normalizeRoadmap(roadmap));
  renderCareerDNA(normalizeCareerDNA(careerDna));
}

function normalizeSkillGap(data, targetRole) {
  return { targetRole: data.target_role || targetRole, matchScore: data.match_score || 0, radar: [], missingSkills: data.missing_skills || [], prioritySkills: (data.priority_skills || []).map((skill) => typeof skill === 'string' ? { skill, reason: '', priority: 'medium' } : { skill: skill.skill || skill.name, reason: skill.reason || '', priority: skill.priority || 'medium' }), learningSuggestions: (data.resources || []).map((resource) => typeof resource === 'string' ? { title: resource, duration: '', type: 'course' } : { title: resource.title || resource.name, duration: resource.duration || '', type: resource.type || 'course' }) };
}

function normalizeRoadmap(data) {
  return { progress: data.progress || 0, learningTimeline: [], weeklyGoals: (data.weekly_plan || []).map((item, index) => ({ week: item.week || index + 1, focus: item.focus || item.title || 'Learning goal', done: Boolean(item.done), tasks: item.tasks || item.goals || [] })), monthlyGoals: (data.monthly_plan || []).map((item, index) => ({ month: item.month || index + 1, theme: item.theme || item.title || 'Career growth', goals: item.goals || [] })), quarterMilestones: (data.quarter_milestones || []).map((item) => ({ quarter: item.quarter || 1, milestone: item.milestone || item.title || '', successCriteria: item.success_criteria || item.successCriteria || [] })), projects: (data.projects || []).map((item) => ({ title: item.title || item.name || '', difficulty: item.difficulty || 'medium', skillsPracticed: item.skills_practiced || item.skillsPracticed || [] })), certifications: (data.certifications || []).map((item) => typeof item === 'string' ? { name: item, priority: 'medium' } : { name: item.name || item.title, priority: item.priority || 'medium' }) };
}

function normalizeCareerDNA(data) {
  data = data || {};
  return { communication: data.communication || 0, leadership: data.leadership || 0, creativity: data.creativity || 0, problemSolving: data.problem_solving || 0, learningStyle: data.learning_style || 'Not available', technicalStrength: data.technical_strength || [], careerPersonality: data.career_personality || 'Not available', growthOpportunities: data.growth_opportunities || [] };
}

document.addEventListener('DOMContentLoaded', init);

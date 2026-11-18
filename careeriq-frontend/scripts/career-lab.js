import { api } from './api/client.js';
import { renderRadarChart, renderRing, renderLineChart } from './charts.js';
import { toast } from './toast.js';

const ROLES = ['Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Data Scientist', 'AIML Engineer', 'UI UX Designer', 'DevOps Engineer', 'Android Developer'];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const clamp = (numberValue) => Math.max(0, Math.min(100, Number(numberValue) || 0));

export class CareerLab {
  constructor() {
    this.cache = {};
    this.role = 'Frontend Developer';
    this.bindTabs();
  }

  bindTabs() {
    const buttons = [...document.querySelectorAll('.tab-btn')];
    const select = (button) => {
      buttons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        const active = panel.id === `panel-${button.dataset.tab}`;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    };
    buttons.forEach((button) => {
      button.addEventListener('click', () => select(button));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = buttons.indexOf(button);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        select(buttons[next]);
        buttons[next].focus();
      });
    });
  }

  setLoading(container, message = 'Loading your career insights...') {
    container.innerHTML = `<div class="skeleton" style="min-height:72px; display:flex; align-items:center;">${escapeHtml(message)}</div>`;
  }

  setEmpty(container, message, action = null) {
    container.innerHTML = `<div style="padding:var(--space-5); text-align:center; color:var(--text-secondary);">${escapeHtml(message)}${action ? `<div style="margin-top:var(--space-3);"><a class="btn btn-secondary" href="resume-studio.html">${escapeHtml(action)}</a></div>` : ''}</div>`;
  }

  async load() {
    ['match-score-ring', 'skill-radar', 'roadmap-timeline-chart', 'dna-traits-list'].forEach((id) => this.setLoading(document.getElementById(id)));
    const status = await api.get('/career-lab/status', { retries: 2 });
    this.skillsExists = Boolean(status.skills);
    this.role = localStorage.getItem('careeriq-career-lab-role') || status.targetRoles?.[0] || this.role;
    const select = document.getElementById('target-role-select');
    select.innerHTML = (status.targetRoles || ROLES).map((role) => `<option value="${escapeHtml(role)}" ${role === this.role ? 'selected' : ''}>${escapeHtml(role)}</option>`).join('');
    select.addEventListener('change', () => {
      this.role = select.value;
      localStorage.setItem('careeriq-career-lab-role', this.role);
    });
    document.getElementById('run-skillgap-btn').addEventListener('click', () => this.analyzeSkills());

    if (!status.hasResume) {
      this.setEmpty(document.getElementById('match-score-ring'), 'Upload your resume in Resume Studio to unlock AI Career Lab.', 'Go to Resume Studio');
      this.setEmpty(document.getElementById('skill-radar'), 'Your skill radar will appear after resume analysis.');
      this.setEmpty(document.getElementById('roadmap-timeline-chart'), 'Your roadmap will appear after skill analysis.');
      this.setEmpty(document.getElementById('dna-traits-list'), 'Career DNA will appear after resume analysis.');
      return;
    }
    const results = await Promise.allSettled([this.loadSkills(status.skills), this.loadRoadmap(status.roadmap), this.loadDna(status.dna)]);
    if (results.some((result) => result.status === 'rejected')) toast.error('Some Career Lab insights could not be loaded. Retry the affected analysis.');
  }

  async loadSkills(exists) {
    if (!exists) {
      this.setEmpty(document.getElementById('match-score-ring'), 'Choose a target role and run your first analysis.');
      document.getElementById('match-role-label').textContent = this.role;
      return;
    }
    this.setLoading(document.getElementById('match-score-ring'));
    const data = await api.get('/career-lab/skills', { retries: 2 });
    this.cache.skills = data;
    this.renderSkills(data);
  }

  renderSkills(data) {
    const targetRole = data.target_role || data.targetRole || this.role;
    const score = clamp(data.match_score ?? data.matchScore);
    document.getElementById('match-role-label').textContent = targetRole;
    renderRing(document.getElementById('match-score-ring'), { value: score, label: `${score}%`, caption: 'Match Score', colorFrom: '#5B7CFA', colorTo: '#9B6BFF' });
    const radar = data.radar_scores || data.radarScores || {};
    const radarAxes = ['Frontend', 'Backend', 'Database', 'Cloud', 'DSA', 'DevOps', 'Soft Skills', 'AI/ML'];
    renderRadarChart(document.getElementById('skill-radar'), radarAxes.map((label) => ({ label, value: clamp(radar[label] ?? radar[label.replace(/[^a-z]/gi, '')] ?? 0) })), { color: '#5B7CFA' });
    const matched = data.matched_skills || data.matchedSkills || [];
    document.getElementById('matched-skills-list').innerHTML = matched.length ? matched.map((skill) => `<span class="skill-chip" title="${escapeHtml(skill.level)}% proficiency">${escapeHtml(skill.name || skill.skill)} <strong>${clamp(skill.level)}%</strong></span>`).join('') : '<span class="text-tertiary">No matched skills returned.</span>';
    const missing = data.missing_skills || data.missingSkills || [];
    document.getElementById('missing-skills-list').innerHTML = missing.length ? missing.map((skill) => `<span class="skill-chip missing" title="${escapeHtml(skill.reason || '')}">${escapeHtml(skill.name || skill.skill)} <strong>${escapeHtml(skill.importance || 'Medium')}</strong></span>`).join('') : '<span class="text-tertiary">Your profile matches the selected role well.</span>';
    const priority = data.priority_skills || data.prioritySkills || [];
    document.getElementById('priority-skills-list').innerHTML = priority.length ? priority.map((skill) => `<div style="padding:var(--space-3); border-radius:var(--radius-md); background:var(--surface-input);"><div style="display:flex; justify-content:space-between; gap:var(--space-2);"><strong>${escapeHtml(skill.name || skill.skill)}</strong><span class="badge badge-amber">${escapeHtml(skill.difficulty || 'Medium')}</span></div><div class="text-tertiary" style="font-size:var(--text-xs); margin-top:4px;">${escapeHtml(skill.weeks || '?')} weeks to build momentum</div></div>`).join('') : '<span class="text-tertiary">Priority skills will appear after analysis.</span>';
    const resources = data.learning_resources || data.learningSuggestions || [];
    document.getElementById('learning-suggestions-grid').innerHTML = resources.length ? resources.map((resource) => `<div class="card" style="background:var(--surface-input);"><div class="card-icon" style="width:36px;height:36px; margin-bottom:var(--space-3);"><i data-lucide="book-open" width="16" height="16"></i></div><h5 style="font-size:var(--text-sm); margin-bottom:var(--space-1);">${escapeHtml(resource.title || resource.name || 'Learning resource')}</h5><span class="text-tertiary" style="font-size:var(--text-xs);">${escapeHtml(resource.provider || '')} ${escapeHtml(resource.duration || '')} ${escapeHtml(resource.type || '')}</span></div>`).join('') : '<span class="text-tertiary">Learning suggestions will appear here.</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  async analyzeSkills() {
    const button = document.getElementById('run-skillgap-btn');
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      const data = await api.post('/career-lab/skills/analyze', { targetRole: this.role });
      this.cache.skills = data;
      this.renderSkills(data);
      toast.success('Analysis completed successfully.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }

  async loadRoadmap(exists) {
    if (!exists) {
      this.setEmpty(document.getElementById('roadmap-timeline-chart'), 'Analyze your skills first, then generate a personalized roadmap.');
      const button = document.getElementById('generate-roadmap-btn');
      button.hidden = !this.skillsExists;
      button.onclick = () => this.generateRoadmap();
      return;
    }
    this.setLoading(document.getElementById('roadmap-timeline-chart'));
    this.cache.roadmap = await api.get('/career-lab/roadmap', { retries: 2 });
    this.renderRoadmap(this.cache.roadmap);
  }

  async generateRoadmap() {
    const button = document.getElementById('generate-roadmap-btn');
    button.disabled = true;
    try {
      this.cache.roadmap = await api.post('/career-lab/roadmap/generate', { targetRole: this.role });
      button.hidden = true;
      this.renderRoadmap(this.cache.roadmap);
      toast.success('Roadmap generated successfully.');
    } catch (error) { toast.error(error.message); } finally { button.disabled = false; }
  }

  renderRoadmap(data) {
    const progress = clamp(data.progress);
    document.getElementById('roadmap-progress-label').textContent = `${progress}% complete`;
    requestAnimationFrame(() => { document.getElementById('roadmap-progress-fill').style.width = `${progress}%`; });
    const timeline = data.timeline || [];
    renderLineChart(document.getElementById('roadmap-timeline-chart'), timeline.map((item, index) => ({ label: item.month || `Month ${index + 1}`, value: item.completed ? 100 : index ? 50 : 20 })), { color: '#34D9E8' });
    this.renderGoals('weekly-goals-list', data.weekly_goals || data.weeklyGoals || [], 'weekly');
    this.renderGoals('monthly-goals-list', data.monthly_goals || data.monthlyGoals || [], 'monthly');
    const milestones = data.quarterly_milestones || data.quarterlyMilestones || [];
    document.getElementById('milestones-list').innerHTML = milestones.map((item) => `<div style="margin-bottom:var(--space-4);"><strong style="font-size:var(--text-sm);">${escapeHtml(item.title || item.milestone)}</strong><div class="progress-track" style="margin-top:var(--space-2);"><div class="progress-fill" style="width:${clamp(item.progress)}%"></div></div><span class="text-tertiary" style="font-size:var(--text-xs);">${escapeHtml(item.targetDate || '')}</span></div>`).join('') || '<span class="text-tertiary">Milestones will appear after roadmap generation.</span>';
    document.getElementById('roadmap-projects-list').innerHTML = (data.projects || []).map((item, index) => `<label style="display:flex; gap:var(--space-2); align-items:flex-start; margin-bottom:var(--space-4); cursor:pointer;"><input type="checkbox" data-progress-kind="projects" data-progress-index="${index}" ${item.status === 'completed' ? 'checked' : ''}><span><strong style="font-size:var(--text-sm);">${escapeHtml(item.title)}</strong><span style="display:block;"><span class="badge badge-purple" style="margin:4px 0; display:inline-flex;">${escapeHtml(item.difficulty || 'Intermediate')}</span></span><span class="text-tertiary" style="font-size:var(--text-xs);">${escapeHtml((item.skills || item.skillsPracticed || []).join(', '))} ${escapeHtml(item.duration || '')}</span></span></label>`).join('') || '<span class="text-tertiary">Projects will appear here.</span>';
    document.getElementById('certifications-list').innerHTML = (data.certifications || []).map((item, index) => `<label style="display:flex; gap:var(--space-2); align-items:center; margin-bottom:var(--space-3); cursor:pointer;"><input type="checkbox" data-progress-kind="certifications" data-progress-index="${index}" ${item.status === 'completed' ? 'checked' : ''}><span style="font-size:var(--text-sm);">${escapeHtml(item.title || item.name)} <span class="badge">${escapeHtml(item.provider || item.provider_hint || '')}</span></span></label>`).join('') || '<span class="text-tertiary">Certifications will appear here.</span>';
    document.querySelectorAll('[data-progress-kind]').forEach((input) => input.addEventListener('change', () => this.updateProgressItem(input)));
  }

  renderGoals(id, goals, kind) {
    document.getElementById(id).innerHTML = goals.map((goal, index) => { const done = goal.status === 'completed' || goal.done; return `<li style="padding:var(--space-3); border-radius:var(--radius-md); background:var(--surface-input);"><label style="display:flex; gap:var(--space-2); align-items:center; cursor:pointer;"><input type="checkbox" data-goal-kind="${kind}" data-goal-index="${index}" ${done ? 'checked' : ''}><span style="${done ? 'text-decoration:line-through; opacity:.7;' : ''}">${escapeHtml(goal.title || goal.focus || goal.theme)}</span><span class="badge" style="margin-left:auto;">${escapeHtml(goal.xp || 10)} XP</span></label></li>`; }).join('') || '<li class="text-tertiary">Goals will appear after roadmap generation.</li>';
    document.querySelectorAll(`#${id} input[data-goal-kind]`).forEach((input) => input.addEventListener('change', () => this.updateGoal(input)));
  }

  async updateGoal(input) {
    const roadmap = this.cache.roadmap;
    const weekly = [...(roadmap.weekly_goals || roadmap.weeklyGoals || [])];
    const monthly = [...(roadmap.monthly_goals || roadmap.monthlyGoals || [])];
    const list = input.dataset.goalKind === 'weekly' ? weekly : monthly;
    list[input.dataset.goalIndex].status = input.checked ? 'completed' : 'pending';
    const all = [...weekly, ...monthly];
    const progress = all.length ? Math.round((all.filter((goal) => goal.status === 'completed').length / all.length) * 100) : clamp(roadmap.progress);
    try {
      this.cache.roadmap = await api.patch('/career-lab/roadmap', { weeklyGoals: weekly, monthlyGoals: monthly, progress });
      this.renderRoadmap(this.cache.roadmap);
      toast.success('Roadmap progress saved.');
    } catch (error) { input.checked = !input.checked; toast.error(error.message); }
  }

  async updateProgressItem(input) {
    const roadmap = this.cache.roadmap;
    const projects = [...(roadmap.projects || [])];
    const certifications = [...(roadmap.certifications || [])];
    const list = input.dataset.progressKind === 'projects' ? projects : certifications;
    list[input.dataset.progressIndex].status = input.checked ? 'completed' : 'pending';
    try {
      this.cache.roadmap = await api.patch('/career-lab/roadmap', { projects, certifications, progress: roadmap.progress });
      this.renderRoadmap(this.cache.roadmap);
      toast.success('Progress saved.');
    } catch (error) { input.checked = !input.checked; toast.error(error.message); }
  }

  async loadDna(exists) {
    if (!exists) {
      this.setEmpty(document.getElementById('dna-traits-list'), 'Analyze your Career DNA to see your strengths and growth opportunities.');
      const button = document.getElementById('analyze-dna-btn');
      button.hidden = false;
      button.onclick = () => this.analyzeDna();
      return;
    }
    this.setLoading(document.getElementById('dna-traits-list'));
    this.cache.dna = await api.get('/career-lab/dna', { retries: 2 });
    this.renderDna(this.cache.dna);
  }

  async analyzeDna() {
    const button = document.getElementById('analyze-dna-btn');
    button.disabled = true;
    try {
      this.cache.dna = await api.post('/career-lab/dna/analyze', {});
      button.hidden = true;
      this.renderDna(this.cache.dna);
      toast.success('Career DNA analyzed successfully.');
    } catch (error) { toast.error(error.message); } finally { button.disabled = false; }
  }

  renderDna(data) {
    const traits = [['communication', 'Communication', '#5B7CFA'], ['leadership', 'Leadership', '#9B6BFF'], ['creativity', 'Creativity', '#34D9E8'], ['problem_solving', 'Problem Solving', '#34D399']];
    document.getElementById('dna-traits-list').innerHTML = traits.map(([key, label, color]) => { const score = clamp(data[key] ?? data[key.replace('_', '')]); return `<div><div style="display:flex; justify-content:space-between; margin-bottom:var(--space-2); font-size:var(--text-sm);"><span>${label}</span><strong>${score}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${score}%; background:${color};"></div></div></div>`; }).join('');
    renderRadarChart(document.getElementById('dna-radar'), traits.map(([key, label]) => ({ label, value: clamp(data[key] ?? data[key.replace('_', '')]) })), { color: '#9B6BFF' });
    document.getElementById('learning-style-value').textContent = data.learning_style || data.learningStyle || 'Not available';
    document.getElementById('technical-strength-list').innerHTML = `<span class="badge badge-blue">${clamp(data.technical_strength_score ?? data.technicalStrength)}%</span>`;
    document.getElementById('career-personality-value').textContent = data.career_personality || data.careerPersonality || 'Not available';
    const strengths = data.strength_summary || data.strengthSummary || 'Your strongest signals are reflected in the trait radar above.';
    const weaknesses = data.weakness_summary || data.weaknessSummary || (data.growth_opportunities?.length ? 'Focus areas are listed below as practical growth opportunities.' : 'Complete more interviews to identify additional growth areas.');
    document.getElementById('dna-strength-summary').textContent = `Strength summary: ${strengths}`;
    document.getElementById('dna-weakness-summary').textContent = `Focus summary: ${weaknesses}`;
    document.getElementById('growth-opportunities-list').innerHTML = (data.growth_opportunities || data.growthOpportunities || []).map((item) => { const opportunity = typeof item === 'string' ? { title: item, reason: '' } : item; return `<li style="display:flex; gap:var(--space-2); font-size:var(--text-sm);"><i data-lucide="arrow-up-right" width="16" height="16" style="color:var(--emerald); flex-shrink:0; margin-top:2px;"></i><span><strong>${escapeHtml(opportunity.title || '')}</strong> ${escapeHtml(opportunity.reason || opportunity.activity || '')}</span></li>`; }).join('') || '<li class="text-tertiary">Growth opportunities will appear here.</li>';
    if (window.lucide) window.lucide.createIcons();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try { await new CareerLab().load(); } catch (error) { toast.error(error.message); }
});
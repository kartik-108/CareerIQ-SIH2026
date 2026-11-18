// dashboard.js — page-specific logic for pages/dashboard.html
import { api } from './api/client.js';
import { renderLineChart, renderBarChart } from './charts.js';
import { getItem, setItem } from './storage.js';
import { getSession } from './api/auth.js';
import { toast } from './toast.js';

const TASK_ICONS = { learning: 'book-open', interview: 'video', jobs: 'briefcase', resume: 'file-text' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

function renderWidgets(widgets) {
  const grid = document.getElementById('widgets-grid');
  const items = [
    { label: 'Resume Score', value: widgets.resumeScore, icon: 'file-check-2', color: 'var(--blue)' },
    { label: 'Skill Match', value: widgets.skillMatch, icon: 'target', color: 'var(--purple)' },
    { label: 'Interview Confidence', value: widgets.interviewConfidence, icon: 'video', color: 'var(--cyan)' },
    { label: 'Career Progress', value: widgets.careerProgress, icon: 'trending-up', color: 'var(--emerald)' },
  ];

  grid.innerHTML = items
    .map(
      (item) => `
    <div class="card card-hover">
      <div class="card-icon" style="color:${item.color}"><i data-lucide="${item.icon}"></i></div>
      <div class="stat-value">${escapeHtml(item.value)}%</div>
      <div class="stat-label">${item.label}</div>
      <div class="progress-track" style="margin-top: var(--space-3);">
        <div class="progress-fill" style="width:0%" data-progress-target="${item.value}"></div>
      </div>
    </div>`
    )
    .join('');

  if (window.lucide) window.lucide.createIcons();
  requestAnimationFrame(() => {
    grid.querySelectorAll('[data-progress-target]').forEach((el) => {
      el.style.width = `${el.getAttribute('data-progress-target')}%`;
    });
  });
}

function renderQuickActions(actions) {
  const grid = document.getElementById('quick-actions-grid');
  grid.innerHTML = actions
    .map(
      (a) => `
    <a href="${a.target}" class="card card-hover" style="text-align:center; display:flex; flex-direction:column; align-items:center; gap: var(--space-3);">
      <div class="card-icon"><i data-lucide="${a.icon}"></i></div>
      <span style="font-size: var(--text-sm); font-weight:600;">${escapeHtml(a.label)}</span>
    </a>`
    )
    .join('');
  if (window.lucide) window.lucide.createIcons();
}

function renderTasks(tasks, completedTasks) {
  const list = document.getElementById('tasks-list');
  list.innerHTML = tasks
    .map((task, index) => {
      const completed = completedTasks.includes(index);
      return `
    <li style="display:flex; align-items:center; gap: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-input); ${completed ? 'opacity:0.65;' : ''}">
      <div class="card-icon" style="width:36px;height:36px;"><i data-lucide="${TASK_ICONS[task.type] || 'circle'}" width="16" height="16"></i></div>
      <div style="flex:1;">
        <div style="font-size: var(--text-sm); font-weight:500; ${completed ? 'text-decoration:line-through;' : ''}">${escapeHtml(task.title)}</div>
        <div class="text-tertiary" style="font-size: var(--text-xs);">${escapeHtml(task.due)}</div>
      </div>
      <button class="btn-icon" data-task-index="${index}" aria-label="${completed ? 'Mark as incomplete' : 'Mark as complete'}" aria-pressed="${completed}"><i data-lucide="check" width="16" height="16"></i></button>
    </li>`
    })
    .join('');
  if (window.lucide) window.lucide.createIcons();

  list.querySelectorAll('[data-task-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.taskIndex);
      completedTasks = completedTasks.includes(index)
        ? completedTasks.filter((taskIndex) => taskIndex !== index)
        : [...completedTasks, index];
      setItem('completed_tasks', completedTasks);
      renderTasks(tasks, completedTasks);
    });
  });
}

function renderEmptyDashboard() {
  renderWidgets({ resumeScore: 0, skillMatch: 0, interviewConfidence: 0, careerProgress: 0 });
  renderTasks([], getItem('completed_tasks', []));
  renderLineChart(document.getElementById('weekly-chart'), [], { color: '#5B7CFA' });
  renderLineChart(document.getElementById('skill-growth-chart'), [], { color: '#9B6BFF' });
  renderLineChart(document.getElementById('resume-timeline-chart'), [], { color: '#34D9E8' });
  renderBarChart(document.getElementById('interview-perf-chart'), [], { color: '#34D399' });
}

async function initDashboard() {
  try {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Your session has expired. Please log in again.');
    const authOptions = { headers: { Authorization: `Bearer ${session.access_token}` } };
    const dashboard = await api.get('/dashboard', authOptions);
    const [analyticsResult, resumeHistoryResult, careerLabResult] = await Promise.allSettled([
      api.get('/dashboard/analytics', authOptions),
      api.get('/vision/history', authOptions),
      api.get('/career-lab/skills', authOptions),
    ]);
    const analytics = analyticsResult.status === 'fulfilled' ? analyticsResult.value : {};
    const resumeHistory = resumeHistoryResult.status === 'fulfilled' ? resumeHistoryResult.value : [];
    const careerLabSkills = careerLabResult.status === 'fulfilled' ? careerLabResult.value : null;
    const interviewHistory = dashboard.interview_history || [];
    const roadmapProgressItems = dashboard.roadmap_progress || [];
    const latestInterview = interviewHistory[0]?.overall_score || 0;
    const latestSkill = careerLabSkills?.match_score || careerLabSkills?.matchScore || dashboard.skill_progress?.match_score || 0;
    const latestResume = resumeHistory[0]?.ats_score || 0;
    const roadmapProgress = roadmapProgressItems.length
      ? Math.round(roadmapProgressItems.reduce((sum, item) => sum + Number(item.progress || 0), 0) / roadmapProgressItems.length)
      : 0;
    const data = {
      user: { name: dashboard.target_role || '', streak: dashboard.streak?.current_streak || 0 },
      widgets: { resumeScore: latestResume, skillMatch: latestSkill, interviewConfidence: latestInterview, careerProgress: roadmapProgress },
    quickActions: [
      { label: 'Improve resume', icon: 'file-text', target: 'resume-studio.html' },
      { label: 'Find skill gaps', icon: 'target', target: 'career-lab.html' },
      { label: 'Practice interview', icon: 'video', target: 'interview-studio.html' },
      { label: 'Explore jobs', icon: 'briefcase', target: 'mentor-jobs.html' },
    ],
    upcomingTasks: [
      ...(dashboard.resume_status !== 'processed' ? [{ type: 'resume', title: 'Analyze your resume', due: 'Improve your ATS score' }] : []),
      ...(roadmapProgress < 100 ? [{ type: 'learning', title: 'Continue your career roadmap', due: `${roadmapProgress}% complete` }] : []),
      ...(interviewHistory.length === 0 ? [{ type: 'interview', title: 'Complete a practice interview', due: 'Build interview confidence' }] : []),
    ],
    weeklyProgress: Object.entries(analytics.weekly_activity || {}).map(([label, value]) => ({ label, value })),
    skillGrowth: (dashboard.skill_progress ? [{ label: dashboard.skill_progress.target_role, value: latestSkill }] : []),
      resumeTimeline: resumeHistory.map((item) => ({ label: new Date(item.created_at).toLocaleDateString(), value: item.ats_score || 0 })),
      interviewPerformance: interviewHistory.map((item) => ({ label: new Date(item.created_at).toLocaleDateString(), value: item.overall_score || 0 })),
    };

    const email = getItem('user_email', 'student@careeriq.dev');
    const firstName = data.user?.name?.split(' ')[0] || email.split('@')[0];
    document.getElementById('greeting-text').textContent = `Good to see you, ${firstName}`;
    document.getElementById('streak-text').textContent = `${data.user.streak}-day streak · Level ${dashboard.level || 1} · ${dashboard.xp || 0} XP`;
    document.getElementById('resume-timeline-chart').closest('.card').querySelector('.card-header h4').textContent = `Resume history (${resumeHistory.length})`;
    document.getElementById('interview-perf-chart').closest('.card').querySelector('.card-header h4').textContent = `Interview history (${interviewHistory.length})`;

    renderWidgets(data.widgets);
    renderQuickActions(data.quickActions);
    renderTasks(data.upcomingTasks, getItem('completed_tasks', []));

    renderLineChart(document.getElementById('weekly-chart'), data.weeklyProgress, { color: '#5B7CFA' });
    renderLineChart(document.getElementById('skill-growth-chart'), data.skillGrowth, { color: '#9B6BFF' });
    renderLineChart(document.getElementById('resume-timeline-chart'), data.resumeTimeline.reverse(), { color: '#34D9E8' });
    renderBarChart(document.getElementById('interview-perf-chart'), data.interviewPerformance, { color: '#34D399' });
  } catch (error) {
    renderEmptyDashboard();
    toast.error(error.message || 'Unable to load your dashboard. Please try again.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard, { once: true });
} else {
  initDashboard();
}

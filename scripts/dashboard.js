// dashboard.js — page-specific logic for pages/dashboard.html
import { api } from './api/client.js';
import { renderLineChart, renderBarChart } from './charts.js';
import { getItem, setItem } from './storage.js';

const TASK_ICONS = { learning: 'book-open', interview: 'video', jobs: 'briefcase', resume: 'file-text' };

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
      <div class="stat-value">${item.value}%</div>
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
      <span style="font-size: var(--text-sm); font-weight:600;">${a.label}</span>
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
        <div style="font-size: var(--text-sm); font-weight:500; ${completed ? 'text-decoration:line-through;' : ''}">${task.title}</div>
        <div class="text-tertiary" style="font-size: var(--text-xs);">${task.due}</div>
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

async function init() {
  const [dashboard, analytics] = await Promise.all([api.get('/dashboard'), api.get('/dashboard/analytics')]);
  const latestInterview = dashboard.interview_history?.[0]?.overall_score || 0;
  const latestSkill = dashboard.skill_progress?.match_score || 0;
  const latestResume = dashboard.resume_status === 'processed' ? 100 : 0;
  const roadmapProgress = dashboard.roadmap_progress?.length
    ? Math.round(dashboard.roadmap_progress.reduce((sum, item) => sum + Number(item.progress || 0), 0) / dashboard.roadmap_progress.length)
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
    upcomingTasks: [],
    weeklyProgress: Object.entries(analytics.weekly_activity || {}).map(([label, value]) => ({ label, value })),
    skillGrowth: (dashboard.skill_progress ? [{ label: dashboard.skill_progress.target_role, value: latestSkill }] : []),
    resumeTimeline: [],
    interviewPerformance: dashboard.interview_history.map((item) => ({ label: new Date(item.created_at).toLocaleDateString(), value: item.overall_score || 0 })),
  };

  const email = getItem('user_email', 'student@careeriq.dev');
  const firstName = data.user?.name?.split(' ')[0] || email.split('@')[0];
  document.getElementById('greeting-text').textContent = `Good to see you, ${firstName}`;
  document.getElementById('streak-text').textContent = `${data.user.streak}-day streak`;

  renderWidgets(data.widgets);
  renderQuickActions(data.quickActions);
  renderTasks(data.upcomingTasks, getItem('completed_tasks', []));

  renderLineChart(document.getElementById('weekly-chart'), data.weeklyProgress, { color: '#5B7CFA' });
  renderLineChart(document.getElementById('skill-growth-chart'), data.skillGrowth, { color: '#9B6BFF' });
  renderLineChart(document.getElementById('resume-timeline-chart'), data.resumeTimeline.map((r) => ({ label: r.version, value: r.score })).reverse(), { color: '#34D9E8' });
  renderBarChart(document.getElementById('interview-perf-chart'), data.interviewPerformance, { color: '#34D399' });
}

document.addEventListener('DOMContentLoaded', init);

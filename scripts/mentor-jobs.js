// mentor-jobs.js — page-specific logic for pages/mentor-jobs.html
import { api } from './api/client.js';
import { toast } from './toast.js';
import { getItem, setItem } from './storage.js';

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

/* ---------------- Mentor tab ---------------- */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderMarkdown(value) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function messageBubble(msg) {
  const isUser = msg.role === 'user';
  return `
    <div style="display:flex; ${isUser ? 'justify-content:flex-end;' : ''} gap: var(--space-3);">
      ${!isUser ? `<div class="card-icon" style="width:32px;height:32px; flex-shrink:0;"><i data-lucide="sparkles" width="16" height="16"></i></div>` : ''}
      <div style="max-width:75%;">
        <div style="padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); line-height:1.6;
          background: ${isUser ? 'var(--gradient-ai)' : 'var(--surface-input)'}; color: ${isUser ? '#fff' : 'var(--text-primary)'};">
          ${isUser ? escapeHtml(msg.text) : renderMarkdown(msg.text)}
        </div>
        ${msg.sources?.length ? `<div style="display:flex; gap:4px; margin-top: var(--space-2); flex-wrap:wrap;">
          ${msg.sources.map((s) => `<span class="badge badge-blue" style="font-size:10px;"><i data-lucide="link-2" width="10" height="10"></i> ${s.title}</span>`).join('')}
        </div>` : ''}
      </div>
    </div>`;
}

function appendMessage(container, msg) {
  const div = document.createElement('div');
  div.innerHTML = messageBubble(msg);
  container.appendChild(div.firstElementChild);
  container.scrollTop = container.scrollHeight;
  if (window.lucide) window.lucide.createIcons();
}

function initMentorTab(mentorData) {
  const chatMessages = document.getElementById('chat-messages');
  mentorData.conversation.forEach((msg) => appendMessage(chatMessages, msg));

  document.getElementById('suggested-questions').innerHTML = mentorData.suggestedQuestions
    .map((q) => `<button class="badge badge-blue" data-suggested-q style="cursor:pointer;">${q}</button>`)
    .join('');

  document.getElementById('mentor-documents').innerHTML = mentorData.documents
    .map((d) => `<li style="display:flex; align-items:center; gap: var(--space-2); font-size: var(--text-xs);"><i data-lucide="file-text" width="14" height="14" style="color:var(--text-tertiary);"></i>${d.title}</li>`)
    .join('');

  document.getElementById('mentor-history').innerHTML = mentorData.history
    .map((h) => `<li style="font-size: var(--text-xs);"><div style="font-weight:500; color:var(--text-primary);">${h.title}</div><div class="text-tertiary">${h.date}</div></li>`)
    .join('');

  function sendMessage(text) {
    if (!text.trim()) return;
    appendMessage(chatMessages, { role: 'user', text, sources: [] });
    document.getElementById('chat-input').value = '';

    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = `<div style="display:flex; gap: var(--space-3);"><div class="card-icon" style="width:32px;height:32px;"><i data-lucide="sparkles" width="16" height="16"></i></div><div class="skeleton skeleton-text w-40" style="width:80px;"></div></div>`;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    api.post('/rag/ask', { question: text })
      .then((reply) => {
      document.getElementById('typing-indicator')?.remove();
      appendMessage(chatMessages, { role: 'assistant', text: reply.answer || reply.response || '', sources: reply.sources || [] });
      })
      .catch((error) => { document.getElementById('typing-indicator')?.remove(); toast.error(error.message); });
  }

  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(document.getElementById('chat-input').value);
  });

  document.querySelectorAll('[data-suggested-q]').forEach((btn) => {
    btn.addEventListener('click', () => sendMessage(btn.textContent));
  });

  if (window.lucide) window.lucide.createIcons();
}

/* ---------------- Jobs tab ---------------- */

function jobCard(job, savedJobs) {
  const isSaved = savedJobs.includes(job.id);
  const salaryLabel = job.isInternship
    ? `₹${(job.salaryMin / 1000).toFixed(0)}k–₹${(job.salaryMax / 1000).toFixed(0)}k /month`
    : `₹${(job.salaryMin / 100000).toFixed(1)}L–₹${(job.salaryMax / 100000).toFixed(1)}L /year`;

  return `
    <div class="card card-hover" data-job-card="${job.id}">
      <div class="card-header">
        <div>
          <h5 style="margin-bottom:2px;">${job.title}</h5>
          <span class="text-tertiary" style="font-size: var(--text-xs);">${job.company} · ${job.location}${job.remote ? ' · Remote' : ''}</span>
        </div>
        <button class="btn-icon" data-bookmark-btn="${job.id}" aria-label="Bookmark job">
          <i data-lucide="bookmark" width="16" height="16" ${isSaved ? 'fill="currentColor"' : ''} style="color:${isSaved ? 'var(--blue)' : 'var(--text-tertiary)'}"></i>
        </button>
      </div>
      <div style="display:flex; align-items:center; gap: var(--space-3); margin-bottom: var(--space-4);">
        <div class="ring-wrap" style="width:44px;height:44px;">
          <svg width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--surface-input)" stroke-width="5"/>
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--blue)" stroke-width="5" stroke-linecap="round"
              stroke-dasharray="${2 * Math.PI * 18}" stroke-dashoffset="${2 * Math.PI * 18 * (1 - job.matchPercentage / 100)}"
              transform="rotate(-90 22 22)"/>
          </svg>
        </div>
        <div>
          <div style="font-weight:700; font-size: var(--text-sm);">${job.matchPercentage}% match</div>
          <div class="text-tertiary" style="font-size: var(--text-xs);">${salaryLabel}</div>
        </div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap: var(--space-2); margin-bottom: var(--space-4);">
        ${job.skills.map((s) => `<span class="badge">${s}</span>`).join('')}
        ${job.isInternship ? '<span class="badge badge-purple">Internship</span>' : ''}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="text-tertiary" style="font-size: var(--text-xs);">Posted ${job.postedDaysAgo}d ago</span>
        <button class="btn btn-primary btn-sm">View & Apply</button>
      </div>
    </div>`;
}

function initJobsTab(jobsData) {
  let savedJobs = getItem('saved_jobs', jobsData.savedJobs || []);

  document.getElementById('job-location-filter').innerHTML +=
    jobsData.filters.locations.map((l) => `<option>${l}</option>`).join('');

  document.getElementById('trending-skills').innerHTML = jobsData.trendingSkills
    .map((s) => `<span class="badge badge-blue"><i data-lucide="trending-up" width="12" height="12"></i> ${s}</span>`)
    .join('');

  function render() {
    const locationFilter = document.getElementById('job-location-filter').value;
    const remoteFilter = document.getElementById('job-remote-filter').value;
    const searchFilter = document.getElementById('job-search-input').value.toLowerCase();

    const filtered = jobsData.recommendations.filter((job) => {
      if (locationFilter && !job.location.includes(locationFilter) && !(locationFilter === 'Remote' && job.remote)) return false;
      if (remoteFilter === 'remote' && !job.remote) return false;
      if (remoteFilter === 'onsite' && job.remote) return false;
      if (searchFilter && !`${job.title} ${job.company}`.toLowerCase().includes(searchFilter)) return false;
      return true;
    });

    const grid = document.getElementById('jobs-grid');
    if (!filtered.length) {
      grid.innerHTML = `<div class="state-block" style="grid-column: 1/-1;">
        <div class="state-icon"><i data-lucide="search-x"></i></div>
        <h5>No jobs match those filters</h5>
        <p>Try widening your location or work-type filters.</p>
      </div>`;
    } else {
      grid.innerHTML = filtered.map((job) => jobCard(job, savedJobs)).join('');
    }
    if (window.lucide) window.lucide.createIcons();

    document.querySelectorAll('[data-bookmark-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-bookmark-btn');
        const request = savedJobs.includes(id) ? api.request(`/jobs/${id}/bookmark`, { method: 'DELETE' }) : api.post(`/jobs/${id}/bookmark`, {});
        request.then(() => {
          if (savedJobs.includes(id)) { savedJobs = savedJobs.filter((j) => j !== id); toast.info('Removed from saved jobs.'); }
          else { savedJobs.push(id); toast.success('Job bookmarked.'); }
          setItem('saved_jobs', savedJobs);
          render();
        }).catch((error) => toast.error(error.message));
      });
    });

    document.querySelectorAll('[data-job-card] .btn-primary').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const job = jobsData.recommendations.find((item) => String(item.id) === btn.closest('[data-job-card]')?.dataset.jobCard);
        if (!jobsData.resumeId || !job?.description) { toast.info('Opening application flow...'); return; }
        try {
          const match = await api.post('/job-match', { resume_id: jobsData.resumeId, job_id: job.id, job_description: job.description });
          toast.success(`Resume match: ${match.match_percentage || 0}%`);
        } catch (error) { toast.error(error.message); }
      });
    });
  }

  ['job-location-filter', 'job-remote-filter'].forEach((id) => document.getElementById(id).addEventListener('change', render));
  document.getElementById('job-search-input').addEventListener('input', render);

  render();
}

async function init() {
  initTabs();
  const [jobs, resumes] = await Promise.all([api.get('/jobs/recommendations'), api.get('/resumes')]);
  const mentorData = { conversation: [], suggestedQuestions: [], documents: [], history: [] };
  const jobsData = { resumeId: resumes?.[0]?.id, savedJobs: getItem('saved_jobs', []), recommendations: (jobs || []).map((job) => ({ ...job, matchPercentage: job.match_percentage || job.matchPercentage || 0, isInternship: job.is_internship || job.isInternship, salaryMin: job.salary_min || job.salaryMin || 0, salaryMax: job.salary_max || job.salaryMax || 0, postedDaysAgo: job.posted_days_ago || job.postedDaysAgo || 0, skills: job.skills || [] })), filters: { locations: [] }, trendingSkills: [] };
  initMentorTab(mentorData);
  initJobsTab(jobsData);
}

document.addEventListener('DOMContentLoaded', init);

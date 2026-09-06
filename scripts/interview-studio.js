// interview-studio.js — page-specific logic for pages/interview-studio.html
import { api } from './api/client.js';
import { renderRing, renderLineChart } from './charts.js';
import { startSimulatedTracking, stopSimulatedTracking, bindMeterElements, updateMeters, getRandomSuggestion } from './vision-ai.js';
import { toast } from './toast.js';

let interviewData = null;
let questionIndex = 0;
let elapsedSeconds = 0;
let timerInterval = null;
let stopTracking = null;
let sessionId = null;
let currentQuestionId = null;

function showView(view) {
  ['setup', 'live', 'report'].forEach((v) => {
    document.getElementById(`${v}-view`).style.display = v === view ? 'block' : 'none';
  });
}

function formatTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function renderHistory(history) {
  document.getElementById('interview-history-list').innerHTML = history
    .map(
      (h) => `<li style="display:flex; justify-content:space-between; align-items:center; padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-input);">
        <div>
          <div style="font-weight:600; font-size: var(--text-sm);">${h.type} Interview</div>
          <div class="text-tertiary" style="font-size: var(--text-xs);">${h.date}</div>
        </div>
        <span class="badge badge-blue">${h.score}%</span>
      </li>`
    )
    .join('');
}

function loadQuestion(question) {
  const q = question || interviewData.questions[questionIndex] || interviewData.questions[interviewData.questions.length - 1];
  currentQuestionId = q.id;
  document.getElementById('question-category-badge').textContent = q.category;
  document.getElementById('current-question').textContent = q.question;
  document.getElementById('question-progress').textContent = `Question ${questionIndex + 1} of ${interviewData.questions.length}`;
  document.getElementById('live-transcript').textContent = '';
  // Simulate a transcript "typing in" over a couple seconds.
  let i = 0;
  const full = interviewData.liveTranscript;
  clearInterval(window.__transcriptTimer);
  window.__transcriptTimer = setInterval(() => {
    i += 4;
    document.getElementById('live-transcript').textContent = full.slice(0, i);
    if (i >= full.length) clearInterval(window.__transcriptTimer);
  }, 40);
}

async function startInterview() {
  const type = document.getElementById('interview-type-select').value;
  const role = document.getElementById('target-role-input').value || 'Frontend Developer';

  try {
    const started = await api.post('/interviews/start', { interview_type: type, target_role: role });
    sessionId = started.session.id;
    interviewData = { questions: [started.first_question], liveTranscript: '', liveMetrics: { confidence: 0 } };
    document.getElementById('live-interview-label').textContent = `${type} Interview · ${role}`;
    questionIndex = 0;
    elapsedSeconds = 0;
    loadQuestion(started.first_question);
  } catch (error) { toast.error(error.message); return; }
  showView('live');

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    document.getElementById('live-timer').textContent = formatTime(elapsedSeconds);
  }, 1000);

  renderRing(document.getElementById('confidence-ring'), { value: interviewData.liveMetrics.confidence, caption: 'Confidence', label: `${interviewData.liveMetrics.confidence}%`, size: 120 });

  const meterEls = bindMeterElements(document.querySelector('.studio-grid'));
  stopTracking = startSimulatedTracking((metrics) => {
    updateMeters(meterEls, metrics);
    const ringLabel = document.querySelector('#confidence-ring .ring-label .value');
    if (ringLabel) ringLabel.textContent = `${metrics.confidence}%`;
    const ringValue = document.querySelector('#confidence-ring .ring-value');
    if (ringValue) {
      const circumference = 2 * Math.PI * 55;
      ringValue.style.strokeDashoffset = circumference - (metrics.confidence / 100) * circumference;
    }
  });

  let suggestionTimer = setInterval(() => {
    document.getElementById('live-suggestion').textContent = getRandomSuggestion();
  }, 6000);
  document.getElementById('live-suggestion').textContent = getRandomSuggestion();
  window.__suggestionTimer = suggestionTimer;

  if (window.lucide) window.lucide.createIcons();
}

async function endInterview() {
  clearInterval(timerInterval);
  clearInterval(window.__suggestionTimer);
  clearInterval(window.__transcriptTimer);
  if (stopTracking) stopTracking();

  try {
    const report = await api.post(`/interviews/${sessionId}/end`, {});
    renderReport(report);
    showView('report');
    toast.success('Report ready!');
  } catch (error) { toast.error(error.message); }
}

function renderReport(report) {
  renderRing(document.getElementById('report-overall-ring'), { value: report.overall_score || 0, caption: 'Overall', label: `${report.overall_score || 0}%`, colorFrom: '#5B7CFA', colorTo: '#34D399' });
  document.getElementById('report-confidence').textContent = `${report.confidence_score || 0}%`;
  document.getElementById('report-communication').textContent = `${report.communication_score || 0}%`;
  document.getElementById('report-technical').textContent = `${report.technical_score || 0}%`;

  renderLineChart(document.getElementById('eye-contact-chart'), report.eyeContactOverTime, { color: '#5B7CFA' });

  document.getElementById('report-strengths').innerHTML = (report.strengths || [])
    .map((s) => `<li style="display:flex; gap: var(--space-2); font-size: var(--text-sm);"><i data-lucide="check-circle" width="16" height="16" style="color:var(--emerald); flex-shrink:0; margin-top:2px;"></i>${s}</li>`)
    .join('');
  document.getElementById('report-weaknesses').innerHTML = (report.weaknesses || [])
    .map((w) => `<li style="display:flex; gap: var(--space-2); font-size: var(--text-sm);"><i data-lucide="alert-circle" width="16" height="16" style="color:var(--amber); flex-shrink:0; margin-top:2px;"></i>${w}</li>`)
    .join('');
  document.getElementById('report-suggestions').innerHTML = (report.feedback ? [report.feedback] : [])
    .map((s) => `<li style="display:flex; gap: var(--space-2); font-size: var(--text-sm);"><i data-lucide="lightbulb" width="16" height="16" style="color:var(--blue); flex-shrink:0; margin-top:2px;"></i>${s}</li>`)
    .join('');

  if (window.lucide) window.lucide.createIcons();
}

async function init() {
  const dashboard = await api.get('/dashboard');
  renderHistory((dashboard.interview_history || []).map((item) => ({ type: 'Mock', date: new Date(item.created_at).toLocaleDateString(), score: item.overall_score || 0 })));

  document.getElementById('start-interview-btn').addEventListener('click', startInterview);
  document.getElementById('end-interview-btn').addEventListener('click', endInterview);
  document.getElementById('next-question-btn').addEventListener('click', async () => {
    const transcript = document.getElementById('live-transcript').textContent.trim() || 'No transcript captured';
    try {
      await api.post(`/interviews/${sessionId}/answer`, { question_id: currentQuestionId, transcript, time_taken_seconds: elapsedSeconds });
      const next = await api.get(`/interviews/${sessionId}/next-question`);
      questionIndex += 1;
      interviewData.questions.push(next);
      loadQuestion(next);
    } catch (error) { toast.error(error.message); }
  });
  document.getElementById('pause-btn').addEventListener('click', (e) => {
    const isPaused = e.currentTarget.dataset.paused === 'true';
    if (isPaused) {
      timerInterval = setInterval(() => { elapsedSeconds++; document.getElementById('live-timer').textContent = formatTime(elapsedSeconds); }, 1000);
      e.currentTarget.innerHTML = '<i data-lucide="pause" width="18" height="18"></i> Pause';
      e.currentTarget.dataset.paused = 'false';
    } else {
      clearInterval(timerInterval);
      e.currentTarget.innerHTML = '<i data-lucide="play" width="18" height="18"></i> Resume';
      e.currentTarget.dataset.paused = 'true';
    }
    if (window.lucide) window.lucide.createIcons();
  });
  document.getElementById('new-interview-btn').addEventListener('click', () => showView('setup'));
  document.getElementById('download-interview-report-btn').addEventListener('click', () => {
    toast.info('Generating PDF report... (connect a backend export endpoint to enable real downloads)');
  });
}

document.addEventListener('DOMContentLoaded', init);

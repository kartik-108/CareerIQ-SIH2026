import { api } from './api/client.js';
import { renderRing } from './charts.js';
import { renderInterviewChart } from './charts/interviewCharts.js';
import { VisionEngine, retryVisionModels, stopMediaPipeTracking, switchCamera } from './vision/mediapipe.js';
import { SpeechAnalyzer, highlightFillers } from './speech/speechAnalyzer.js';
import { InterviewVoice } from './speech/interviewVoice.js';
import { toast } from './toast.js';
import { getCurrentUser } from './api/auth.js';

let session = null;
let questionNumber = 1;
let elapsedSeconds = 0;
let timerInterval;
let stopVision;
let visionEngine;
let speech;
let voice;
let visionMetrics = {};
let speechMetrics = {};
let answerHistory = [];
let lastConfidenceRender = 0;
let currentQuestionText = '';
let currentSpokenIntro = '';
let userName = 'there';
let interviewEnding = false;
const INTERVIEW_STATES = Object.freeze({ IDLE: 'IDLE', LOADING: 'LOADING', QUESTION_ACTIVE: 'QUESTION_ACTIVE', LISTENING: 'LISTENING', THINKING: 'THINKING', NEXT_QUESTION: 'NEXT_QUESTION', INTERVIEW_COMPLETE: 'INTERVIEW_COMPLETE', REPORT_READY: 'REPORT_READY' });
let interviewState = INTERVIEW_STATES.IDLE;
let questionSeconds = 60;
let questionTimer;
let pageHidden = false;
let listenersBound = false;
let loadingTimer;

const $ = (id) => document.getElementById(id);
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
function clearInterviewTimer() { clearInterval(timerInterval); timerInterval = null; }
function updateVoiceStatus() {
  const indicator = $('ai-speaking-status');
  if (!indicator) return;
  const labels = { [INTERVIEW_STATES.THINKING]: '🟡 Thinking...', [INTERVIEW_STATES.QUESTION_ACTIVE]: '⚪ Ready.', [INTERVIEW_STATES.LISTENING]: '🟢 Listening...' };
  indicator.textContent = labels[interviewState] || indicator.textContent;
}
function setInterviewState(next) { interviewState = next; document.querySelector('.interview-studio-page')?.classList.toggle('is-live', ![INTERVIEW_STATES.IDLE, INTERVIEW_STATES.REPORT_READY].includes(next)); updateVoiceStatus(); }
function clearQuestionTimer() { clearInterval(questionTimer); questionTimer = null; }
function updateCountdown() { $('question-countdown').textContent = formatTime(questionSeconds); }
function startQuestionTimer() { clearQuestionTimer(); questionSeconds = 60; updateCountdown(); questionTimer = setInterval(() => { if (pageHidden || interviewState === INTERVIEW_STATES.THINKING) return; questionSeconds -= 1; updateCountdown(); if (questionSeconds <= 0) nextQuestion({ automatic: true }).catch(() => {}); }, 1000); }
function startLoadingSteps() {
  const steps = ['Initializing session.', 'Loading resume.', 'Preparing questions.', 'Ready.'];
  let index = 0;
  clearInterval(loadingTimer);
  $('start-interview-btn').dataset.loadingLabel = $('start-interview-btn').textContent.trim();
  $('start-interview-btn').textContent = steps[index];
  loadingTimer = setInterval(() => { index = Math.min(index + 1, steps.length - 1); $('start-interview-btn').textContent = steps[index]; if (index === steps.length - 1) clearInterval(loadingTimer); }, 700);
}
function stopLoadingSteps() { clearInterval(loadingTimer); loadingTimer = null; const button = $('start-interview-btn'); if (button) button.innerHTML = '<i data-lucide="video" width="18" height="18"></i> Start interview'; }
function cleanupInterviewResources() {
  clearInterviewTimer();
  clearQuestionTimer();
  voice?.stop();
  speech?.stop();
  speech = null;
  stopVision?.();
  stopVision = null;
  stopMediaPipeTracking();
  visionEngine = null;
  $('interview-camera')?.srcObject?.getTracks?.().forEach((track) => track.stop());
  if ($('interview-camera')) $('interview-camera').srcObject = null;
}

function showView(view) { ['setup', 'live', 'report'].forEach((name) => { $(`${name}-view`).style.display = name === view ? 'block' : 'none'; }); }

function renderHistory(history) {
  $('interview-history-list').innerHTML = (history || []).map((item) => {
    const report = Array.isArray(item.interview_reports) ? item.interview_reports[0] : item.interview_reports;
    const score = report?.overall_score ?? item.overall_score;
    const status = item.status === 'completed' ? 'Completed' : 'In progress';
    return `<li style="display:flex; justify-content:space-between; align-items:center; padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-input);"><div><div style="font-weight:600; font-size:var(--text-sm);">${item.interview_type || 'Mock'} · ${item.target_role || 'Interview'}</div><div class="text-tertiary" style="font-size:var(--text-xs);">${item.started_at ? new Date(item.started_at).toLocaleDateString() : 'Recently'} · ${status}</div></div><span class="badge badge-blue">${score == null ? status : `${score}%`}</span></li>`;
  }).join('');
}

function renderQuestion(question) {
  if (!question) throw new Error('The interviewer did not return a question.');
  currentQuestionText = question.question_text || question.question || '';
  currentSpokenIntro = question.spokenIntro || question.spoken_intro || '';
  $('question-category-badge').textContent = question.category || question.type || 'Interview';
  $('question-difficulty-badge').textContent = question.difficulty || 'Easy';
  $('current-question').textContent = currentQuestionText;
  $('question-progress').textContent = `Question ${questionNumber} of ${session?.number_of_questions || 6}`;
  $('question-hint').textContent = question.followUpHint || question.hint || 'Use a concrete example, explain your decisions, and describe the result.';
  $('question-hint').hidden = true;
  $('live-transcript').textContent = '';
  startQuestionTimer();
  setInterviewState(INTERVIEW_STATES.QUESTION_ACTIVE);
}

function updateMetrics(metrics) {
  visionMetrics = { ...visionMetrics, ...metrics };
  const values = { eyeContact: metrics.eyeContact || 0, smile: metrics.smile || 0, blinkRate: metrics.blinkRate || 0, posture: metrics.posture || 0, headStability: Math.max(0, 100 - (metrics.headMovement || 0)), speakingPace: speechMetrics.speakingPace || 0 };
  Object.entries(values).forEach(([key, value]) => { const root = document.querySelector(`[data-metric="${key}"]`); if (!root) return; root.querySelector('[data-metric-value]').textContent = `${Math.round(value)}%`; root.querySelector('[data-metric-fill]').style.width = `${Math.round(value)}%`; });
  const confidence = Math.round(metrics.confidence || 0);
  if (performance.now() - lastConfidenceRender > 1000) { renderRing($('confidence-ring'), { value: confidence, caption: 'Confidence', label: `${confidence}%`, size: 120 }); lastConfidenceRender = performance.now(); }
  $('live-suggestion').textContent = metrics.eyeContact < 55 ? 'Try looking at the camera between thoughts.' : metrics.posture < 55 ? 'Lift your shoulders gently and sit tall.' : speechMetrics.fillers ? `You have used ${speechMetrics.fillers} filler words. Pause instead.` : 'Your live signals look steady. Keep going.';
}

function updateSpeech(metrics) {
  speechMetrics = metrics;
  $('live-transcript').innerHTML = highlightFillers(metrics.transcript || '');
  const pace = document.querySelector('[data-metric="speakingPace"]');
  if (pace) { pace.querySelector('[data-metric-value]').textContent = `${metrics.wpm || 0} WPM`; pace.querySelector('[data-metric-fill]').style.width = `${metrics.speakingPace || 0}%`; }
  if (performance.now() - lastConfidenceRender > 1000) { renderRing($('confidence-ring'), { value: metrics.confidence || 0, caption: 'Speech confidence', label: `${metrics.confidence || 0}%`, size: 120 }); lastConfidenceRender = performance.now(); }
  $('live-suggestion').textContent = metrics.fillers ? `${metrics.fillers} filler word${metrics.fillers === 1 ? '' : 's'} detected. Pause briefly instead of filling the silence.` : `Speech clarity ${metrics.clarity}% · ${metrics.pauseDuration}s total pause time.`;
  visionMetrics = { ...visionMetrics, speech: metrics };
}

function setAiSpeaking(isSpeaking) {
  const indicator = $('ai-speaking-status');
  const nextButton = $('next-question-btn');
  if (indicator) {
    indicator.textContent = isSpeaking ? '🟣 AI Speaking...' : interviewState === INTERVIEW_STATES.THINKING ? '🟡 Thinking...' : interviewState === INTERVIEW_STATES.QUESTION_ACTIVE ? '⚪ Ready.' : '🟢 Listening...';
    indicator.classList.toggle('animate-pulse-ring', isSpeaking);
  }
  if (nextButton) nextButton.disabled = isSpeaking;
}

function startAnswerTimer() {
  clearInterviewTimer();
  timerInterval = setInterval(() => { elapsedSeconds += 1; $('live-timer').textContent = formatTime(elapsedSeconds); }, 1000);
}

function beginListening() {
  if (interviewEnding || interviewState === INTERVIEW_STATES.INTERVIEW_COMPLETE) return;
  setInterviewState(INTERVIEW_STATES.LISTENING);
  speech?.stop();
  speech = new SpeechAnalyzer({ onUpdate: updateSpeech });
  if (!speech.start()) $('camera-warning').textContent = 'Microphone unavailable. You can continue with camera-only feedback.';
  startAnswerTimer();
}

async function speakAsInterviewer(text, startListening = true) {
  speech?.stop();
  speech = null;
  clearInterviewTimer();
  setAiSpeaking(true);
  await voice?.speakQuestion(text);
  setAiSpeaking(false);
  if (startListening) beginListening();
}

async function speakGreetingAndQuestion() {
  speech?.stop();
  speech = null;
  clearInterviewTimer();
  setAiSpeaking(true);
  await voice?.speakQuestion(`Hello ${userName}. Welcome to your ${$('target-role-input').value.trim()} interview.`);
  await voice?.speakQuestion([currentSpokenIntro, currentQuestionText].filter(Boolean).join(' '));
  setAiSpeaking(false);
  beginListening();
}

async function speakCurrentQuestion() {
  await speakAsInterviewer([currentSpokenIntro, currentQuestionText].filter(Boolean).join(' '));
}

function createVoiceControls() {
  const controls = $('end-interview-btn').parentElement;
  if ($('interview-voice-controls')) return;
  const status = document.createElement('span');
  status.id = 'ai-speaking-status';
  status.className = 'text-tertiary';
  status.textContent = 'Listening for your answer';
  status.style.cssText = 'display:flex; align-items:center; min-width:150px; font-size:var(--text-xs);';
  const muteButton = document.createElement('button');
  muteButton.id = 'mute-ai-voice-btn';
  muteButton.className = 'btn btn-ghost btn-sm';
  const replayButton = document.createElement('button');
  replayButton.id = 'replay-question-btn';
  replayButton.className = 'btn btn-ghost btn-sm';
  replayButton.textContent = 'Replay question';
  const pauseButton = document.createElement('button');
  pauseButton.id = 'pause-ai-voice-btn';
  pauseButton.className = 'btn btn-ghost btn-sm';
  pauseButton.textContent = 'Pause voice';
  const voiceSelect = document.createElement('select');
  voiceSelect.id = 'interview-voice-select';
  voiceSelect.className = 'btn btn-ghost btn-sm';
  voiceSelect.setAttribute('aria-label', 'Interviewer voice');
  const speed = document.createElement('input');
  speed.type = 'range'; speed.min = '0.8'; speed.max = '1.3'; speed.step = '0.05'; speed.className = 'interview-voice-slider'; speed.setAttribute('aria-label', 'Voice speed');
  const pitch = document.createElement('input');
  pitch.type = 'range'; pitch.min = '0.7'; pitch.max = '1.3'; pitch.step = '0.05'; pitch.className = 'interview-voice-slider'; pitch.setAttribute('aria-label', 'Voice pitch');
  const volume = document.createElement('input');
  volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '0.05'; volume.className = 'interview-voice-slider'; volume.setAttribute('aria-label', 'Voice volume');
  const updateMuteLabel = () => { muteButton.textContent = voice?.isMuted() ? 'Unmute AI voice' : 'Mute AI voice'; };
  muteButton.addEventListener('click', () => { voice?.setMuted(!voice.isMuted()); updateMuteLabel(); if (voice?.isMuted()) beginListening(); });
  replayButton.textContent = '🔊 Hear question again';
  replayButton.addEventListener('click', () => speakCurrentQuestion());
  pauseButton.addEventListener('click', () => { if (voice?.isSpeaking()) { voice.pause(); pauseButton.textContent = 'Resume voice'; } else { voice?.resume(); pauseButton.textContent = 'Pause voice'; } });
  const wrapper = document.createElement('div');
  wrapper.id = 'interview-voice-controls';
  wrapper.style.cssText = 'display:flex; align-items:center; gap:var(--space-2); flex-wrap:wrap;';
  wrapper.append(status, muteButton, replayButton, pauseButton);
  wrapper.append(voiceSelect, speed, pitch, volume);
  controls.prepend(wrapper);
  const preferences = voice?.getPreferences() || {};
  speed.value = preferences.rate || 0.98; pitch.value = preferences.pitch || 1.02; volume.value = preferences.volume || 1;
  const populateVoices = () => { voiceSelect.innerHTML = ''; const voices = voice?.getVoices() || []; if (!voices.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'System default (English)'; voiceSelect.append(option); } voices.forEach((item) => { const option = document.createElement('option'); option.value = item.name; option.textContent = item.name; option.selected = item.name === voice?.getPreferences().voiceName; voiceSelect.append(option); }); };
  populateVoices();
  voice?.voiceReady?.then(populateVoices).catch(() => {});
  voiceSelect.addEventListener('change', () => voice?.setPreferences({ voiceName: voiceSelect.value }));
  speed.addEventListener('input', () => voice?.setPreferences({ rate: speed.value }));
  pitch.addEventListener('input', () => voice?.setPreferences({ pitch: pitch.value }));
  volume.addEventListener('input', () => voice?.setPreferences({ volume: volume.value }));
  updateMuteLabel();
}

function setCameraLoading(isLoading) {
  $('camera-status').innerHTML = isLoading ? '<span class="processing-spinner" style="display:inline-block; width:16px; height:16px; border-width:2px; vertical-align:middle; margin-right:var(--space-2);"></span>Initializing camera...' : $('camera-status').textContent;
}

function showCameraRetry() {
  const stage = $('camera-stage');
  let retryButton = $('retry-camera-btn');
  if (!retryButton) {
    retryButton = document.createElement('button');
    retryButton.id = 'retry-camera-btn';
    retryButton.className = 'btn btn-secondary btn-sm';
    retryButton.textContent = 'Retry Camera';
    retryButton.style.cssText = 'position:absolute; left:50%; top:50%; transform:translate(-50%, -50%);';
    retryButton.addEventListener('click', initializeCamera);
    stage.append(retryButton);
  }
  $('interview-camera').style.display = 'none';
  $('camera-status').textContent = 'Camera unavailable';
}

function showVisionRetry() {
  let retryButton = $('retry-vision-btn');
  if (!retryButton) {
    retryButton = document.createElement('button');
    retryButton.id = 'retry-vision-btn';
    retryButton.className = 'btn btn-secondary btn-sm';
    retryButton.textContent = 'Retry Vision Models';
    retryButton.style.cssText = 'position:absolute; left:50%; top:calc(50% + 40px); transform:translate(-50%, -50%);';
    retryButton.addEventListener('click', async () => {
      retryButton.disabled = true;
      try {
        const models = await retryVisionModels();
        if (!models) {
          toast.error('AI Vision models failed to load.');
          return;
        }
        retryButton.remove();
        await visionEngine?.startTracking();
      } catch { toast.error('AI Vision models failed to load.'); }
      finally { retryButton.disabled = false; }
    });
    $('camera-stage').append(retryButton);
  }
}

async function initializeCamera() {
  const video = $('interview-camera');
  const stage = $('camera-stage');
  const retryButton = $('retry-camera-btn');
  retryButton?.remove();
  video.style.display = 'block';
  setCameraLoading(true);
  $('camera-warning').textContent = '';
  visionEngine?.stopTracking();
  visionEngine = new VisionEngine({ video, canvas: $('face-mesh-canvas'), statusEl: $('camera-status'), warningEl: $('camera-warning') });
  try {
    await Promise.race([visionEngine.startTracking(), new Promise((_, reject) => setTimeout(() => reject(new Error('Camera initialization timed out.')), 3000))]);
    stopVision = () => { visionEngine?.stopTracking(); visionEngine = null; };
    $('camera-status').textContent = 'Camera active';
  } catch (error) {
    visionEngine?.stopTracking();
    visionEngine = null;
    speech?.stop();
    speech = null;
    showCameraRetry();
    const permissionDenied = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';
    if (permissionDenied) toast.error('Camera permission is required for Interview Studio.');
    else toast.error(error.message || 'Camera initialization failed.');
  }
}

async function startInterview() {
  const interviewType = $('interview-type-select').value.trim();
  const targetRole = $('target-role-input').value.trim();
  if (!interviewType || !targetRole) return toast.error('Interview type and target role are required.');
  if (![INTERVIEW_STATES.IDLE, INTERVIEW_STATES.REPORT_READY].includes(interviewState)) return;
  setInterviewState(INTERVIEW_STATES.LOADING);
  startLoadingSteps();
  clearInterviewTimer();
  const startButton = $('start-interview-btn');
  startButton.disabled = true;
  try {
    const started = await api.post('/interview/session', { targetRole, interviewType, difficulty: 'easy' }, { timeout: 20000, retries: 1 });
    session = started.session || { id: started.sessionId, number_of_questions: interviewType === 'Technical' ? 8 : interviewType === 'Behavioral' ? 6 : interviewType === 'HR' ? 5 : 10 };
    session.id = started.sessionId || session.id;
    questionNumber = 1; answerHistory = []; elapsedSeconds = 0; visionMetrics = {}; speechMetrics = {}; interviewEnding = false;
    $('live-interview-label').textContent = `${interviewType} Interview · ${targetRole}`;
    renderQuestion(started.question);
    showView('live');
    voice = new InterviewVoice({ language: 'en-IN', onSpeakingChange: setAiSpeaking, onUnavailable: () => toast.info('Voice unavailable. Using text-only interviewer.') });
    createVoiceControls();
    initializeCamera().catch((error) => { $('camera-warning').textContent = error.message || 'Camera unavailable. You can continue without vision.'; });
    $('mute-ai-voice-btn').textContent = voice.isMuted() ? 'Unmute AI voice' : 'Mute AI voice';
    speakGreetingAndQuestion().catch(() => beginListening());
    if (window.lucide) window.lucide.createIcons();
  } catch (error) { setInterviewState(INTERVIEW_STATES.IDLE); showView('setup'); toast.error(`${error.message || 'Unable to start interview.'} Retry when ready.`); }
  finally { stopLoadingSteps(); startButton.disabled = false; if (window.lucide) window.lucide.createIcons(); }
}

async function submitCurrentAnswer() {
  const transcript = $('live-transcript').textContent.trim() || 'No transcript captured.';
  const result = await api.post('/interview/answer', { sessionId: session.id, questionNumber, transcript, visionMetrics, speechMetrics });
  answerHistory.push(result.feedback || result.answer?.ai_feedback || {});
  if (result.feedback?.improvements?.length) $('live-suggestion').textContent = result.feedback.improvements[0];
  return result;
}

async function nextQuestion() {
  if (!session || [INTERVIEW_STATES.THINKING, INTERVIEW_STATES.NEXT_QUESTION, INTERVIEW_STATES.INTERVIEW_COMPLETE].includes(interviewState)) return;
  setInterviewState(INTERVIEW_STATES.THINKING);
  clearQuestionTimer();
  try {
    const result = await submitCurrentAnswer();
    const improvement = result.feedback?.improvements?.[0] || result.feedback?.suggestions?.[0] || 'Keep your answer focused and connect it to a clear example.';
    setInterviewState(INTERVIEW_STATES.NEXT_QUESTION);
    await speakAsInterviewer(`Thank you. Here's your feedback. ${improvement}`, false);
    const next = await api.post('/interview/question', { sessionId: session.id });
    if (!next.question) { setInterviewState(INTERVIEW_STATES.INTERVIEW_COMPLETE); toast.info('All questions are complete. Generate your report when ready.'); return; }
    questionNumber += 1; renderQuestion(next.question); await speakCurrentQuestion();
  } catch (error) { setInterviewState(INTERVIEW_STATES.QUESTION_ACTIVE); startQuestionTimer(); toast.error(`${error.message || 'Unable to load the next question.'} Retry.`); }
}

async function endInterview() {
  if (!session || interviewState === INTERVIEW_STATES.REPORT_READY) return;
  interviewEnding = true; setInterviewState(INTERVIEW_STATES.INTERVIEW_COMPLETE);
  clearInterviewTimer(); clearQuestionTimer(); speech?.stop(); speech = null; stopVision?.(); stopVision = null; stopMediaPipeTracking(); visionEngine = null;
  $('interview-camera')?.srcObject?.getTracks?.().forEach((track) => track.stop());
  if ($('interview-camera')) $('interview-camera').srcObject = null;
  try {
    await voice?.speakQuestion('Your interview is complete. Generating your CareerIQ report.');
    if ($('live-transcript').textContent.trim()) await submitCurrentAnswer();
    const report = await api.post('/interview/end', { sessionId: session.id });
    renderReport(report); showView('report'); setInterviewState(INTERVIEW_STATES.REPORT_READY); toast.success('Report ready!');
  } catch (error) { setInterviewState(INTERVIEW_STATES.INTERVIEW_COMPLETE); toast.error(`${error.message || 'Unable to generate the report.'} Retry.`); }
  finally { cleanupInterviewResources(); }
}

function renderReport(report) {
  renderRing($('report-overall-ring'), { value: report.overall_score || 0, caption: 'Overall', label: `${report.overall_score || 0}%`, colorFrom: '#5B7CFA', colorTo: '#34D399' });
  $('report-confidence').textContent = `${report.confidence_score || 0}%`; $('report-communication').textContent = `${report.communication_score || 0}%`; $('report-technical').textContent = `${report.technical_score || 0}%`;
  renderInterviewChart($('eye-contact-chart'), answerHistory.map((answer) => answer.confidence || answer.score || 0), { label: 'Confidence trend' }).catch(() => {
    const values = answerHistory.map((answer) => Math.max(0, Math.min(100, answer.confidence || answer.score || 0)));
    $('eye-contact-chart').innerHTML = `<div class="interview-score-bars" aria-label="Confidence trend">${values.map((value, index) => `<span style="height:${Math.max(4, value)}%" title="Question ${index + 1}: ${value}%"></span>`).join('')}</div>`;
  });
  const list = (id, items, icon, color) => { $(id).innerHTML = (items || []).map((item) => `<li style="display:flex; gap:var(--space-2); font-size:var(--text-sm);"><i data-lucide="${icon}" width="16" height="16" style="color:${color}; flex-shrink:0; margin-top:2px;"></i>${String(item).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])}</li>`).join(''); };
  list('report-strengths', report.strengths, 'check-circle', 'var(--emerald)'); list('report-weaknesses', report.weaknesses, 'alert-circle', 'var(--amber)'); list('report-suggestions', report.suggestions, 'lightbulb', 'var(--blue)');
  if (window.lucide) window.lucide.createIcons();
}

async function init() {
  try { renderHistory(await api.get('/interview/history')); } catch { renderHistory([]); }
  try {
    const user = await getCurrentUser();
    userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';
  } catch { userName = 'there'; }
  if (listenersBound) return;
  listenersBound = true;
  $('start-interview-btn').addEventListener('click', startInterview); $('next-question-btn').addEventListener('click', () => nextQuestion()); $('end-interview-btn').addEventListener('click', endInterview);
  $('question-hint-btn').addEventListener('click', () => { const hint = $('question-hint'); hint.hidden = !hint.hidden; });
  $('skip-question-btn').addEventListener('click', () => nextQuestion());
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select')) return;
    if (event.key.toLowerCase() === 'r' && currentQuestionText && interviewState !== INTERVIEW_STATES.INTERVIEW_COMPLETE) speakCurrentQuestion().catch(() => {});
    if (event.key.toLowerCase() === 'm' && voice) { voice.setMuted(!voice.isMuted()); const muteButton = $('mute-ai-voice-btn'); if (muteButton) muteButton.textContent = voice.isMuted() ? 'Unmute AI voice' : 'Mute AI voice'; }
  });
  $('pause-btn').addEventListener('click', (event) => { const paused = event.currentTarget.dataset.paused === 'true'; if (paused) { timerInterval = setInterval(() => { elapsedSeconds += 1; $('live-timer').textContent = formatTime(elapsedSeconds); }, 1000); event.currentTarget.dataset.paused = 'false'; event.currentTarget.innerHTML = '<i data-lucide="pause" width="18" height="18"></i> Pause'; } else { clearInterval(timerInterval); event.currentTarget.dataset.paused = 'true'; event.currentTarget.innerHTML = '<i data-lucide="play" width="18" height="18"></i> Resume'; } if (window.lucide) window.lucide.createIcons(); });
  $('new-interview-btn').addEventListener('click', () => { interviewEnding = false; cleanupInterviewResources(); session = null; setInterviewState(INTERVIEW_STATES.IDLE); showView('setup'); }); $('switch-camera-btn').addEventListener('click', () => switchCamera().catch((error) => toast.error(error.message))); $('toggle-mesh-btn').addEventListener('click', () => { $('face-mesh-canvas').hidden = !$('face-mesh-canvas').hidden; });
  document.addEventListener('visibilitychange', () => { pageHidden = document.hidden; if (pageHidden) { speech?.stop(); voice?.pause(); } else if (interviewState === INTERVIEW_STATES.LISTENING && !interviewEnding) beginListening(); });
  window.addEventListener('pagehide', () => { interviewEnding = true; cleanupInterviewResources(); });
  window.addEventListener('auth:logout', cleanupInterviewResources);
  window.addEventListener('auth:expired', cleanupInterviewResources);
  window.addEventListener('offline', () => { $('camera-warning').textContent = 'Network offline. Transcript and metrics remain local until you reconnect.'; }); window.addEventListener('online', () => { $('camera-warning').textContent = ''; });
  window.addEventListener('vision:models-failed', () => { toast.error('AI Vision models failed to load.'); showVisionRetry(); });
}

document.addEventListener('DOMContentLoaded', init);

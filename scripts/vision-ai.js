// vision-ai.js — FRONTEND PLACEHOLDER ONLY.
//
// This module simulates the live metrics a real MediaPipe (FaceMesh + Pose)
// integration would produce, so the Interview Studio UI can be fully built,
// demoed, and wired to real APIs later WITHOUT the UI layer changing.
//
// To connect a real pipeline later: replace `startSimulatedTracking()` with
// code that reads MediaPipe FaceMesh/Pose landmark results and calls
// `updateMeters()` with real computed values on each frame. Everything
// downstream (the gauges, the confidence ring, the live suggestion feed)
// already expects exactly this shape, so no HTML/CSS changes are needed.

const METRIC_KEYS = ['eyeContact', 'smile', 'blinkRate', 'posture', 'headStability', 'speakingPace'];

const SUGGESTION_BANK = [
  'Try to hold eye contact with the camera a little longer between glances at your notes.',
  'Great posture — keep your shoulders relaxed and squared to the camera.',
  'Nice, natural smile there. It reads as confident and approachable.',
  'Your speaking pace picked up — take a breath before your next sentence.',
  'Try reducing hand movement slightly so the interviewer focuses on your answer.',
  'Solid head stability — you\'re holding your frame well.',
];

let intervalId = null;
let listeners = [];

function randomWalk(current, min, max, maxStep) {
  const step = (Math.random() * 2 - 1) * maxStep;
  return Math.max(min, Math.min(max, current + step));
}

function classify(value) {
  if (value >= 70) return 'good';
  if (value >= 40) return 'warn';
  return 'bad';
}

/**
 * Starts a simulated real-time metrics stream. Calls `onUpdate(metrics)`
 * roughly once per second, where `metrics` matches the shape a real
 * MediaPipe-driven scorer would emit.
 */
export function startSimulatedTracking(onUpdate, { intervalMs = 1200 } = {}) {
  let state = {
    eyeContact: 72,
    smile: 58,
    blinkRate: 65,
    posture: 80,
    headStability: 75,
    speakingPace: 68,
  };

  stopSimulatedTracking();
  intervalId = setInterval(() => {
    state = {
      eyeContact: randomWalk(state.eyeContact, 30, 96, 6),
      smile: randomWalk(state.smile, 20, 92, 8),
      blinkRate: randomWalk(state.blinkRate, 25, 95, 5),
      posture: randomWalk(state.posture, 35, 97, 4),
      headStability: randomWalk(state.headStability, 30, 96, 5),
      speakingPace: randomWalk(state.speakingPace, 25, 90, 7),
    };
    const rounded = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, Math.round(v)]));
    const confidence = Math.round(
      (rounded.eyeContact * 0.28 + rounded.posture * 0.22 + rounded.smile * 0.18 + rounded.headStability * 0.18 + rounded.speakingPace * 0.14)
    );
    onUpdate({ ...rounded, confidence });
  }, intervalMs);

  return () => stopSimulatedTracking();
}

export function stopSimulatedTracking() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

/** Returns a random contextual suggestion — call occasionally, not every tick. */
export function getRandomSuggestion() {
  return SUGGESTION_BANK[Math.floor(Math.random() * SUGGESTION_BANK.length)];
}

/**
 * Binds metric values to DOM meters. Expects markup like:
 * <div class="meter" data-metric="eyeContact">
 *   <div class="meter-head"><span>Eye Contact</span><span data-metric-value></span></div>
 *   <div class="meter-track"><div class="meter-fill" data-metric-fill></div></div>
 * </div>
 */
export function bindMeterElements(container) {
  const elements = {};
  METRIC_KEYS.forEach((key) => {
    const root = container.querySelector(`[data-metric="${key}"]`);
    if (!root) return;
    elements[key] = {
      valueEl: root.querySelector('[data-metric-value]'),
      fillEl: root.querySelector('[data-metric-fill]'),
    };
  });
  return elements;
}

export function updateMeters(elements, metrics) {
  METRIC_KEYS.forEach((key) => {
    const target = elements[key];
    const value = metrics[key];
    if (!target || value === undefined) return;
    if (target.valueEl) target.valueEl.textContent = `${value}%`;
    if (target.fillEl) {
      target.fillEl.style.width = `${value}%`;
      target.fillEl.classList.remove('good', 'warn', 'bad');
      target.fillEl.classList.add(classify(value));
    }
  });
}

export { METRIC_KEYS };

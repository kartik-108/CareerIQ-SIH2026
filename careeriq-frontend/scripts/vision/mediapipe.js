const ASSET_ROOT = new URL('../../assets/mediapipe/', import.meta.url);
const FACE_MODEL = new URL('face_landmarker.task', ASSET_ROOT).href;
const POSE_MODEL = new URL('pose_landmarker.task', ASSET_ROOT).href;
const HAND_MODEL = new URL('hand_landmarker.task', ASSET_ROOT).href;
const WASM_PATH = new URL('wasm', ASSET_ROOT).href;
const DEBUG_MESH = false;
const MAX_INFERENCE_FPS = 15;
const NEON = { cyan: '#22D3EE', purple: '#8B5CF6', blue: '#60A5FA', green: '#34D399', yellow: '#FBBF24', orange: '#F97316', red: '#F87171' };
const FACE_CONTOURS = {
  jawline: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454],
  leftBrow: [70, 63, 105, 66, 107], rightBrow: [336, 296, 334, 293, 300],
  leftEye: [33, 160, 158, 133, 153, 144, 33], rightEye: [362, 387, 385, 263, 373, 380, 362],
  nose: [168, 6, 197, 195, 5, 4, 1],
  lips: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 61],
  innerLips: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 78],
};
const HAND_PALM = [0, 1, 2, 5, 9, 13, 17, 0];
const FINGERTIPS = [4, 8, 12, 16, 20];

let modelsPromise;
let visionModulePromise;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));
const point = (landmarks, index) => landmarks?.[index] || { x: 0.5, y: 0.5, z: 0 };
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
const average = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, z: ((first.z || 0) + (second.z || 0)) / 2 });

async function loadModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      try {
        if (!visionModulePromise) {
          visionModulePromise = (async () => {
            try {
              const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm');
              return vision;
            } catch (error) {
              visionModulePromise = null;
              throw error;
            }
          })();
        }
        const { FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } = await visionModulePromise;
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        const options = { runningMode: 'VIDEO', baseOptions: { delegate: 'GPU' } };
        const [face, pose, hands] = await Promise.all([
          FaceLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, modelAssetPath: FACE_MODEL }, numFaces: 1, outputFaceBlendshapes: true }),
          PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, modelAssetPath: POSE_MODEL }, numPoses: 1 }),
          HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, modelAssetPath: HAND_MODEL }, numHands: 2 }),
        ]);
        return { face, pose, hands, resolver: vision };
      } catch (error) {
        modelsPromise = null;
        window.dispatchEvent(new CustomEvent('vision:models-failed', { detail: error }));
        return null;
      }
    })();
  }
  return modelsPromise;
}

export function retryVisionModels() {
  modelsPromise = null;
  return loadModels();
}

function blendshape(categories, name) {
  return categories.find((category) => category.categoryName === name)?.score || 0;
}

function faceMetrics(landmarks, blendshapes, state) {
  if (!landmarks.length) return { eyeContact: 0, faceVisible: false, headDirection: 'Away', headTilt: 0, yaw: 0, pitch: 0, roll: 0, blinkCount: state.blinkCount, smile: 0, neckAngle: 0 };
  const leftEye = point(landmarks, 33);
  const rightEye = point(landmarks, 263);
  const nose = point(landmarks, 1);
  const eyes = average(leftEye, rightEye);
  const eyeWidth = Math.max(0.01, distance(leftEye, rightEye));
  const yawOffset = (nose.x - eyes.x) / eyeWidth;
  const pitchOffset = (nose.y - eyes.y) / eyeWidth;
  const direction = Math.abs(yawOffset) < 0.16 && Math.abs(pitchOffset - 0.72) < 0.38 ? 'Center' : Math.abs(yawOffset) >= Math.abs(pitchOffset - 0.72) ? (yawOffset < 0 ? 'Left' : 'Right') : (pitchOffset < 0.72 ? 'Up' : 'Down');
  const eyeContact = direction === 'Center' ? clamp(100 - Math.abs(yawOffset) * 180 - Math.abs(pitchOffset - 0.72) * 80) : clamp(48 - Math.abs(yawOffset) * 20);
  const blink = (blendshape(blendshapes, 'eyeBlinkLeft') + blendshape(blendshapes, 'eyeBlinkRight')) / 2;
  if (blink > 0.55 && !state.eyesClosed) state.blinkCount += 1;
  state.eyesClosed = blink > 0.55;
  const headTilt = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI;
  const yaw = Math.round(yawOffset * 45);
  const pitch = Math.round((pitchOffset - 0.72) * 55);
  const smile = clamp(((blendshape(blendshapes, 'mouthSmileLeft') + blendshape(blendshapes, 'mouthSmileRight')) / 2) * 100);
  return { eyeContact, faceVisible: true, headDirection: direction, headTilt: Math.round(headTilt), yaw, pitch, roll: Math.round(headTilt), blinkCount: state.blinkCount, smile, neckAngle: 0 };
}

function poseMetrics(landmarks) {
  if (!landmarks.length) return { posture: 0, shoulderAlignment: 0, slouch: true, neckAngle: 0, crossedArms: false };
  const leftShoulder = point(landmarks, 11);
  const rightShoulder = point(landmarks, 12);
  const leftHip = point(landmarks, 23);
  const rightHip = point(landmarks, 24);
  const nose = point(landmarks, 0);
  const shoulderMid = average(leftShoulder, rightShoulder);
  const hipMid = average(leftHip, rightHip);
  const shoulderWidth = Math.max(0.01, distance(leftShoulder, rightShoulder));
  const shoulderAlignment = clamp(100 - Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth * 350);
  const neckAngle = Math.round(Math.atan2(nose.x - shoulderMid.x, shoulderMid.y - nose.y) * 180 / Math.PI);
  const torsoLength = Math.max(0.01, distance(shoulderMid, hipMid));
  const forwardHead = Math.abs(nose.x - shoulderMid.x) / shoulderWidth;
  const slouch = nose.y > shoulderMid.y + torsoLength * 0.42 || forwardHead > 0.8;
  const posture = clamp(shoulderAlignment * 0.55 + (slouch ? 25 : 95) * 0.45);
  const leftElbow = point(landmarks, 13);
  const rightElbow = point(landmarks, 14);
  const leftWrist = point(landmarks, 15);
  const rightWrist = point(landmarks, 16);
  const crossedArms = distance(leftWrist, rightElbow) < shoulderWidth * 0.8 && distance(rightWrist, leftElbow) < shoulderWidth * 0.8;
  return { posture, shoulderAlignment, slouch, neckAngle, crossedArms };
}

function handMetrics(hands, state) {
  const handCount = hands.length;
  const movement = hands.reduce((total, hand) => total + distance(point(hand, 0), point(hand, 8)), 0);
  if (handCount && movement > 0.12) state.gestureCount += 1;
  const gestures = hands.map((hand) => {
    const wrist = point(hand, 0);
    const extended = FINGERTIPS.map((tipIndex, index) => distance(point(hand, tipIndex), wrist) > distance(point(hand, [2, 5, 9, 13, 17][index]), wrist) * 1.15);
    if (extended.filter(Boolean).length >= 4) return 'Open palm';
    if (extended[1] && extended.filter(Boolean).length === 1) return 'Pointing';
    return 'Hand gesture';
  });
  return { gestures: state.gestureCount, handCount, gestureStatus: gestures[0] || 'Hands outside frame', handMovement: movement };
}

function drawLandmarks(context, landmarks, width, height, color, radius = 1.5) {
  context.fillStyle = color;
  landmarks.forEach((landmark) => { context.beginPath(); context.arc(landmark.x * width, landmark.y * height, radius, 0, Math.PI * 2); context.fill(); });
}

function drawLine(context, first, second, width, height) {
  context.moveTo(first.x * width, first.y * height);
  context.lineTo(second.x * width, second.y * height);
}

function drawSmoothPath(context, landmarks, indices, width, height, close = false) {
  const points = indices.map((index) => landmarks[index]).filter(Boolean);
  if (points.length < 2) return;
  context.beginPath();
  context.moveTo(points[0].x * width, points[0].y * height);
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    const midpointX = (previous.x + current.x) * width / 2;
    const midpointY = (previous.y + current.y) * height / 2;
    context.quadraticCurveTo(previous.x * width, previous.y * height, midpointX, midpointY);
  }
  const last = points.at(-1);
  context.quadraticCurveTo(last.x * width, last.y * height, last.x * width, last.y * height);
  if (close) context.closePath();
  context.stroke();
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawLabel(context, text, x, y, color, background = 'rgba(7, 12, 28, 0.72)') {
  context.font = '600 12px Inter, sans-serif';
  const padding = 8;
  const width = context.measureText(text).width + padding * 2;
  drawRoundedRect(context, x, y - 18, width, 24, 12);
  context.fillStyle = background;
  context.fill();
  context.fillStyle = color;
  context.fillText(text, x + padding, y - 2);
}

function eyeCenter(landmarks, indices) {
  const points = indices.map((index) => landmarks[index]).filter(Boolean);
  return points.length ? points.reduce((sum, item) => ({ x: sum.x + item.x, y: sum.y + item.y }), { x: 0, y: 0 }) : null;
}

export class VisionEngine {
  constructor({ video, canvas, onMetrics, statusEl, warningEl } = {}) {
    this.video = video;
    this.canvas = canvas;
    this.onMetrics = onMetrics;
    this.statusEl = statusEl;
    this.warningEl = warningEl;
    this.stream = null;
    this.models = null;
    this.animationFrame = null;
    this.tracking = false;
    this.lastMetricsAt = 0;
    this.lastMetrics = this.emptyMetrics();
    this.state = { blinkCount: 0, eyesClosed: false, gestureCount: 0 };
  }

  emptyMetrics() {
    return { eyeContact: 0, faceVisible: false, headDirection: 'Away', headTilt: 0, blinkCount: 0, smile: 0, shoulderAlignment: 0, posture: 0, slouch: true, neckAngle: 0, gestures: 0, crossedArms: false, confidence: 0 };
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser.');
    if (!this.stream) this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    this.video.srcObject = this.stream;
    if (this.video.readyState < HTMLMediaElement.HAVE_METADATA) await new Promise((resolve) => { this.video.onloadedmetadata = resolve; });
    await this.video.play();
    if (this.statusEl) this.statusEl.textContent = 'Camera active';
    return this.stream;
  }

  async startTracking() {
    if (this.tracking) return this;
    this.models = this.models || await loadModels();
    if (!this.models) {
      if (this.warningEl) this.warningEl.textContent = 'AI vision is unavailable. You can continue without vision analytics.';
      if (!this.stream) await this.startCamera();
      return this;
    }
    if (!this.stream) await this.startCamera();
    this.tracking = true;
    this.lastMetricsAt = 0;
    this.lastFrameAt = 0;
    this.state = { blinkCount: 0, eyesClosed: false, gestureCount: 0 };
    this.animationFrame = requestAnimationFrame((timestamp) => this.processFrame(timestamp));
    return this;
  }

  processFrame(timestamp) {
    if (!this.tracking) return;
    if (this.video.hidden || this.video.style.display === 'none' || this.video.readyState < HTMLMediaElement.HAVE_METADATA) {
      this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.animationFrame = requestAnimationFrame((nextTimestamp) => this.processFrame(nextTimestamp));
      return;
    }
    const frameDelta = timestamp - (this.lastFrameAt || timestamp);
    if (frameDelta < 1000 / MAX_INFERENCE_FPS) {
      this.animationFrame = requestAnimationFrame((nextTimestamp) => this.processFrame(nextTimestamp));
      return;
    }
    this.lastFrameAt = timestamp;
    const fpsEl = document.getElementById('camera-fps');
    if (fpsEl && frameDelta > 0) fpsEl.textContent = `${Math.round(1000 / frameDelta)} FPS`;
    const faceResult = this.models.face.detectForVideo(this.video, timestamp);
    const poseResult = this.models.pose.detectForVideo(this.video, timestamp);
    const handResult = this.models.hands.detectForVideo(this.video, timestamp);
    const face = faceResult.faceLandmarks?.[0] || [];
    const pose = poseResult.landmarks?.[0] || [];
    const hands = handResult.landmarks || [];
    const faceData = faceMetrics(face, faceResult.faceBlendshapes?.[0]?.categories || [], this.state);
    const poseData = poseMetrics(pose);
    const handData = handMetrics(hands, this.state);
    const confidence = clamp(faceData.eyeContact * 0.35 + poseData.posture * 0.35 + poseData.shoulderAlignment * 0.15 + (poseData.crossedArms ? 0 : 15));
    const metrics = { ...faceData, ...poseData, ...handData, confidence, eye_contact: faceData.eyeContact, confidence_score: confidence };
    this.lastMetrics = metrics;
    this.drawOverlay(face, pose, hands, metrics, timestamp);
    if (timestamp - this.lastMetricsAt >= 1000) {
      this.lastMetricsAt = timestamp;
      this.onMetrics?.({ ...metrics });
    }
    this.animationFrame = requestAnimationFrame((nextTimestamp) => this.processFrame(nextTimestamp));
  }

  drawOverlay(face, pose, hands, metrics, timestamp = performance.now()) {
    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;
    this.canvas.width = width;
    this.canvas.height = height;
    const context = this.canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    if (this.video.hidden || this.video.style.display === 'none' || this.video.readyState < HTMLMediaElement.HAVE_METADATA) return;

    const pulse = 0;
    context.save();
    context.lineWidth = 2 + pulse;
    context.shadowBlur = 0;
    context.shadowColor = NEON.cyan;
    context.strokeStyle = `rgba(34, 211, 238, ${0.55 + pulse * 0.2})`;
    drawRoundedRect(context, 8, 8, width - 16, height - 16, 22);
    context.stroke();
    context.restore();

    if (face.length) {
      const faceColor = metrics.headDirection === 'Down' ? NEON.red : metrics.eyeContact >= 70 ? NEON.green : NEON.yellow;
      context.save();
      context.globalAlpha = 0.4;
      context.lineWidth = 2;
      context.shadowBlur = 10;
      context.shadowColor = NEON.blue;
      context.strokeStyle = NEON.cyan;
      Object.entries(FACE_CONTOURS).forEach(([name, indices]) => {
        context.strokeStyle = name === 'lips' || name === 'innerLips' ? NEON.purple : name === 'nose' ? NEON.blue : NEON.cyan;
        drawSmoothPath(context, face, indices, width, height, name === 'leftEye' || name === 'rightEye' || name === 'lips' || name === 'innerLips');
      });
      context.restore();

      if (DEBUG_MESH) {
        context.save(); context.globalAlpha = 0.28; context.fillStyle = NEON.cyan; drawLandmarks(context, face, width, height, NEON.cyan, 1); context.restore();
      }

      const eyes = [[33, 133], [362, 263]];
      const irisGroups = [[468, 469, 470, 471, 472], [473, 474, 475, 476, 477]];
      const gazeColor = metrics.headDirection === 'Down' ? NEON.red : metrics.eyeContact >= 70 ? NEON.green : NEON.yellow;
      eyes.forEach(([inner, outer], index) => {
        const left = point(face, inner); const right = point(face, outer);
        const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
        const iris = irisGroups[index].map((landmarkIndex) => face[landmarkIndex]).filter(Boolean);
        const pupil = iris.length ? iris.reduce((sum, item) => ({ x: sum.x + item.x / iris.length, y: sum.y + item.y / iris.length }), { x: 0, y: 0 }) : center;
        const radius = Math.max(4, distance(left, right) * width * 0.1);
        context.save(); context.globalAlpha = 0.65; context.strokeStyle = gazeColor; context.fillStyle = gazeColor; context.shadowBlur = 8; context.shadowColor = gazeColor;
        context.lineWidth = 1.5; context.beginPath(); context.arc(pupil.x * width, pupil.y * height, radius, 0, Math.PI * 2); context.stroke();
        context.beginPath(); context.arc(pupil.x * width, pupil.y * height, 2.5, 0, Math.PI * 2); context.fill();
        context.globalAlpha = 0.7; context.beginPath(); context.moveTo(center.x * width, center.y * height); context.lineTo((center.x + (pupil.x - center.x) * 3) * width, (center.y + (pupil.y - center.y) * 3) * height); context.stroke(); context.restore();
      });

      const forehead = point(face, 10);
      const axisX = forehead.x * width; const axisY = forehead.y * height - 26;
      context.save(); context.lineWidth = 1.5; [['x', NEON.red, 22, 0], ['y', NEON.green, 0, -22], ['z', NEON.blue, -14, 14]].forEach(([, color, dx, dy]) => { context.strokeStyle = color; context.beginPath(); context.moveTo(axisX, axisY); context.lineTo(axisX + dx, axisY + dy); context.stroke(); }); context.restore();
      drawLabel(context, `Eye contact ${metrics.eyeContact}%`, 18, height - 18, gazeColor);
      drawLabel(context, metrics.headDirection === 'Center' ? 'Centered' : `Looking ${metrics.headDirection}`, 18, 42, gazeColor);
    }

    if (pose.length) {
      const postureColor = metrics.posture >= 70 ? NEON.green : metrics.posture >= 45 ? NEON.orange : NEON.red;
      context.save(); context.globalAlpha = 0.62; context.lineWidth = 2; context.shadowBlur = 8; context.shadowColor = postureColor; context.strokeStyle = postureColor;
      [[11, 12], [11, 0], [12, 0]].forEach(([from, to]) => { if (pose[from] && pose[to]) { context.beginPath(); drawLine(context, pose[from], pose[to], width, height); context.stroke(); } });
      context.restore();
      drawLabel(context, `Neck ${metrics.neckAngle}° · Shoulders ${metrics.shoulderAlignment}%`, 18, height - 48, postureColor);
    }

    hands.forEach((hand) => {
      context.save(); context.globalAlpha = 0.58; context.strokeStyle = NEON.purple; context.shadowBlur = 8; context.shadowColor = NEON.purple; context.lineWidth = 2; drawSmoothPath(context, hand, HAND_PALM, width, height, true); FINGERTIPS.forEach((index) => { const fingertip = hand[index]; if (!fingertip) return; context.beginPath(); context.arc(fingertip.x * width, fingertip.y * height, 3, 0, Math.PI * 2); context.stroke(); }); context.restore();
    });
    const gesture = metrics.crossedArms ? 'Crossed arms' : metrics.gestureStatus;
    drawLabel(context, gesture, width - Math.min(170, context.measureText(gesture).width + 20) - 18, height - 18, metrics.crossedArms ? NEON.orange : NEON.purple);

    const coaching = metrics.eyeContact < 55 ? 'Raise your head slightly.' : metrics.posture < 55 ? 'Sit a little straighter.' : metrics.handMovement > 0.5 ? 'Use calmer hand movements.' : 'Excellent eye contact.';
    drawLabel(context, coaching, width - 210, 42, metrics.eyeContact < 55 || metrics.posture < 55 ? NEON.yellow : NEON.green, 'rgba(7, 12, 28, 0.78)');
  }

  stopTracking() {
    this.tracking = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause?.();
    this.video.srcObject = null;
    this.models?.face?.close?.();
    this.models?.pose?.close?.();
    this.models?.hands?.close?.();
    this.models?.resolver?.close?.();
    if (this.models) {
      this.models = null;
      modelsPromise = null;
    }
    this.lastMetrics = this.emptyMetrics();
  }

  getMetrics() { return { ...this.lastMetrics }; }
}

let activeEngine;

export async function startMediaPipeTracking(options) {
  stopMediaPipeTracking();
  activeEngine = new VisionEngine({ ...options, onMetrics: options.onUpdate });
  await activeEngine.startCamera();
  await activeEngine.startTracking();
  return () => stopMediaPipeTracking();
}

export function stopMediaPipeTracking() {
  activeEngine?.stopTracking();
  activeEngine = null;
}

export function getCameraStream() { return activeEngine?.stream || null; }
export async function switchCamera() {
  const track = activeEngine?.stream?.getVideoTracks()?.[0];
  if (!track) return false;
  const current = track.getSettings().facingMode;
  await track.applyConstraints({ facingMode: current === 'environment' ? 'user' : 'environment' });
  return true;
}

export function getVisionMetrics() { return activeEngine?.getMetrics() || null; }

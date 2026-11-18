export function calculatePosture(landmarks) {
  if (!landmarks?.length) return { posture: 0, shoulderSymmetry: 0, slouch: true, confidence: 0 };
  const left = landmarks[11];
  const right = landmarks[12];
  const nose = landmarks[0];
  const shoulderGap = Math.abs((left?.y || 0) - (right?.y || 0));
  const shoulderWidth = Math.max(0.01, Math.abs((left?.x || 0) - (right?.x || 0)));
  const neckOffset = Math.abs((nose?.x || 0.5) - (((left?.x || 0.5) + (right?.x || 0.5)) / 2));
  const posture = Math.round(Math.max(0, Math.min(100, 100 - shoulderGap * 300 - neckOffset * 260)));
  return { posture, shoulderSymmetry: Math.round(Math.max(0, 100 - (shoulderGap / shoulderWidth) * 300)), slouch: posture < 55, confidence: posture };
}

export function drawPose(context, landmarks, width, height) {
  if (!landmarks?.length) return;
  context.strokeStyle = '#34D399';
  context.lineWidth = 2;
  [[11, 12], [11, 0], [12, 0]].forEach(([from, to]) => {
    if (!landmarks[from] || !landmarks[to]) return;
    context.beginPath(); context.moveTo(landmarks[from].x * width, landmarks[from].y * height); context.lineTo(landmarks[to].x * width, landmarks[to].y * height); context.stroke();
  });
}
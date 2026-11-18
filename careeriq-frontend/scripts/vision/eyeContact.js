const distance = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));

export function calculateEyeContact(landmarks) {
  if (!landmarks?.length) return { eyeContact: 0, faceDirection: 'away', headMovement: 0, headTilt: 0, smile: 0 };
  const left = landmarks[33];
  const right = landmarks[263];
  const nose = landmarks[1];
  const centerX = ((left?.x || 0.5) + (right?.x || 0.5)) / 2;
  const horizontal = centerX - (nose?.x || 0.5);
  const vertical = (nose?.y || 0.5) - (((left?.y || 0.5) + (right?.y || 0.5)) / 2);
  const eyeContact = Math.round(Math.max(0, Math.min(100, 100 - Math.abs(horizontal) * 500 - Math.max(0, Math.abs(vertical) - 0.12) * 250)));
  return { eyeContact, faceDirection: Math.abs(horizontal) < 0.08 && Math.abs(vertical) < 0.16 ? 'camera' : horizontal < 0 ? 'left' : horizontal > 0 ? 'right' : 'down', headMovement: Math.round(Math.min(100, Math.abs(horizontal) * 700)), headTilt: Math.round((landmarks[263]?.y - landmarks[33]?.y || 0) * 180), smile: Math.round(Math.max(0, Math.min(100, (distance(landmarks[61], landmarks[291]) / Math.max(0.01, distance(landmarks[33], landmarks[263])) - 0.35) * 260))) };
}
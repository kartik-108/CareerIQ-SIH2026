import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApiUrl } from '../scripts/api/url.js';

test('production dashboard requests use the Render API origin', () => {
  assert.equal(
    buildApiUrl('https://careeriq-sih2026.onrender.com/api', '/dashboard'),
    'https://careeriq-sih2026.onrender.com/api/dashboard',
  );
  assert.equal(
    buildApiUrl('https://careeriq-sih2026.onrender.com/api', '/dashboard/analytics'),
    'https://careeriq-sih2026.onrender.com/api/dashboard/analytics',
  );
});

test('API URL construction avoids duplicate slashes', () => {
  assert.equal(
    buildApiUrl('https://example.com/api/', '/dashboard'),
    'https://example.com/api/dashboard',
  );
  assert.equal(
    buildApiUrl('https://example.com/api', 'dashboard/analytics'),
    'https://example.com/api/dashboard/analytics',
  );
});

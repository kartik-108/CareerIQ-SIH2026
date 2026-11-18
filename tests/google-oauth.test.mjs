import test from 'node:test';
import assert from 'node:assert/strict';
import { googleRedirectUrl, initiateGoogleOAuth } from '../scripts/api/oauth.js';

test('Google OAuth redirects to the protected dashboard callback', () => {
  assert.equal(
    googleRedirectUrl({ origin: 'https://careeriq.vercel.app' }),
    'https://careeriq.vercel.app/pages/dashboard.html',
  );
});

test('Google OAuth uses the Supabase Google provider', async () => {
  let credentials;
  const supabase = {
    auth: {
      signInWithOAuth: async (value) => {
        credentials = value;
        return { data: { url: 'https://accounts.google.com/o/oauth2/auth' }, error: null };
      },
    },
  };

  const result = await initiateGoogleOAuth(supabase, {
    origin: 'https://careeriq.vercel.app',
  });

  assert.deepEqual(credentials, {
    provider: 'google',
    options: {
      redirectTo: 'https://careeriq.vercel.app/pages/dashboard.html',
    },
  });
  assert.equal(result.url, 'https://accounts.google.com/o/oauth2/auth');
});

test('Google OAuth errors are returned to the caller', async () => {
  const supabase = {
    auth: {
      signInWithOAuth: async () => ({
        data: null,
        error: new Error('Unsupported provider'),
      }),
    },
  };

  await assert.rejects(
    initiateGoogleOAuth(supabase, { origin: 'https://careeriq.vercel.app' }),
    /Unsupported provider/,
  );
});

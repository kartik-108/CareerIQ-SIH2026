// app.js — global bootstrap loaded on every page. Handles theme,
// icon rendering, scroll reveal, and route-guarding dashboard pages against
// direct access without a mock login.
import { initTheme } from './theme.js';
import { initAllAnimations } from './animations.js';
import { isAuthenticated, clearSession } from './storage.js';
import { getSession, subscribeToAuthChanges } from './api/auth.js';

const PROTECTED_PAGES = [
  'dashboard.html',
  'resume-studio.html',
  'career-lab.html',
  'interview-studio.html',
  'mentor-jobs.html',
  'profile-settings.html',
];

async function guardRoute() {
  const page = location.pathname.split('/').pop();
  if (PROTECTED_PAGES.includes(page)) {
    const session = await getSession();
    if (!session && !isAuthenticated()) {
      location.href = 'login.html';
      return false;
    }
  }
  return true;
}

subscribeToAuthChanges((event, session) => {
  if (event === 'SIGNED_OUT' && PROTECTED_PAGES.includes(location.pathname.split('/').pop())) {
    clearSession();
    location.href = 'login.html';
  }
});

window.addEventListener('auth:expired', () => {
  clearSession();
  const page = location.pathname.split('/').pop();
  if (PROTECTED_PAGES.includes(page)) location.href = 'login.html';
});

function showRuntimeError() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('[data-runtime-error]')) return;
  const state = document.createElement('div');
  state.className = 'state-block';
  state.setAttribute('data-runtime-error', 'true');
  state.innerHTML = '<div class="state-icon" aria-hidden="true">!</div><h3>Something went wrong</h3><p>We could not load this page. Refresh to try again.</p><button class="btn btn-primary" type="button">Retry</button>';
  state.querySelector('button').addEventListener('click', () => location.reload());
  main.prepend(state);
}

async function bootstrap() {
  if (!(await guardRoute())) return;
  initTheme();
  initAllAnimations();
  if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', bootstrap);
window.addEventListener('unhandledrejection', showRuntimeError);
window.addEventListener('error', showRuntimeError);

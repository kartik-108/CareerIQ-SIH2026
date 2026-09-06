// auth-page.js — page-specific logic for pages/login.html.
import { api, ApiClientError } from './api/client.js';
import { saveSession } from './storage.js';
import { toast } from './toast.js';

function showView(view) {
  document.getElementById('login-view').style.display = view === 'login' ? 'block' : 'none';
  document.getElementById('register-view').style.display = view === 'register' ? 'block' : 'none';
}

function initViewToggle() {
  document.querySelector('[data-show-register]')?.addEventListener('click', (e) => {
    e.preventDefault();
    showView('register');
  });
  document.querySelector('[data-show-login]')?.addEventListener('click', (e) => {
    e.preventDefault();
    showView('login');
  });

  const params = new URLSearchParams(location.search);
  showView(params.get('mode') === 'register' ? 'register' : 'login');
}

function initPasswordToggle() {
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-toggle-password'));
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.innerHTML = isHidden
        ? '<i data-lucide="eye-off" width="18" height="18"></i>'
        : '<i data-lucide="eye" width="18" height="18"></i>';
      btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      if (window.lucide) window.lucide.createIcons();
    });
  });
}

function initForgotModal() {
  const modal = document.getElementById('forgot-modal');
  const resetEmail = document.getElementById('reset-email');
  const closeModal = () => {
    modal?.classList.remove('is-open');
    document.querySelector('[data-open-forgot]')?.focus();
  };
  document.querySelector('[data-open-forgot]')?.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('is-open');
    resetEmail?.focus();
  });
  modal?.querySelectorAll('[data-close-forgot]').forEach((btn) => btn.addEventListener('click', closeModal));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  const handleEscape = (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('is-open')) closeModal();
  };
  document.addEventListener('keydown', handleEscape);
  modal?.addEventListener('keydown', handleEscape);
  resetEmail?.addEventListener('keydown', handleEscape);
  document.getElementById('send-reset-btn')?.addEventListener('click', () => {
    if (!resetEmail?.reportValidity()) return;
    closeModal();
    toast.success('If that email exists, a reset link is on its way.');
  });
}

function initForms() {
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      saveSession(await api.post('/auth/login', { email, password }));
      toast.success('Welcome back! Redirecting to your dashboard...');
      setTimeout(() => (location.href = 'dashboard.html'), 700);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Unable to log in. Please try again.');
    }
  });

  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    const full_name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    try {
      saveSession(await api.post('/auth/register', { full_name, email, password, role: 'student' }));
      toast.success('Account created! Setting up your dashboard...');
      setTimeout(() => (location.href = 'dashboard.html'), 700);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Unable to create your account. Please try again.');
    }
  });

  document.getElementById('google-login-btn')?.addEventListener('click', () => {
    toast.info('Google sign-in is not configured for this account yet.');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initViewToggle();
  initPasswordToggle();
  initForgotModal();
  initForms();
});

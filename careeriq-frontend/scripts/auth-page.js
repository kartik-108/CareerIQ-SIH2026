// auth-page.js — page-specific logic for pages/login.html.
import { authErrorMessage, redirectAuthenticatedUser, signIn, signInWithGoogle, signUp } from './api/auth.js';
import { toast } from './toast.js';

function showView(view) {
  const loginView = document.getElementById('login-view');
  const registerView = document.getElementById('register-view');
  if (loginView) loginView.style.display = view === 'login' ? 'block' : 'none';
  if (registerView) registerView.style.display = view === 'register' ? 'block' : 'none';
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
      if (!input) return;
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

async function handleLogin(e) {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      await signIn(email, password);
      toast.success('Welcome back! Redirecting to your dashboard...');
      setTimeout(() => (location.href = 'dashboard.html'), 700);
    } catch (error) {
      toast.error(authErrorMessage(error, 'Unable to log in. Please try again.'));
    }
}

async function handleSignup(e) {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    const full_name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    try {
      const { session } = await signUp(email, password, full_name);
      if (session) {
        toast.success('Account created! Setting up your dashboard...');
        setTimeout(() => (location.href = 'dashboard.html'), 700);
      } else {
        toast.success('Account created. Check your email to confirm your account before logging in.');
      }
    } catch (error) {
      toast.error(authErrorMessage(error, 'Unable to create your account. Please try again.'));
    }
}

async function handleGoogleLogin() {
    try {
      await signInWithGoogle();
    } catch (error) {
      toast.error(authErrorMessage(error, 'Unable to start Google sign-in. Please try again.'));
    }
}

function initForms() {
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const signupForm = document.getElementById('signup-form') || document.getElementById('register-form');
  if (signupForm) signupForm.addEventListener('submit', handleSignup);

  const googleButton = document.getElementById('google-login-btn');
  if (googleButton) googleButton.addEventListener('click', handleGoogleLogin);
}

function initAuthControls() {
  for (const initialize of [initViewToggle, initPasswordToggle, initForgotModal, initForms]) {
    try {
      initialize();
    } catch (error) {
      console.error(`CareerIQ auth control initialization failed (${initialize.name}):`, error);
    }
  }
}

function init() {
  try {
    initAuthControls();
  } catch (error) {
    console.error('CareerIQ auth control initialization failed:', error);
  }

  redirectAuthenticatedUser().catch((error) => {
    console.error('CareerIQ auth initialization failed:', error);
    toast.error(authErrorMessage(error, 'Unable to check your session.'));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

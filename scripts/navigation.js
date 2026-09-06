// navigation.js — builds the sidebar, topbar, and mobile bottom nav for every
// authenticated page, and wires up sidebar collapse + dropdown behavior.
//
// Markup is generated here (rather than fetched from components/*.html) so
// the shell works identically whether the project is opened directly or
// served — the components/ folder still ships static reference copies of
// this same markup for designers/backend devs to read, per the project's
// modular-components requirement.
import { getItem, setItem, clearSession } from './storage.js';
import { api } from './api/client.js';
import { getTheme, toggleTheme } from './theme.js';

const NAV_ITEMS = [
  { href: 'dashboard.html', icon: 'layout-dashboard', label: 'Dashboard' },
  { href: 'resume-studio.html', icon: 'file-text', label: 'Resume Studio' },
  { href: 'career-lab.html', icon: 'flask-conical', label: 'AI Career Lab' },
  { href: 'interview-studio.html', icon: 'video', label: 'AI Interview Studio' },
  { href: 'mentor-jobs.html', icon: 'message-circle', label: 'Career Mentor & Jobs' },
  { href: 'profile-settings.html', icon: 'settings', label: 'Profile & Settings' },
];

function currentPageName() {
  return location.pathname.split('/').pop() || 'dashboard.html';
}

function renderSidebar() {
  const mount = document.querySelector('[data-mount="sidebar"]');
  if (!mount) return;

  const current = currentPageName();
  const collapsed = getItem('sidebar_collapsed', false);

  mount.outerHTML = `
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="sidebar-brand">
        <span class="logo-mark" aria-hidden="true"></span>
        <span>CareerIQ</span>
      </div>
      <nav class="sidebar-nav">
        ${NAV_ITEMS.map(
          (item) => `
          <a class="nav-item ${item.href === current ? 'is-active' : ''}" href="${item.href}" aria-label="${item.label}" ${item.href === current ? 'aria-current="page"' : ''}>
            <i data-lucide="${item.icon}"></i>
            <span class="nav-label">${item.label}</span>
          </a>`
        ).join('')}
      </nav>
      <button class="sidebar-toggle" data-sidebar-toggle aria-label="Collapse sidebar">
        <i data-lucide="panel-left-close"></i>
      </button>
    </aside>
  `;

  const shell = document.querySelector('.app-shell');
  if (shell) shell.setAttribute('data-sidebar-collapsed', String(collapsed));

  document.querySelector('[data-sidebar-toggle]')?.addEventListener('click', () => {
    const next = !getItem('sidebar_collapsed', false);
    setItem('sidebar_collapsed', next);
    shell?.setAttribute('data-sidebar-collapsed', String(next));
  });
}

function renderTopbar() {
  const mount = document.querySelector('[data-mount="topbar"]');
  if (!mount) return;

  const email = getItem('user_email', 'student@careeriq.dev');
  const initial = email.charAt(0).toUpperCase();

  mount.outerHTML = `
    <header class="topbar">
      <div class="topbar-search">
        <i data-lucide="search" width="18" height="18"></i>
        <input type="search" placeholder="Search resumes, roadmaps, jobs..." aria-label="Global search" />
      </div>
      <div class="topbar-actions">
        <button class="btn-icon theme-toggle" data-theme-toggle aria-label="Toggle dark/light mode" aria-pressed="${getTheme() === 'dark'}">
          <i data-lucide="sun" class="icon-sun" width="20" height="20"></i>
          <i data-lucide="moon" class="icon-moon" width="20" height="20"></i>
        </button>
        <button class="btn-icon topbar-notification" data-notif-toggle aria-label="Notifications">
          <i data-lucide="bell" width="20" height="20"></i>
          <span class="dot-indicator" aria-hidden="true"></span>
        </button>
        <div class="topbar-profile">
          <button class="avatar" data-profile-toggle aria-haspopup="true" aria-expanded="false">
            ${initial}
          </button>
        </div>
      </div>
    </header>
  `;

  document.querySelector('[data-notif-toggle]')?.addEventListener('click', () => {
    import('./toast.js').then(({ toast }) => api.get('/notifications').then((items) => toast.info(items?.length ? `${items.length} notifications` : 'No new notifications.')).catch((error) => toast.error(error.message)));
  });

  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => toggleTheme());

  document.querySelector('[data-profile-toggle]')?.addEventListener('click', () => {
    const atRoot = !location.pathname.includes('/pages/');
    location.href = atRoot ? 'pages/profile-settings.html' : 'profile-settings.html';
  });
}

function renderBottomNav() {
  const mount = document.querySelector('[data-mount="bottom-nav"]');
  if (!mount) return;
  const current = currentPageName();

  mount.outerHTML = `
    <nav class="bottom-nav" aria-label="Mobile navigation">
      ${NAV_ITEMS.slice(0, 5)
        .map(
          (item) => `
        <a href="${item.href}" class="${item.href === current ? 'is-active' : ''}" aria-label="${item.label}" ${item.href === current ? 'aria-current="page"' : ''}>
          <i data-lucide="${item.icon}" width="20" height="20"></i>
          <span>${item.label.split(' ')[0]}</span>
        </a>`
        )
        .join('')}
    </nav>
  `;
}

export function initNavigation() {
  renderSidebar();
  renderTopbar();
  renderBottomNav();
  if (window.lucide) window.lucide.createIcons();
}

export function bindLogout(selector = '[data-logout]') {
  document.querySelectorAll(selector).forEach((btn) => {
    btn.addEventListener('click', async () => {
      try { await api.post('/auth/logout', {}); } catch { /* session is cleared locally regardless */ }
      clearSession();
      const atRoot = !location.pathname.includes('/pages/');
      location.href = atRoot ? 'index.html' : '../index.html';
    });
  });
}

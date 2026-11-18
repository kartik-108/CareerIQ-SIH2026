// profile-settings.js — page-specific logic for pages/profile-settings.html
import { api } from './api/client.js';
import { getItem } from './storage.js';
import { getTheme, applyTheme } from './theme.js';
import { toast } from './toast.js';

function renderBadges(achievements) {
  document.getElementById('profile-xp').textContent = achievements.xp.toLocaleString();
  document.getElementById('profile-level').textContent = achievements.level;
  document.getElementById('profile-streak').textContent = achievements.streak.current;

  const pct = Math.round((achievements.xp / achievements.xpToNextLevel) * 100);
  document.getElementById('xp-progress-label').textContent = `${achievements.xp} / ${achievements.xpToNextLevel} XP`;
  requestAnimationFrame(() => { document.getElementById('xp-progress-fill').style.width = `${pct}%`; });

  document.getElementById('badges-grid').innerHTML = achievements.badges
    .map(
      (b) => `<div class="card" style="background: var(--surface-input); text-align:center; opacity:${b.earned ? '1' : '0.45'};">
        <div class="card-icon" style="margin-inline:auto; margin-bottom: var(--space-2);">
          <i data-lucide="${b.earned ? 'award' : 'lock'}" width="18" height="18"></i>
        </div>
        <div style="font-weight:600; font-size: var(--text-xs);">${b.title}</div>
        <div class="text-tertiary" style="font-size:10px; margin-top:2px;">${b.earned ? b.date : 'Locked'}</div>
      </div>`
    )
    .join('');

  if (window.lucide) window.lucide.createIcons();
}

function initThemeSegment() {
  const buttons = document.querySelectorAll('[data-theme-select]');
  function sync() {
    const current = getTheme();
    buttons.forEach((b) => b.classList.toggle('is-active', b.dataset.themeSelect === current));
  }
  buttons.forEach((btn) => btn.addEventListener('click', () => { applyTheme(btn.dataset.themeSelect); sync(); }));
  sync();
}

async function init() {
  const [profileResult, dashboardResult] = await Promise.allSettled([api.get('/auth/profile'), api.get('/dashboard')]);
  const profile = profileResult.status === 'fulfilled' ? profileResult.value : {};
  const dashboard = dashboardResult.status === 'fulfilled' ? dashboardResult.value : {};
  if (profileResult.status === 'rejected' || dashboardResult.status === 'rejected') toast.info('Some profile data is temporarily unavailable. Retry when the connection recovers.');
  const achievements = dashboard.achievements || [];
  renderBadges({ xp: dashboard.xp || 0, level: dashboard.level || 1, streak: { current: dashboard.streak?.current_streak || 0 }, xpToNextLevel: 500, badges: achievements.map((item) => ({ ...item, earned: true, date: item.earned_at ? new Date(item.earned_at).toLocaleDateString() : '' })) });

  const email = profile.email || getItem('user_email', 'student@careeriq.dev');
  const details = profile.profile || {};
  document.getElementById('profile-name').textContent = details.full_name || email;
  document.getElementById('profile-role').textContent = `${details.degree || ''} ${details.branch || ''} · Target: ${details.target_role || 'Not set'}`;
document.getElementById('profile-avatar').textContent = (details.full_name || email).charAt(0).toUpperCase();

// ADD THIS — without it, avatar_url is saved in DB but never rendered on reload
if (details.avatar_url) {
  document.getElementById('profile-avatar').style.backgroundImage = `url(${details.avatar_url})`;
  document.getElementById('profile-avatar').style.backgroundSize = 'cover';
  document.getElementById('profile-avatar').textContent = '';
}
  const avatarInput = document.createElement('input');
  avatarInput.type = 'file';
  avatarInput.accept = 'image/*';
  avatarInput.hidden = true;
  document.body.appendChild(avatarInput);
  document.querySelector('.profile-photo-change')?.addEventListener('click', () => avatarInput.click());
  avatarInput.addEventListener('change', async () => {
    if (!avatarInput.files[0]) return;
    const formData = new FormData();
    formData.append('avatar', avatarInput.files[0]);
    try {
      const updated = await api.upload('/auth/avatar', formData);
      if (updated.avatar_url) document.getElementById('profile-avatar').style.backgroundImage = `url(${updated.avatar_url})`;
      toast.success('Profile photo updated.');
    } catch (error) { toast.error(error.message); }
  });

  document.querySelector('.profile-settings-edit')?.addEventListener('click', async () => {
    const full_name = window.prompt('Full name', details.full_name || '');
    if (!full_name) return;
    try { await api.put('/auth/profile', { full_name }); details.full_name = full_name; document.getElementById('profile-name').textContent = full_name; toast.success('Profile updated.'); } catch (error) { toast.error(error.message); }
  });

  initThemeSegment();
}

document.addEventListener('DOMContentLoaded', init);

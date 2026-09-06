// theme.js — dark/light mode with persistence + smooth cross-fade.
import { getItem, setItem } from './storage.js';

const THEME_KEY = 'theme';

export function getTheme() {
  return getItem(THEME_KEY, matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  setItem(THEME_KEY, theme);
  document.querySelectorAll('[data-theme-label]').forEach((el) => {
    el.textContent = theme === 'dark' ? 'Dark' : 'Light';
  });
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
  });
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function initTheme() {
  applyTheme(getTheme());
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleTheme());
  });
}

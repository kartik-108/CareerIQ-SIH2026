// navigation-init.js — included on every authenticated page right after
// app.js. Kept separate from navigation.js itself so navigation.js stays a
// pure, importable module with no side effects at import time.
import { initNavigation, bindLogout } from './navigation.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  bindLogout();
});

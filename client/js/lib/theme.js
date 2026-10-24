/** Light/dark theme. theme-init.js applies the saved choice before first paint. */

const KEY = 'aerotrack-theme';
const listeners = new Set();

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let theme = initial();
document.documentElement.classList.toggle('dark', theme === 'dark');

export const getTheme = () => theme;

export function setTheme(t) {
  theme = t;
  document.documentElement.classList.toggle('dark', t === 'dark');
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(t));
}

export const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

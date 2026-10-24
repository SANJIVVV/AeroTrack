/** Logo, theme/sound toggles and status badges shared by many pages. */
import { STATUS_LABELS } from '/shared/index.js';
import { html, cx } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { badge } from '../lib/ui.js';
import { getTheme, toggleTheme, subscribeTheme } from '../lib/theme.js';
import { soundEnabled, setSoundEnabled, subscribeSound } from '../lib/audio.js';

export function logoMark(cls = 'logo-mark') {
  return html`<svg viewBox="0 0 512 512" class="${cls}" aria-hidden="true">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#071426" /><stop offset="1" stop-color="#246bfd" /></linearGradient>
    </defs>
    <rect width="512" height="512" rx="120" fill="url(#lg)" />
    <rect x="156" y="196" width="200" height="190" rx="28" fill="none" stroke="#55d6ff" stroke-width="26" />
    <path d="M206 196v-34a20 20 0 0 1 20-20h60a20 20 0 0 1 20 20v34" fill="none" stroke="#55d6ff" stroke-width="26" />
    <path d="M118 300 L394 300" stroke="#fff" stroke-width="22" stroke-linecap="round" />
    <path d="M332 262 L394 300 L332 338" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

export function logo({ to = '/', light = false } = {}) {
  return html`<a href="${to}" class="logo ${light ? 'logo-light' : ''}" aria-label="AeroTrack Pro home">
    ${logoMark()}
    <span class="logo-text">AeroTrack<span class="logo-accent"> Pro</span></span>
  </a>`;
}

/* --------------------------- Theme and sound toggles ------------------------ */

export function themeToggle(cls = '') {
  return html`<button type="button" class="${cx('icon-btn', cls)}" data-toggle="theme"></button>`;
}

export function soundToggle(cls = '') {
  return html`<button type="button" class="${cx('icon-btn', cls)}" data-toggle="sound"></button>`;
}

function paintToggles(root = document) {
  const dark = getTheme() === 'dark';
  for (const b of root.querySelectorAll('[data-toggle=theme]')) {
    b.innerHTML = String(icon(dark ? 'sun' : 'moon', 'i-5'));
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    b.setAttribute('aria-pressed', String(dark));
    b.title = dark ? 'Light mode' : 'Dark mode';
  }
  const on = soundEnabled();
  for (const b of root.querySelectorAll('[data-toggle=sound]')) {
    b.innerHTML = String(icon(on ? 'volume2' : 'volumeX', 'i-5'));
    b.setAttribute('aria-label', on ? 'Turn sound effects off' : 'Turn sound effects on');
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Sound effects on' : 'Sound effects off';
  }
}

/** Wires every theme/sound toggle on the page (call once at start-up). */
export function initToggles() {
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-toggle]') : null;
    if (!t) return;
    if (t.dataset.toggle === 'theme') toggleTheme();
    if (t.dataset.toggle === 'sound') setSoundEnabled(!soundEnabled());
  });
  subscribeTheme(() => paintToggles());
  subscribeSound(() => paintToggles());
  // New toggles appear whenever a page renders, so paint them as they arrive.
  new MutationObserver(() => {
    for (const b of document.querySelectorAll('[data-toggle]:empty')) paintToggles(b.parentElement);
  }).observe(document.body, { childList: true, subtree: true });
  paintToggles();
}

/* ---------------------------------- Badges ---------------------------------- */

const STATUS_TONE = {
  REGISTERED: 'neutral',
  CHECKED_IN: 'brand',
  SECURITY_SCREENING: 'brand',
  LOADED: 'brand',
  IN_TRANSIT: 'info',
  ARRIVED: 'info',
  ON_BELT: 'ok',
  COLLECTED: 'ok',
  DELAYED: 'warn',
  MISSING: 'danger',
  INCIDENT_REPORTED: 'danger',
};

export const statusBadge = (status) => badge(STATUS_LABELS[status], STATUS_TONE[status]);

export const demoBadge = (label = 'DEMO') => badge(html`${icon('flaskConical', 'i-3')}${label}`, 'demo', 'Simulated data for demonstration. Not real airport activity.');

const SOURCE = {
  verified: { label: 'Verified scan', tone: 'ok', iconName: 'shieldCheck', title: 'Recorded by an authorised scan or staff action' },
  simulated: { label: 'Simulated', tone: 'demo', iconName: 'flaskConical', title: 'Demo / simulated event' },
  predicted: { label: 'Prediction', tone: 'brand', iconName: 'sparkles', title: 'Model or rules estimate, not an observed event' },
  cached: { label: 'Cached', tone: 'warn', iconName: 'database', title: 'Saved earlier; may be out of date' },
  unknown: { label: 'Unknown', tone: 'neutral', iconName: 'helpCircle', title: 'Source unknown' },
};

export function sourceBadge(source) {
  const s = SOURCE[source] ?? SOURCE.unknown;
  return badge(html`${icon(s.iconName, 'i-3')}${s.label}`, s.tone, s.title);
}

const FLIGHT_SOURCE = {
  live: { label: 'Live', tone: 'ok', iconName: 'radio', title: 'From the configured flight-data provider' },
  cached: { label: 'Cached', tone: 'warn', iconName: 'database', title: 'Last provider refresh failed; showing saved data' },
  manual: { label: 'Entered by staff', tone: 'brand', iconName: 'pencilLine', title: 'Entered manually by airport staff' },
  demo: { label: 'Demo sample', tone: 'demo', iconName: 'flaskConical', title: 'Sample flight for demonstrations. Not a real schedule.' },
  unavailable: { label: 'Unavailable', tone: 'neutral', iconName: 'cloudOff', title: 'No data source available' },
};

export function flightSourceBadge(source) {
  const s = FLIGHT_SOURCE[source] ?? FLIGHT_SOURCE.unavailable;
  return badge(html`${icon(s.iconName, 'i-3')}${s.label}`, s.tone, s.title);
}

export const severityBadge = (severity) => badge(severity.toUpperCase(), severity === 'high' ? 'danger' : severity === 'medium' ? 'warn' : 'neutral');

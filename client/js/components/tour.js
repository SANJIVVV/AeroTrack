/** Guided first-time tour. Keyboard: ←/→ to move, Esc to skip. */
import { html, cx } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { patch } from '../lib/api.js';
import { button } from '../lib/ui.js';

const KEY = 'aerotrack-tour-done';

export const TOUR_STEPS = [
  { id: 'register', iconName: 'userPlus', title: 'Create your account', body: 'Sign up with your name, email and a strong password. Passwords are hashed on the server and never stored in plain text.', link: { to: '/register', label: 'Open registration' } },
  { id: 'verify', iconName: 'mailCheck', title: 'Verify your email', body: 'We email you a 6-digit code that expires after 5 minutes. Baggage registration unlocks once your email is verified.', link: { to: '/settings', label: 'Check verification status' } },
  { id: 'bag', iconName: 'luggage', title: 'Register a bag', body: 'Pick your flight from the directory and describe the bag. You get a reference such as AT-2026-100245 and a QR tag that contains nothing personal.', link: { to: '/baggage/new', label: 'Register baggage' } },
  { id: 'scan', iconName: 'scanLine', title: 'QR checkpoint scans', body: 'Airport staff scan the tag at check-in, security, loading, departure, arrival, the belt and collection. If the camera fails, they type the reference instead.' },
  { id: 'history', iconName: 'history', title: 'Checkpoint history', body: 'Every scan is stored with time, checkpoint and source. "Verified scan" means a real authorised scan; "Simulated" marks demo data. Skipped checkpoints are highlighted.' },
  { id: 'predict', iconName: 'sparkles', title: 'Delay-risk estimate', body: 'A transparent estimate shows the risk, the factors behind it and an uncertainty range. It is a prompt for attention, not a confirmed delay.' },
  { id: 'alerts', iconName: 'bellRing', title: 'Alerts and notifications', body: 'You are notified in the app (and by email if configured) when your bag is checked in, loaded, arrives or reaches the belt. Staff see explainable anomaly alerts.', link: { to: '/notifications', label: 'View notifications' } },
  { id: 'incident', iconName: 'lifeBuoy', title: 'Report a problem', body: 'If a bag is missing, delayed, damaged or misrouted, file an incident. Staff investigate, add notes and resolve it, and you see every update.', link: { to: '/incidents/new', label: 'Report an incident' } },
];

export function tourDone() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

let overlay = null;

export function openTour(start = 0) {
  closeTour(false);
  const restoreFocus = document.activeElement;
  let step = start;
  let showHelp = false;
  overlay = document.createElement('div');
  overlay.className = 'tour-overlay';

  const finish = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    patch('/users/me', { tutorialCompleted: true }).catch(() => {});
    closeTour();
    restoreFocus?.focus?.();
  };

  const render = () => {
    const s = TOUR_STEPS[step];
    const last = step === TOUR_STEPS.length - 1;
    overlay.innerHTML = String(html`<div class="card tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" tabindex="-1">
      <div class="tour-head">
        <span class="tour-step">Tour · step ${step + 1} of ${TOUR_STEPS.length}</span>
        <div class="row gap-1">
          <button type="button" class="icon-btn icon-btn-sm" data-tour="help" aria-expanded="${showHelp}" aria-label="Tour help">${icon('helpCircle')}</button>
          <button type="button" class="icon-btn icon-btn-sm" data-tour="skip" aria-label="Skip tour">${icon('x')}</button>
        </div>
      </div>
      <div class="p-6">
        <div class="tour-icon">${icon(s.iconName, 'i-6')}</div>
        <h2 id="tour-title" class="tour-title">${s.title}</h2>
        <p id="tour-body" class="tour-body">${s.body}</p>
        ${s.link ? html`<a href="${s.link.to}" class="tour-link" data-tour="link">${s.link.label} →</a>` : ''}
        ${showHelp ? html`<p class="tour-help">Use the arrow keys or the buttons to move between steps. Press Esc or “Skip” to close. You can replay this tour any time from the help menu or the Tutorial page.</p>` : ''}
        <div class="tour-dots" aria-hidden="true">${TOUR_STEPS.map((t, i) => html`<button type="button" tabindex="-1" data-tour-step="${i}" class="${cx('tour-dot', i <= step && 'on')}"></button>`)}</div>
      </div>
      <div class="tour-foot">
        <div class="row gap-2">
          ${button('Skip', { variant: 'ghost', size: 'sm', attrs: html`data-tour="skip"` })}
          ${button(html`${icon('rotateCcw', 'i-3')} Restart`, { variant: 'ghost', size: 'sm', disabled: step === 0, attrs: html`data-tour="restart"` })}
        </div>
        <div class="row gap-2">
          ${button(html`${icon('arrowLeft')} Previous`, { variant: 'secondary', size: 'sm', disabled: step === 0, attrs: html`data-tour="prev"` })}
          ${last ? button('Finish', { size: 'sm', attrs: html`data-tour="skip"` }) : button(html`Next ${icon('arrowRight')}`, { size: 'sm', attrs: html`data-tour="next"` })}
        </div>
      </div>
    </div>`);
    overlay.querySelector('.tour-card').focus();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) return finish();
    const t = e.target.closest('[data-tour],[data-tour-step]');
    if (!t) return;
    if (t.dataset.tourStep !== undefined) step = Number(t.dataset.tourStep);
    const a = t.dataset.tour;
    if (a === 'skip' || a === 'link') return finish();
    if (a === 'help') showHelp = !showHelp;
    if (a === 'restart') step = 0;
    if (a === 'prev') step = Math.max(0, step - 1);
    if (a === 'next') step = Math.min(TOUR_STEPS.length - 1, step + 1);
    render();
  });
  overlay.onKey = (e) => {
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight' && step < TOUR_STEPS.length - 1) (step++, render());
    else if (e.key === 'ArrowLeft' && step > 0) (step--, render());
  };
  window.addEventListener('keydown', overlay.onKey);
  document.body.append(overlay);
  render();
}

function closeTour() {
  if (!overlay) return;
  window.removeEventListener('keydown', overlay.onKey);
  overlay.remove();
  overlay = null;
}

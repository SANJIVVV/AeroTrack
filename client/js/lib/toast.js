/** Toast notifications in the bottom-right corner (polite live region). */
import { html } from './dom.js';
import { icon } from './icons.js';

const ICONS = { ok: 'checkCircle2', warn: 'alertTriangle', danger: 'xCircle', info: 'info' };
let region;

function ensureRegion() {
  if (region) return region;
  region = document.createElement('div');
  region.className = 'toasts';
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'false');
  document.body.append(region);
  return region;
}

/** toast({ tone: 'ok' | 'warn' | 'danger' | 'info', title, body? }) */
export function toast({ tone = 'info', title, body }) {
  const root = ensureRegion();
  while (root.children.length > 3) root.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = 'toast card';
  el.setAttribute('role', 'status');
  el.innerHTML = String(html`
    <span class="toast-icon tone-${tone}">${icon(ICONS[tone])}</span>
    <div class="toast-text">
      <p class="semibold">${title}</p>
      ${body ? html`<p class="muted">${body}</p>` : ''}
    </div>
    <button type="button" class="toast-close" aria-label="Dismiss notification">${icon('x')}</button>
  `);
  el.querySelector('.toast-close').addEventListener('click', () => el.remove());
  root.append(el);
  setTimeout(() => el.remove(), 6000);
}

/**
 * Reusable UI pieces as functions that return safe HTML. Interactive pieces
 * (dialogs, busy buttons) have small helpers that work on real DOM nodes.
 */
import { html, cx, uid } from './dom.js';
import { icon } from './icons.js';

/* ---------------------------------- Buttons --------------------------------- */

const btnClass = (variant = 'primary', size = 'md', extra) => cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, extra);

/** <button>. `attrs` is extra trusted attribute markup, e.g. html`data-action="save"`. */
export function button(label, { variant, size, type = 'button', cls, attrs = '', disabled = false } = {}) {
  return html`<button type="${type}" class="${btnClass(variant, size, cls)}" ${attrs} ${disabled ? html`disabled` : ''}>${label}</button>`;
}

/** Link styled as a button. */
export function buttonLink(href, label, { variant, size, cls, attrs = '' } = {}) {
  return html`<a href="${href}" class="${btnClass(variant, size, cls)}" ${attrs}>${label}</a>`;
}

/** Shows a spinner on a button and disables it while `promise` runs. */
export async function withBusy(btn, promise) {
  if (!btn) return promise;
  const before = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = `${icon('loader2', 'i-4 spin')}${before}`;
  try {
    return await promise;
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = before;
  }
}

/* ----------------------------------- Cards ---------------------------------- */

export function cardHeader({ title, subtitle, action, iconName }) {
  return html`<div class="card-header">
    <div class="card-header-main">
      ${iconName ? html`<div class="card-header-icon">${icon(iconName, 'i-5')}</div>` : ''}
      <div class="min-w-0">
        <h2 class="card-title">${title}</h2>
        ${subtitle ? html`<p class="card-subtitle">${subtitle}</p>` : ''}
      </div>
    </div>
    ${action ?? ''}
  </div>`;
}

/* ------------------------------ Badges & notes ------------------------------ */

/** tone: neutral | info | ok | warn | danger | brand | demo */
export function badge(content, tone = 'neutral', title) {
  return html`<span class="badge tone-${tone}" ${title ? html`title="${title}"` : ''}>${content}</span>`;
}

const CALLOUT_ICONS = { info: 'info', ok: 'checkCircle2', warn: 'alertTriangle', danger: 'xCircle' };

export function callout({ tone = 'info', title, body }) {
  return html`<div class="callout tone-${tone}" role="${tone === 'danger' ? 'alert' : 'status'}">
    ${icon(CALLOUT_ICONS[tone], 'i-4 callout-icon')}
    <div class="callout-text">
      ${title ? html`<p class="semibold fg">${title}</p>` : ''}
      ${body ? html`<div class="muted">${body}</div>` : ''}
    </div>
  </div>`;
}

/* ----------------------------------- Forms ---------------------------------- */

/**
 * Labelled form field. `control(id, describedBy)` returns the input markup so
 * the label, hint and error are wired to it for screen readers.
 */
export function field({ label, hint, error, id = uid(), control }) {
  const hintId = hint ? `${id}-hint` : '';
  const errId = error ? `${id}-err` : '';
  const describedBy = [hintId, errId].filter(Boolean).join(' ');
  return html`<div class="field">
    <label for="${id}" class="field-label">${label}</label>
    ${control(id, describedBy)}
    ${hint && !error ? html`<p id="${hintId}" class="field-hint">${hint}</p>` : ''}
    <p id="${id}-err" class="field-error" ${error ? '' : html`hidden`}>${error ?? ''}</p>
  </div>`;
}

/** Common input markup. `attrs` is trusted attribute markup. */
export const input = (id, attrs = '', describedBy = '', cls = '') => html`<input id="${id}" class="${cx('input', cls)}" ${describedBy ? html`aria-describedby="${describedBy}"` : ''} ${attrs} />`;
export const textarea = (id, attrs = '', value = '', cls = '') => html`<textarea id="${id}" class="${cx('input textarea', cls)}" ${attrs}>${value}</textarea>`;

/** <select> with options [{ value, label }]. */
export function select(id, options, { value = '', attrs = '', cls } = {}) {
  return html`<select id="${id}" class="${cx('input select', cls)}" ${attrs}>
    ${options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(value) ? html`selected` : ''}>${o.label}</option>`)}
  </select>`;
}

/** Shows or clears a field's error message under it. */
export function setFieldError(form, id, message) {
  const p = form.querySelector(`#${CSS.escape(id)}-err`);
  const control = form.querySelector(`#${CSS.escape(id)}`);
  if (p) {
    p.textContent = message ?? '';
    p.hidden = !message;
  }
  if (control) control.setAttribute('aria-invalid', message ? 'true' : 'false');
}

/* --------------------------------- States ---------------------------------- */

export const spinner = (label = 'Loading') => html`<div role="status" class="spinner-row">${icon('loader2', 'i-5 spin')} ${label}…</div>`;

export const skeleton = (cls = '') => html`<div class="${cx('skeleton', cls)}" aria-hidden="true"></div>`;

export function emptyState({ iconName = 'inbox', title, body, action }) {
  return html`<div class="empty">
    <div class="empty-icon">${icon(iconName, 'i-6')}</div>
    <p class="semibold">${title}</p>
    ${body ? html`<p class="empty-body">${body}</p>` : ''}
    ${action ? html`<div class="mt-4">${action}</div>` : ''}
  </div>`;
}

/** Error panel; a "Try again" button carries data-action="retry". */
export function errorState(error, retry = false) {
  return html`<div class="p-5">
    ${callout({
      tone: 'danger',
      title: 'Could not load this data',
      body: html`${error instanceof Error ? error.message : 'Unknown error'}
      ${retry ? html`<div class="mt-2">${button('Try again', { variant: 'secondary', size: 'sm', attrs: html`data-action="retry"` })}</div>` : ''}`,
    })}
  </div>`;
}

/** Pagination bar; buttons carry data-page. */
export function pagination({ page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return '';
  return html`<nav class="pagination" aria-label="Pagination">
    <span class="muted">Page ${page} of ${pages} · ${total} total</span>
    <div class="row gap-2">
      ${button(icon('chevronLeft'), { variant: 'secondary', size: 'sm', disabled: page <= 1, attrs: html`data-page="${page - 1}" aria-label="Previous page"` })}
      ${button(icon('chevronRight'), { variant: 'secondary', size: 'sm', disabled: page >= pages, attrs: html`data-page="${page + 1}" aria-label="Next page"` })}
    </div>
  </nav>`;
}

export function pageHeader({ title, subtitle, actions, eyebrow }) {
  return html`<header class="page-header">
    <div class="min-w-0">
      ${eyebrow ? html`<div class="page-eyebrow">${eyebrow}</div>` : ''}
      <h1 class="page-title">${title}</h1>
      ${subtitle ? html`<div class="page-subtitle">${subtitle}</div>` : ''}
    </div>
    ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

export function stat({ label, value, iconName, tone = 'brand', hint }) {
  return html`<section class="card stat">
    <div class="stat-top">
      <p class="stat-label">${label}</p>
      <div class="stat-icon tone-${tone}">${icon(iconName)}</div>
    </div>
    <p class="stat-value">${value}</p>
    ${hint ? html`<p class="stat-hint">${hint}</p>` : ''}
  </section>`;
}

/* ---------------------------------- Dialog ---------------------------------- */

/**
 * Accessible modal built on <dialog>. Returns { el, body, close }. The body
 * markup is rendered once; callers wire their own events on `el`.
 */
export function openDialog({ title, body, footer, wide = false, onClose }) {
  const dlg = document.createElement('dialog');
  dlg.className = cx('dialog', wide && 'dialog-wide');
  const titleId = uid('dlg');
  dlg.setAttribute('aria-labelledby', titleId);
  dlg.innerHTML = String(html`<div>
    <div class="dialog-head">
      <h2 id="${titleId}" class="bold">${title}</h2>
      <button type="button" class="icon-btn" data-dialog-close aria-label="Close dialog">${icon('x', 'i-5')}</button>
    </div>
    <div class="dialog-body">${body}</div>
    ${footer ? html`<div class="dialog-foot">${footer}</div>` : ''}
  </div>`);
  document.body.append(dlg);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (dlg.open) dlg.close();
    dlg.remove();
    onClose?.();
  };
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-dialog-close]')) close();
  });
  dlg.showModal?.();
  return { el: dlg, body: dlg.querySelector('.dialog-body'), close };
}

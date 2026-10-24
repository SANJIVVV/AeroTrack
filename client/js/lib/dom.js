/**
 * Tiny HTML helpers. Pages build markup with the `html` tagged template:
 * every interpolated value is escaped unless it is already safe HTML (the
 * result of another `html` call, or `raw(...)`). Arrays are joined, and
 * null/undefined/false render as nothing, so conditionals read naturally:
 *
 *   html`<p>${user.name}</p>${isAdmin && html`<b>Admin</b>`}`
 */

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Marks a string as trusted HTML. Only use for markup this app generated itself. */
export const raw = (value) => new SafeHtml(String(value));

function renderValue(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Joins class names, skipping falsy ones. */
export const cx = (...c) => c.filter(Boolean).join(' ');

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let counter = 0;
/** Unique id for label/input pairs. */
export const uid = (prefix = 'f') => `${prefix}-${++counter}`;

/** Replaces an element's content with markup. */
export function setHtml(el, markup) {
  if (el) el.innerHTML = String(markup);
  return el;
}

/**
 * Delegated event handling: `on(root, 'click', '[data-action=save]', (e, el) => ...)`.
 * Returns a function that removes the listener.
 */
export function on(root, type, selector, handler, options) {
  const listener = (e) => {
    const target = e.target instanceof Element ? e.target.closest(selector) : null;
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

/** Reads a form's named fields into a plain object (strings). */
export function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export const prefersReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

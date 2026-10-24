/** Date and text formatting used across pages. */

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(iso, now = Date.now()) {
  if (!iso) return 'never';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return rtf.format(diff, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export const pct = (n) => `${Math.round(n * 100)}%`;

export const titleCase = (s) => s.toLowerCase().replace(/(^|[_\s-])(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase());

/** Where each role lands after signing in. */
export const homeFor = (role) => (role === 'admin' ? '/admin' : role === 'staff' ? '/staff' : '/dashboard');

export const timeOfDay = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const shortDay = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

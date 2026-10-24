/**
 * Thin fetch wrapper for the AeroTrack API. Sessions use an httpOnly cookie,
 * so every request sends credentials; the X-Requested-With header satisfies
 * the server's CSRF check on state-changing requests.
 */

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Same origin by default: the Node server serves both the pages and the API.
const BASE = window.AEROTRACK_API_BASE ?? '';

function withQuery(path, query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}

export async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${withQuery(path, opts.query)}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'aerotrack',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', navigator.onLine ? 'Cannot reach the AeroTrack server. Is it running?' : 'You appear to be offline.');
  }
  if (res.status === 204) return undefined;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Request failed (${res.status}).`, e?.details);
  }
  return data;
}

export const get = (path, query) => api(path, { query });
export const post = (path, body) => api(path, { method: 'POST', body: body ?? {} });
export const patch = (path, body) => api(path, { method: 'PATCH', body: body ?? {} });
export const del = (path) => api(path, { method: 'DELETE' });

export function errorMessage(err) {
  if (err instanceof ApiError) {
    const details = Array.isArray(err.details) ? err.details : [];
    return details.length ? `${err.message} ${details.map((d) => `${d.field ? `${d.field}: ` : ''}${d.message}`).join('; ')}` : err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

/**
 * Signed-in user state. The session itself is an httpOnly cookie, so the
 * browser only keeps the public profile returned by /api/auth/me.
 */
import { get, post } from './api.js';

const listeners = new Set();
const state = { user: null, emailMode: null, loaded: false };
let pending = null;

export const auth = {
  get user() {
    return state.user;
  },
  get emailMode() {
    return state.emailMode;
  },
  get loaded() {
    return state.loaded;
  },

  /** Loads /auth/me once; later calls reuse the result unless `force` is set. */
  async load(force = false) {
    if (state.loaded && !force) return state.user;
    pending ??= get('/auth/me')
      .then((r) => {
        state.user = r?.user ?? null;
        state.emailMode = r?.emailMode ?? null;
      })
      .catch(() => {
        state.user = null;
      })
      .finally(() => {
        state.loaded = true;
        pending = null;
        emit();
      });
    await pending;
    return state.user;
  },

  refresh() {
    return this.load(true);
  },

  setUser(user) {
    state.user = user;
    state.loaded = true;
    emit();
  },

  async logout() {
    try {
      await post('/auth/logout');
    } finally {
      state.user = null;
      emit();
    }
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function emit() {
  listeners.forEach((l) => l(state.user));
}

export const isStaff = (u) => u?.role === 'staff' || u?.role === 'admin';

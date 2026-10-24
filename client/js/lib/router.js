/**
 * Minimal client-side router on the History API.
 *
 * Routes are `{ path: '/baggage/:ref', layout, roles?, auth?, load }` where
 * `load()` imports the page module and returns its render function. A page
 * function receives a context and draws into `ctx.el`; it may register
 * cleanup work (timers, camera) with `ctx.onCleanup(fn)`, which runs when the
 * user navigates away.
 */

let routes = [];
let renderRoute = async () => {};
let cleanups = [];
let current = null;

/** Turns '/airlines/:code' into a matcher. */
export function compile(path) {
  const keys = [];
  const pattern = path === '*' ? '.*' : path.replace(/\/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '/([^/]+)'));
  const re = new RegExp(`^${pattern}/?$`);
  return (pathname) => {
    const m = re.exec(pathname);
    if (!m) return null;
    return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  };
}

export function match(pathname) {
  for (const r of routes) {
    const params = r.matcher(pathname);
    if (params) return { route: r, params };
  }
  return null;
}

export function setupRouter(table, render) {
  routes = table.map((r) => ({ ...r, matcher: compile(r.path) }));
  renderRoute = render;
  window.addEventListener('popstate', () => void go());
  document.addEventListener('click', onLinkClick);
}

function onLinkClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (!a || a.target || a.hasAttribute('download') || a.dataset.native !== undefined) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Same-page anchors (#faq) just scroll.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) {
    e.preventDefault();
    history.replaceState(history.state, '', url.hash);
    document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}

/** Navigates within the app. `state` is kept in history (like router state). */
export function navigate(to, { replace = false, state = null } = {}) {
  if (replace) history.replaceState(state, '', to);
  else history.pushState(state, '', to);
  return go();
}

export function runCleanups() {
  const list = cleanups;
  cleanups = [];
  for (const fn of list) {
    try {
      fn();
    } catch {
      /* ignore cleanup errors */
    }
  }
}

export const onCleanup = (fn) => cleanups.push(fn);

export const currentRoute = () => current;

async function go() {
  runCleanups();
  const found = match(location.pathname);
  current = found;
  await renderRoute(found, { query: new URLSearchParams(location.search), state: history.state, hash: location.hash });
}

export const start = () => go();

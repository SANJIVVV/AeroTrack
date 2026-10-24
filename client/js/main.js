/**
 * AeroTrack Pro browser app: plain ES modules, no framework and no build step.
 * This file lists the routes, loads the signed-in user and draws each page
 * inside the right layout.
 */
import { html } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { auth } from './lib/auth.js';
import { homeFor } from './lib/format.js';
import { setupRouter, navigate, start, onCleanup, currentRoute } from './lib/router.js';
import { spinner } from './lib/ui.js';
import { initToggles } from './components/common.js';
import { initImages, markLoadedImages } from './components/media.js';
import { publicLayout, appLayout, bareLayout } from './components/layouts.js';
import { initReveal } from './lib/reveal.js';
import './lib/audio.js';

const page = (loader, name) => async () => (await loader())[name];
const general = () => import('./pages/general.js');
const passenger = () => import('./pages/passenger.js');
const staff = () => import('./pages/staff.js');
const admin = () => import('./pages/admin.js');
const authPages = () => import('./pages/auth.js');
const airlines = () => import('./pages/airlines.js');
const about = () => import('./pages/about.js');

const ALL = ['passenger', 'staff', 'admin'];
const STAFF = ['staff', 'admin'];

/** layout: public | app | bare. roles: who may open it (implies sign-in). */
const ROUTES = [
  { path: '/', layout: 'public', load: page(() => import('./pages/landing.js'), 'landingPage') },
  { path: '/about', layout: 'public', load: page(about, 'aboutPage') },
  { path: '/privacy', layout: 'public', load: page(about, 'privacyPage') },
  { path: '/airlines', layout: 'public', load: page(airlines, 'airlinesPage') },
  { path: '/airlines/:code', layout: 'public', load: page(airlines, 'airlineDetailPage') },
  { path: '/tutorial', layout: 'public', load: page(general, 'tutorialPage') },
  { path: '/dev-outbox', layout: 'public', load: page(authPages, 'devOutboxPage') },
  { path: '/forbidden', layout: 'public', load: page(general, 'forbiddenPage') },

  { path: '/login', layout: 'bare', load: page(authPages, 'loginPage') },
  { path: '/register', layout: 'bare', load: page(authPages, 'registerPage') },
  { path: '/verify-email', layout: 'bare', load: page(authPages, 'verifyEmailPage') },
  { path: '/forgot-password', layout: 'bare', load: page(authPages, 'forgotPasswordPage') },
  { path: '/reset-password', layout: 'bare', redirect: '/forgot-password' },
  { path: '/app', layout: 'bare', redirect: () => (auth.user ? homeFor(auth.user.role) : '/login') },

  { path: '/dashboard', layout: 'app', roles: ['passenger'], load: page(passenger, 'passengerDashboard') },
  { path: '/baggage/new', layout: 'app', roles: ALL, load: page(passenger, 'registerBaggagePage') },
  { path: '/baggage/:ref', layout: 'app', roles: ALL, load: page(passenger, 'baggageDetailPage') },
  { path: '/track', layout: 'app', roles: ALL, load: page(passenger, 'trackPage') },
  { path: '/track/:ref', layout: 'app', roles: ALL, load: page(passenger, 'baggageDetailPage') },
  { path: '/flights', layout: 'app', roles: ALL, load: page(general, 'flightsPage') },
  { path: '/flights/:id', layout: 'app', roles: ALL, load: page(general, 'flightDetailPage') },
  { path: '/incidents', layout: 'app', roles: ALL, load: page(general, 'incidentsPage') },
  { path: '/incidents/new', layout: 'app', roles: ALL, load: page(general, 'newIncidentPage') },
  { path: '/incidents/:id', layout: 'app', roles: ALL, load: page(general, 'incidentDetailPage') },
  { path: '/notifications', layout: 'app', roles: ALL, load: page(general, 'notificationsPage') },
  { path: '/settings', layout: 'app', roles: ALL, load: page(general, 'settingsPage') },
  { path: '/staff', layout: 'app', roles: STAFF, load: page(staff, 'staffDashboard') },
  { path: '/staff/baggage', layout: 'app', roles: STAFF, load: page(staff, 'baggageSearchPage') },
  { path: '/staff/alerts', layout: 'app', roles: STAFF, load: page(staff, 'alertsPage') },
  { path: '/staff/board', layout: 'app', roles: STAFF, load: page(() => import('./pages/board.js'), 'baggageBoardPage') },
  { path: '/admin', layout: 'app', roles: STAFF, load: page(admin, 'analyticsPage') },
  { path: '/admin/users', layout: 'app', roles: ['admin'], load: page(admin, 'usersPage') },
  { path: '/admin/audit', layout: 'app', roles: ['admin'], load: page(admin, 'auditPage') },
  { path: '/admin/system', layout: 'app', roles: ['admin'], load: page(admin, 'systemPage') },

  { path: '*', layout: 'public', load: page(general, 'notFoundPage') },
];

const LAYOUTS = { public: publicLayout, app: appLayout, bare: bareLayout };
const appEl = document.getElementById('app');
let layout = null;
let layoutName = null;
let layoutUser = null;
let navToken = 0;

function errorPanel(err) {
  console.error(err);
  return html`<div role="alert" class="error-page">
    <div class="center">
      ${icon('alertOctagon', 'i-10 danger')}
      <h1 class="h2 mt-3">Something went wrong</h1>
      <p class="muted mt-2">This page hit an unexpected error. Your data is safe on the server.</p>
      <div class="row center-row gap-2 mt-6">
        <button type="button" class="btn btn-primary" data-action="reload">Reload</button>
        <a class="btn btn-secondary" href="/">Home</a>
      </div>
    </div>
  </div>`;
}

async function render(found, { query, state, hash }) {
  const { route, params } = found;
  const token = ++navToken;
  if (!auth.loaded) await auth.load();
  if (token !== navToken) return; // a newer navigation started meanwhile
  const user = auth.user;

  if (route.redirect) return navigate(typeof route.redirect === 'function' ? route.redirect() : route.redirect, { replace: true });
  if (route.roles && !user) return navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
  if (route.roles && !route.roles.includes(user.role)) return navigate('/forbidden', { replace: true });

  // Keep the shell while staying in the same layout (and, for the app shell, the same user).
  if (layoutName !== route.layout || (route.layout === 'app' && layoutUser !== user)) {
    layout?.destroy();
    layoutName = route.layout;
    layoutUser = user;
    layout = LAYOUTS[route.layout](appEl, navigate);
  }
  layout.update(location.pathname);

  // Each page draws into a fresh container, so a slow request from the
  // previous page can never write into the new one.
  const el = document.createElement('div');
  el.className = 'page-enter';
  layout.main.replaceChildren(el);
  if (hash) requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }));
  else window.scrollTo(0, 0);

  const ctx = { el, params, query, state: state ?? {}, user, navigate, onCleanup, layout };
  try {
    el.innerHTML = String(spinner());
    const draw = await route.load();
    if (token !== navToken) return;
    await draw(ctx);
    markLoadedImages(el);
  } catch (err) {
    el.innerHTML = String(errorPanel(err));
    el.querySelector('[data-action=reload]').addEventListener('click', () => location.reload());
  }
}

// When the session ends elsewhere (sign out), leave protected pages.
auth.subscribe((user) => {
  if (user) return;
  setTimeout(() => {
    if (!auth.user && currentRoute()?.route.roles) navigate('/login', { replace: true });
  }, 0);
});

initToggles();
initImages();
initReveal();
setupRouter(ROUTES, render);
start();

if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

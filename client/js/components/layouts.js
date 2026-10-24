/**
 * Page shells. Each layout renders once into #app and returns an object with
 * `main` (where pages draw), `update(pathname)` for active links, and
 * `destroy()`. Moving between pages of the same layout keeps the shell.
 */
import { html } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { auth } from '../lib/auth.js';
import { get } from '../lib/api.js';
import { homeFor } from '../lib/format.js';
import { logo, themeToggle, soundToggle } from './common.js';
import { openTour, tourDone } from './tour.js';

export const GITHUB_URL = 'https://github.com/SANJIVVV/AeroTrack';

/* ------------------------------- Public layout ------------------------------ */

const LINKS = [
  { to: '/track', label: 'Track baggage' },
  { to: '/airlines', label: 'Airlines' },
  { to: '/about', label: 'About us' },
];

/** Pages that open with a dark photo hero, so the nav starts transparent. */
const DARK_HERO = /^\/($|airlines(\/[^/]+)?$|about$)/;

function publicNavActions(user, overHero) {
  if (user) return html`<a href="${homeFor(user.role)}" class="btn ${overHero ? 'btn-light' : 'btn-primary'}">Open dashboard</a>`;
  return html`<a href="/login" class="btn btn-ghost nav-signin">Sign in</a>
    <a href="/register" class="btn ${overHero ? 'btn-light' : 'btn-primary'}">Get started</a>`;
}

function footer(user) {
  const links = [['/track', 'Track Baggage'], ['/airlines', 'Airlines'], user ? [homeFor(user.role), 'Dashboard'] : ['/login', 'Sign in'], ['/about', 'About Us'], ['/privacy', 'Privacy']];
  return html`<div class="footer-glow" aria-hidden="true"></div>
    <div class="container footer-grid">
      <div>
        ${logo({ light: true })}
        <p class="footer-about">Smart airline baggage tracking with QR tags, verified checkpoint scans and a validated operations board. An MCA academic project at PSG College of Technology.</p>
      </div>
      <nav aria-label="Footer">
        <ul class="footer-links">
          ${links.map(([to, label]) => html`<li><a href="${to}">${label}</a></li>`)}
          <li><a href="${GITHUB_URL}" target="_blank" rel="noreferrer" class="row gap-1">${icon('github')} GitHub</a></li>
        </ul>
      </nav>
    </div>
    <div class="footer-legal">© ${new Date().getFullYear()} AeroTrack team · Academic project. Not affiliated with or endorsed by any airline or airport. Airline flights, gates and belts are demonstration data. Photos via Unsplash.</div>`;
}

export function publicLayout(app) {
  app.innerHTML = String(html`<div class="public-shell">
    <header class="pub-nav" id="pub-nav">
      <a href="#main" class="skip-link">Skip to content</a>
      <nav class="container pub-nav-inner" aria-label="Main">
        <span data-slot="logo"></span>
        <ul class="pub-links">
          ${LINKS.map((l) => html`<li><a href="${l.to}" class="pub-link">${l.label}</a></li>`)}
        </ul>
        <div class="row gap-1">
          ${soundToggle('nav-toggle')} ${themeToggle('nav-toggle')}
          <div class="pub-actions" data-slot="actions"></div>
          <button type="button" class="icon-btn pub-menu-btn" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu">${icon('menu', 'i-5')}</button>
        </div>
      </nav>
      <div id="mobile-menu" class="mobile-menu" hidden>
        <ul>${LINKS.map((l) => html`<li><a href="${l.to}">${l.label}</a></li>`)}</ul>
        <div class="mobile-menu-actions" data-slot="mobile-actions"></div>
      </div>
    </header>
    <main id="main" class="public-main"></main>
    <footer class="site-footer" data-slot="footer"></footer>
  </div>`);

  const nav = app.querySelector('#pub-nav');
  const menu = app.querySelector('#mobile-menu');
  const menuBtn = app.querySelector('.pub-menu-btn');
  let path = location.pathname;
  let scrolled = false;

  const paint = () => {
    const user = auth.user;
    const open = !menu.hidden;
    const overHero = DARK_HERO.test(path) && !scrolled && !open;
    nav.classList.toggle('over-hero', overHero);
    nav.querySelector('[data-slot=logo]').innerHTML = String(logo({ light: overHero }));
    nav.querySelector('[data-slot=actions]').innerHTML = String(publicNavActions(user, overHero));
    menu.querySelector('[data-slot=mobile-actions]').innerHTML = String(
      user ? html`<a href="${homeFor(user.role)}" class="btn btn-primary span-2">Open dashboard</a>` : html`<a href="/login" class="btn btn-secondary">Sign in</a><a href="/register" class="btn btn-primary">Get started</a>`,
    );
    for (const a of nav.querySelectorAll('.pub-link')) a.classList.toggle('active', path === a.getAttribute('href') || path.startsWith(`${a.getAttribute('href')}/`));
    app.querySelector('[data-slot=footer]').innerHTML = String(footer(user));
  };

  const setMenu = (open) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menuBtn.innerHTML = String(icon(open ? 'x' : 'menu', 'i-5'));
    paint();
  };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));

  const onScroll = () => {
    const s = window.scrollY > 24;
    if (s !== scrolled) {
      scrolled = s;
      paint();
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  const unsub = auth.subscribe(paint);
  paint();

  return {
    main: app.querySelector('#main'),
    update(pathname) {
      path = pathname;
      scrolled = window.scrollY > 24;
      if (!menu.hidden) setMenu(false);
      else paint();
    },
    destroy() {
      window.removeEventListener('scroll', onScroll);
      unsub();
    },
  };
}

/* -------------------------------- App layout -------------------------------- */

const NAV = [
  { to: '/dashboard', label: 'My baggage', iconName: 'layoutDashboard', roles: ['passenger'] },
  { to: '/track', label: 'Track baggage', iconName: 'radar', roles: ['passenger', 'staff', 'admin'] },
  { to: '/baggage/new', label: 'Register bag', iconName: 'luggage', roles: ['passenger', 'staff', 'admin'] },
  { to: '/staff', label: 'Scanner', iconName: 'scanLine', roles: ['staff', 'admin'], end: true },
  { to: '/staff/board', label: 'Baggage board', iconName: 'columns3', roles: ['staff', 'admin'] },
  { to: '/staff/baggage', label: 'Baggage search', iconName: 'packageSearch', roles: ['staff', 'admin'] },
  { to: '/staff/alerts', label: 'Anomaly alerts', iconName: 'shieldAlert', roles: ['staff', 'admin'] },
  { to: '/admin', label: 'Analytics', iconName: 'barChart3', roles: ['staff', 'admin'], end: true },
  { to: '/admin/users', label: 'Users & roles', iconName: 'users', roles: ['admin'] },
  { to: '/admin/audit', label: 'Audit log', iconName: 'scrollText', roles: ['admin'] },
  { to: '/admin/system', label: 'Checkpoints & demo', iconName: 'wrench', roles: ['admin'] },
  { to: '/flights', label: 'Flights', iconName: 'plane', roles: ['passenger', 'staff', 'admin'] },
  { to: '/airlines', label: 'Airlines', iconName: 'globe2', roles: ['passenger', 'staff', 'admin'] },
  { to: '/incidents', label: 'Incidents', iconName: 'lifeBuoy', roles: ['passenger', 'staff', 'admin'] },
  { to: '/notifications', label: 'Notifications', iconName: 'bell', roles: ['passenger', 'staff', 'admin'] },
  { to: '/settings', label: 'Settings', iconName: 'settings', roles: ['passenger', 'staff', 'admin'] },
];

function sideNav(user) {
  const items = NAV.filter((n) => n.roles.includes(user.role));
  return html`<nav aria-label="Dashboard" class="side-nav">
    <div class="side-nav-logo">${logo()}</div>
    <ul class="side-nav-list">
      ${items.map(
        (n) => html`<li><a href="${n.to}" class="side-link" data-end="${n.end ? '1' : ''}">${icon(n.iconName, 'i-4')} ${n.label}${n.to === '/notifications' ? html`<span class="unread-count" hidden></span>` : ''}</a></li>`,
      )}
    </ul>
    <div class="side-nav-user">
      <div class="avatar" aria-hidden="true">${user.name.slice(0, 1).toUpperCase()}</div>
      <div class="min-w-0 flex-1">
        <p class="truncate small semibold">${user.name}</p>
        <p class="xs muted capitalize">${user.role}</p>
      </div>
      <button type="button" class="icon-btn icon-btn-sm" data-action="logout" aria-label="Sign out" title="Sign out">${icon('logOut')}</button>
    </div>
  </nav>`;
}

export function appLayout(app, navigate) {
  const user = auth.user;
  app.innerHTML = String(html`<div class="app-shell">
    <a href="#main" class="skip-link">Skip to content</a>
    <aside class="app-sidebar">${sideNav(user)}</aside>
    <div class="drawer" hidden role="dialog" aria-modal="true" aria-label="Navigation">
      <div class="drawer-backdrop" data-action="close-drawer"></div>
      <aside class="drawer-panel">
        <button type="button" class="icon-btn drawer-close" data-action="close-drawer" aria-label="Close navigation">${icon('x', 'i-5')}</button>
        ${sideNav(user)}
      </aside>
    </div>
    <div class="min-w-0">
      <header class="app-header">
        <div class="row gap-2">
          <button type="button" class="icon-btn hide-lg" data-action="open-drawer" aria-label="Open navigation">${icon('menu', 'i-5')}</button>
          <span class="hide-lg">${logo()}</span>
        </div>
        <div class="row gap-1">
          <button type="button" class="icon-btn" data-action="tour" aria-label="Help and tour" title="Replay the guided tour">${icon('helpCircle', 'i-5')}</button>
          <a href="/notifications" class="icon-btn bell" aria-label="Notifications">${icon('bell', 'i-5')}<span class="bell-dot" hidden></span></a>
          ${soundToggle()} ${themeToggle()}
        </div>
      </header>
      <div class="banner banner-warn" data-slot="offline" role="status" ${navigator.onLine ? html`hidden` : ''}>${icon('wifiOff')} You are offline. Information on screen may be out of date.</div>
      ${!user.emailVerified
        ? html`<div class="banner banner-info" role="status">${icon('mailWarning')} Your email is not verified yet, so you cannot register baggage. <a href="/settings" class="semibold underline">Resend verification</a></div>`
        : ''}
      <main id="main" class="app-main"></main>
    </div>
  </div>`);

  const drawer = app.querySelector('.drawer');
  const offline = app.querySelector('[data-slot=offline]');
  const onClick = async (e) => {
    const a = e.target instanceof Element ? e.target.closest('[data-action]') : null;
    if (!a) return;
    const action = a.dataset.action;
    if (action === 'open-drawer') drawer.hidden = false;
    if (action === 'close-drawer') drawer.hidden = true;
    if (action === 'tour') openTour(0);
    if (action === 'logout') {
      await auth.logout();
      navigate('/');
    }
  };
  app.addEventListener('click', onClick);
  const online = () => (offline.hidden = navigator.onLine);
  window.addEventListener('online', online);
  window.addEventListener('offline', online);

  const refreshUnread = async () => {
    try {
      const r = await get('/notifications', { pageSize: 1 });
      const n = r?.unread ?? 0;
      for (const c of app.querySelectorAll('.unread-count')) {
        c.hidden = n === 0;
        c.textContent = String(n);
      }
      app.querySelector('.bell-dot').hidden = n === 0;
      app.querySelector('.bell').setAttribute('aria-label', `Notifications${n ? `, ${n} unread` : ''}`);
    } catch {
      /* the badge simply stays as it was */
    }
  };
  void refreshUnread();
  const timer = setInterval(refreshUnread, 60_000);

  if (user.role === 'passenger' && !tourDone()) setTimeout(() => openTour(0), 300);

  return {
    main: app.querySelector('#main'),
    user,
    update(pathname) {
      drawer.hidden = true;
      for (const a of app.querySelectorAll('.side-link')) {
        const to = a.getAttribute('href');
        const active = a.dataset.end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
      void refreshUnread();
    },
    refreshUnread,
    destroy() {
      clearInterval(timer);
      app.removeEventListener('click', onClick);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    },
  };
}

/** Auth pages and other full-screen pages draw their own shell. */
export function bareLayout(app) {
  app.innerHTML = '<div id="main-bare"></div>';
  return { main: app.firstElementChild, update() {}, destroy() {} };
}


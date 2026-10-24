/** Flights, incidents, notifications, settings, the tutorial and error pages. */
import { AIRLINE_DIRECTORY, FLIGHT_STATUSES, FLIGHT_STATUS_LABELS, INCIDENT_STATUSES, INCIDENT_TYPES, STATUS_LABELS } from '/shared/index.js';
import { html, cx, on } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { errorMessage, get, patch, post } from '../lib/api.js';
import { auth } from '../lib/auth.js';
import { toast } from '../lib/toast.js';
import { formatDateTime, formatRelative, titleCase } from '../lib/format.js';
import { badge, button, buttonLink, callout, cardHeader, emptyState, errorState, field, input, pageHeader, pagination, select, spinner, textarea, withBusy } from '../lib/ui.js';
import { demoBadge, flightSourceBadge } from '../components/common.js';
import { flightStatusPill } from '../components/flights.js';
import { TOUR_STEPS, openTour } from '../components/tour.js';

const anyOption = (label = 'Any') => [{ value: '', label }];
const enumOptions = (values, label = titleCase) => values.map((v) => ({ value: v, label: label(v) }));

/**
 * Loads a list into `slot`, drawing a spinner, error panel (with retry),
 * empty state or the rows plus pagination. `state.page` changes through the
 * pagination buttons. Returns a `reload()` function.
 */
function listLoader(slot, { fetch, empty, rows, state }) {
  const reload = async () => {
    slot.innerHTML = String(spinner());
    try {
      const data = await fetch();
      slot.innerHTML = String(html`${data.items.length === 0 ? empty(data) : rows(data)}${pagination({ page: state.page, pageSize: 20, total: data.total })}`);
      return data;
    } catch (err) {
      slot.innerHTML = String(errorState(err, true));
    }
  };
  on(slot, 'click', '[data-action=retry]', () => void reload());
  on(slot, 'click', '[data-page]', (_e, btn) => {
    state.page = Number(btn.dataset.page);
    void reload();
  });
  return reload;
}

/* ---------------------------------- Flights --------------------------------- */

export async function flightsPage(ctx) {
  const state = { search: '', airline: '', page: 1 };
  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Flights', title: 'Flight directory', subtitle: 'Sample flights from the airline directory, plus any flights entered by staff. Each one shows its source.' })}
    <div class="mb-6">
      ${callout({ tone: 'info', title: 'No live flight data', body: 'AeroTrack Pro does not use an external flight API. Sample flights are demonstration data; staff-entered flights are labelled “Staff-entered”. Check real times with the airline.' })}
    </div>
    <div class="grid g-side">
      <section class="card">
        <form class="filter-bar" data-form="filters">
          <div class="grow">${field({ label: 'Search', id: 'fl-search', control: (id) => input(id, html`name="search" placeholder="Flight, airport or airline"`) })}</div>
          ${field({ label: 'Airline', id: 'fl-airline', control: (id) => select(id, [...anyOption('All airlines'), ...AIRLINE_DIRECTORY.map((a) => ({ value: a.code, label: a.name }))], { attrs: html`name="airline"` }) })}
          ${button(html`${icon('search')} Search`, { type: 'submit' })}
        </form>
        <div data-slot="list"></div>
      </section>
      <aside class="stack-6">
        <section class="card">
          ${cardHeader({ title: 'Airlines' })}
          <ul class="divided">
            ${AIRLINE_DIRECTORY.map(
              (a) => html`<li class="row between gap-2 px-5 py-3 small">
                <span><span class="mono xs muted">${a.code}</span> ${a.name}</span>
                <a href="${a.officialSite}" target="_blank" rel="noreferrer noopener" class="link xs row gap-1" aria-label="${a.name} official website (opens in new tab)">Official site ${icon('externalLink', 'i-3')}</a>
              </li>`,
            )}
          </ul>
          <p class="card-foot xs muted">Demonstration directory. <a href="/airlines" class="link">Open the airline showcase</a></p>
        </section>
      </aside>
    </div>
  `);
  const form = ctx.el.querySelector('[data-form=filters]');
  const reload = listLoader(ctx.el.querySelector('[data-slot=list]'), {
    state,
    fetch: () => get('/flights', { ...state, pageSize: 20 }),
    empty: () => emptyState({ iconName: 'plane', title: 'No flights found', body: 'Staff can add flights manually; administrators can seed clearly labelled demo flights.' }),
    rows: (data) => html`<ul class="divided">
      ${data.items.map(
        (fl) => html`<li>
          <a href="/flights/${fl.id}" class="list-link py-4">
            <span class="row gap-4">
              <span class="code-chip">${fl.airlineCode}</span>
              <span>
                <span class="block semibold">${fl.flightNumber} <span class="normal muted">· ${fl.airlineName}</span></span>
                <span class="block small muted">${fl.origin} → ${fl.destination} · ${formatDateTime(fl.scheduledDeparture)}</span>
              </span>
            </span>
            <span class="row wrap gap-1">${badge(titleCase(fl.status), fl.status === 'DELAYED' || fl.status === 'CANCELLED' ? 'warn' : 'neutral')}${flightSourceBadge(fl.source)}</span>
          </a>
        </li>`,
      )}
    </ul>`,
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    state.search = form.elements.search.value.trim();
    state.page = 1;
    void reload();
  });
  form.elements.airline.addEventListener('change', () => {
    state.airline = form.elements.airline.value;
    state.page = 1;
    void reload();
  });
  await reload();
}

export async function flightDetailPage(ctx) {
  const user = auth.user;
  const load = async () => {
    ctx.el.innerHTML = String(spinner());
    let data;
    try {
      data = await get(`/flights/${encodeURIComponent(ctx.params.id)}`);
    } catch (err) {
      ctx.el.innerHTML = String(errorState(err, true));
      ctx.el.querySelector('[data-action=retry]').addEventListener('click', load);
      return;
    }
    const { flight, baggageCount, airline } = data;
    const sample = flight.isDemo ? ' (sample)' : '';
    const canEdit = user && user.role !== 'passenger' && (flight.source === 'demo' || flight.source === 'manual');
    ctx.el.innerHTML = String(html`
      ${pageHeader({
        eyebrow: flight.airlineName,
        title: `${flight.flightNumber}: ${flight.origin} → ${flight.destination}`,
        subtitle: html`<span class="row wrap gap-2">${flightSourceBadge(flight.source)}${flight.isDemo ? demoBadge() : ''}</span>`,
        actions: user?.role === 'passenger' ? buttonLink(`/baggage/new?flight=${encodeURIComponent(flight.id)}`, 'Register a bag on this flight') : '',
      })}
      <section class="card p-6">
        <dl class="grid g-3 gap-5">
          <div><dt class="small muted">Scheduled departure</dt><dd class="lg bold">${formatDateTime(flight.scheduledDeparture)}</dd></div>
          <div><dt class="small muted">Scheduled arrival</dt><dd class="lg bold">${formatDateTime(flight.scheduledArrival)}</dd></div>
          <div><dt class="small muted">Status${sample}</dt><dd class="mt-1">${flightStatusPill(flight.status, flight.isDemo)}</dd></div>
          <div><dt class="small muted">Gate · baggage belt${sample}</dt><dd class="lg bold">${flight.gate ?? 'Not set'} · ${flight.baggageBelt ?? 'Not set'}</dd></div>
          <div><dt class="small muted">Last successful refresh</dt><dd class="semibold">${flight.lastRefreshedAt ? `${formatDateTime(flight.lastRefreshedAt)} (${formatRelative(flight.lastRefreshedAt)})` : 'Never'}</dd></div>
          <div><dt class="small muted">${user?.role === 'passenger' ? 'Your bags on this flight' : 'Registered bags'}</dt><dd class="semibold">${baggageCount}</dd></div>
          ${airline
            ? html`<div><dt class="small muted">Official information</dt><dd><a href="${airline.officialSite}" target="_blank" rel="noreferrer noopener" class="link row gap-1">${airline.name} website ${icon('externalLink', 'i-3')}</a></dd></div>`
            : ''}
        </dl>
        <p class="mt-6 xs muted">Flight status does not reveal where an individual suitcase is. Baggage location comes only from checkpoint scans.</p>
      </section>
      ${canEdit ? flightEditor(flight) : ''}
    `);
    if (canEdit) wireFlightEditor(ctx.el.querySelector('[data-form=flight]'), flight, load);
  };
  await load();
}

/** Staff/admin: update a demonstration or staff-entered flight's status, gate and belt (audited). */
function flightEditor(flight) {
  return html`<section class="card p-6 mt-6">
    ${cardHeader({ title: 'Manage flight', subtitle: flight.isDemo ? 'Demonstration record: changes are labelled as sample data, not operational information.' : 'Staff-entered flight.' })}
    <form class="grid g-4 items-end" data-form="flight">
      ${field({ label: 'Status', id: 'fe-status', control: (id) => select(id, enumOptions(FLIGHT_STATUSES, (s) => FLIGHT_STATUS_LABELS[s]), { value: flight.status, attrs: html`name="status"` }) })}
      ${field({ label: 'Gate', id: 'fe-gate', control: (id) => input(id, html`name="gate" maxlength="6" placeholder="B12" value="${flight.gate ?? ''}"`, '', 'uppercase') })}
      ${field({ label: 'Baggage belt', id: 'fe-belt', control: (id) => input(id, html`name="baggageBelt" maxlength="4" placeholder="4" value="${flight.baggageBelt ?? ''}"`, '', 'uppercase') })}
      ${button('Save', { type: 'submit' })}
    </form>
  </section>`;
}

function wireFlightEditor(form, flight, reload) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const els = form.elements;
    try {
      await withBusy(
        e.submitter,
        patch(`/flights/${flight.id}`, { status: els.status.value, gate: els.gate.value.trim().toUpperCase() || null, baggageBelt: els.baggageBelt.value.trim().toUpperCase() || null }),
      );
      toast({ tone: 'ok', title: 'Flight updated', body: flight.isDemo ? 'Saved. This remains a demonstration record.' : 'Saved.' });
      void reload();
    } catch (err) {
      toast({ tone: 'danger', title: 'Not saved', body: errorMessage(err) });
    }
  });
}

/* --------------------------------- Incidents -------------------------------- */

const incidentTone = (s) => (s === 'RESOLVED' || s === 'CLOSED' ? 'ok' : s === 'INVESTIGATING' ? 'info' : 'warn');

export async function incidentsPage(ctx) {
  const staff = auth.user?.role !== 'passenger';
  const state = { status: '', type: '', page: 1 };
  ctx.el.innerHTML = String(html`
    ${pageHeader({
      eyebrow: 'Incidents',
      title: staff ? 'Incident investigations' : 'My incident reports',
      subtitle: staff ? 'Investigate passenger reports, add notes and resolve cases.' : 'Reports you filed about missing, delayed, damaged or misrouted bags.',
      actions: staff ? '' : buttonLink('/incidents/new', html`${icon('lifeBuoy')} Report a problem`),
    })}
    <section class="card">
      <form class="filter-bar" data-form="filters">
        ${field({ label: 'Status', id: 'in-status', control: (id) => select(id, [...anyOption(), ...enumOptions(INCIDENT_STATUSES)], { attrs: html`name="status"` }) })}
        ${field({ label: 'Type', id: 'in-type', control: (id) => select(id, [...anyOption(), ...enumOptions(INCIDENT_TYPES)], { attrs: html`name="type"` }) })}
      </form>
      <div data-slot="list"></div>
    </section>
  `);
  const form = ctx.el.querySelector('[data-form=filters]');
  const reload = listLoader(ctx.el.querySelector('[data-slot=list]'), {
    state,
    fetch: () => get('/incidents', { ...state, scope: 'all', pageSize: 20 }),
    empty: () => emptyState({ iconName: 'lifeBuoy', title: 'No incidents' }),
    rows: (data) => html`<ul class="divided">
      ${data.items.map(
        (i) => html`<li>
          <a href="/incidents/${i.id}" class="list-link py-4">
            <span class="min-w-0">
              <span class="block semibold">${titleCase(i.type)} · <span class="mono small">${i.reference}</span></span>
              <span class="block truncate small muted">${i.description}</span>
              <span class="block xs muted">${i.reporterName ? `${i.reporterName} · ` : ''}updated ${formatRelative(i.updatedAt)}</span>
            </span>
            <span class="row gap-1">${badge(titleCase(i.status), incidentTone(i.status))}${i.isDemo ? demoBadge() : ''}</span>
          </a>
        </li>`,
      )}
    </ul>`,
  });
  form.addEventListener('change', () => {
    state.status = form.elements.status.value;
    state.type = form.elements.type.value;
    state.page = 1;
    void reload();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  await reload();
}

export async function newIncidentPage(ctx) {
  const preset = ctx.query.get('ref') ?? '';
  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Incidents', title: 'Report a baggage problem', subtitle: 'Staff will investigate and update you here and by notification.' })}
    <section class="card max-w-2xl">
      <form class="p-6 stack-5" novalidate>
        <div data-slot="error"></div>
        ${field({ label: 'Bag', id: 'ni-bag', control: (id) => select(id, [{ value: '', label: 'Loading…' }], { attrs: html`name="reference"` }) })}
        <fieldset>
          <legend class="small semibold mb-2">What happened?</legend>
          <div class="grid g-choice">
            ${INCIDENT_TYPES.map(
              (t, i) => html`<label class="choice">
                <input type="radio" name="type" value="${t}" class="sr-only" ${i === 0 ? html`checked` : ''} />
                ${titleCase(t)}
              </label>`,
            )}
          </div>
        </fieldset>
        ${field({ label: 'Description', id: 'ni-desc', hint: 'Where and when you last saw the bag, damage details, etc.', control: (id, d) => textarea(id, html`name="description" maxlength="2000" aria-describedby="${d}"`) })}
        ${button('Submit report', { type: 'submit' })}
      </form>
    </section>
  `);
  const form = ctx.el.querySelector('form');
  const errorSlot = ctx.el.querySelector('[data-slot=error]');
  const showError = (msg) => (errorSlot.innerHTML = msg ? String(callout({ tone: 'danger', body: msg })) : '');

  get('/baggage', { pageSize: 50 })
    .then((r) => {
      const sel = form.elements.reference;
      const options = [{ value: '', label: 'Select a bag' }, ...r.items.map((b) => ({ value: b.reference, label: `${b.reference} · ${b.description} (${STATUS_LABELS[b.status]})` }))];
      // A preset reference the user can't see still appears, so the server can say why.
      if (preset && !r.items.some((b) => b.reference === preset)) options.push({ value: preset, label: preset });
      sel.outerHTML = String(select(sel.id, options, { value: preset, attrs: html`name="reference"` }));
    })
    .catch((err) => showError(`Could not load your bags: ${errorMessage(err)}`));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(null);
    const els = form.elements;
    const body = { reference: els.reference.value, type: els.type.value, description: els.description.value };
    if (!body.reference) return showError('Choose a bag.');
    if (body.description.trim().length < 10) return showError('Please describe the problem (at least 10 characters).');
    try {
      const r = await withBusy(e.submitter, post('/incidents', body));
      toast({ tone: 'ok', title: 'Incident reported', body: 'Staff will investigate and you will be notified of updates.' });
      ctx.navigate(`/incidents/${r.incident.id}`);
    } catch (err) {
      showError(errorMessage(err));
    }
  });
}

export async function incidentDetailPage(ctx) {
  const staff = auth.user?.role !== 'passenger';
  const load = async () => {
    let i;
    try {
      i = (await get(`/incidents/${encodeURIComponent(ctx.params.id)}`)).incident;
    } catch (err) {
      ctx.el.innerHTML = String(errorState(err, true));
      ctx.el.querySelector('[data-action=retry]').addEventListener('click', load);
      return;
    }
    ctx.el.innerHTML = String(html`
      ${pageHeader({
        eyebrow: 'Incident',
        title: `${titleCase(i.type)} baggage`,
        subtitle: html`<span class="row wrap gap-2">${badge(titleCase(i.status), incidentTone(i.status))}${i.isDemo ? demoBadge() : ''}<a href="/baggage/${i.reference}" class="link mono small">${i.reference}</a></span>`,
      })}
      <div class="grid ${staff ? 'g-side-lg' : ''}">
        <section class="card">
          ${cardHeader({ title: 'Report', subtitle: `Filed ${formatDateTime(i.createdAt)}${i.reporterName ? ` by ${i.reporterName}` : ''}` })}
          <p class="p-5 pre-wrap">${i.description}</p>
          <div class="border-t p-5">
            <h3 class="bold mb-3">History</h3>
            <ol class="history">
              ${i.history.map(
                (h) => html`<li>
                  <p class="small"><span class="semibold">${h.byName}</span> ${h.status ? badge(titleCase(h.status), incidentTone(h.status)) : ''}</p>
                  <p class="small muted">${h.text}</p>
                  <p class="xs muted">${formatDateTime(h.at)}</p>
                </li>`,
              )}
            </ol>
          </div>
        </section>
        ${staff
          ? html`<section class="card">
              ${cardHeader({ title: 'Investigation' })}
              <form class="p-5 stack-4" data-form="note">
                ${field({ label: 'Note', id: 'id-note', control: (id) => textarea(id, html`name="text" maxlength="1000"`) })}
                ${field({ label: 'Change status (optional)', id: 'id-status', control: (id) => select(id, [{ value: '', label: `Keep ${titleCase(i.status)}` }, ...enumOptions(INCIDENT_STATUSES.filter((s) => s !== i.status))], { attrs: html`name="status"` }) })}
                ${button('Add note', { type: 'submit', disabled: true })}
              </form>
            </section>`
          : ''}
      </div>
    `);
    const form = ctx.el.querySelector('[data-form=note]');
    if (!form) return;
    const submitBtn = form.querySelector('[type=submit]');
    form.elements.text.addEventListener('input', () => (submitBtn.disabled = !form.elements.text.value.trim()));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.elements.text.value.trim();
      if (!text) return;
      try {
        await withBusy(submitBtn, post(`/incidents/${i.id}/notes`, { text, status: form.elements.status.value || undefined }));
        toast({ tone: 'ok', title: 'Incident updated', body: 'The passenger has been notified.' });
        await load();
      } catch (err) {
        toast({ tone: 'danger', title: 'Not updated', body: errorMessage(err) });
      }
    });
  };
  ctx.el.innerHTML = String(spinner());
  await load();
}

/* ------------------------------- Notifications ------------------------------ */

const EMAIL_LABEL = {
  sent: 'Email accepted by provider',
  failed: 'Email failed',
  skipped: 'In-app only',
  'dev-outbox': 'Dev outbox (not sent)',
  disabled: 'Email not configured',
};

export async function notificationsPage(ctx) {
  const state = { page: 1, unreadOnly: false };
  ctx.el.innerHTML = String(html`
    ${pageHeader({
      eyebrow: 'Inbox',
      title: 'Notifications',
      subtitle: html`<span data-slot="unread"></span>`,
      actions: html`${button('Unread only', { variant: 'secondary', attrs: html`data-action="toggle-unread" aria-pressed="false"` })}
      ${button(html`${icon('checkCheck')} Mark all read`, { variant: 'secondary', disabled: true, attrs: html`data-action="read-all"` })}`,
    })}
    <section class="card" data-slot="list"></section>
  `);
  const unreadEl = ctx.el.querySelector('[data-slot=unread]');
  const toggleBtn = ctx.el.querySelector('[data-action=toggle-unread]');
  const readAllBtn = ctx.el.querySelector('[data-action=read-all]');
  const list = ctx.el.querySelector('[data-slot=list]');

  const reload = listLoader(list, {
    state,
    fetch: async () => {
      const data = await get('/notifications', { page: state.page, pageSize: 20, unread: state.unreadOnly ? 'true' : undefined });
      unreadEl.textContent = `${data.unread} unread`;
      readAllBtn.disabled = !data.unread;
      return data;
    },
    empty: () => emptyState({ iconName: 'bell', title: 'You’re all caught up' }),
    rows: (data) => html`<ul class="divided">
      ${data.items.map(
        (n) => html`<li class="${cx('note-row', !n.readAt && 'is-unread')}">
          <span class="note-dot" aria-hidden="true"></span>
          <div class="min-w-0 grow">
            <div class="row wrap gap-2"><p class="semibold">${n.title}</p>${n.isDemo ? demoBadge() : ''}${!n.readAt ? html`<span class="sr-only">(unread)</span>` : ''}</div>
            <p class="small muted">${n.body}</p>
            <p class="mt-1 row wrap gap-2 xs muted">${formatDateTime(n.createdAt)} <span class="row gap-1">${icon('mail', 'i-3')} ${EMAIL_LABEL[n.emailStatus] ?? n.emailStatus}</span></p>
          </div>
          <div class="note-actions">
            ${n.link ? html`<a href="${n.link}" class="link small" ${!n.readAt ? html`data-read="${n.id}"` : ''}>Open</a>` : ''}
            ${!n.readAt ? html`<button type="button" class="text-btn xs" data-mark="${n.id}">Mark read</button>` : ''}
          </div>
        </li>`,
      )}
    </ul>`,
  });

  const markRead = (ids) => post('/notifications/read', ids ? { ids } : { all: true });
  toggleBtn.addEventListener('click', () => {
    state.unreadOnly = !state.unreadOnly;
    state.page = 1;
    toggleBtn.textContent = state.unreadOnly ? 'Show all' : 'Unread only';
    toggleBtn.setAttribute('aria-pressed', String(state.unreadOnly));
    void reload();
  });
  readAllBtn.addEventListener('click', async () => {
    try {
      await withBusy(readAllBtn, markRead());
      void reload();
    } catch (err) {
      toast({ tone: 'danger', title: 'Could not mark as read', body: errorMessage(err) });
    }
  });
  on(list, 'click', '[data-mark]', async (_e, btn) => {
    try {
      await markRead([btn.dataset.mark]);
      void reload();
    } catch (err) {
      toast({ tone: 'danger', title: 'Could not mark as read', body: errorMessage(err) });
    }
  });
  // "Open" marks the notification read in the background; the router handles navigation.
  on(list, 'click', '[data-read]', (_e, a) => void markRead([a.dataset.read]).catch(() => {}));
  await reload();
}

/* --------------------------------- Settings --------------------------------- */

function prefToggle(name, title, body, checked) {
  return html`<label class="pref-row">
    <span><span class="block semibold">${title}</span><span class="small muted">${body}</span></span>
    <input type="checkbox" class="checkbox" name="${name}" ${checked ? html`checked` : ''} />
  </label>`;
}

export async function settingsPage(ctx) {
  const draw = () => {
    const user = auth.user;
    if (!user) return;
    const mode = auth.emailMode;
    ctx.el.innerHTML = String(html`
      ${pageHeader({ eyebrow: 'Account', title: 'Settings' })}
      <div class="grid g-2">
        <section class="card">
          ${cardHeader({ title: 'Profile', iconName: 'settings' })}
          <form class="p-5 stack-4" data-form="profile">
            ${field({ label: 'Name', id: 'st-name', control: (id) => input(id, html`name="fullName" value="${user.name}" autocomplete="name" maxlength="80"`) })}
            ${field({ label: 'Email', id: 'st-email', control: (id) => input(id, html`value="${user.email}" disabled`) })}
            <div class="row wrap gap-2 small">
              Role: ${badge(titleCase(user.role), 'brand')}
              Email: ${user.emailVerified ? badge('Verified', 'ok') : badge('Not verified', 'warn')}
            </div>
            ${!user.emailVerified
              ? callout({ tone: 'warn', title: 'Verify your email to register baggage', body: html`<a href="/verify-email?email=${encodeURIComponent(user.email)}&resend=1" class="semibold underline">Send a 6-digit code</a>` })
              : ''}
            ${button('Save profile', { type: 'submit' })}
          </form>
        </section>
        <section class="card">
          ${cardHeader({ title: 'Notifications', iconName: 'bell' })}
          <div class="p-5 stack-4" data-slot="prefs">
            ${prefToggle('emailNotifications', 'Email notifications', 'Status changes, delay-risk alerts and incident updates.', user.preferences.emailNotifications)}
            ${prefToggle('browserNotifications', 'Browser notifications', 'Shows a system notification for new updates while AeroTrack is open.', user.preferences.browserNotifications)}
            ${mode && mode !== 'resend' && mode !== 'smtp' ? callout({ tone: 'info', body: `This server’s email mode is “${mode}”, so no real emails are sent right now.` }) : ''}
          </div>
        </section>
        <section class="card">
          ${cardHeader({ title: 'Password', iconName: 'keyRound' })}
          <form class="p-5 stack-4" data-form="password">
            ${field({ label: 'Current password', id: 'st-cur', control: (id) => input(id, html`name="currentPassword" type="password" autocomplete="current-password"`) })}
            ${field({ label: 'New password', id: 'st-new', hint: 'At least 10 characters, with letters and a number.', control: (id, d) => input(id, html`name="newPassword" type="password" autocomplete="new-password"`, d) })}
            ${button('Change password', { type: 'submit', disabled: true })}
          </form>
        </section>
        <section class="card">
          ${cardHeader({ title: 'Sessions', iconName: 'logOut' })}
          <div class="p-5 stack-3">
            <p class="small muted">Sign out of AeroTrack Pro on every device, including this one.</p>
            ${button('Sign out everywhere', { variant: 'danger', attrs: html`data-action="logout-all"` })}
          </div>
        </section>
      </div>
    `);
    wire();
  };

  const save = async (body, btn) => {
    try {
      await withBusy(btn, patch('/users/me', body));
      await auth.refresh();
      toast({ tone: 'ok', title: 'Settings saved' });
      return true;
    } catch (err) {
      toast({ tone: 'danger', title: 'Not saved', body: errorMessage(err) });
      return false;
    }
  };

  const wire = () => {
    const profile = ctx.el.querySelector('[data-form=profile]');
    profile.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = profile.elements.fullName.value.trim();
      if (await save({ name }, e.submitter)) draw();
    });

    const prefs = ctx.el.querySelector('[data-slot=prefs]');
    prefs.addEventListener('change', async (e) => {
      const box = e.target;
      if (!(box instanceof HTMLInputElement)) return;
      let enabled = box.checked;
      if (box.name === 'browserNotifications' && enabled && 'Notification' in window && Notification.permission === 'default') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') {
          toast({ tone: 'warn', title: 'Browser notifications were not allowed' });
          box.checked = false;
          return;
        }
      }
      box.disabled = true;
      const ok = await save({ preferences: { [box.name]: enabled } });
      box.disabled = false;
      if (!ok) box.checked = !enabled;
    });

    const pw = ctx.el.querySelector('[data-form=password]');
    const pwBtn = pw.querySelector('[type=submit]');
    pw.addEventListener('input', () => (pwBtn.disabled = !pw.elements.currentPassword.value || !pw.elements.newPassword.value));
    pw.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await withBusy(pwBtn, post('/users/me/password', { currentPassword: pw.elements.currentPassword.value, newPassword: pw.elements.newPassword.value }));
        pw.reset();
        pwBtn.disabled = true;
        toast({ tone: 'ok', title: 'Password changed', body: 'Other sessions were signed out.' });
      } catch (err) {
        toast({ tone: 'danger', title: 'Not changed', body: errorMessage(err) });
      }
    });

    const allBtn = ctx.el.querySelector('[data-action=logout-all]');
    allBtn.addEventListener('click', async () => {
      try {
        await withBusy(allBtn, post('/auth/logout-all'));
      } catch (err) {
        toast({ tone: 'danger', title: 'Could not sign out everywhere', body: errorMessage(err) });
        return;
      }
      await auth.logout().catch(() => {});
      ctx.navigate('/login');
    });
  };

  draw();
}

/* ------------------------------ Public content ------------------------------ */

export async function tutorialPage(ctx) {
  ctx.el.innerHTML = String(html`<div class="container-md pt-hero pb-20">
    ${pageHeader({
      eyebrow: 'Tutorial',
      title: 'How to use AeroTrack Pro',
      subtitle: 'Eight short steps from sign-up to incident reporting. Start the interactive tour or read them below.',
      actions: button(html`${icon('compass')} Start interactive tour`, { attrs: html`data-tour-step="0"` }),
    })}
    <ol class="grid g-2">
      ${TOUR_STEPS.map(
        (s, i) => html`<li class="card row items-start gap-4 p-5">
          <div class="icon-tile">${icon(s.iconName, 'i-5')}</div>
          <div>
            <p class="mono xs muted">Step ${i + 1}</p>
            <h2 class="bold">${s.title}</h2>
            <p class="mt-1 small muted">${s.body}</p>
            <button type="button" class="text-btn link small mt-2" data-tour-step="${i}">Open in tour</button>
          </div>
        </li>`,
      )}
    </ol>
    <section class="card p-5 mt-8">
      <div class="row items-start gap-3">
        ${icon('info', 'i-5 text-info shrink-0')}
        <div class="small muted">
          <p class="semibold fg">Camera permissions for QR scanning</p>
          <p class="mt-1">Browsers only allow camera access on HTTPS pages (or localhost). When prompted, choose “Allow”. If you denied it earlier, re-enable it from the padlock or site-settings icon in the address bar. Manual entry and photo upload always work as fallbacks.</p>
        </div>
      </div>
    </section>
  </div>`);
  on(ctx.el, 'click', '[data-tour-step]', (_e, btn) => openTour(Number(btn.dataset.tourStep)));
}

export async function notFoundPage(ctx, code = 404) {
  const denied = code === 403;
  document.title = `${denied ? 'No access' : 'Page not found'} · AeroTrack Pro`;
  ctx.el.innerHTML = String(html`<div class="error-page">
    <div class="center">
      <p class="error-code">${code}</p>
      <h1 class="h2 mt-3">${denied ? 'You don’t have access to this page' : 'This gate doesn’t exist'}</h1>
      <p class="mt-2 muted">${denied ? 'Your role does not include this area.' : 'The page you were looking for may have moved.'}</p>
      <div class="row justify-center gap-2 mt-6">
        ${buttonLink('/', html`${icon('home')} Home`)}
        ${button('Go back', { variant: 'secondary', attrs: html`data-action="back"` })}
      </div>
    </div>
  </div>`);
  ctx.el.querySelector('[data-action=back]').addEventListener('click', () => history.back());
}

export const forbiddenPage = (ctx) => notFoundPage(ctx, 403);

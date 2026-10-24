/** Passenger dashboard, baggage registration, Track Baggage and the baggage detail page. */
import { AIRLINE_DIRECTORY, STATUS_LABELS, isException, nextMainStep } from '/shared/index.js';
import { html } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { ApiError, del, errorMessage, get, patch, post } from '../lib/api.js';
import { auth, isStaff } from '../lib/auth.js';
import { playSound } from '../lib/audio.js';
import { toast } from '../lib/toast.js';
import { formatDateTime, formatRelative } from '../lib/format.js';
import { badge, button, buttonLink, callout, cardHeader, emptyState, errorState, field, input, openDialog, pageHeader, select, skeleton, spinner, stat, textarea, withBusy } from '../lib/ui.js';
import { demoBadge, flightSourceBadge, statusBadge } from '../components/common.js';
import { baggageCard, eventTimeline, journeyStepper, openCorrectDialog, openQrDialog, riskCard } from '../components/baggage.js';
import { mountLookupPanel } from '../components/lookup.js';

/* -------------------------------- Dashboard --------------------------------- */

function profileCard(user) {
  const actions = [
    { to: '/track', label: 'Track baggage', iconName: 'radar' },
    { to: '/track', label: 'Scan QR', iconName: 'qrCode' },
    { to: '/settings', label: 'Settings', iconName: 'settings' },
  ];
  return html`<section class="card">
    ${cardHeader({ title: 'Profile', iconName: 'userRound' })}
    <div class="px-5 pb-4 small stack-1">
      <p class="semibold">${user.name}</p>
      <p class="break-all muted">${user.email}</p>
      <p class="xs muted">${user.emailVerified ? 'Email verified' : 'Email not verified'} · Member since ${new Date(user.createdAt).toLocaleDateString()}</p>
    </div>
    <div class="quick-actions">
      ${actions.map((a) => html`<a href="${a.to}" class="quick-action">${icon(a.iconName)} ${a.label}</a>`)}
      <button type="button" class="quick-action" data-action="logout">${icon('logOut')} Log out</button>
    </div>
  </section>`;
}

export async function passengerDashboard(ctx) {
  const user = auth.user;
  ctx.el.innerHTML = String(html`
    ${pageHeader({
      eyebrow: 'Passenger',
      title: `Hello, ${user.name.split(' ')[0]}`,
      subtitle: 'Your registered baggage, its last verified checkpoint and any alerts.',
      actions: buttonLink('/baggage/new', html`${icon('plus')} Register baggage`, { attrs: html`data-tour="register-bag"` }),
    })}
    <div class="grid g-4 mb-6" data-slot="stats"></div>
    <div class="grid g-side">
      <section aria-labelledby="bags-h">
        <h2 id="bags-h" class="h4 mb-3">My baggage</h2>
        <div data-slot="bags"><div class="grid g-2">${skeleton('h-48')}${skeleton('h-48')}</div></div>
      </section>
      <aside class="stack-6">
        ${profileCard(user)}
        <section class="card">
          ${cardHeader({ title: 'Recent activity', iconName: 'bell', action: html`<a href="/notifications" class="link small">All</a>` })}
          <div data-slot="notes">${spinner()}</div>
        </section>
        <section class="card">
          ${cardHeader({ title: 'My incident reports', iconName: 'lifeBuoy', action: html`<a href="/incidents/new" class="link small">Report</a>` })}
          <div data-slot="incidents">${spinner()}</div>
        </section>
      </aside>
    </div>
  `);
  const slot = (n) => ctx.el.querySelector(`[data-slot=${n}]`);
  ctx.el.querySelector('[data-action=logout]').addEventListener('click', async () => {
    await auth.logout();
    ctx.navigate('/');
  });

  const drawStats = (items) => {
    const loading = items === null;
    const active = loading ? '…' : items.filter((b) => b.status !== 'COLLECTED').length;
    const attention = loading ? 0 : items.filter((b) => ['DELAYED', 'MISSING', 'INCIDENT_REPORTED'].includes(b.status)).length;
    slot('stats').innerHTML = String(html`
      ${stat({ label: 'Registered bags', value: loading ? '…' : items.length, iconName: 'luggage' })}
      ${stat({ label: 'On their way', value: active, iconName: 'plane', tone: 'info' })}
      ${stat({ label: 'Need attention', value: loading ? '…' : attention, iconName: 'alertTriangle', tone: attention ? 'warn' : 'ok' })}
      ${stat({ label: 'Account', value: user.emailVerified ? 'Verified' : 'Unverified', iconName: user.emailVerified ? 'mailCheck' : 'mailWarning', tone: user.emailVerified ? 'ok' : 'warn' })}
    `);
  };
  drawStats(null);

  const loadBags = async () => {
    try {
      const r = await get('/baggage', { pageSize: 50 });
      drawStats(r.items);
      slot('bags').innerHTML = String(
        r.items.length === 0
          ? html`<section class="card">${emptyState({ iconName: 'luggage', title: 'No baggage yet', body: 'Register a bag against your flight to get its QR tag.', action: buttonLink('/baggage/new', 'Register your first bag') })}</section>`
          : html`<div class="grid g-2">${r.items.map(baggageCard)}</div>`,
      );
    } catch (err) {
      slot('bags').innerHTML = String(errorState(err, true));
      slot('bags').querySelector('[data-action=retry]').addEventListener('click', loadBags);
    }
  };

  const loadNotes = get('/notifications', { pageSize: 5 })
    .then((r) => {
      slot('notes').innerHTML = String(
        r.items.length === 0
          ? html`<p class="p-5 small muted">Nothing yet. You will be notified at key steps.</p>`
          : html`<ul class="divided">${r.items.map((n) => html`<li class="px-5 py-3"><p class="small semibold">${n.title}</p><p class="xs muted">${formatRelative(n.createdAt)}</p></li>`)}</ul>`,
      );
    })
    .catch(() => (slot('notes').innerHTML = String(html`<p class="p-5 small muted">Could not load activity.</p>`)));

  const loadIncidents = get('/incidents', { pageSize: 5 })
    .then((r) => {
      slot('incidents').innerHTML = String(
        r.items.length === 0
          ? html`<p class="p-5 small muted">No incidents reported.</p>`
          : html`<ul class="divided">${r.items.map(
              (i) => html`<li><a href="/incidents/${i.id}" class="list-link"><span class="small"><span class="semibold capitalize">${i.type.toLowerCase()}</span> · <span class="mono xs">${i.reference}</span></span>${badge(i.status, i.status === 'RESOLVED' || i.status === 'CLOSED' ? 'ok' : 'warn')}</a></li>`,
            )}</ul>`,
      );
    })
    .catch(() => (slot('incidents').innerHTML = String(html`<p class="p-5 small muted">Could not load incidents.</p>`)));

  await Promise.all([loadBags(), loadNotes, loadIncidents]);
}

/* ---------------------------- Register baggage ------------------------------ */

export async function registerBaggagePage(ctx) {
  const user = auth.user;
  const form = { airline: '', date: '', flightId: ctx.query.get('flight') ?? '' };
  let flights = [];
  let loadingFlights = false;

  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Baggage', title: 'Register baggage', subtitle: 'Choose your airline and flight, describe the bag, and get a QR tag that holds only a random reference.' })}
    ${!user.emailVerified
      ? html`<div class="mb-6">${callout({ tone: 'warn', title: 'Verify your email first', body: html`Baggage registration is available after email verification. <a href="/verify-email?email=${encodeURIComponent(user.email)}&resend=1" class="semibold underline">Send a code</a>` })}</div>`
      : ''}
    <div class="grid g-side">
      <section class="card">
        <form class="p-6 stack-6" novalidate>
          <div data-slot="error"></div>
          <fieldset class="stack-4">
            <legend class="step-legend"><span class="step-num">1</span> Flight</legend>
            <div class="grid g-2">
              ${field({ label: 'Airline', control: (id) => select(id, [{ value: '', label: 'Select an airline' }, ...AIRLINE_DIRECTORY.map((a) => ({ value: a.code, label: a.name }))], { attrs: html`name="airline"` }) })}
              ${field({ label: 'Travel date', control: (id) => select(id, [{ value: '', label: 'Choose an airline first' }], { attrs: html`name="date" disabled` }) })}
            </div>
            ${field({
              label: 'Flight number',
              hint: html`Only flights in the directory can be chosen. <a href="/airlines" class="link">Browse airlines</a>`,
              control: (id, d) => select(id, [{ value: '', label: 'Select a flight' }], { attrs: html`name="flightId" disabled aria-describedby="${d}"` }),
            })}
            <div class="grid g-3">
              ${field({ label: 'Origin', control: (id) => input(id, html`name="origin" readonly placeholder="—"`) })}
              ${field({ label: 'Destination', control: (id) => input(id, html`name="destination" readonly placeholder="—"`) })}
              ${field({ label: 'Departure', control: (id) => input(id, html`name="departure" readonly placeholder="—"`) })}
            </div>
          </fieldset>
          <fieldset class="stack-4">
            <legend class="step-legend"><span class="step-num">2</span> Bag</legend>
            ${field({ label: 'Description', hint: 'For example: Navy hard-shell suitcase with a red strap.', control: (id, d) => input(id, html`name="description" maxlength="200"`, d) })}
            <div class="grid g-2">
              ${field({ label: 'Colour (optional)', control: (id) => input(id, html`name="color" maxlength="40"`) })}
              ${field({ label: 'Weight in kg (optional)', control: (id) => input(id, html`name="weightKg" type="number" min="0" max="100" step="0.1"`) })}
            </div>
          </fieldset>
          <div class="row wrap gap-2">
            ${button(html`${icon('qrCode')} Register and create QR`, { type: 'submit', size: 'lg', disabled: !user.emailVerified })}
            ${buttonLink('/dashboard', 'Cancel', { variant: 'secondary', size: 'lg' })}
          </div>
        </form>
      </section>
      <aside class="stack-4">
        <section class="card overflow-hidden" data-slot="flight-card"></section>
        ${callout({ tone: 'info', title: 'What the QR code holds', body: 'Only a random reference such as AT-2026-100245. No name, email or flight details.' })}
      </aside>
    </div>
  `);

  const f = ctx.el.querySelector('form');
  const el = f.elements;
  const dateLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const open = () => flights.filter((x) => x.status !== 'CANCELLED' && x.status !== 'LANDED');
  const setOptions = (sel, options, value) => {
    sel.innerHTML = String(html`${options.map((o) => html`<option value="${o.value}" ${o.value === value ? html`selected` : ''}>${o.label}</option>`)}`);
  };

  const paint = () => {
    const list = open();
    const dates = [...new Set(list.map((x) => x.scheduledDeparture.slice(0, 10)))].sort();
    const choices = list.filter((x) => !form.date || x.scheduledDeparture.startsWith(form.date));
    const selected = list.find((x) => x.id === form.flightId);
    el.airline.value = form.airline;
    setOptions(el.date, [{ value: '', label: !form.airline ? 'Choose an airline first' : dates.length ? 'Any date' : 'No upcoming flights' }, ...dates.map((d) => ({ value: d, label: dateLabel(d) }))], form.date);
    setOptions(
      el.flightId,
      [{ value: '', label: loadingFlights ? 'Loading flights…' : 'Select a flight' }, ...choices.map((x) => ({ value: x.id, label: `${x.flightNumber} · ${x.origin} → ${x.destination} · ${formatDateTime(x.scheduledDeparture)}${x.isDemo ? ' · sample' : ''}` }))],
      form.flightId,
    );
    el.date.disabled = el.flightId.disabled = !form.airline || loadingFlights;
    el.origin.value = selected?.origin ?? '';
    el.destination.value = selected?.destination ?? '';
    el.departure.value = selected ? formatDateTime(selected.scheduledDeparture) : '';
    ctx.el.querySelector('[data-slot=flight-card]').innerHTML = String(html`<div class="hero-gradient p-5 white">
        <p class="eyebrow cyan">Your flight</p>
        ${selected
          ? html`<p class="mono h2 mt-2">${selected.flightNumber}</p>
              <p class="small white-75">${selected.airlineName}</p>
              <div class="row between mt-4 flight-card-route"><span>${selected.origin}</span>${icon('plane', 'i-5 cyan')}<span>${selected.destination}</span></div>
              <p class="xs white-70 mt-2">Departs ${formatDateTime(selected.scheduledDeparture)}</p>`
          : html`<p class="small white-70 mt-2">Choose an airline and a flight to see it here.</p>`}
      </div>
      ${selected
        ? html`<div class="row wrap gap-2 p-4 small">${flightSourceBadge(selected.source)}${selected.isDemo ? html`<span class="xs muted">Sample flight: the bag will be labelled DEMO and kept apart from operational records.</span>` : ''}</div>`
        : ''}`);
  };

  const loadFlights = async () => {
    loadingFlights = true;
    flights = [];
    paint();
    try {
      const r = await get('/flights', { upcoming: 'true', airline: form.airline, pageSize: 100 });
      flights = r.items;
    } catch (err) {
      toast({ tone: 'danger', title: 'Flights could not be loaded', body: errorMessage(err) });
    } finally {
      loadingFlights = false;
      paint();
    }
  };

  el.airline.addEventListener('change', () => {
    Object.assign(form, { airline: el.airline.value, date: '', flightId: '' });
    if (form.airline) void loadFlights();
    else paint();
  });
  el.date.addEventListener('change', () => {
    Object.assign(form, { date: el.date.value, flightId: '' });
    paint();
  });
  el.flightId.addEventListener('change', () => {
    form.flightId = el.flightId.value;
    paint();
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errSlot = f.querySelector('[data-slot=error]');
    const fail = (msg) => (errSlot.innerHTML = String(callout({ tone: 'danger', body: msg })));
    errSlot.innerHTML = '';
    if (!form.airline) return fail('Choose an airline.');
    if (!form.flightId) return fail('Choose a flight.');
    if (el.description.value.trim().length < 3) return fail('Describe the bag (at least 3 characters).');
    try {
      const r = await withBusy(
        f.querySelector('[type=submit]'),
        post('/baggage', { flightId: form.flightId, description: el.description.value, color: el.color.value || undefined, weightKg: el.weightKg.value ? Number(el.weightKg.value) : undefined }),
      );
      toast({ tone: 'ok', title: 'Bag registered', body: `Reference ${r.baggage.reference}` });
      ctx.navigate(`/track/${r.baggage.reference}?new=1`);
    } catch (err) {
      fail(errorMessage(err));
    }
  });

  paint();
  // Arriving from an airline page with ?flight=: preselect that flight.
  if (form.flightId) {
    try {
      const r = await get(`/flights/${form.flightId}`);
      Object.assign(form, { airline: r.flight.airlineCode, date: r.flight.scheduledDeparture.slice(0, 10), flightId: r.flight.id });
      await loadFlights();
    } catch {
      form.flightId = '';
      paint();
    }
  }
}

/* ------------------------------ Track baggage ------------------------------- */

/**
 * Camera scan, pasted QR content or a typed ID, all resolved by the same
 * backend lookup. Owners see their own bags; staff can look up any bag.
 * Unknown or inaccessible IDs show "Baggage Not Found".
 */
export async function trackPage(ctx) {
  const user = auth.user;
  const staff = isStaff(user);
  ctx.el.innerHTML = String(html`
    <div class="hero-gradient track-hero">
      <div class="grid-lines" aria-hidden="true"></div>
      <div class="relative hero-copy-sm">
        <p class="eyebrow cyan">Track baggage</p>
        <h1 class="h1 mt-2">Where was my bag last scanned?</h1>
        <p class="mt-2 white-75">Scan the tag with your camera, paste the QR content, or type the baggage ID. You can track bags you registered${staff ? ', and as staff you can look up any bag' : ''}.</p>
      </div>
    </div>
    <div class="grid g-track">
      <section class="card p-5" data-slot="lookup"></section>
      <div aria-live="polite" data-slot="result">
        <section class="card result-empty">${emptyState({ iconName: 'qrCode', title: 'No bag selected', body: "The bag's current status and journey appear here." })}</section>
      </div>
    </div>
    ${user.role === 'passenger'
      ? html`<section aria-labelledby="mine" class="mt-10">
          <h2 id="mine" class="h4 mb-3">Your bags</h2>
          <div data-slot="mine">${skeleton('h-40')}</div>
        </section>`
      : ''}
  `);
  const result = ctx.el.querySelector('[data-slot=result]');

  const lookup = async (ref) => {
    panel.setBusy(true);
    try {
      const [detail, events] = await Promise.all([get(`/baggage/${ref}`), get(`/baggage/${ref}/events`)]);
      const bag = detail.baggage;
      result.innerHTML = String(html`<section class="card p-5">
        <div class="row wrap between align-start gap-3">
          <div>
            <p class="mono h3">${bag.reference}</p>
            <p class="small muted">${bag.description}${bag.flight ? ` · ${bag.flight.flightNumber} ${bag.flight.origin} → ${bag.flight.destination}` : ''}</p>
          </div>
          <div class="row gap-2">${bag.isDemo ? demoBadge() : ''}${statusBadge(bag.status)}</div>
        </div>
        <div class="mt-6">${journeyStepper({ status: bag.status, lastMainStatus: bag.lastMainStatus, events: events.items })}</div>
        <div class="mt-6">${eventTimeline(events.items)}</div>
        <div class="row wrap gap-2 mt-6">
          ${buttonLink(`/track/${bag.reference}`, 'Open full details')}
          ${staff ? buttonLink(`/staff/board?highlight=${bag.reference}`, 'Open in Baggage Board', { variant: 'secondary' }) : ''}
        </div>
      </section>`);
      playSound('lookupSuccess');
    } catch (err) {
      const notFound = err instanceof ApiError && err.status === 404;
      result.innerHTML = String(
        notFound
          ? html`<section class="card result-empty">${emptyState({ iconName: 'alertTriangle', title: 'Baggage Not Found', body: html`No bag <span class="mono semibold">${ref}</span> exists that you are allowed to see. Check the ID and try again.` })}</section>`
          : html`<section class="card result-empty">${emptyState({ iconName: 'qrCode', title: 'No bag selected', body: "The bag's current status and journey appear here." })}</section>`,
      );
      playSound('invalid');
      if (!notFound) toast({ tone: 'danger', title: 'Lookup failed', body: errorMessage(err) });
    } finally {
      panel.setBusy(false);
    }
  };
  const panel = mountLookupPanel(ctx.el.querySelector('[data-slot=lookup]'), ctx, (ref) => void lookup(ref));

  if (user.role === 'passenger') {
    const mine = ctx.el.querySelector('[data-slot=mine]');
    try {
      const r = await get('/baggage', { pageSize: 50 });
      mine.innerHTML = String(
        r.items.length === 0
          ? html`<section class="card">${emptyState({ iconName: 'luggage', title: 'No baggage yet', action: buttonLink('/baggage/new', 'Register a bag') })}</section>`
          : html`<div class="grid g-3">${r.items.map(baggageCard)}</div>`,
      );
    } catch (err) {
      mine.innerHTML = String(errorState(err));
    }
  }
}

/* ------------------------------ Baggage detail ------------------------------ */

export async function baggageDetailPage(ctx) {
  const ref = ctx.params.ref;
  const user = auth.user;
  const staff = isStaff(user);
  let showQrOnLoad = ctx.query.get('new') === '1';

  const load = async () => {
    ctx.el.innerHTML = String(spinner('Loading baggage'));
    let detail;
    try {
      detail = await get(`/baggage/${ref}`);
    } catch (err) {
      ctx.el.innerHTML = String(errorState(err, true));
      ctx.el.querySelector('[data-action=retry]').addEventListener('click', load);
      return;
    }
    const { baggage: bag, nextStep, allowedNext } = detail;
    ctx.el.innerHTML = String(html`
      ${pageHeader({
        eyebrow: html`<span class="mono">${bag.reference}</span>`,
        title: bag.description,
        subtitle: html`<span class="row wrap gap-2">${statusBadge(bag.status)} ${bag.isDemo ? demoBadge() : ''}${bag.ownerName ? html`<span class="small">Owner: ${bag.ownerName}</span>` : ''}</span>`,
        actions: html`
          ${button(html`${icon('qrCode')} QR tag`, { variant: 'secondary', attrs: html`data-action="qr"` })}
          ${!staff ? buttonLink(`/incidents/new?ref=${bag.reference}`, html`${icon('lifeBuoy')} Report a problem`, { variant: 'secondary' }) : ''}
          ${staff ? buttonLink(`/staff/board?highlight=${bag.reference}`, html`${icon('columns3')} Open in Baggage Board`, { variant: 'secondary' }) : ''}
          ${staff ? button(html`${icon('shieldAlert')} Update status`, { attrs: html`data-action="status"` }) : ''}
          ${user.role === 'admin' ? button(html`${icon('wrench')} Correct`, { variant: 'ghost', attrs: html`data-action="correct"` }) : ''}
          ${!staff && bag.status === 'REGISTERED' ? button(html`${icon('trash2')} Remove`, { variant: 'ghost', attrs: html`data-action="remove"` }) : ''}
        `,
      })}
      ${bag.isDemo ? html`<div class="mb-6">${callout({ tone: 'info', title: 'Demo baggage', body: 'This bag and its events are simulated for demonstration. They are not real airport activity.' })}</div>` : ''}
      <section class="card mb-6 p-5 sm-p-6">
        <div data-slot="stepper">${journeyStepper({ status: bag.status, lastMainStatus: bag.lastMainStatus, events: [] })}</div>
        <dl class="detail-facts">
          <div><dt>Current verified status</dt><dd>${STATUS_LABELS[bag.status]}</dd></div>
          <div><dt>Last verified checkpoint</dt><dd>${bag.lastCheckpointName ?? 'None yet'}</dd></div>
          <div><dt>Last scan</dt><dd>${bag.lastScanAt ? `${formatDateTime(bag.lastScanAt)} (${formatRelative(bag.lastScanAt)})` : 'Not scanned yet'}</dd></div>
          <div><dt>Expected next step</dt><dd>${nextStep ? STATUS_LABELS[nextStep] : 'Journey complete'}</dd></div>
        </dl>
        <p class="xs muted mt-4">Position between scans is unknown. AeroTrack shows the last verified checkpoint, not a live location.</p>
      </section>
      <div class="grid g-side-wide">
        <section class="card">
          ${cardHeader({ title: 'Checkpoint history', iconName: 'history', subtitle: 'Every recorded event, oldest at the bottom' })}
          <div class="p-5 sm-p-6" data-slot="events">${spinner()}</div>
        </section>
        <div class="stack-6">
          <div data-slot="prediction">${skeleton('h-72')}</div>
          ${bag.flight
            ? html`<section class="card">
                ${cardHeader({ title: 'Flight', iconName: 'plane', action: flightSourceBadge(bag.flight.source) })}
                <dl class="facts-2 p-5 small">
                  <div><dt class="muted">Flight</dt><dd class="semibold">${bag.flight.flightNumber}</dd></div>
                  <div><dt class="muted">Airline</dt><dd class="semibold">${bag.flight.airlineName}</dd></div>
                  <div><dt class="muted">Route</dt><dd class="semibold">${bag.flight.origin} → ${bag.flight.destination}</dd></div>
                  <div><dt class="muted">Flight status</dt><dd class="semibold capitalize">${bag.flight.status.toLowerCase()}</dd></div>
                  <div class="span-2"><dt class="muted">Scheduled</dt><dd class="semibold">${formatDateTime(bag.flight.scheduledDeparture)} → ${formatDateTime(bag.flight.scheduledArrival)}</dd></div>
                  <div class="span-2 xs muted">Last refreshed ${formatRelative(bag.flight.lastRefreshedAt)}</div>
                </dl>
                <div class="card-foot"><a href="/flights/${bag.flight.id}" class="link small row gap-1">Flight details ${icon('externalLink', 'i-3')}</a></div>
              </section>`
            : ''}
        </div>
      </div>
    `);

    ctx.el.addEventListener('click', onAction);
    ctx.onCleanup(() => ctx.el.removeEventListener('click', onAction));
    function onAction(e) {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const action = a.dataset.action;
      if (action === 'qr') openQrDialog(bag);
      if (action === 'status') openStatusDialog(bag, allowedNext, load);
      if (action === 'correct') openCorrectDialog(bag, () => load());
      if (action === 'remove' && confirm('Remove this baggage registration?')) {
        withBusy(a, del(`/baggage/${ref}`))
          .then(() => {
            toast({ tone: 'ok', title: 'Registration removed' });
            ctx.navigate('/dashboard');
          })
          .catch((err) => toast({ tone: 'danger', title: 'Could not remove', body: errorMessage(err) }));
      }
    }
    if (showQrOnLoad) {
      showQrOnLoad = false;
      openQrDialog(bag);
    }

    const [events, prediction] = await Promise.allSettled([get(`/baggage/${ref}/events`), get(`/baggage/${ref}/prediction`)]);
    const evSlot = ctx.el.querySelector('[data-slot=events]');
    if (events.status === 'fulfilled') {
      const evs = events.value.items;
      ctx.el.querySelector('[data-slot=stepper]').innerHTML = String(journeyStepper({ status: bag.status, lastMainStatus: bag.lastMainStatus, events: evs }));
      evSlot.innerHTML = String(evs.length === 0 ? html`<p class="small muted">No events.</p>` : eventTimeline(evs));
    } else evSlot.innerHTML = String(errorState(events.reason));
    ctx.el.querySelector('[data-slot=prediction]').innerHTML = prediction.status === 'fulfilled' ? String(riskCard(prediction.value.prediction)) : '';
  };
  await load();
}

/** Staff status update: next checkpoint, an exception, or resuming the last verified step. */
function openStatusDialog(bag, allowed, onSaved) {
  // Same rule as the server: exceptions, the next journey step, or resuming the last verified step.
  const next = nextMainStep(bag.lastMainStatus);
  const options = allowed.filter((s) => isException(s) || s === next || s === bag.lastMainStatus);
  const d = openDialog({
    title: 'Update baggage status',
    body: html`<div class="stack-4">
      <p class="small muted">Record the next checkpoint, an exception (Delayed, Missing, Incident) or resume the journey. Steps cannot be skipped; an administrator can correct mistakes.</p>
      ${field({ label: 'New status', control: (id) => select(id, [{ value: '', label: 'Choose…' }, ...options.map((s) => ({ value: s, label: STATUS_LABELS[s] }))], { attrs: html`name="status"` }) })}
      ${field({ label: 'Note (optional)', control: (id) => textarea(id, html`name="note" maxlength="500"`) })}
    </div>`,
    footer: html`${button('Cancel', { variant: 'secondary', attrs: html`data-dialog-close` })}${button('Save', { disabled: true, attrs: html`data-action="save"` })}`,
  });
  const status = d.el.querySelector('[name=status]');
  const save = d.el.querySelector('[data-action=save]');
  status.addEventListener('change', () => (save.disabled = !status.value));
  save.addEventListener('click', async () => {
    try {
      await withBusy(save, patch(`/baggage/${bag.reference}/status`, { status: status.value, note: d.el.querySelector('[name=note]').value || undefined }));
      playSound('statusUpdated');
      toast({ tone: 'ok', title: 'Status updated', body: 'Saved and added to the tracking history.' });
      d.close();
      onSaved();
    } catch (e) {
      playSound('invalid');
      toast({ tone: 'danger', title: 'Not updated', body: errorMessage(e) });
    }
  });
}

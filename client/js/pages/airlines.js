/** Airline showcase: directory with search/region filters, and one airline's sample flights. */
import { AIRLINE_DIRECTORY, AIRLINE_REGIONS, HISTORICAL_BRANDS, findAirline } from '/shared/index.js';
import { html } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get } from '../lib/api.js';
import { auth } from '../lib/auth.js';
import { photo } from '../lib/photos.js';
import { callout, emptyState, skeleton } from '../lib/ui.js';
import { smartImage } from '../components/media.js';
import { airlineCard, airlineMark, replaceRevealed } from '../components/airlines.js';
import { flightStatusPill, flightTimeline, flightLabel } from '../components/flights.js';
import { notFoundPage } from './general.js';

function hero(photoKey, inner) {
  return html`<section class="page-hero">
    ${smartImage({ photoKey, width: 2000, priority: true, showIcon: false, cls: 'fill page-hero-bg', imgCls: 'anim-slow-zoom', alt: '' })}
    <div class="page-hero-shade" aria-hidden="true"></div>
    <div class="container relative">${inner}</div>
  </section>`;
}

export async function airlinesPage(ctx) {
  const state = { search: '', region: '', featured: new Map(), flightState: 'loading' };

  ctx.el.innerHTML = String(html`
    ${hero(
      'gateWindow',
      html`<div class="hero-copy-md">
          <p class="eyebrow cyan fade-up">Airline showcase</p>
          <h1 class="display-title mt-3 fade-up" style="--d:0.1s">Explore the World of Aviation</h1>
          <p class="hero-lead mt-5 fade-up" style="--d:0.2s">Browse twenty airlines from India, the Gulf, Asia, Europe and Oceania, each with sample flights you can attach a bag to. This is an editable demonstration directory, not a partnership or a live feed.</p>
        </div>
        <form class="glass filter-bar fade-up" style="--d:0.35s" role="search">
          <label class="filter-search">
            <span class="sr-only">Search airlines</span>
            ${icon('search', 'i-5 filter-search-icon')}
            <input name="search" placeholder="Search by airline, country or code" autocomplete="off" />
          </label>
          <label class="filter-region">
            <span class="sr-only">Region</span>
            <select name="region">
              <option value="">All regions</option>
              ${AIRLINE_REGIONS.map((r) => html`<option>${r}</option>`)}
            </select>
          </label>
          <button type="reset" class="filter-reset" disabled>${icon('rotateCcw')} Reset</button>
        </form>`,
    )}
    <section class="container section-sm">
      <div class="row between wrap gap-3 mb-6">
        <p class="small muted" aria-live="polite" data-slot="count"></p>
        <p class="row gap-1 xs muted">${icon('flaskConical', 'i-3')} Brand marks are text only. Sample flights, gates and belts are demonstration data.</p>
      </div>
      <div data-slot="grid"></div>
      ${HISTORICAL_BRANDS.map(
        (b) => html`<p class="historical-note">${icon('history', 'i-4')}<span><strong class="fg">${b.name} (historical brand).</strong> ${b.note}</span></p>`,
      )}
    </section>
  `);

  const form = ctx.el.querySelector('form');
  const grid = ctx.el.querySelector('[data-slot=grid]');
  const count = ctx.el.querySelector('[data-slot=count]');

  const draw = () => {
    const q = state.search.trim().toLowerCase();
    const items = AIRLINE_DIRECTORY.filter((a) => (!state.region || a.region === state.region) && (!q || a.name.toLowerCase().includes(q) || a.country.toLowerCase().includes(q) || a.code.toLowerCase() === q));
    const filtered = state.search !== '' || state.region !== '';
    form.querySelector('[type=reset]').disabled = !filtered;
    count.innerHTML = String(html`Showing <span class="bold fg">${items.length}</span> of ${AIRLINE_DIRECTORY.length} airlines`);
    replaceRevealed(
      grid,
      items.length === 0
        ? emptyState({ iconName: 'search', title: 'No airlines match', body: 'Try a different name or region.', action: html`<button type="button" class="link-btn" data-action="clear">Clear filters</button>` })
        : html`<div class="grid g-airlines">${items.map((a, i) => html`<div class="h-full" style="--d:${(i % 8) * 0.05}s">${airlineCard(a, state.featured.get(a.code), state.flightState)}</div>`)}</div>`,
    );
  };

  form.addEventListener('input', () => {
    state.search = form.search.value;
    state.region = form.region.value;
    draw();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('reset', () => {
    state.search = '';
    state.region = '';
    setTimeout(draw);
  });
  grid.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=clear]')) form.reset();
  });
  draw();

  try {
    const r = await get('/airlines');
    state.featured = new Map(r.items.map((a) => [a.code, a.featuredFlight]));
    state.flightState = 'ready';
  } catch {
    state.flightState = 'error';
  }
  draw();
}

function flightRow(f) {
  const closed = ['LANDED', 'CANCELLED', 'DEPARTED', 'IN_AIR'].includes(f.status);
  const next = `/baggage/new?flight=${f.id}`;
  return html`<li class="card accent-border flight-row reveal">
    <div>
      <p class="mono h5 bold">${flightLabel(f)}</p>
      ${flightStatusPill(f.status, f.isDemo, 'mt-1')}
    </div>
    ${flightTimeline(f, true)}
    ${closed
      ? html`<span class="xs muted flight-row-note">Bags can't be added to a ${f.status.toLowerCase()} flight</span>`
      : html`<a href="${auth.user ? next : `/login?next=${encodeURIComponent(next)}`}" class="btn btn-secondary btn-sm">${icon('luggage')} Register a bag</a>`}
  </li>`;
}

export async function airlineDetailPage(ctx) {
  const local = findAirline(ctx.params.code);
  if (!local) return notFoundPage(ctx);
  const a = local;
  const p = photo(a.image);
  ctx.el.innerHTML = String(html`
    ${hero(
      a.image,
      html`<a href="/airlines" class="back-link">${icon('arrowLeft')} All airlines</a>
        <div class="airline-hero">
          <div class="fade-up">${airlineMark(a.code, 'lg')}</div>
          <div>
            <p class="eyebrow cyan fade-up" style="--d:0.1s">${a.region} · ${a.country}</p>
            <h1 class="display-title mt-2 fade-up" style="--d:0.2s">${a.name}</h1>
            <p class="hero-lead mt-4 fade-up" style="--d:0.3s">${a.description}</p>
          </div>
        </div>
        <div class="row wrap gap-3 mt-8 small">
          <span class="glass chip">Main base: ${a.hub}</span>
          <a href="${a.officialSite}" target="_blank" rel="noreferrer" class="glass chip chip-link">Official website ${icon('externalLink', 'i-3')}</a>
          <span class="glass chip white-75">${a.photoMatchesAirline ? `Photo: ${p?.photographer ?? ''} / Unsplash` : 'Background photo is illustrative'}</span>
        </div>`,
    )}
    <section id="flights" class="container-md section-sm scroll-mt">
      <p class="eyebrow">Sample flights</p>
      <h2 class="h2 mt-2">Demonstration schedule</h2>
      <div class="mt-5">${callout({ tone: 'info', title: 'Demonstration data', body: `These flights are generated sample records stored in the project database. They are not real ${a.name} schedules or live statuses.` })}</div>
      <div class="mt-6" data-slot="flights"><div class="stack-3">${[0, 1, 2].map(() => skeleton('h-24 rounded-card'))}</div></div>
    </section>
  `);
  const slot = ctx.el.querySelector('[data-slot=flights]');
  try {
    const r = await get(`/airlines/${a.code}`);
    slot.innerHTML = String(html`<ol class="stack-3">${r.flights.map((f) => flightRow(f))}</ol>`);
  } catch {
    slot.innerHTML = String(callout({ tone: 'warn', title: 'Sample flights unavailable', body: 'The server or database could not be reached. Check that the API is running and MONGODB_URI is set (see README).' }));
  }
}

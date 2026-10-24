/** Airline directory card and text-only brand mark (no airline logos are used). */
import { html } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { photo } from '../lib/photos.js';
import { auth } from '../lib/auth.js';
import { skeleton } from '../lib/ui.js';
import { smartImage } from './media.js';
import { flightStatusPill, flightTimeline, flightLabel } from './flights.js';

export const airlineMark = (code, size = 'md') => html`<span class="airline-mark ${size === 'lg' ? 'airline-mark-lg' : ''}" aria-hidden="true">${code}</span>`;

/** flightState: 'loading' | 'error' | 'ready' */
export function airlineCard(airline, flight, flightState = 'ready') {
  const p = photo(airline.image);
  const trackHref = auth.user ? '/track' : '/login?next=/track';
  let flightBox;
  if (flightState === 'loading') flightBox = skeleton('h-24 rounded-xl');
  else if (flight)
    flightBox = html`<div class="row between gap-2 mb-2"><p class="mono small bold">${flightLabel(flight)}</p>${flightStatusPill(flight.status, flight.isDemo)}</div>
      ${flightTimeline(flight, true)}`;
  else flightBox = html`<p class="airline-card-empty">${flightState === 'error' ? 'Sample flight unavailable: the server or database could not be reached.' : 'No sample flight yet. Run npm run seed.'}</p>`;

  return html`<article class="card accent-border airline-card reveal">
    <div class="airline-card-photo">
      ${smartImage({ photoKey: airline.image, width: 800, cls: 'fill', imgCls: 'zoom-on-hover', alt: airline.photoMatchesAirline ? (p?.alt ?? '') : '' })}
      <div class="airline-card-shade" aria-hidden="true"></div>
      ${!airline.photoMatchesAirline ? html`<span class="photo-chip">Illustrative photo</span>` : ''}
      <div class="airline-card-title">
        ${airlineMark(airline.code)}
        <div>
          <p class="airline-card-name">${airline.name}</p>
          <p class="airline-card-meta">${icon('mapPin', 'i-3')} ${airline.country} · ${airline.code}</p>
        </div>
      </div>
      ${p ? html`<span class="photo-credit-sm">Photo: ${p.photographer} / Unsplash</span>` : ''}
    </div>
    <div class="airline-card-body">
      <p class="airline-card-desc">${airline.description}</p>
      <div class="airline-card-flight">${flightBox}</div>
      <div class="airline-card-actions">
        <a href="${trackHref}" class="btn btn-primary btn-sm">${icon('radar')} Track Baggage</a>
        <a href="/airlines/${airline.code}" class="btn btn-secondary btn-sm">Details ${icon('arrowUpRight')}</a>
      </div>
    </div>
  </article>`;
}

/** Re-renders a card grid without replaying the reveal animation of cards already shown. */
export function replaceRevealed(container, markup) {
  const shown = container.querySelector('.reveal.is-visible');
  container.innerHTML = String(markup);
  if (shown) for (const el of container.querySelectorAll('.reveal')) el.classList.add('is-visible');
}

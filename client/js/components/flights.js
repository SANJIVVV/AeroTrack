/** Flight status pill and compact flight timeline. */
import { FLIGHT_STATUS_LABELS, formatFlightNumber } from '/shared/index.js';
import { html, cx } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { timeOfDay, shortDay } from '../lib/format.js';

const TONE = {
  SCHEDULED: 'fs-scheduled',
  CHECK_IN_OPEN: 'fs-sky',
  BOARDING: 'fs-ok',
  DEPARTED: 'fs-sky',
  IN_AIR: 'fs-sky',
  DELAYED: 'fs-warn',
  LANDED: 'fs-muted',
  CANCELLED: 'fs-danger',
  UNKNOWN: 'fs-muted',
};

export function flightStatusPill(status, demo = false, cls = '') {
  return html`<span class="${cx('flight-pill', TONE[status], cls)}">${FLIGHT_STATUS_LABELS[status]}${demo ? html`<span class="op-70">· sample</span>` : ''}</span>`;
}

export const flightLabel = (f) => formatFlightNumber(f.flightNumber);

/** Origin → progress → destination, with times, date, gate and belt. */
export function flightTimeline(f, compact = false) {
  const dep = new Date(f.scheduledDeparture).getTime();
  const arr = new Date(f.scheduledArrival).getTime();
  const progress = Math.min(1, Math.max(0, (Date.now() - dep) / (arr - dep || 1)));
  const big = compact ? 'ft-code' : 'ft-code ft-code-lg';
  return html`<div class="flight-timeline">
    <div class="ft-row">
      <div>
        <p class="${big}">${f.origin}</p>
        <p class="ft-time">${icon('planeTakeoff', 'i-3')} ${timeOfDay(f.scheduledDeparture)}</p>
      </div>
      <div class="ft-track" aria-label="${Math.round(progress * 100)}% of the scheduled flight time elapsed">
        <div class="ft-dash"></div>
        <div class="ft-progress" style="width:${progress * 100}%"></div>
        <span class="ft-plane" style="left:${Math.max(4, Math.min(96, progress * 100))}%" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" /></svg>
        </span>
      </div>
      <div class="right">
        <p class="${big}">${f.destination}</p>
        <p class="ft-time ft-time-end">${timeOfDay(f.scheduledArrival)} ${icon('planeLanding', 'i-3')}</p>
      </div>
    </div>
    <dl class="ft-facts">
      <div><dt>Date</dt><dd>${shortDay(f.scheduledDeparture)}</dd></div>
      <div><dt>${icon('doorOpen', 'i-3')} Gate</dt><dd>${f.gate ?? 'Not set'}</dd></div>
      <div><dt>${icon('luggage', 'i-3')} Belt</dt><dd>${f.baggageBelt ?? 'Not set'}</dd></div>
    </dl>
  </div>`;
}

/**
 * Baggage pieces: summary card, journey stepper, event timeline, delay-risk
 * card, the digital QR tag, and the administrator correction dialog.
 */
import { MAIN_FLOW, STATUS_LABELS, BAGGAGE_STATUSES, isException, mainFlowIndex, formatFlightNumber, toQrPayload } from '/shared/index.js';
import { html, cx } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { errorMessage, post } from '../lib/api.js';
import { playSound } from '../lib/audio.js';
import { toast } from '../lib/toast.js';
import { formatDateTime, formatRelative, pct } from '../lib/format.js';
import { badge, button, callout, cardHeader, field, openDialog, select, skeleton, textarea, withBusy } from '../lib/ui.js';
import { demoBadge, sourceBadge, statusBadge } from './common.js';

/* ------------------------------- Summary card ------------------------------- */

export function baggageCard(bag) {
  const idx = mainFlowIndex(bag.lastMainStatus);
  return html`<a href="/baggage/${bag.reference}" class="card bag-card">
    <div class="row between align-start gap-3">
      <div class="min-w-0">
        <p class="mono small semibold brand tracking">${bag.reference}</p>
        <p class="truncate semibold mt-05">${bag.description}</p>
      </div>
      <div class="col end gap-1 shrink-0">${statusBadge(bag.status)} ${bag.isDemo ? demoBadge() : ''}</div>
    </div>
    <div class="bag-progress" aria-hidden="true">
      ${MAIN_FLOW.map((s, i) => html`<span class="${cx(i <= idx ? (isException(bag.status) && i === idx ? 'warn-bg' : 'brand-bg') : 'line-bg')}"></span>`)}
    </div>
    <dl class="bag-facts">
      ${bag.flight ? html`<div>${icon('plane')}<dt class="sr-only">Flight</dt><dd>${bag.flight.flightNumber} · ${bag.flight.origin} → ${bag.flight.destination}</dd></div>` : ''}
      <div>${icon('mapPin')}<dt class="sr-only">Last checkpoint</dt><dd>${bag.lastCheckpointName ?? 'No checkpoint scan yet'}</dd></div>
      <div>${icon('clock')}<dt class="sr-only">Last scan</dt><dd>Last verified scan ${formatRelative(bag.lastScanAt)}</dd></div>
    </dl>
  </a>`;
}

/* ----------------------------- Journey stepper ------------------------------ */

const STEP_ICONS = {
  REGISTERED: 'tag',
  CHECKED_IN: 'clipboardCheck',
  SECURITY_SCREENING: 'shieldCheck',
  LOADED: 'packageCheck',
  IN_TRANSIT: 'plane',
  ARRIVED: 'planeLanding',
  ON_BELT: 'luggage',
  COLLECTED: 'hand',
};

/** Vertical on phones, horizontal on wider screens. The progress rail animates in. */
export function journeyStepper({ status, lastMainStatus, events }) {
  const current = mainFlowIndex(lastMainStatus);
  const reached = new Set(events.map((e) => e.status));
  const progress = status === 'COLLECTED' ? 1 : current / (MAIN_FLOW.length - 1);
  return html`<div class="stepper-box"><div class="stepper" style="--progress:${progress}">
    <div class="stepper-rail" aria-hidden="true"><div class="stepper-fill"></div></div>
    <ol class="stepper-list" aria-label="Baggage journey">
      ${MAIN_FLOW.map((s, i) => {
        const done = i < current || (i === current && status === 'COLLECTED');
        const isCurrent = i === current && status !== 'COLLECTED';
        const skipped = i < current && !reached.has(s) && s !== 'REGISTERED';
        const state = skipped ? 'skipped' : done ? 'done' : isCurrent ? 'current' : 'pending';
        const word = skipped ? 'no scan recorded' : done ? 'done' : isCurrent ? 'current' : '';
        return html`<li class="step step-${state}" style="--d:${i * 0.06}s" ${isCurrent ? html`aria-current="step"` : ''}>
          <span class="step-dot">${isCurrent ? html`<span class="step-ping" aria-hidden="true"></span>` : ''}${icon(skipped ? 'alertTriangle' : STEP_ICONS[s])}</span>
          <span class="step-label">${STATUS_LABELS[s]}<span class="step-word" aria-hidden="true">${word}</span></span>
          <span class="sr-only">${skipped ? 'no scan recorded' : done ? 'completed' : isCurrent ? 'current' : 'pending'}</span>
        </li>`;
      })}
    </ol>
  </div></div>`;
}

/** Every recorded event with its data source, newest first. */
export function eventTimeline(events) {
  return html`<ol class="timeline" aria-label="Checkpoint history">
    ${[...events].reverse().map((e, idx) => {
      const exception = isException(e.status);
      return html`<li class="timeline-item">
        <span class="${cx('timeline-dot', exception ? 'is-warn' : idx === 0 && 'is-latest')}">${idx === 0 ? icon('circleDot', 'i-3 brand') : ''}</span>
        <div class="row wrap gap-2"><span class="${cx('semibold', exception && 'warn')}">${STATUS_LABELS[e.status]}</span>${sourceBadge(e.source)}</div>
        <p class="small muted mt-05">
          <time datetime="${e.occurredAt}">${formatDateTime(e.occurredAt)}</time>${e.checkpointName ? html` · ${e.checkpointName}` : ''}${e.actorRole ? html` · by ${e.actorName ?? e.actorRole}` : ''}
        </p>
        ${e.note ? html`<p class="small mt-1">${e.note}</p>` : ''}
      </li>`;
    })}
  </ol>`;
}

/* ------------------------------ Delay-risk card ----------------------------- */

const FEATURE_LABELS = {
  dwellRatio: 'Time at current checkpoint vs expected',
  skippedCheckpoints: 'Missing checkpoint scans',
  openAnomalies: 'Open anomaly alerts',
  flightDelayed: 'Flight reported delayed',
  flightCancelled: 'Flight reported cancelled',
  notLoadedNearDeparture: 'Not loaded close to departure',
  minutesSinceLastScan: 'Minutes since last scan',
  stageIndex: 'Journey stage',
  minutesToDeparture: 'Minutes to departure',
};

export function riskCard(p) {
  const tone = p.level === 'high' ? 'danger' : p.level === 'medium' ? 'warn' : 'ok';
  return html`<section class="card">
    ${cardHeader({ iconName: 'sparkles', title: 'Delay-risk estimate', subtitle: p.method === 'rules-baseline' ? 'Transparent rules baseline' : 'Logistic-regression model', action: badge('Prediction', 'brand') })}
    <div class="p-5 stack-4">
      <div>
        <div class="row between align-end"><span class="h1 tabular">${pct(p.risk)}</span>${badge(`${p.level} risk`, tone)}</div>
        <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.risk * 100)}" aria-label="Estimated delay risk">
          <div class="meter-fill ${tone}-bg" style="width:${Math.max(3, p.risk * 100)}%"></div>
        </div>
        <p class="xs muted mt-2">Uncertainty range ${pct(p.interval[0])} – ${pct(p.interval[1])}${p.computedAt ? html` · computed ${formatDateTime(p.computedAt)}` : ''}</p>
      </div>
      <div>
        <p class="small semibold mb-2">Contributing factors</p>
        ${p.factors.length === 0
          ? html`<p class="small muted">No risk factors detected right now.</p>`
          : html`<ul class="stack-1">${p.factors.map((f) => html`<li class="row between gap-3 small"><span>${FEATURE_LABELS[f.feature] ?? f.label}</span><span class="mono xs muted">+${f.contribution.toFixed(2)}</span></li>`)}</ul>`}
      </div>
      <p class="note-box">${icon('info', 'i-4 shrink-0')}<span>${p.disclaimer} It is an estimate to prompt attention, not a confirmed delay.${p.modelInfo ? html` Model ${p.modelInfo.version}, trained ${formatDateTime(p.modelInfo.trainedAt)} on ${p.modelInfo.dataOrigin}.` : ''}</span></p>
    </div>
  </section>`;
}

/* ------------------------------ Digital QR tag ------------------------------ */

/** Decorative barcode stripes derived from the reference (not a machine-readable barcode). */
function stripes(seed) {
  const clean = (s) => s.replace(/\W/g, '');
  const bars = Array.from(clean(seed) + clean(seed.split('').reverse().join(''))).map((c) => (c.charCodeAt(0) % 4) + 1);
  let x = 0;
  const rects = bars.map((w) => {
    const r = html`<rect x="${x}" y="0" width="${w}" height="20" fill="#071426" />`;
    x += w * 2 + 1;
    return r;
  });
  return html`<svg viewBox="0 0 ${x} 20" preserveAspectRatio="none" class="tag-stripes" aria-hidden="true">${rects}</svg>`;
}

/**
 * Baggage tag: AeroTrack branding, route codes, flight, baggage ID, a real QR
 * code (it encodes only AEROTRACK:BAG:<ID>) and the current status. The QR
 * image is drawn after mounting with mountQrTag().
 */
export function qrTag(reference, bag) {
  return html`<div class="qr-tag-wrap" data-qr-tag="${reference}">
    <article class="qr-tag" aria-label="Baggage tag ${reference}">
      <header class="qr-tag-head"><span class="bold">Aero<span class="cyan">Track</span></span><span class="qr-tag-kind">Baggage tag</span></header>
      <div class="qr-tag-body">
        ${bag?.flight
          ? html`<div class="row between align-end">
              <div><p class="qr-tag-k">From</p><p class="qr-tag-code">${bag.flight.origin}</p></div>
              <div class="center pb-1"><p class="mono xs bold">${formatFlightNumber(bag.flight.flightNumber)}</p><p class="qr-tag-k">${new Date(bag.flight.scheduledDeparture).toLocaleDateString([], { day: '2-digit', month: 'short' })}</p></div>
              <div class="right"><p class="qr-tag-k">To</p><p class="qr-tag-code">${bag.flight.destination}</p></div>
            </div>`
          : ''}
        <div class="qr-tag-qr" data-slot="qr">${skeleton('qr-skeleton')}</div>
        <p class="qr-tag-ref">${reference}</p>
        ${bag ? html`<p class="center xs mt-1">Status: <span class="semibold">${STATUS_LABELS[bag.status]}</span>${bag.isDemo ? html`<span class="qr-demo">DEMO</span>` : ''}</p>` : ''}
      </div>
      <div class="qr-tag-foot">${stripes(reference)}</div>
    </article>
    <div class="row gap-2 no-print">
      ${button(html`${icon('download')} Download QR`, { variant: 'secondary', size: 'sm', disabled: true, attrs: html`data-action="download-qr"` })}
      ${button(html`${icon('printer')} Print tag`, { variant: 'secondary', size: 'sm', attrs: html`data-action="print-tag"` })}
    </div>
    <p class="qr-tag-note">The QR code contains only this baggage ID. A signed-in, authorised user is needed to look it up. The stripes are decoration, not a scannable barcode.</p>
  </div>`;
}

export async function mountQrTag(root) {
  const wrap = root.querySelector('[data-qr-tag]');
  if (!wrap) return;
  const reference = wrap.dataset.qrTag;
  const slot = wrap.querySelector('[data-slot=qr]');
  const dl = wrap.querySelector('[data-action=download-qr]');
  wrap.querySelector('[data-action=print-tag]').addEventListener('click', () => window.print());
  try {
    const { default: QRCode } = await import('/vendor/qrcode.js');
    const url = await QRCode.toDataURL(toQrPayload(reference), { errorCorrectionLevel: 'M', margin: 2, width: 512, color: { dark: '#071426', light: '#ffffff' } });
    slot.innerHTML = String(html`<img src="${url}" width="200" height="200" alt="QR code for baggage ${reference}" />`);
    dl.disabled = false;
    dl.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `aerotrack-${reference}.png`;
      a.click();
    });
  } catch {
    slot.innerHTML = String(html`<p class="small muted p-5">The QR code could not be drawn.</p>`);
  }
}

export function openQrDialog(bag) {
  const d = openDialog({ title: 'Baggage QR tag', body: qrTag(bag.reference, bag) });
  void mountQrTag(d.el);
  return d;
}

/* --------------------------- Administrator correction ----------------------- */

/** Any status, reason required, recorded in the audit log by the server. */
export function openCorrectDialog(bag, onSaved) {
  const initial = bag.status === 'REGISTERED' ? 'CHECKED_IN' : 'REGISTERED';
  const d = openDialog({
    title: `Administrator correction · ${bag.reference}`,
    body: html`<div class="stack-4">
      ${callout({ tone: 'warn', body: 'Use this only to fix a mistake. It bypasses the journey rules, so a reason is required and the change is written to the audit log with your name.' })}
      ${field({ label: 'Correct status', control: (id) => select(id, BAGGAGE_STATUSES.filter((s) => s !== bag.status).map((s) => ({ value: s, label: STATUS_LABELS[s] })), { value: initial, attrs: html`name="status"` }) })}
      ${field({ label: 'Reason (at least 10 characters)', control: (id) => textarea(id, html`name="reason" rows="3" maxlength="500"`) })}
    </div>`,
    footer: html`${button('Cancel', { variant: 'secondary', attrs: html`data-dialog-close` })}${button('Save correction', { disabled: true, attrs: html`data-action="save"` })}`,
  });
  const reason = d.el.querySelector('[name=reason]');
  const save = d.el.querySelector('[data-action=save]');
  reason.addEventListener('input', () => (save.disabled = reason.value.trim().length < 10));
  save.addEventListener('click', async () => {
    const status = d.el.querySelector('[name=status]').value;
    try {
      const r = await withBusy(save, post(`/baggage/${bag.reference}/override`, { status, reason: reason.value }));
      playSound('statusUpdated');
      toast({ tone: 'ok', title: 'Correction saved', body: `${r.baggage.reference} is now ${STATUS_LABELS[r.baggage.status]}. Recorded in the audit log.` });
      d.close();
      onSaved?.(r.baggage);
    } catch (e) {
      playSound('invalid');
      toast({ tone: 'danger', title: 'Correction not saved', body: errorMessage(e) });
    }
  });
  return d;
}

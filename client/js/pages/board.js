/**
 * Baggage operations board. Dragging a card asks the server to record the
 * move; the card changes column only after the server confirms. Invalid moves
 * are refused before any request, and failed requests leave the card where it
 * was. Drag works with a mouse, touch (press and hold) or the keyboard.
 */
import { MAIN_FLOW, STATUS_LABELS, checkTransition, formatFlightNumber, isException, nextMainStep } from '/shared/index.js';
import { html, cx, on } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { api, errorMessage, get } from '../lib/api.js';
import { auth } from '../lib/auth.js';
import { playSound } from '../lib/audio.js';
import { toast } from '../lib/toast.js';
import { formatRelative } from '../lib/format.js';
import { button, emptyState, errorState, pageHeader, skeleton } from '../lib/ui.js';
import { demoBadge, statusBadge } from '../components/common.js';
import { openCorrectDialog } from '../components/baggage.js';
import { scopeSelect } from './staff.js';

/** Board columns follow the main journey; exception bags stay in the column of their last verified step. */
export const COLUMN_LABELS = {
  REGISTERED: 'Registered',
  CHECKED_IN: 'Check-in',
  SECURITY_SCREENING: 'Security Screening',
  LOADED: 'Loaded onto Aircraft',
  IN_TRANSIT: 'In Transit',
  ARRIVED: 'Arrived',
  ON_BELT: 'Baggage Belt',
  COLLECTED: 'Collected',
};

const REASONS = {
  SAME_STATUS: 'The bag is already at this step.',
  BACKWARD: 'Bags cannot move backwards. An administrator can correct a status with a reason.',
  TERMINAL: 'This bag has been collected.',
  NOT_FROM_EXCEPTION: 'Not allowed from the current exception status.',
};

/** Same rule as the server: one step forward at a time, or resuming after an exception. */
export function canMove(bag, to) {
  const v = checkTransition(bag.status, to, bag.lastMainStatus);
  if (!v.ok) return { ok: false, reason: REASONS[v.reason] };
  if (v.skipped.length > 0) return { ok: false, reason: `Steps cannot be skipped: record ${STATUS_LABELS[v.skipped[0]]} first.` };
  return { ok: true };
}

/** Where the "Move to / Resume" button sends a bag, or null. */
export const nextColumn = (bag) => (bag.status === 'COLLECTED' ? null : isException(bag.status) ? bag.lastMainStatus : nextMainStep(bag.lastMainStatus));

function bagCard(bag, { pending, highlight, admin }) {
  const next = nextColumn(bag);
  return html`<article id="bag-${bag.reference}" class="${cx('board-card', highlight && 'is-highlight', isException(bag.status) && 'is-exception', pending && 'is-pending')}" data-ref="${bag.reference}">
    <button type="button" class="drag-handle" data-drag aria-label="Drag ${bag.reference}. Press space to pick up, arrow keys to choose a column, space to drop, escape to cancel." ${pending ? html`disabled` : ''}>
      ${pending ? icon('loader2', 'i-4 spin') : icon('gripVertical')}
    </button>
    <div class="min-w-0 grow">
      <div class="row between gap-2">
        <a href="/baggage/${bag.reference}" class="bag-ref">${bag.reference}</a>
        ${bag.isDemo ? demoBadge() : ''}
      </div>
      ${bag.flight
        ? html`<p class="truncate xs muted mt-05">${formatFlightNumber(bag.flight.flightNumber)} · ${bag.flight.airlineName}</p>
            <p class="row gap-1 xs semibold mt-1">${bag.flight.origin} ${icon('arrowRight', 'i-3 muted')} ${bag.flight.destination}</p>`
        : ''}
      <div class="row wrap gap-1 mt-2">${statusBadge(bag.status)}</div>
      <p class="bag-qr" title="QR identifier">${icon('qrCode', 'i-3 shrink-0')} ${bag.qrPayload}</p>
      <p class="bag-updated">${icon('clock3', 'i-3')} Updated ${formatRelative(bag.updatedAt)}</p>
      <div class="row wrap gap-1 mt-2">
        ${next ? html`<button type="button" class="mini-btn" data-next ${pending ? html`disabled` : ''}>${isException(bag.status) ? 'Resume' : 'Move to'} ${COLUMN_LABELS[next]}</button>` : ''}
        ${admin ? html`<button type="button" class="mini-btn ghost" data-correct ${pending ? html`disabled` : ''}>${icon('wrench', 'i-3')} Correct</button>` : ''}
      </div>
    </div>
  </article>`;
}

export async function baggageBoardPage(ctx) {
  const highlight = ctx.query.get('highlight');
  const admin = auth.user?.role === 'admin';
  let scope = highlight ? 'all' : 'operational';
  let items = null;
  let pending = null;
  let drag = null; // { bag, ghost?, over, mode: 'pointer' | 'keyboard' }
  let scrolledToHighlight = false;

  ctx.el.innerHTML = String(html`
    ${pageHeader({
      eyebrow: 'Staff',
      title: 'Baggage operations board',
      subtitle: 'Drag a bag to its next checkpoint. The server validates the move, saves it to MongoDB and adds a tracking event before the card moves.',
      actions: html`<div class="row gap-2" data-form="toolbar">${scopeSelect(scope)}${button(icon('refreshCw'), { variant: 'secondary', size: 'sm', attrs: html`data-action="refresh" aria-label="Refresh board"` })}</div>`,
    })}
    <div class="board-legend" data-slot="legend"></div>
    <div data-slot="board"><div class="board-skeleton">${[0, 1, 2, 3].map(() => skeleton('board-col-skeleton'))}</div></div>
    <p class="sr-only" aria-live="assertive" data-slot="announce"></p>
  `);
  const boardSlot = ctx.el.querySelector('[data-slot=board]');
  const legend = ctx.el.querySelector('[data-slot=legend]');
  const announcer = ctx.el.querySelector('[data-slot=announce]');
  const refreshBtn = ctx.el.querySelector('[data-action=refresh]');
  const announce = (text) => (announcer.textContent = text);
  const findBag = (ref) => items?.find((b) => b.reference === ref);

  const drawLegend = () => {
    const exceptions = (items ?? []).filter((b) => isException(b.status)).length;
    legend.innerHTML = String(html`
      <span class="row gap-1"><span class="legend-swatch" aria-hidden="true"></span> Allowed next step</span>
      <span class="row gap-1">${icon('shieldAlert', 'i-3')} Only one step forward at a time. Backward moves need an administrator correction.</span>
      ${exceptions > 0 ? html`<span class="row gap-1 text-warn">${icon('alertTriangle', 'i-3')} ${exceptions} bag${exceptions === 1 ? '' : 's'} in an exception state (shown in their last verified column)</span>` : ''}
    `);
  };

  const draw = () => {
    drawLegend();
    if (items.length === 0) {
      boardSlot.innerHTML = String(
        emptyState({
          iconName: 'columns3',
          title: 'No bags on the board',
          body: scope === 'operational' ? 'Registered bags appear here. To try the board, switch Data to “Demo only” after seeding demo data.' : 'Seed demo data under Checkpoints & demo.',
        }),
      );
      return;
    }
    const byColumn = new Map(MAIN_FLOW.map((s) => [s, []]));
    for (const b of items) byColumn.get(b.lastMainStatus)?.push(b);
    boardSlot.innerHTML = String(html`<div class="board-scroll" role="region" aria-label="Board columns" tabindex="0">
      <div class="board">
        ${MAIN_FLOW.map((s) => {
          const list = byColumn.get(s);
          return html`<section class="board-col" data-col="${s}" aria-label="${COLUMN_LABELS[s]}, ${list.length} bags">
            <header class="board-col-head"><h2>${COLUMN_LABELS[s]}</h2><span class="count-pill">${list.length}</span></header>
            <div class="board-col-body">${list.map((b) => bagCard(b, { pending: pending === b.reference, highlight: highlight === b.reference, admin }))}</div>
          </section>`;
        })}
      </div>
    </div>`);
    if (highlight && !scrolledToHighlight) {
      const el = document.getElementById(`bag-${highlight}`);
      if (el) {
        scrolledToHighlight = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  };

  const load = async () => {
    refreshBtn.querySelector('.icon')?.classList.add('spin');
    try {
      const r = await get('/baggage/board', { scope });
      // Don't redraw under the user's pointer mid-drag or mid-save.
      if (drag || pending) return;
      items = r.items;
      draw();
    } catch (err) {
      if (items === null || !drag) {
        boardSlot.innerHTML = String(errorState(err, true));
        items = null;
      }
    } finally {
      refreshBtn.querySelector('.icon')?.classList.remove('spin');
    }
  };

  const move = async (bag, to) => {
    pending = bag.reference;
    draw();
    try {
      const r = await api(`/baggage/${bag.reference}/status`, {
        method: 'PATCH',
        body: { status: to, source: 'board', note: 'Moved on the baggage operations board' },
        headers: { 'If-Match': String(bag.version) },
      });
      items = items.map((x) => (x.reference === r.baggage.reference ? r.baggage : x));
      playSound('dropSuccess');
      toast({ tone: 'ok', title: `${r.baggage.reference} → ${COLUMN_LABELS[to]}`, body: 'Saved to the database and added to the tracking history.' });
      announce(`${r.baggage.reference} moved to ${COLUMN_LABELS[to]}.`);
      pending = null;
      draw();
    } catch (err) {
      playSound('invalid');
      toast({ tone: 'danger', title: `${bag.reference} was not moved`, body: errorMessage(err) });
      pending = null;
      await load();
    }
  };

  const request = (bag, to) => {
    const verdict = canMove(bag, to);
    if (!verdict.ok) {
      playSound('invalid');
      toast({ tone: 'warn', title: 'Move not allowed', body: verdict.reason });
      announce(`Move not allowed. ${verdict.reason}`);
      return;
    }
    void move(bag, to);
  };

  /* ------------------------------ Drag & drop ------------------------------ */

  const columns = () => [...boardSlot.querySelectorAll('[data-col]')];

  const paintColumns = () => {
    for (const col of columns()) {
      const state = !drag ? '' : canMove(drag.bag, col.dataset.col).ok ? 'valid' : 'invalid';
      col.classList.toggle('is-valid', state === 'valid');
      col.classList.toggle('is-invalid', state === 'invalid');
      col.classList.toggle('is-over', !!drag && drag.over === col.dataset.col);
    }
  };

  const startDrag = (bag, mode, point) => {
    const card = document.getElementById(`bag-${bag.reference}`);
    drag = { bag, mode, over: mode === 'keyboard' ? bag.lastMainStatus : null, card };
    card?.classList.add('is-dragging');
    document.body.classList.add('is-board-dragging');
    if (mode === 'pointer' && card) {
      const rect = card.getBoundingClientRect();
      const ghost = card.cloneNode(true);
      ghost.removeAttribute('id');
      ghost.classList.remove('is-dragging');
      ghost.classList.add('board-ghost');
      ghost.style.width = `${rect.width}px`;
      ghost.setAttribute('aria-hidden', 'true');
      document.body.append(ghost);
      drag.ghost = ghost;
      drag.offset = { x: point.x - rect.left, y: point.y - rect.top };
      positionGhost(point);
    }
    paintColumns();
    announce(mode === 'keyboard' ? `Picked up ${bag.reference} in ${COLUMN_LABELS[bag.lastMainStatus]}. Use the arrow keys to choose a column, space to drop, escape to cancel.` : `Dragging ${bag.reference}.`);
  };

  const positionGhost = (point) => {
    if (!drag?.ghost) return;
    drag.ghost.style.transform = `translate(${point.x - drag.offset.x}px, ${point.y - drag.offset.y}px) rotate(2deg)`;
  };

  const columnAt = (point) => {
    const el = document.elementFromPoint(point.x, point.y);
    return el?.closest?.('[data-col]')?.dataset.col ?? null;
  };

  const autoScroll = (point) => {
    const scroller = boardSlot.querySelector('.board-scroll');
    if (!scroller) return;
    const r = scroller.getBoundingClientRect();
    const edge = 48;
    if (point.x < r.left + edge) scroller.scrollLeft -= 14;
    else if (point.x > r.right - edge) scroller.scrollLeft += 14;
  };

  const endDrag = (drop) => {
    if (!drag) return;
    const { bag, over, ghost, card } = drag;
    ghost?.remove();
    card?.classList.remove('is-dragging');
    document.body.classList.remove('is-board-dragging');
    drag = null;
    paintColumns();
    if (!drop || !over) {
      announce(`${bag.reference} was not moved.`);
      return;
    }
    if (over === bag.lastMainStatus && !isException(bag.status)) return; // dropped back in place
    request(bag, over);
  };

  // Pointer: a mouse drag starts after moving 6 px; touch needs a 180 ms press
  // (moving more than 8 px first cancels, so the page can still scroll).
  on(boardSlot, 'pointerdown', '[data-drag]', (e, handle) => {
    if (e.button !== 0 || drag || pending) return;
    const bag = findBag(handle.closest('[data-ref]').dataset.ref);
    if (!bag) return;
    const start = { x: e.clientX, y: e.clientY };
    const touch = e.pointerType === 'touch';
    let started = false;
    let timer = null;
    handle.setPointerCapture?.(e.pointerId);

    const begin = (point) => {
      started = true;
      startDrag(bag, 'pointer', point);
    };
    if (touch) timer = setTimeout(() => begin(start), 180);

    const onMove = (ev) => {
      const point = { x: ev.clientX, y: ev.clientY };
      const dist = Math.hypot(point.x - start.x, point.y - start.y);
      if (!started) {
        if (touch) {
          if (dist > 8) finish(false);
          return;
        }
        if (dist < 6) return;
        begin(point);
      }
      ev.preventDefault();
      positionGhost(point);
      autoScroll(point);
      const over = columnAt(point);
      if (drag && over !== drag.over) {
        drag.over = over;
        paintColumns();
      }
    };
    const finish = (drop) => {
      clearTimeout(timer);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      if (started) endDrag(drop);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
  });

  // Keyboard: space/enter picks up and drops, arrows pick the column, escape cancels.
  on(boardSlot, 'keydown', '[data-drag]', (e, handle) => {
    const ref = handle.closest('[data-ref]').dataset.ref;
    if (!drag) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const bag = findBag(ref);
      if (!bag || pending) return;
      e.preventDefault();
      startDrag(bag, 'keyboard');
      return;
    }
    if (drag.mode !== 'keyboard') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = MAIN_FLOW.indexOf(drag.over);
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      drag.over = MAIN_FLOW[Math.min(MAIN_FLOW.length - 1, Math.max(0, i + step))];
      paintColumns();
      boardSlot.querySelector(`[data-col=${drag.over}]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const verdict = canMove(drag.bag, drag.over);
      announce(`${COLUMN_LABELS[drag.over]}. ${verdict.ok ? 'Allowed.' : verdict.reason}`);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      endDrag(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      endDrag(false);
    }
  });
  on(boardSlot, 'focusout', '[data-drag]', () => {
    if (drag?.mode === 'keyboard') endDrag(false);
  });

  /* -------------------------------- Buttons -------------------------------- */

  on(boardSlot, 'click', '[data-next]', (_e, btn) => {
    const bag = findBag(btn.closest('[data-ref]').dataset.ref);
    const to = bag && nextColumn(bag);
    if (to) request(bag, to);
  });
  on(boardSlot, 'click', '[data-correct]', (_e, btn) => {
    const bag = findBag(btn.closest('[data-ref]').dataset.ref);
    if (!bag) return;
    openCorrectDialog(bag, (saved) => {
      items = items.map((x) => (x.reference === saved.reference ? saved : x));
      draw();
    });
  });
  on(boardSlot, 'click', '[data-action=retry]', () => void load());
  refreshBtn.addEventListener('click', () => void load());
  ctx.el.querySelector('[data-form=toolbar] select').addEventListener('change', (e) => {
    scope = e.target.value;
    void load();
  });

  const timer = setInterval(() => void load(), 30_000);
  ctx.onCleanup(() => {
    clearInterval(timer);
    drag?.ghost?.remove();
    document.body.classList.remove('is-board-dragging');
  });
  await load();
}

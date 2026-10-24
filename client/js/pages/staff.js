/** Staff checkpoint scanner, baggage search and anomaly alerts. */
import { ALERT_STATUSES, ANOMALY_TYPES, BAGGAGE_STATUSES, SEVERITIES, STATUS_LABELS } from '/shared/index.js';
import { html, on } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { ApiError, errorMessage, get, patch, post } from '../lib/api.js';
import { playSound } from '../lib/audio.js';
import { toast } from '../lib/toast.js';
import { formatDateTime, formatRelative, titleCase } from '../lib/format.js';
import { badge, button, callout, cardHeader, emptyState, errorState, field, input, openDialog, pageHeader, pagination, select, spinner, textarea, withBusy } from '../lib/ui.js';
import { demoBadge, severityBadge, statusBadge } from '../components/common.js';
import { mountQrScanner } from '../components/lookup.js';

const CP_KEY = 'aerotrack-checkpoint';

const SCOPES = [
  { value: 'operational', label: 'Operational' },
  { value: 'demo', label: 'Demo only' },
  { value: 'all', label: 'All' },
];

/** Data scope picker (operational / demo / all). The select is named "scope". */
export const scopeSelect = (value = 'operational') => html`<label class="scope-select">
  <span class="muted">Data</span>
  ${select(`scope-${Math.random().toString(36).slice(2, 7)}`, SCOPES, { value, attrs: html`name="scope"`, cls: 'input-sm' })}
</label>`;

const readCheckpoint = () => {
  try {
    return localStorage.getItem(CP_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveCheckpoint = (code) => {
  try {
    localStorage.setItem(CP_KEY, code);
  } catch {
    /* storage blocked */
  }
};

function findingList(findings = []) {
  if (findings.length === 0) return '';
  return html`<ul class="mt-3 stack-2">
    ${findings.map(
      (f) => html`<li class="finding">
        <div class="row gap-2 semibold">${icon('alertTriangle', 'i-4 text-warn')} ${titleCase(f.type)} ${severityBadge(f.severity)}</div>
        <p class="mt-1 muted">${f.reason}</p>
        <p class="mt-1 xs"><span class="semibold">Recommended:</span> ${f.recommendedAction}</p>
      </li>`,
    )}
  </ul>`;
}

/* ---------------------------------- Scanner --------------------------------- */

export async function staffDashboard(ctx) {
  let checkpoint = readCheckpoint();
  let checkpoints = [];
  let last = null;
  let scanner = null;

  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Staff', title: 'Checkpoint scanner', subtitle: 'Choose your checkpoint, then scan baggage tags. Every scan is checked against the journey rules.' })}
    <div class="grid g-scan">
      <section class="card">
        ${cardHeader({ title: 'Scan', iconName: 'scanLine' })}
        <div class="p-5 stack-4">
          <div data-slot="cp">${field({ label: 'Checkpoint', id: 'cp-select', control: (id) => select(id, [{ value: '', label: 'Loading checkpoints…' }], { attrs: html`disabled` }) })}</div>
          <div data-slot="scanner"></div>
        </div>
      </section>
      <div class="stack-6">
        <section class="card" aria-live="polite" data-slot="last"></section>
        <div class="grid g-2-xl">
          <section class="card">
            ${cardHeader({ title: 'Needs attention', iconName: 'alertTriangle', subtitle: 'Delayed, missing or with incidents' })}
            <div data-slot="attention">${spinner()}</div>
          </section>
          <section class="card">
            ${cardHeader({ title: 'Active anomaly alerts', iconName: 'shieldAlert', action: html`<a href="/staff/alerts" class="link small">All alerts</a>` })}
            <div data-slot="alerts">${spinner()}</div>
          </section>
        </div>
        <section class="card">
          ${cardHeader({ title: 'Recent checkpoint activity', iconName: 'history' })}
          <div data-slot="recent">${spinner()}</div>
        </section>
      </div>
    </div>
  `);
  const slot = (n) => ctx.el.querySelector(`[data-slot=${n}]`);

  const drawLast = () => {
    const ok = last?.ok !== false;
    let body;
    if (!last) body = html`<p class="small muted">No scans in this session yet.</p>`;
    else if (last.ok) {
      const r = last.result;
      body = html`<div>
        <div class="row wrap gap-2">
          <a href="/baggage/${r.baggage.reference}" class="link mono semibold">${r.baggage.reference}</a>
          ${statusBadge(r.baggage.status)}${r.baggage.isDemo ? demoBadge() : ''}
          ${badge(r.outcome === 'recorded' ? 'Recorded' : 'Duplicate, not recorded', r.outcome === 'recorded' ? 'ok' : 'neutral')}
        </div>
        <p class="mt-1 small muted">${r.baggage.description} · ${last.at.toLocaleTimeString()}</p>
        ${findingList(r.findings)}
      </div>`;
    } else body = html`<div>${callout({ tone: 'danger', title: 'Scan not recorded', body: last.error })}${findingList(last.findings)}</div>`;
    slot('last').innerHTML = String(html`${cardHeader({ title: 'Last scan result', iconName: ok ? 'checkCircle2' : 'alertTriangle' })}<div class="p-5">${body}</div>`);
  };

  const loadAttention = async () => {
    try {
      const pages = await Promise.all(['DELAYED', 'MISSING', 'INCIDENT_REPORTED'].map((s) => get('/baggage', { status: s, pageSize: 10, scope: 'all' })));
      const bags = pages.flatMap((p) => p.items);
      slot('attention').innerHTML = String(
        bags.length === 0
          ? html`<p class="p-5 small muted">No bags need attention.</p>`
          : html`<ul class="divided">${bags.map((b) => html`<li><a href="/baggage/${b.reference}" class="list-link"><span class="mono small">${b.reference}</span><span class="row gap-1">${statusBadge(b.status)}${b.isDemo ? demoBadge() : ''}</span></a></li>`)}</ul>`,
      );
    } catch (err) {
      slot('attention').innerHTML = String(html`<p class="p-5 small muted">Could not load: ${errorMessage(err)}</p>`);
    }
  };

  const loadAlerts = async () => {
    try {
      const r = await get('/alerts', { status: 'ACTIVE', pageSize: 5, scope: 'all' });
      slot('alerts').innerHTML = String(
        r.items.length === 0
          ? html`<p class="p-5 small muted">No active alerts.</p>`
          : html`<ul class="divided">
              ${r.items.map(
                (a) => html`<li class="px-5 py-3">
                  <div class="row between gap-2"><span class="small semibold">${titleCase(a.type)}</span>${severityBadge(a.severity)}</div>
                  <p class="truncate xs muted">${a.reference ?? 'Scanner'} · ${formatRelative(a.detectedAt)}</p>
                </li>`,
              )}
            </ul>`,
      );
    } catch (err) {
      slot('alerts').innerHTML = String(html`<p class="p-5 small muted">Could not load: ${errorMessage(err)}</p>`);
    }
  };

  const loadRecent = async () => {
    try {
      const r = await get('/scans/recent', { pageSize: 8, scope: 'all' });
      slot('recent').innerHTML = String(
        r.items.length === 0
          ? emptyState({ iconName: 'history', title: 'No scans yet', body: 'Recorded scans will appear here.' })
          : html`<div class="table-wrap"><table class="table">
              <thead><tr><th>Bag</th><th>Status</th><th>Checkpoint</th><th>By</th><th>When</th></tr></thead>
              <tbody>
                ${r.items.map(
                  (s) => html`<tr>
                    <td><a href="/baggage/${s.reference}" class="link mono">${s.reference}</a>${s.isDemo ? html` <span class="demo-tag">DEMO</span>` : ''}</td>
                    <td>${STATUS_LABELS[s.status]}</td>
                    <td class="muted">${s.checkpointCode}</td>
                    <td class="muted">${s.actorName} <span class="xs">(${s.method})</span></td>
                    <td class="muted nowrap">${formatRelative(s.occurredAt)}</td>
                  </tr>`,
                )}
              </tbody>
            </table></div>`,
      );
    } catch (err) {
      slot('recent').innerHTML = String(html`<p class="p-5 small muted">Could not load: ${errorMessage(err)}</p>`);
    }
  };

  const refreshPanels = () => Promise.all([loadAttention(), loadAlerts(), loadRecent()]);

  const doScan = async (scanInput) => {
    scanner?.setBusy(true);
    try {
      const r = await post('/scans', { ...scanInput, checkpointCode: checkpoint, idempotencyKey: crypto.randomUUID() });
      last = { ok: true, result: r, at: new Date() };
      const recorded = r.outcome === 'recorded';
      toast({ tone: recorded ? (r.findings.length ? 'warn' : 'ok') : 'info', title: recorded ? `${r.baggage.reference}: ${STATUS_LABELS[r.baggage.status]}` : `Duplicate scan of ${r.baggage.reference}` });
      navigator.vibrate?.(60);
      if (recorded) playSound('statusUpdated');
    } catch (err) {
      playSound('invalid');
      last = { ok: false, error: errorMessage(err), findings: err instanceof ApiError ? (err.details?.findings ?? []) : [], at: new Date() };
    } finally {
      scanner?.setBusy(false);
    }
    drawLast();
    void refreshPanels();
  };

  const drawScanner = () => {
    const box = slot('scanner');
    if (checkpoint && scanner) return; // switching checkpoints keeps the running camera
    void scanner?.stop();
    scanner = null;
    if (!checkpoint) {
      box.innerHTML = String(callout({ tone: 'info', body: 'Select a checkpoint to start scanning.' }));
      return;
    }
    scanner = mountQrScanner(box, ctx, doScan);
  };

  const drawCheckpoints = () => {
    const active = checkpoints.filter((c) => c.active);
    if (checkpoint && !active.some((c) => c.code === checkpoint)) checkpoint = '';
    const selected = active.find((c) => c.code === checkpoint);
    const hint = selected ? `${selected.airport} · ${titleCase(selected.type)}${selected.isDemo ? ' · DEMO checkpoint' : ''}` : 'Scans record the status for this checkpoint.';
    slot('cp').innerHTML = String(html`
      ${field({
        label: 'Checkpoint',
        id: 'cp-select',
        hint,
        control: (id, d) =>
          select(id, [{ value: '', label: 'Select checkpoint…' }, ...active.map((c) => ({ value: c.code, label: `${c.isDemo ? '[DEMO] ' : ''}${c.name} (${c.code})` }))], {
            value: checkpoint,
            attrs: html`aria-describedby="${d}"`,
          }),
      })}
      ${active.length === 0
        ? html`<div class="mt-4">${callout({ tone: 'warn', title: 'No checkpoints configured', body: html`An administrator must add checkpoints (or seed demo data) under <a class="underline" href="/admin/system">Checkpoints &amp; demo</a>.` })}</div>`
        : ''}
    `);
    slot('cp')
      .querySelector('select')
      .addEventListener('change', (e) => {
        checkpoint = e.target.value;
        saveCheckpoint(checkpoint);
        drawCheckpoints();
        drawScanner();
      });
  };

  drawLast();
  drawScanner();
  get('/checkpoints')
    .then((r) => {
      checkpoints = r.items;
      const before = checkpoint;
      drawCheckpoints();
      if (before !== checkpoint) drawScanner();
    })
    .catch((err) => (slot('cp').innerHTML = String(errorState(err))));

  const timer = setInterval(() => void loadRecent(), 30_000);
  ctx.onCleanup(() => clearInterval(timer));
  await refreshPanels();
}

/* ------------------------------ Baggage search ------------------------------ */

export async function baggageSearchPage(ctx) {
  const state = { search: '', status: '', scope: 'operational', page: 1 };
  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Staff', title: 'Baggage search', subtitle: 'Find bags by reference or description and filter by status.' })}
    <section class="card">
      <form class="filter-bar" data-form="filters">
        <div class="grow">${field({ label: 'Search', id: 'bs-search', control: (id) => input(id, html`name="search" placeholder="AT-… or description"`) })}</div>
        ${field({ label: 'Status', id: 'bs-status', control: (id) => select(id, [{ value: '', label: 'Any status' }, ...BAGGAGE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))], { attrs: html`name="status"` }) })}
        ${scopeSelect(state.scope)}
        ${button(html`${icon('search')} Search`, { type: 'submit' })}
      </form>
      <div data-slot="list"></div>
    </section>
  `);
  const form = ctx.el.querySelector('[data-form=filters]');
  const list = ctx.el.querySelector('[data-slot=list]');
  const reload = async () => {
    list.innerHTML = String(spinner());
    try {
      const r = await get('/baggage', { ...state, pageSize: 20 });
      list.innerHTML = String(
        r.items.length === 0
          ? emptyState({ iconName: 'packageSearch', title: 'No baggage matches these filters' })
          : html`<div class="table-wrap"><table class="table">
              <thead><tr><th>Reference</th><th>Description</th><th>Owner</th><th>Flight</th><th>Status</th><th>Last scan</th></tr></thead>
              <tbody>
                ${r.items.map(
                  (b) => html`<tr class="hover-row">
                    <td><a href="/baggage/${b.reference}" class="link mono semibold">${b.reference}</a></td>
                    <td>${b.description}</td>
                    <td class="muted">${b.ownerName ?? '—'}</td>
                    <td class="muted">${b.flight?.flightNumber ?? '—'}</td>
                    <td><span class="row gap-1">${statusBadge(b.status)}${b.isDemo ? demoBadge() : ''}</span></td>
                    <td class="muted nowrap">${b.lastScanAt ? formatRelative(b.lastScanAt) : 'Never'}</td>
                  </tr>`,
                )}
              </tbody>
            </table></div>${pagination({ page: state.page, pageSize: 20, total: r.total })}`,
      );
    } catch (err) {
      list.innerHTML = String(errorState(err, true));
    }
  };
  on(list, 'click', '[data-action=retry]', () => void reload());
  on(list, 'click', '[data-page]', (_e, b) => {
    state.page = Number(b.dataset.page);
    void reload();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    state.search = form.elements.search.value.trim();
    state.page = 1;
    void reload();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'search') return;
    state.status = form.elements.status.value;
    state.scope = form.elements.scope.value;
    state.page = 1;
    void reload();
  });
  await reload();
}

/* ---------------------------------- Alerts ---------------------------------- */

const ALERT_ACTIONS = [
  { status: 'ACKNOWLEDGED', label: 'Acknowledge', variant: 'secondary' },
  { status: 'INVESTIGATING', label: 'Investigate', variant: 'secondary' },
  { status: 'ESCALATED', label: 'Escalate', variant: 'danger' },
  { status: 'RESOLVED', label: 'Resolve', variant: 'primary' },
];

const alertTone = (s) => (s === 'RESOLVED' ? 'ok' : s === 'ESCALATED' ? 'danger' : 'neutral');

function alertDetail(a) {
  const evidence = JSON.stringify(a.evidence, null, 2);
  return html`<div class="stack-4 small">
    <div class="row wrap gap-2">${severityBadge(a.severity)}${badge(titleCase(a.status))}${a.isDemo ? demoBadge() : ''}</div>
    <dl class="grid g-2 gap-3">
      <div><dt class="muted">Baggage</dt><dd class="mono semibold">${a.reference ?? '—'}</dd></div>
      <div><dt class="muted">Detected</dt><dd class="semibold">${formatDateTime(a.detectedAt)}</dd></div>
      <div class="span-2"><dt class="muted">Reason</dt><dd>${a.reason}</dd></div>
      <div class="span-2"><dt class="muted">Recommended action</dt><dd>${a.recommendedAction}</dd></div>
    </dl>
    <div>
      <div class="row between mb-1"><p class="muted">Evidence</p><button type="button" class="text-btn link xs row gap-1" data-action="copy">${icon('copy', 'i-3')} Copy</button></div>
      <pre class="code-block">${evidence}</pre>
    </div>
    ${a.history.length
      ? html`<div>
          <p class="muted mb-1">Investigation history</p>
          <ul class="stack-1">${a.history.map((h) => html`<li class="xs"><span class="semibold">${titleCase(h.status)}</span> by ${h.byName} · ${formatDateTime(h.at)}${h.text ? ` · “${h.text}”` : ''}</li>`)}</ul>
        </div>`
      : ''}
    ${field({ label: 'Note (optional)', id: 'al-note', control: (id) => textarea(id, html`name="note" maxlength="1000"`, '', 'textarea-sm') })}
    <div class="row wrap gap-2">
      ${ALERT_ACTIONS.map((x) => button(x.label, { size: 'sm', variant: x.variant, disabled: a.status === x.status, attrs: html`data-status="${x.status}"` }))}
    </div>
  </div>`;
}

function openAlertDialog(alert, onChanged) {
  let current = alert;
  const dlg = openDialog({ title: titleCase(alert.type), body: alertDetail(alert), wide: true });
  const draw = () => (dlg.body.innerHTML = String(alertDetail(current)));
  on(dlg.body, 'click', '[data-action=copy]', () => {
    void navigator.clipboard?.writeText(JSON.stringify(current.evidence, null, 2)).then(() => toast({ tone: 'ok', title: 'Evidence copied' }));
  });
  on(dlg.body, 'click', '[data-status]', async (_e, btn) => {
    const note = dlg.body.querySelector('[name=note]').value.trim();
    try {
      const r = await withBusy(btn, patch(`/alerts/${current.id}`, { status: btn.dataset.status, note: note || undefined }));
      current = r.alert;
      draw();
      toast({ tone: 'ok', title: `Alert ${r.alert.status.toLowerCase()}` });
      onChanged();
    } catch (err) {
      toast({ tone: 'danger', title: 'Not updated', body: errorMessage(err) });
    }
  });
}

export async function alertsPage(ctx) {
  const state = { status: 'ACTIVE', severity: '', type: '', scope: 'operational', page: 1 };
  let items = [];
  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Staff', title: 'Anomaly alerts', subtitle: 'Rules-based detections with evidence. Alerts describe operational irregularities, not wrongdoing.' })}
    <section class="card">
      <form class="filter-bar" data-form="filters">
        ${icon('filter', 'i-4 muted filter-icon')}
        ${field({ label: 'Status', id: 'al-status', control: (id) => select(id, [{ value: 'ACTIVE', label: 'Active (not resolved)' }, { value: '', label: 'Any' }, ...ALERT_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))], { value: state.status, attrs: html`name="status"` }) })}
        ${field({ label: 'Severity', id: 'al-sev', control: (id) => select(id, [{ value: '', label: 'Any' }, ...SEVERITIES.map((s) => ({ value: s, label: titleCase(s) }))], { attrs: html`name="severity"` }) })}
        ${field({ label: 'Type', id: 'al-type', control: (id) => select(id, [{ value: '', label: 'Any' }, ...ANOMALY_TYPES.map((s) => ({ value: s, label: titleCase(s) }))], { attrs: html`name="type"` }) })}
        ${scopeSelect(state.scope)}
      </form>
      <div data-slot="list"></div>
    </section>
  `);
  const form = ctx.el.querySelector('[data-form=filters]');
  const list = ctx.el.querySelector('[data-slot=list]');
  const reload = async (quiet = false) => {
    if (!quiet) list.innerHTML = String(spinner());
    try {
      const r = await get('/alerts', { ...state, pageSize: 20 });
      items = r.items;
      list.innerHTML = String(
        r.items.length === 0
          ? emptyState({ iconName: 'shieldAlert', title: 'No alerts match', body: 'Try another filter, or seed demo data to see example alerts.' })
          : html`<ul class="divided">
              ${r.items.map(
                (a) => html`<li class="row wrap between items-start gap-3 px-5 py-4">
                  <div class="min-w-0 grow">
                    <div class="row wrap gap-2"><span class="semibold">${titleCase(a.type)}</span>${severityBadge(a.severity)}${badge(titleCase(a.status), alertTone(a.status))}${a.isDemo ? demoBadge() : ''}</div>
                    <p class="mt-1 small muted">${a.reason}</p>
                    <p class="mt-1 xs muted">${a.reference ? html`<a class="link mono" href="/baggage/${a.reference}">${a.reference}</a>` : 'No bag (scanner-level)'} · detected ${formatDateTime(a.detectedAt)}</p>
                  </div>
                  ${button(html`${icon('eye')} Investigate`, { size: 'sm', variant: 'secondary', attrs: html`data-open="${a.id}"` })}
                </li>`,
              )}
            </ul>${pagination({ page: state.page, pageSize: 20, total: r.total })}`,
      );
    } catch (err) {
      list.innerHTML = String(errorState(err, true));
    }
  };
  on(list, 'click', '[data-action=retry]', () => void reload());
  on(list, 'click', '[data-page]', (_e, b) => {
    state.page = Number(b.dataset.page);
    void reload();
  });
  on(list, 'click', '[data-open]', (_e, b) => {
    const a = items.find((x) => x.id === b.dataset.open);
    if (a) openAlertDialog(a, () => void reload(true));
  });
  form.addEventListener('change', () => {
    state.status = form.elements.status.value;
    state.severity = form.elements.severity.value;
    state.type = form.elements.type.value;
    state.scope = form.elements.scope.value;
    state.page = 1;
    void reload();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  await reload();
}

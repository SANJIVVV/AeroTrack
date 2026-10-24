/** Analytics, users & roles, audit log, and checkpoints & demo data. */
import { CHECKPOINT_TYPE_LIST, ROLES, STATUS_LABELS } from '/shared/index.js';
import { html, on } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { errorMessage, get, patch, post } from '../lib/api.js';
import { auth } from '../lib/auth.js';
import { toast } from '../lib/toast.js';
import { formatDateTime, formatRelative, titleCase } from '../lib/format.js';
import { badge, button, callout, cardHeader, emptyState, errorState, field, input, openDialog, pageHeader, pagination, select, skeleton, spinner, stat, withBusy } from '../lib/ui.js';
import { demoBadge } from '../components/common.js';
import { scopeSelect } from './staff.js';

/* ---------------------------------- Charts ---------------------------------- */

const W = 560;
const H = 240;
const nice = (max) => {
  if (max <= 5) return Math.max(1, Math.ceil(max));
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
};
const ticks = (max) => {
  const top = nice(max);
  const n = top <= 5 ? top : 4;
  return Array.from({ length: n + 1 }, (_, i) => Math.round((top / n) * i));
};
const short = (iso) => iso.slice(5);

/** Vertical bars over dates. rows: [{ label, value }]. */
function columnChart(rows, { color = 'var(--chart-1)', unit = '' } = {}) {
  const pad = { l: 36, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  const yt = ticks(max);
  const top = yt.at(-1);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / Math.max(1, rows.length);
  const bw = Math.min(28, slot - 2);
  const y = (v) => pad.t + ih - (v / top) * ih;
  const every = Math.max(1, Math.ceil(rows.length / 8));
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">
    ${yt.map((t) => html`<line class="chart-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" /><text class="chart-axis" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`)}
    ${rows.map((r, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const h = Math.max(0, (r.value / top) * ih);
      return html`<g class="chart-mark">
        <rect class="chart-hit" x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${ih}" />
        ${h > 0 ? html`<path d="${roundedTop(x, y(r.value), bw, h)}" fill="${color}" />` : ''}
        <title>${r.label}: ${r.value}${unit}</title>
      </g>`;
    })}
    ${rows.map((r, i) => (i % every === 0 ? html`<text class="chart-axis" x="${pad.l + slot * i + slot / 2}" y="${H - 6}" text-anchor="middle">${short(r.label)}</text>` : ''))}
  </svg>`;
}

/** Bar with 4px rounded top, square at the baseline. */
function roundedTop(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Line over dates; null values break the line. */
function lineChart(rows, { color = 'var(--chart-2)', unit = '' } = {}) {
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const vals = rows.map((r) => r.value).filter((v) => v !== null && v !== undefined);
  const max = Math.max(1, ...vals);
  const yt = ticks(max);
  const top = yt.at(-1);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (rows.length === 1 ? iw / 2 : (iw * i) / (rows.length - 1));
  const y = (v) => pad.t + ih - (v / top) * ih;
  const segments = [];
  let cur = [];
  rows.forEach((r, i) => {
    if (r.value === null || r.value === undefined) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push(`${x(i)},${y(r.value)}`);
  });
  if (cur.length) segments.push(cur);
  const every = Math.max(1, Math.ceil(rows.length / 8));
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">
    ${yt.map((t) => html`<line class="chart-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" /><text class="chart-axis" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`)}
    ${segments.map((s) => html`<polyline points="${s.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`)}
    ${rows.map((r, i) =>
      r.value === null || r.value === undefined
        ? ''
        : html`<g class="chart-mark"><circle class="chart-hit" cx="${x(i)}" cy="${y(r.value)}" r="12" /><circle cx="${x(i)}" cy="${y(r.value)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2" /><title>${r.label}: ${r.value}${unit}</title></g>`,
    )}
    ${rows.map((r, i) => (i % every === 0 ? html`<text class="chart-axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${short(r.label)}</text>` : ''))}
  </svg>`;
}

/** Horizontal bars for categories. */
function barList(rows, { color = 'var(--chart-1)', labelWidth = 150 } = {}) {
  const pad = { l: labelWidth, r: 36, t: 4, b: 4 };
  const rowH = 28;
  const h = pad.t + pad.b + rows.length * rowH;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const iw = W - pad.l - pad.r;
  return html`<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Horizontal bar chart">
    ${rows.map((r, i) => {
      const y = pad.t + i * rowH;
      const w = Math.max(2, (r.value / max) * iw);
      const bh = 18;
      const rr = Math.min(4, w / 2);
      const by = y + (rowH - bh) / 2;
      return html`<g class="chart-mark">
        <rect class="chart-hit" x="0" y="${y}" width="${W}" height="${rowH}" />
        <text class="chart-label" x="${pad.l - 8}" y="${y + rowH / 2 + 4}" text-anchor="end">${r.label}</text>
        <path d="M${pad.l},${by}H${pad.l + w - rr}Q${pad.l + w},${by} ${pad.l + w},${by + rr}V${by + bh - rr}Q${pad.l + w},${by + bh} ${pad.l + w - rr},${by + bh}H${pad.l}Z" fill="${color}" />
        <text class="chart-value" x="${pad.l + w + 6}" y="${y + rowH / 2 + 4}">${r.value}</text>
        <title>${r.label}: ${r.value}</title>
      </g>`;
    })}
  </svg>`;
}

/** Single-series chart card with a table view, so the data is never chart-only. */
function chartCard({ title, subtitle, chart, rows, empty }) {
  return html`<section class="card" data-chart>
    ${cardHeader({ title, subtitle, action: button(html`${icon('table2')} <span data-label>Table</span>`, { size: 'sm', variant: 'ghost', attrs: html`data-action="toggle-table" aria-pressed="false"` }) })}
    <div class="p-4">
      <div class="chart-box" data-view="chart">${empty ?? chart}</div>
      <div class="chart-table" data-view="table" hidden>
        <table class="table table-compact"><tbody>${rows.map(([k, v]) => html`<tr><th scope="row">${k}</th><td class="num">${v}</td></tr>`)}</tbody></table>
      </div>
    </div>
  </section>`;
}

/* --------------------------------- Analytics -------------------------------- */

async function adminOverview(el, scope) {
  el.innerHTML = String(skeleton('h-28 mb-6'));
  try {
    const d = await get('/admin/stats', { scope });
    el.innerHTML = String(html`<div class="grid g-overview mb-6">
      <div class="grid g-3">
        ${stat({ label: 'Registered users', value: d.users, iconName: 'users' })}
        ${stat({ label: 'Ready for collection', value: d.readyForCollection, iconName: 'packageCheck', tone: 'ok', hint: 'On a baggage belt' })}
        ${stat({ label: 'Delayed baggage', value: d.delayed, iconName: 'clock', tone: 'warn', hint: `${d.missing} missing` })}
      </div>
      <section class="card p-4">
        <p class="small bold mb-2">Recent activity</p>
        ${d.recent.length === 0
          ? html`<p class="small muted">Nothing recorded yet.</p>`
          : html`<ul class="stack-1 xs">${d.recent.slice(0, 5).map((r) => html`<li class="row between gap-2"><span class="truncate"><span class="mono">${r.action}</span> ${r.targetId ? html`<span class="muted">· ${r.targetId}</span>` : ''}</span><span class="shrink-0 muted">${formatRelative(r.at)}</span></li>`)}</ul>`}
      </section>
    </div>`);
  } catch {
    el.innerHTML = '';
  }
}

export async function analyticsPage(ctx) {
  const isAdmin = auth.user?.role === 'admin';
  const state = { scope: 'operational', days: 14, status: '', checkpoint: '' };
  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Operations', title: 'Analytics', subtitle: 'Computed from database records. Operational and demo data are never mixed unless you choose “All”.', actions: html`<span data-slot="scope-badge"></span>` })}
    <div data-slot="overview"></div>
    <form class="card filter-bar mb-6" data-form="filters">
      ${scopeSelect(state.scope)}
      <label class="scope-select"><span class="muted">Period</span>${select('an-days', [7, 14, 30, 90].map((n) => ({ value: n, label: `Last ${n} days` })), { value: state.days, attrs: html`name="days"`, cls: 'input-sm' })}</label>
      <label class="scope-select"><span class="muted">Status</span>${select('an-status', [{ value: '', label: 'All' }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))], { attrs: html`name="status"`, cls: 'input-sm' })}</label>
      <label class="scope-select"><span class="muted">Checkpoint</span><span data-slot="cp-select">${select('an-cp', [{ value: '', label: 'All' }], { attrs: html`name="checkpoint"`, cls: 'input-sm' })}</span></label>
    </form>
    <div data-slot="body"></div>
  `);
  const slot = (n) => ctx.el.querySelector(`[data-slot=${n}]`);
  const form = ctx.el.querySelector('[data-form=filters]');
  const body = slot('body');

  get('/checkpoints')
    .then((r) => {
      slot('cp-select').innerHTML = String(select('an-cp', [{ value: '', label: 'All' }, ...r.items.map((c) => ({ value: c.code, label: c.code }))], { value: state.checkpoint, attrs: html`name="checkpoint"`, cls: 'input-sm' }));
    })
    .catch(() => {});

  const load = async () => {
    slot('scope-badge').innerHTML = state.scope === 'operational' ? '' : String(demoBadge(state.scope === 'demo' ? 'DEMO DATA' : 'INCLUDES DEMO'));
    if (isAdmin) void adminOverview(slot('overview'), state.scope);
    body.innerHTML = String(spinner('Computing analytics'));
    let d;
    try {
      d = await get('/admin/analytics', state);
    } catch (err) {
      body.innerHTML = String(errorState(err, true));
      return;
    }
    const statusRows = Object.entries(d.byStatus)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => ({ label: STATUS_LABELS[s], value: n }));
    const anomalyRows = Object.entries(d.anomaliesByType).map(([t, n]) => ({ label: titleCase(t), value: n }));
    const k = d.kpis;
    const topScans = d.checkpointActivity[0]?.scans || 1;
    body.innerHTML = String(html`
      ${k.totalBaggage === 0
        ? html`<div class="mb-6">${callout({
            tone: 'info',
            title: 'No records in this scope yet',
            body:
              state.scope === 'operational'
                ? 'Real baggage will appear here once passengers register bags and staff scan them. To present the system, seed demo data under Checkpoints & demo and switch the scope to “Demo only”.'
                : 'Seed demo data under Checkpoints & demo.',
          })}</div>`
        : ''}
      <div class="grid g-4 mb-6">
        ${stat({ label: 'Registered baggage', value: k.totalBaggage, iconName: 'luggage' })}
        ${stat({ label: 'In progress', value: k.inProgress, iconName: 'activity', tone: 'info', hint: `${k.inTransit} in transit` })}
        ${stat({ label: 'Collected', value: k.collected, iconName: 'packageCheck', tone: 'ok' })}
        ${stat({ label: 'Delayed / missing', value: `${k.delayed} / ${k.missing}`, iconName: 'clock', tone: 'warn' })}
        ${stat({ label: 'Open incidents', value: k.openIncidents, iconName: 'lifeBuoy', tone: 'danger' })}
        ${stat({ label: 'Active alerts', value: k.activeAlerts, iconName: 'shieldAlert', tone: 'warn' })}
        ${stat({ label: 'Scan failures', value: k.scanFailures, iconName: 'scanLine', tone: 'danger', hint: 'All scopes (no bag to classify)' })}
        ${stat({ label: 'Checkpoints active', value: d.checkpointActivity.length, iconName: 'plane', hint: 'With scans in period' })}
      </div>
      <div class="grid g-2">
        ${chartCard({ title: 'Checkpoint scans per day', chart: columnChart(d.scansPerDay.map((r) => ({ label: r.date, value: r.scans })), { unit: ' scans' }), rows: d.scansPerDay.map((r) => [r.date, r.scans]) })}
        ${chartCard({
          title: 'Average check-in → loaded time',
          subtitle: 'Minutes, by day of check-in',
          chart: lineChart(d.processingTrend.map((r) => ({ label: r.date, value: r.avgCheckinToLoadMin })), { unit: ' min' }),
          rows: d.processingTrend.map((r) => [r.date, r.avgCheckinToLoadMin ?? '—']),
        })}
        ${chartCard({ title: 'Baggage by status', chart: barList(statusRows, { labelWidth: 150 }), rows: statusRows.map((r) => [r.label, r.value]), empty: statusRows.length ? null : emptyState({ iconName: 'luggage', title: 'No baggage' }) })}
        ${chartCard({
          title: 'Anomalies by type',
          subtitle: 'Detected in period',
          chart: barList(anomalyRows, { color: 'var(--chart-3)', labelWidth: 180 }),
          rows: anomalyRows.map((r) => [r.label, r.value]),
          empty: anomalyRows.length ? null : emptyState({ iconName: 'alertTriangle', title: 'No anomalies in this period' }),
        })}
      </div>
      <section class="card mt-6">
        ${cardHeader({ title: 'Checkpoint activity', subtitle: 'Scans per checkpoint in period' })}
        ${d.checkpointActivity.length === 0
          ? html`<p class="p-5 small muted">No scans in this period.</p>`
          : html`<ul class="divided">
              ${d.checkpointActivity.map(
                (c) => html`<li class="cp-row">
                  <span class="cp-code mono xs">${c.code}</span>
                  <span class="cp-name truncate muted">${c.name}</span>
                  <span class="meter"><span style="width:${Math.round((c.scans / topScans) * 100)}%"></span></span>
                  <span class="cp-count mono">${c.scans}</span>
                </li>`,
              )}
            </ul>`}
      </section>
      <p class="mt-3 xs muted">Generated ${formatDateTime(d.generatedAt)}.</p>
    `);
  };

  on(body, 'click', '[data-action=retry]', () => void load());
  on(body, 'click', '[data-action=toggle-table]', (_e, btn) => {
    const card = btn.closest('[data-chart]');
    const showTable = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(showTable));
    btn.querySelector('[data-label]').textContent = showTable ? 'Chart' : 'Table';
    card.querySelector('[data-view=chart]').hidden = showTable;
    card.querySelector('[data-view=table]').hidden = !showTable;
  });
  form.addEventListener('change', () => {
    state.scope = form.elements.scope.value;
    state.days = Number(form.elements.days.value);
    state.status = form.elements.status.value;
    state.checkpoint = form.elements.checkpoint?.value ?? '';
    void load();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  await load();
}

/* ------------------------------- Users & roles ------------------------------ */

export async function usersPage(ctx) {
  const me = auth.user;
  const state = { search: '', role: '', status: '', page: 1 };
  let items = [];
  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Administration', title: 'Users & roles', subtitle: 'Change roles or disable accounts. Changes take effect at the user’s next sign-in.' })}
    <section class="card">
      <form class="filter-bar" data-form="filters">
        <div class="grow">${field({ label: 'Search', id: 'us-search', control: (id) => input(id, html`name="search" placeholder="Name or email"`) })}</div>
        ${field({ label: 'Role', id: 'us-role', control: (id) => select(id, [{ value: '', label: 'Any' }, ...ROLES.map((r) => ({ value: r, label: titleCase(r) }))], { attrs: html`name="role"` }) })}
        ${field({ label: 'Account status', id: 'us-status', control: (id) => select(id, [{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'disabled', label: 'Deactivated' }], { attrs: html`name="status"` }) })}
        ${button('Search', { type: 'submit' })}
      </form>
      <div data-slot="list"></div>
    </section>
  `);
  const form = ctx.el.querySelector('[data-form=filters]');
  const list = ctx.el.querySelector('[data-slot=list]');
  const reload = async () => {
    list.innerHTML = String(spinner());
    try {
      const r = await get('/admin/users', { ...state, pageSize: 20 });
      items = r.items;
      list.innerHTML = String(
        r.items.length === 0
          ? emptyState({ iconName: 'users', title: 'No users found' })
          : html`<div class="table-wrap"><table class="table">
              <thead><tr><th>User</th><th>Verified</th><th>Role</th><th>Last sign-in</th><th>Access</th></tr></thead>
              <tbody>
                ${r.items.map((u) => {
                  const self = u.id === me?.id;
                  return html`<tr data-user="${u.id}">
                    <td><p class="semibold">${u.name}</p><p class="xs muted">${u.email}</p></td>
                    <td>${u.emailVerified ? badge('Yes', 'ok') : badge('No', 'warn')}</td>
                    <td>${select(`role-${u.id}`, ROLES.map((x) => ({ value: x, label: titleCase(x) })), { value: u.role, cls: 'input-sm', attrs: html`data-role aria-label="Role for ${u.name}" ${self ? html`disabled` : ''}` })}</td>
                    <td class="muted nowrap">${u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                    <td>${button(u.disabled ? 'Enable' : 'Disable', { size: 'sm', variant: u.disabled ? 'secondary' : 'ghost', disabled: self, attrs: html`data-toggle-user` })}</td>
                  </tr>`;
                })}
              </tbody>
            </table></div>${pagination({ page: state.page, pageSize: 20, total: r.total })}`,
      );
    } catch (err) {
      list.innerHTML = String(errorState(err, true));
    }
  };
  const update = async (id, body, btn) => {
    try {
      await withBusy(btn, patch(`/admin/users/${id}`, body));
      toast({ tone: 'ok', title: 'User updated', body: 'Their sessions were signed out so new permissions apply.' });
    } catch (err) {
      toast({ tone: 'danger', title: 'Not updated', body: errorMessage(err) });
    }
    await reload();
  };
  on(list, 'change', '[data-role]', (_e, sel) => {
    sel.disabled = true;
    void update(sel.closest('[data-user]').dataset.user, { role: sel.value });
  });
  on(list, 'click', '[data-toggle-user]', (_e, btn) => {
    const u = items.find((x) => x.id === btn.closest('[data-user]').dataset.user);
    if (u) void update(u.id, { disabled: !u.disabled }, btn);
  });
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
    state.role = form.elements.role.value;
    state.status = form.elements.status.value;
    state.page = 1;
    void reload();
  });
  await reload();
}

/* --------------------------------- Audit log -------------------------------- */

const AUDIT_PREFIXES = ['auth.', 'scan.', 'baggage.', 'incident.', 'alert.', 'admin.', 'checkpoint.', 'flight.', 'demo.'];

export async function auditPage(ctx) {
  const state = { action: '', page: 1 };
  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Administration', title: 'Audit log', subtitle: 'Security and operational events. Entries are retained for 365 days.' })}
    <section class="card">
      <form class="filter-bar" data-form="filters">
        ${field({ label: 'Action prefix', id: 'au-action', control: (id) => select(id, [{ value: '', label: 'All' }, ...AUDIT_PREFIXES.map((a) => ({ value: a, label: `${a}*` }))], { attrs: html`name="action"` }) })}
      </form>
      <div data-slot="list"></div>
    </section>
  `);
  const form = ctx.el.querySelector('[data-form=filters]');
  const list = ctx.el.querySelector('[data-slot=list]');
  const reload = async () => {
    list.innerHTML = String(spinner());
    try {
      const r = await get('/admin/audit', { action: state.action, page: state.page, pageSize: 25 });
      list.innerHTML = String(
        r.items.length === 0
          ? emptyState({ iconName: 'scrollText', title: 'No audit events' })
          : html`<div class="table-wrap"><table class="table">
              <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th></tr></thead>
              <tbody>
                ${r.items.map((a) => {
                  const meta = Object.keys(a.meta ?? {}).length ? JSON.stringify(a.meta) : '';
                  return html`<tr>
                    <td class="muted nowrap">${formatDateTime(a.at)}</td>
                    <td class="mono xs">${a.action} ${a.isDemo ? html`<span class="demo-tag">DEMO</span>` : ''}</td>
                    <td>${a.actorName ?? html`<span class="muted">${a.actorRole ?? 'system'}</span>`}</td>
                    <td class="mono xs muted">${a.targetId ? `${a.targetType}:${a.targetId}` : '—'}</td>
                    <td class="mono xs muted truncate max-w-xs" title="${meta}">${meta}</td>
                  </tr>`;
                })}
              </tbody>
            </table></div>${pagination({ page: state.page, pageSize: 25, total: r.total })}`,
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
  form.addEventListener('change', () => {
    state.action = form.elements.action.value;
    state.page = 1;
    void reload();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  await reload();
}

/* ---------------------------- Checkpoints & demo ---------------------------- */

/** Confirmation dialog (instead of window.confirm). Resolves true when confirmed. */
function confirmDialog({ title, body, confirmLabel }) {
  return new Promise((resolve) => {
    let answered = false;
    const d = openDialog({
      title,
      body: html`<p class="small muted">${body}</p>`,
      footer: html`${button('Cancel', { variant: 'secondary', attrs: html`data-dialog-close` })}${button(confirmLabel, { variant: 'danger', attrs: html`data-action="confirm"` })}`,
      onClose: () => !answered && resolve(false),
    });
    d.el.querySelector('[data-action=confirm]').addEventListener('click', () => {
      answered = true;
      d.close();
      resolve(true);
    });
  });
}

export async function systemPage(ctx) {
  ctx.el.innerHTML = String(html`
    ${pageHeader({ eyebrow: 'Administration', title: 'Checkpoints & demo', subtitle: 'Configure scanning points, add flights manually and manage the isolated demo dataset.' })}
    <div class="grid g-2">
      <section class="card">
        ${cardHeader({ title: 'Demo data', iconName: 'flaskConical', subtitle: 'For presentations. Every record is flagged and labelled DEMO.' })}
        <div class="p-5 stack-3">
          <p class="small muted">Seeding creates demo checkpoints, demo flights, a demo passenger and seven demo bags with scans that trigger example alerts. Resetting deletes only records flagged as demo, including demo bags registered by real users on demo flights.</p>
          <div class="row wrap gap-2">
            ${button(html`${icon('flaskConical')} Seed / re-seed demo data`, { attrs: html`data-action="seed"` })}
            ${button(html`${icon('rotateCcw')} Reset demo data`, { variant: 'secondary', attrs: html`data-action="reset"` })}
          </div>
          <div class="border-t pt-3">
            ${button(html`${icon('shieldAlert')} Run anomaly sweep now`, { variant: 'ghost', attrs: html`data-action="sweep"` })}
            <p class="mt-1 xs muted">The server also runs this automatically on a schedule.</p>
          </div>
        </div>
      </section>
      <section class="card">
        ${cardHeader({ title: 'Add a flight manually', iconName: 'plane', subtitle: 'Shown as “Entered by staff”. Use when no live provider is configured.' })}
        <form class="grid g-2 gap-3 p-5" data-form="flight">
          ${field({ label: 'Airline code', id: 'mf-code', control: (id) => input(id, html`name="airlineCode" value="AI" maxlength="3"`, '', 'uppercase') })}
          ${field({ label: 'Airline name', id: 'mf-name', control: (id) => input(id, html`name="airlineName" value="Air India"`) })}
          ${field({ label: 'Flight number', id: 'mf-num', control: (id) => input(id, html`name="flightNumber" placeholder="AI101"`, '', 'uppercase') })}
          <div class="grid g-2-fixed gap-3">
            ${field({ label: 'From', id: 'mf-from', control: (id) => input(id, html`name="origin" placeholder="MAA" maxlength="3"`, '', 'uppercase') })}
            ${field({ label: 'To', id: 'mf-to', control: (id) => input(id, html`name="destination" placeholder="DEL" maxlength="3"`, '', 'uppercase') })}
          </div>
          ${field({ label: 'Departure (local)', id: 'mf-dep', control: (id) => input(id, html`name="scheduledDeparture" type="datetime-local"`) })}
          ${field({ label: 'Arrival (local)', id: 'mf-arr', control: (id) => input(id, html`name="scheduledArrival" type="datetime-local"`) })}
          <div class="span-2">${button(html`${icon('plus')} Add flight`, { type: 'submit', disabled: true })}</div>
        </form>
      </section>
    </div>
    <section class="card mt-6">
      ${cardHeader({ title: 'Checkpoints', iconName: 'wrench', subtitle: 'Each checkpoint records one journey status when a bag is scanned there.' })}
      <form class="grid g-5 gap-3 items-end p-5 border-b" data-form="cp">
        ${field({ label: 'Code', id: 'cp-code', control: (id) => input(id, html`name="code" placeholder="MAA-SEC-02"`, '', 'uppercase') })}
        ${field({ label: 'Name', id: 'cp-name', control: (id) => input(id, html`name="name" placeholder="Chennai screening 2"`) })}
        ${field({ label: 'Airport', id: 'cp-airport', control: (id) => input(id, html`name="airport" placeholder="MAA" maxlength="4"`, '', 'uppercase') })}
        ${field({ label: 'Type', id: 'cp-type', control: (id) => select(id, CHECKPOINT_TYPE_LIST.map((t) => ({ value: t, label: titleCase(t) })), { attrs: html`name="type"` }) })}
        ${button(html`${icon('plus')} Add checkpoint`, { type: 'submit', disabled: true })}
      </form>
      <div data-slot="cps">${spinner()}</div>
      <p class="card-foot xs muted">RFID is reserved in the data model for future readers. No RFID hardware integration exists in this version.</p>
    </section>
  `);
  const $ = (sel) => ctx.el.querySelector(sel);
  const cpsSlot = $('[data-slot=cps]');
  let checkpoints = [];

  const loadCps = async () => {
    try {
      checkpoints = (await get('/checkpoints')).items;
      cpsSlot.innerHTML = String(
        checkpoints.length === 0
          ? emptyState({ iconName: 'wrench', title: 'No checkpoints yet', body: 'Add checkpoints above, run “npm run seed:checkpoints -w server -- MAA DEL”, or seed demo data.' })
          : html`<div class="table-wrap"><table class="table">
              <thead><tr><th>Code</th><th>Name</th><th>Airport</th><th>Type</th><th>Reader</th><th>State</th></tr></thead>
              <tbody>
                ${checkpoints.map(
                  (c) => html`<tr data-cp="${c.id}">
                    <td class="mono xs">${c.code} ${c.isDemo ? demoBadge() : ''}</td>
                    <td>${c.name}</td>
                    <td>${c.airport}</td>
                    <td class="muted">${titleCase(c.type)}</td>
                    <td class="muted upper">${c.readerKind}</td>
                    <td>${c.isDemo ? badge(c.active ? 'Active' : 'Inactive') : button(c.active ? 'Deactivate' : 'Activate', { size: 'sm', variant: 'ghost', attrs: html`data-toggle-cp` })}</td>
                  </tr>`,
                )}
              </tbody>
            </table></div>`,
      );
    } catch (err) {
      cpsSlot.innerHTML = String(errorState(err, true));
    }
  };

  /* Demo data & sweep */
  $('[data-action=seed]').addEventListener('click', async (e) => {
    try {
      const r = await withBusy(e.currentTarget, post('/demo/seed'));
      toast({ tone: 'ok', title: 'Demo data created', body: `${r.baggage} demo bags, ${r.flights} demo flights, ${r.checkpoints} demo checkpoints.` });
      void loadCps();
    } catch (err) {
      toast({ tone: 'danger', title: 'Seeding failed', body: errorMessage(err) });
    }
  });
  $('[data-action=reset]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!(await confirmDialog({ title: 'Reset demo data?', body: 'Remove all demo records? Operational data is not affected.', confirmLabel: 'Remove demo data' }))) return;
    try {
      const r = await withBusy(btn, post('/demo/reset'));
      toast({ tone: 'ok', title: 'Demo data removed', body: `${r.deleted.baggage ?? 0} bags and related demo records deleted. Operational data untouched.` });
      void loadCps();
    } catch (err) {
      toast({ tone: 'danger', title: 'Reset failed', body: errorMessage(err) });
    }
  });
  $('[data-action=sweep]').addEventListener('click', async (e) => {
    try {
      const r = await withBusy(e.currentTarget, post('/alerts/sweep'));
      toast({ tone: 'ok', title: 'Anomaly sweep complete', body: `Checked ${r.checked} bags, raised ${r.raised} alerts.` });
    } catch (err) {
      toast({ tone: 'danger', title: 'Sweep failed', body: errorMessage(err) });
    }
  });

  /* Manual flight */
  const flightForm = $('[data-form=flight]');
  const flightBtn = flightForm.querySelector('[type=submit]');
  const fe = flightForm.elements;
  const upper = (el, strip = false) => {
    const v = el.value.toUpperCase();
    el.value = strip ? v.replace(/\s/g, '') : v;
  };
  flightForm.addEventListener('input', (e) => {
    if (['airlineCode', 'origin', 'destination'].includes(e.target.name)) upper(e.target);
    if (e.target.name === 'flightNumber') upper(e.target, true);
    flightBtn.disabled = !fe.flightNumber.value || !fe.scheduledDeparture.value || !fe.scheduledArrival.value;
  });
  flightForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      airlineCode: fe.airlineCode.value,
      airlineName: fe.airlineName.value,
      flightNumber: fe.flightNumber.value,
      origin: fe.origin.value,
      destination: fe.destination.value,
      scheduledDeparture: new Date(fe.scheduledDeparture.value).toISOString(),
      scheduledArrival: new Date(fe.scheduledArrival.value).toISOString(),
    };
    try {
      await withBusy(flightBtn, post('/flights', body));
      toast({ tone: 'ok', title: 'Flight added', body: 'Labelled “Entered by staff”.' });
      fe.flightNumber.value = '';
      fe.scheduledDeparture.value = '';
      fe.scheduledArrival.value = '';
      flightBtn.disabled = true;
    } catch (err) {
      toast({ tone: 'danger', title: 'Not added', body: errorMessage(err) });
    }
  });

  /* Checkpoints */
  const cpForm = $('[data-form=cp]');
  const cpBtn = cpForm.querySelector('[type=submit]');
  const ce = cpForm.elements;
  cpForm.addEventListener('input', (e) => {
    if (['code', 'airport'].includes(e.target.name)) upper(e.target);
    cpBtn.disabled = !ce.code.value || !ce.name.value || !ce.airport.value;
  });
  cpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await withBusy(cpBtn, post('/checkpoints', { code: ce.code.value, name: ce.name.value, airport: ce.airport.value, type: ce.type.value }));
      toast({ tone: 'ok', title: 'Checkpoint added' });
      ce.code.value = '';
      ce.name.value = '';
      ce.airport.value = '';
      cpBtn.disabled = true;
      void loadCps();
    } catch (err) {
      toast({ tone: 'danger', title: 'Not added', body: errorMessage(err) });
    }
  });
  on(cpsSlot, 'click', '[data-toggle-cp]', async (_e, btn) => {
    const c = checkpoints.find((x) => x.id === btn.closest('[data-cp]').dataset.cp);
    if (!c) return;
    try {
      await withBusy(btn, patch(`/checkpoints/${c.id}`, { active: !c.active }));
      void loadCps();
    } catch (err) {
      toast({ tone: 'danger', title: 'Not updated', body: errorMessage(err) });
    }
  });
  on(cpsSlot, 'click', '[data-action=retry]', () => void loadCps());
  await loadCps();
}

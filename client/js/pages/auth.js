/** Sign in, registration, email OTP verification, password reset and the dev outbox. */
import { html } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { ApiError, errorMessage, get, post } from '../lib/api.js';
import { auth } from '../lib/auth.js';
import { homeFor } from '../lib/format.js';
import { button, callout, field, input, spinner, setFieldError, withBusy } from '../lib/ui.js';
import { logo, themeToggle } from '../components/common.js';
import { smartImage } from '../components/media.js';
import { runwayScene } from '../components/aircraft.js';
import { otpMarkup, mountOtp } from '../components/otp.js';

function authShell({ title, subtitle, body }) {
  return html`<div class="auth-shell">
    <div class="auth-art">
      ${smartImage({ photoKey: 'climbDusk', width: 1400, priority: true, showIcon: false, cls: 'fill', imgCls: 'anim-slow-zoom', alt: '' })}
      <div class="auth-art-shade" aria-hidden="true"></div>
      ${runwayScene()}
      <div class="relative">${logo({ light: true })}</div>
      <div class="auth-art-copy">
        <p class="auth-art-title">Every Bag Has a Journey.</p>
        <p class="auth-art-lead">Every checkpoint scan, every alert and every estimate, with the source shown.</p>
      </div>
    </div>
    <div class="auth-side">
      <div class="auth-top">
        <span class="hide-lg">${logo()}</span>
        <a href="/" class="back-home show-lg">${icon('arrowLeft')} Back to home</a>
        ${themeToggle()}
      </div>
      <main id="main" class="auth-main">
        <div class="auth-box">
          <div class="auth-banner hide-lg">
            ${smartImage({ photoKey: 'climbDusk', width: 800, showIcon: false, cls: 'fill', alt: '' })}
            <div class="auth-art-shade" aria-hidden="true"></div>
            ${runwayScene()}
          </div>
          <h1 class="h1">${title}</h1>
          ${subtitle ? html`<p class="mt-2 muted">${subtitle}</p>` : ''}
          <div class="mt-8">${body}</div>
        </div>
      </main>
    </div>
  </div>`;
}

function devEmailNotice() {
  if (auth.emailMode !== 'dev') return '';
  return callout({
    tone: 'warn',
    title: 'Development email mode',
    body: html`SMTP is not configured, so emails are <strong>not sent</strong>. Codes are shown on screen instead and kept in a temporary <a href="/dev-outbox" class="semibold underline">dev outbox</a>.`,
  });
}

/** Shown only when the server is in development email mode and returned a code. */
function devCode(code) {
  if (!code) return '';
  return html`<div role="status" class="dev-code">
    <p class="dev-code-label">${icon('flaskConical')} Development mode · no email sent</p>
    <p class="dev-code-value">${code}</p>
    <p class="xs muted mt-1">This code is displayed only because SMTP is not configured. Production servers never show it.</p>
  </div>`;
}

/** Countdown for "Resend in Ns" buttons. */
function cooldown(btn, seconds, ctx, label = 'Resend code', prefix = 'Resend in') {
  clearInterval(btn._timer);
  let left = seconds;
  const paint = () => {
    btn.disabled = left > 0 || btn.dataset.blocked === '1';
    btn.textContent = left > 0 ? `${prefix} ${left}s` : label;
  };
  paint();
  btn._timer = setInterval(() => {
    left -= 1;
    paint();
    if (left <= 0) clearInterval(btn._timer);
  }, 1000);
  ctx.onCleanup(() => clearInterval(btn._timer));
}

const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null);
const showError = (slot, markup) => (slot.innerHTML = String(markup ?? ''));

export function loginPage(ctx) {
  const next = safeNext(ctx.query.get('next'));
  if (auth.user) return ctx.navigate(next ?? homeFor(auth.user.role), { replace: true });
  ctx.el.innerHTML = String(
    authShell({
      title: 'Welcome back',
      subtitle: html`New here? <a href="/register" class="link">Create an account</a>`,
      body: html`<form class="stack-4" novalidate>
        <div data-slot="error"></div>
        ${ctx.state.reset ? callout({ tone: 'ok', body: 'Password updated. Sign in with your new password.' }) : ''}
        ${field({ label: 'Email', control: (id) => input(id, html`name="email" type="email" autocomplete="email" required`) })}
        ${field({ label: 'Password', control: (id) => input(id, html`name="password" type="password" autocomplete="current-password" required`) })}
        <div class="row end"><a href="/forgot-password" class="link small">Forgot password?</a></div>
        ${button('Sign in', { type: 'submit', size: 'lg', cls: 'w-full' })}
        ${devEmailNotice()}
      </form>`,
    }),
  );
  const form = ctx.el.querySelector('form');
  const errSlot = form.querySelector('[data-slot=error]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(errSlot);
    const body = { email: form.email.value, password: form.password.value };
    try {
      const res = await withBusy(form.querySelector('[type=submit]'), post('/auth/login', body));
      auth.setUser(res.user);
      ctx.navigate(next ?? homeFor(res.user.role), { replace: true });
    } catch (err) {
      const unverified = err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED';
      showError(
        errSlot,
        callout({
          tone: unverified ? 'warn' : 'danger',
          body: html`${errorMessage(err)} ${unverified ? html`<a href="/verify-email?email=${encodeURIComponent(body.email)}&resend=1" class="link underline">Enter or resend the code</a>` : ''}`,
        }),
      );
    }
  });
}

export function registerPage(ctx) {
  ctx.el.innerHTML = String(
    authShell({
      title: 'Create your account',
      subtitle: html`Already registered? <a href="/login" class="link">Sign in</a>`,
      body: html`<form class="stack-4" novalidate>
        <div data-slot="error"></div>
        ${field({ label: 'Full name', id: 'reg-name', control: (id, d) => input(id, html`name="name" autocomplete="name"`, d) })}
        ${field({ label: 'Email', id: 'reg-email', control: (id, d) => input(id, html`name="email" type="email" autocomplete="email"`, d) })}
        ${field({ label: 'Password', id: 'reg-password', hint: 'At least 10 characters, with letters and a number.', control: (id, d) => input(id, html`name="password" type="password" autocomplete="new-password"`, d) })}
        ${button('Create account', { type: 'submit', size: 'lg', cls: 'w-full' })}
        <p class="xs muted">We'll email you a 6-digit code to verify your address. New accounts are passengers; staff and admin roles are granted by an administrator.</p>
      </form>`,
    }),
  );
  const form = ctx.el.querySelector('form');
  const errSlot = form.querySelector('[data-slot=error]');
  const validate = (v) => {
    const e = {};
    if (v.name.trim().length < 2) e.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Enter a valid email address.';
    if (v.password.length < 10 || !/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password)) e.password = 'Use at least 10 characters with letters and a number.';
    for (const k of ['name', 'email', 'password']) setFieldError(form, `reg-${k}`, e[k]);
    // Hints are hidden while an error shows.
    const hint = form.querySelector('#reg-password-hint');
    if (hint) hint.hidden = !!e.password;
    return Object.keys(e).length === 0;
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = { name: form.elements.name.value, email: form.email.value, password: form.password.value };
    if (!validate(v)) return;
    showError(errSlot);
    try {
      const res = await withBusy(form.querySelector('[type=submit]'), post('/auth/register', v));
      ctx.navigate(`/verify-email?email=${encodeURIComponent(v.email.trim().toLowerCase())}`, { state: { devOtp: res.devOtp ?? null, emailMode: res.emailMode } });
    } catch (err) {
      showError(errSlot, callout({ tone: 'danger', body: errorMessage(err) }));
    }
  });
}

export function verifyEmailPage(ctx) {
  const emailParam = ctx.query.get('email') ?? '';
  const wantsResend = !!ctx.query.get('resend');
  let email = emailParam;
  ctx.el.innerHTML = String(
    authShell({
      title: 'Verify your email',
      subtitle: email ? html`Enter the 6-digit code sent to <strong class="fg">${email}</strong>. It expires in 5 minutes.` : 'Enter your email and the 6-digit code we sent you.',
      body: html`<form class="stack-5" novalidate>
        <div data-slot="msg"></div>
        <div data-slot="dev">${devCode(ctx.state.devOtp)}</div>
        ${!emailParam ? field({ label: 'Email', control: (id) => input(id, html`name="email" type="email" autocomplete="email"`) }) : ''}
        ${otpMarkup()}
        ${button(html`${icon('mailCheck')} Verify and continue`, { type: 'submit', size: 'lg', cls: 'w-full', disabled: true })}
        <div class="row between small">
          <span class="muted">Didn't get it?</span>
          <button type="button" class="link-btn" data-action="resend">Resend code</button>
        </div>
        ${devEmailNotice()}
      </form>`,
    }),
  );
  const form = ctx.el.querySelector('form');
  const msg = form.querySelector('[data-slot=msg]');
  const dev = form.querySelector('[data-slot=dev]');
  const submitBtn = form.querySelector('[type=submit]');
  const resendBtn = form.querySelector('[data-action=resend]');
  const syncResend = () => (resendBtn.dataset.blocked = email ? '0' : '1');
  syncResend();
  cooldown(resendBtn, wantsResend ? 0 : 60, ctx);

  let busy = false;
  const submitWith = async (code) => {
    if (busy) return;
    busy = true;
    otp.disable(true);
    showError(msg);
    try {
      const res = await withBusy(submitBtn, post('/auth/verify-otp', { email, code }));
      auth.setUser(res.user);
      ctx.navigate(homeFor(res.user.role), { replace: true });
    } catch (err) {
      showError(msg, callout({ tone: 'danger', body: errorMessage(err) }));
      otp.disable(false);
      otp.clear();
      otp.focus();
    } finally {
      busy = false;
    }
  };
  const otp = mountOtp(form.querySelector('[data-otp]'), {
    onChange: (c) => (submitBtn.disabled = c.length !== 6),
    onComplete: (c) => void submitWith(c),
  });

  const resend = async () => {
    showError(msg);
    try {
      const res = await post('/auth/resend-otp', { email });
      showError(msg, callout({ tone: 'ok', body: res.message }));
      dev.innerHTML = String(devCode(res.devOtp));
      cooldown(resendBtn, res.cooldownSeconds ?? 60, ctx);
    } catch (err) {
      showError(msg, callout({ tone: 'danger', body: errorMessage(err) }));
    }
  };
  resendBtn.addEventListener('click', () => void resend());
  form.email?.addEventListener('input', () => {
    email = form.email.value;
    syncResend();
    cooldown(resendBtn, 0, ctx);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = otp.value();
    if (code.length !== 6) return showError(msg, callout({ tone: 'danger', body: 'Enter all 6 digits.' }));
    void submitWith(code);
  });
  if (wantsResend && email) void resend();
}

export function forgotPasswordPage(ctx) {
  let email = '';
  const draw = (step, devOtp) => {
    ctx.el.innerHTML = String(
      authShell({
        title: 'Reset your password',
        subtitle: step === 'email' ? "We'll email you a 6-digit code that expires in 5 minutes." : html`If an account exists for <strong class="fg">${email}</strong>, a code is on its way.`,
        body: html`${step === 'email'
            ? html`<form class="stack-4" data-step="email">
                <div data-slot="error"></div>
                ${field({ label: 'Email', control: (id) => input(id, html`name="email" type="email" required autocomplete="email" value="${email}"`) })}
                ${button('Send code', { type: 'submit', size: 'lg', cls: 'w-full' })}
              </form>`
            : html`<form class="stack-4" data-step="code">
                <div data-slot="error"></div>
                <div data-slot="dev">${devCode(devOtp)}</div>
                ${otpMarkup()}
                ${field({ label: 'New password', hint: 'At least 10 characters, with letters and a number.', control: (id, d) => input(id, html`name="password" type="password" autocomplete="new-password"`, d) })}
                ${field({ label: 'Confirm password', control: (id) => input(id, html`name="confirm" type="password" autocomplete="new-password"`) })}
                ${button('Update password', { type: 'submit', size: 'lg', cls: 'w-full', disabled: true })}
                <button type="button" class="link-btn small" data-action="resend">Resend code</button>
              </form>`}
          <p class="mt-6 small"><a href="/login" class="link">Back to sign in</a></p>`,
      }),
    );
    const form = ctx.el.querySelector('form');
    const errSlot = form.querySelector('[data-slot=error]');
    if (step === 'email') {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        email = form.email.value;
        showError(errSlot);
        try {
          const res = await withBusy(form.querySelector('[type=submit]'), post('/auth/forgot-password', { email }));
          draw('code', res.devOtp ?? null);
        } catch (err) {
          showError(errSlot, callout({ tone: 'danger', body: errorMessage(err) }));
        }
      });
      return;
    }
    const submitBtn = form.querySelector('[type=submit]');
    const resendBtn = form.querySelector('[data-action=resend]');
    const otp = mountOtp(form.querySelector('[data-otp]'), { onChange: (c) => (submitBtn.disabled = c.length !== 6) });
    cooldown(resendBtn, 60, ctx, 'Resend code', 'Resend code in');
    resendBtn.addEventListener('click', async () => {
      showError(errSlot);
      try {
        const res = await post('/auth/resend-otp', { email, purpose: 'reset-password' });
        form.querySelector('[data-slot=dev]').innerHTML = String(devCode(res.devOtp));
        cooldown(resendBtn, 60, ctx, 'Resend code', 'Resend code in');
      } catch (err) {
        showError(errSlot, callout({ tone: 'danger', body: errorMessage(err) }));
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.password.value !== form.confirm.value) return showError(errSlot, callout({ tone: 'danger', body: 'Passwords do not match.' }));
      showError(errSlot);
      try {
        await withBusy(submitBtn, post('/auth/reset-password', { email, code: otp.value(), password: form.password.value }));
        ctx.navigate('/login', { replace: true, state: { reset: true } });
      } catch (err) {
        showError(errSlot, callout({ tone: 'danger', body: errorMessage(err) }));
      }
    });
  };
  draw('email');
}

/** Development-only view of emails captured instead of sent. */
export async function devOutboxPage(ctx) {
  const shell = (inner) => html`<div class="container-sm page-top-sm">
    <div class="row gap-3 mb-6">${icon('flaskConical', 'i-6 demo-ink')}<h1 class="h2">Development email outbox</h1></div>
    ${inner}
  </div>`;
  // Links inside dev emails point at this app; keep only the path so they open here.
  const linkify = (text) =>
    text.split(/(https?:\/\/\S+)/g).map((part) => (/^https?:\/\//.test(part) ? html`<a href="${part.replace(/^https?:\/\/[^/]+/, '')}" class="link break-all underline">${part}</a>` : part));
  const load = async () => {
    ctx.el.innerHTML = String(shell(spinner()));
    try {
      const r = await get('/auth/dev-outbox');
      ctx.el.innerHTML = String(
        shell(html`<div class="stack-4">
          ${callout({ tone: 'warn', title: 'These emails were NOT sent', body: r.notice })}
          ${r.items.length === 0 ? html`<p class="muted">No messages yet.</p>` : ''}
          ${r.items.map(
            (m) => html`<section class="card p-5">
              <p class="xs muted">To ${m.to} · ${new Date(m.createdAt).toLocaleString()}</p>
              <p class="mt-1 semibold">${m.subject}</p>
              <pre class="mail-text">${linkify(m.text)}</pre>
            </section>`,
          )}
          ${button(html`${icon('checkCircle2')} Refresh`, { variant: 'secondary', attrs: html`data-action="refresh"` })}
        </div>`),
      );
      ctx.el.querySelector('[data-action=refresh]').addEventListener('click', load);
    } catch {
      ctx.el.innerHTML = String(shell(callout({ tone: 'warn', body: 'The dev outbox is only available when the server runs with EMAIL_PROVIDER=dev outside production.' })));
    }
  };
  await load();
}

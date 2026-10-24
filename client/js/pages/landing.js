/** Home page: hero with aircraft animation, journey, lookup methods, airlines, features, FAQ. */
import { AIRLINE_DIRECTORY } from '/shared/index.js';
import { html, prefersReducedMotion } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get } from '../lib/api.js';
import { auth } from '../lib/auth.js';
import { homeFor } from '../lib/format.js';
import { photo } from '../lib/photos.js';
import { smartImage } from '../components/media.js';
import { heroAircraft } from '../components/aircraft.js';
import { airlineCard, replaceRevealed } from '../components/airlines.js';

const HEADLINE = ['Every', 'Bag', 'Has', 'a', 'Journey.'];

const STEPS = [
  { iconName: 'tag', title: 'Register', body: 'Add a bag to your flight. Its ID becomes a QR baggage tag.' },
  { iconName: 'scanLine', title: 'Scan', body: 'Staff record check-in, security, loading and departure at each checkpoint.' },
  { iconName: 'plane', title: 'Fly', body: 'In transit, the timeline shows the last verified checkpoint, never a guess.' },
  { iconName: 'packageCheck', title: 'Collect', body: 'Arrival and belt scans tell you when the bag is ready to collect.' },
];

const LOOKUP = [
  { iconName: 'scanLine', title: 'Scan with your camera', body: 'Point your phone at the tag. The camera stops as soon as you leave the page.', photoKey: 'checkIn' },
  { iconName: 'clipboardPaste', title: 'Paste QR content', body: 'Decoded the tag in another app? Paste the text or an AeroTrack tracking link.', photoKey: 'conveyor' },
  { iconName: 'keyboard', title: 'Type the baggage ID', body: 'IDs look like AT-2026-100245. All three methods use the same lookup.', photoKey: 'ramp' },
];

const FEATURES = [
  { iconName: 'qrCode', title: 'QR baggage tags', body: 'Each bag gets an ID and a printable tag. The QR code holds no personal data.' },
  { iconName: 'columns3', title: 'Baggage operations board', body: 'Staff drag bags to the next checkpoint. Every move is validated and saved by the server first.' },
  { iconName: 'shieldAlert', title: 'Explainable alerts', body: 'Skipped checkpoints, wrong-airport scans, duplicates and long dwell times, each with evidence.' },
  { iconName: 'sparkles', title: 'Delay-risk estimate', body: 'A transparent rules baseline with listed factors. Clearly labelled as an estimate.' },
  { iconName: 'lifeBuoy', title: 'Incident reports', body: 'Report missing, delayed or damaged bags and follow the investigation history.' },
  { iconName: 'barChart3', title: 'Admin dashboard', body: 'Users, baggage, flights and an audit trail, all from the database, with demo data kept separate.' },
  { iconName: 'lock', title: 'Secure by design', body: 'Email OTP verification, hashed passwords, server-side sessions and role checks on the server.' },
  { iconName: 'volume2', title: 'Sound feedback', body: 'Subtle confirmation sounds for scans and saved updates, with an on/off switch.' },
];

const FAQ = [
  { q: 'Does AeroTrack locate my suitcase with GPS?', a: 'No. Tracking is based on QR scans at airport checkpoints. Between scans the app shows the last verified checkpoint, not a live position.' },
  { q: 'Are the flights and airlines live?', a: 'No. The airline directory and its flights, gates and belts are demonstration data stored in the project database. No external flight API is used, and no partnership with any airline is implied.' },
  { q: 'How is my account verified?', a: 'We email a 6-digit code that expires in 5 minutes. Only a hash of the code is stored. In local development without SMTP, the code is shown on screen and clearly labelled.' },
  { q: 'What does the QR code contain?', a: 'Only the baggage ID, for example AEROTRACK:BAG:AT-2026-100245. No names or flight details. You must sign in to look it up, and passengers only see their own bags.' },
  { q: 'Can I track a bag without a camera?', a: 'Yes. Paste the decoded QR text from another app, or type the baggage ID.' },
];

const PREVIEW = ['AI', '6E', 'EK', 'SQ'];

/** Animated route line with a small plane following it (still for reduced motion). */
function routeLine() {
  const d = 'M12 70 C 90 10, 210 10, 288 50';
  const still = prefersReducedMotion();
  return html`<svg viewBox="0 0 300 80" class="route-line" aria-hidden="true">
    <defs><linearGradient id="route" x1="0" x2="1"><stop offset="0" stop-color="#246bfd" /><stop offset="1" stop-color="#55d6ff" /></linearGradient></defs>
    <path d="${d}" fill="none" stroke="rgb(255 255 255 / 0.2)" stroke-width="2" stroke-dasharray="4 6" />
    <path class="draw-path draw-late" pathLength="1" d="${d}" fill="none" stroke="url(#route)" stroke-width="2.5" stroke-linecap="round" />
    <circle cx="12" cy="70" r="4" fill="#55d6ff" />
    <circle cx="288" cy="50" r="4" fill="#fff" />
    <g>
      <path d="M-9 -2 L4 -2 L9 0 L4 2 L-9 2 Z M-2 -2 L-6 -9 L-3 -9 L4 -2 Z M-2 2 L-6 9 L-3 9 L4 2 Z M-9 -1 L-11 -5 L-9 -5 L-6 -1 Z M-9 1 L-11 5 L-9 5 L-6 1 Z" fill="#fff" ${still ? html`transform="translate(150 25)"` : ''} />
      ${still ? '' : html`<animateMotion dur="6s" repeatCount="indefinite" rotate="auto" path="${d}" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1" />`}
    </g>
  </svg>`;
}

/** Flight information panel and baggage status preview. Sample values, labelled as such. */
function statusCard() {
  const stages = ['Checked in', 'Security', 'Loaded', 'In transit'];
  return html`<div class="glass status-card">
    <div class="row between">
      <span class="row gap-2 small semibold">${icon('plane', 'i-4 cyan')} AI 573 · Air India</span>
      <span class="sample-chip">Sample</span>
    </div>
    <div class="status-card-route">
      <div><p class="status-card-code">MAA</p><p>Chennai</p></div>
      <div class="flex-1 px-3">${routeLine()}</div>
      <div class="right"><p class="status-card-code">BOM</p><p>Mumbai</p></div>
    </div>
    <dl class="status-card-facts">
      ${[['Gate', 'B12'], ['Belt', '4'], ['Flight', 'Boarding']].map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
    </dl>
    <div class="status-card-bag">
      <p class="row between xs semibold">
        <span class="row gap-1">${icon('luggage', 'i-3 cyan')} AT-2026-100245</span>
        <span class="cyan">Loaded</span>
      </p>
      <ol class="status-card-stages" aria-label="Sample checkpoint progress">
        ${stages.map((s, i) => html`<li><span class="stage-bar" style="--fill:${i < 3 ? 1 : 0.35}; animation-delay:${1 + i * 0.25}s"></span><span class="stage-label">${s}</span></li>`)}
      </ol>
      <p class="status-card-note">${icon('clock3', 'i-3')} Last verified scan: loading bay · sample</p>
    </div>
  </div>`;
}

export async function landingPage(ctx) {
  const user = auth.user;
  const trackTo = user ? '/track' : '/login?next=/track';
  const startTo = user ? homeFor(user.role) : '/register';
  const startLabel = user ? 'Open dashboard' : 'Get Started';
  const heroPhoto = photo('hero');

  const airlinesGrid = (featured, state) =>
    AIRLINE_DIRECTORY.filter((a) => PREVIEW.includes(a.code))
      .map((a, i) => html`<div class="h-full" style="--d:${i * 0.08}s">${airlineCard(a, featured.get(a.code), state)}</div>`);

  ctx.el.innerHTML = String(html`
    <section class="hero" id="hero">
      <div class="hero-bg" data-parallax="0.18">${smartImage({ photoKey: 'hero', width: 2000, priority: true, showIcon: false, cls: 'fill', imgCls: 'anim-slow-zoom', alt: heroPhoto.alt })}</div>
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="hero-shade-2" aria-hidden="true"></div>
      <div class="container hero-grid">
        <div class="hero-copy" data-parallax="-0.1" data-fade>
          <p class="hero-pill fade-up" style="--d:0s"><span class="dot-cyan" aria-hidden="true"></span> Smart airline baggage tracking</p>
          <h1 class="hero-title">
            ${HEADLINE.map((w, i) => html`<span class="fade-up word ${w === 'Journey.' ? 'gradient-text' : ''}" style="--d:${0.12 * (i + 1)}s">${w}</span> `)}
          </h1>
          <p class="hero-lead fade-up" style="--d:0.8s">Track your baggage through its journey with clear status updates and a connected baggage experience.</p>
          <div class="hero-ctas fade-up" style="--d:0.95s">
            <a href="${trackTo}" class="btn btn-lg btn-electric group">Track My Bag ${icon('arrowRight', 'i-4 nudge')}</a>
            <a href="${startTo}" class="btn btn-lg btn-white">${startLabel}</a>
            <a href="/airlines" class="btn btn-lg btn-outline-light">Explore Airlines</a>
          </div>
        </div>
        <div class="hero-visual">
          <div data-parallax="-0.25">${heroAircraft()}</div>
          <div class="hero-status fade-up" style="--d:1.6s">${statusCard()}</div>
        </div>
      </div>
      <a href="#journey" class="scroll-cue"><span class="scroll-mouse"><span class="scroll-dot"></span></span>Scroll</a>
      <p class="photo-credit">Photo: ${heroPhoto.photographer} / Unsplash · Aircraft: illustration</p>
    </section>

    <section id="journey" class="container section scroll-mt">
      <div class="section-head reveal">
        <p class="eyebrow">How it works</p>
        <h2 class="section-title">From tag to belt, every step verified.</h2>
      </div>
      <ol class="journey-steps">
        <div class="journey-line" aria-hidden="true"></div>
        ${STEPS.map(
          (s, i) => html`<li class="journey-step reveal" style="--d:${i * 0.12}s">
            <div class="journey-icon">${icon(s.iconName, 'i-6')}</div>
            <p class="mono xs muted mt-5">0${i + 1}</p>
            <h3 class="h4 mt-1">${s.title}</h3>
            <p class="small muted mt-1 journey-body">${s.body}</p>
          </li>`,
        )}
      </ol>
    </section>

    <section class="hero-gradient section-band">
      <div class="grid-lines" aria-hidden="true"></div>
      <div class="container relative">
        <div class="section-head reveal">
          <p class="eyebrow cyan">Find your bag</p>
          <h2 class="section-title">Three ways in, one source of truth.</h2>
          <p class="mt-4 white-75">Whichever way you identify a bag, the same database record answers: the tracking page, the staff board and the admin dashboard never disagree.</p>
        </div>
        <div class="grid g-3 mt-12">
          ${LOOKUP.map(
            (l, i) => html`<article class="lookup-card reveal" style="--d:${i * 0.08}s">
              ${smartImage({ photoKey: l.photoKey, width: 700, showIcon: false, cls: 'lookup-card-photo', imgCls: 'zoom-on-hover op-80' })}
              <div class="lookup-card-shade" aria-hidden="true"></div>
              <div class="lookup-card-body">
                <span class="gradient-tile">${icon(l.iconName, 'i-5')}</span>
                <h3 class="h4 mt-4">${l.title}</h3>
                <p class="small white-70 mt-1">${l.body}</p>
              </div>
            </article>`,
          )}
        </div>
        <div class="mt-10"><a href="${trackTo}" class="btn btn-lg btn-white">Track My Bag ${icon('arrowRight')}</a></div>
      </div>
    </section>

    <section class="container section">
      <div class="row between wrap gap-4 align-end">
        <div class="section-head reveal">
          <p class="eyebrow">Airline directory</p>
          <h2 class="section-title">Twenty airlines, one simple timeline.</h2>
          <p class="mt-3 muted">A demonstration directory with sample flights, gates and belts. Not a partnership or a live data feed.</p>
        </div>
        <a href="/airlines" class="btn btn-secondary btn-lg">Explore Airlines ${icon('arrowRight')}</a>
      </div>
      <div class="grid g-4 mt-12" id="landing-airlines">${airlinesGrid(new Map(), 'loading')}</div>
    </section>

    <section id="features" class="features-band">
      <div class="container section scroll-mt">
        <div class="section-head reveal">
          <p class="eyebrow">Features</p>
          <h2 class="section-title">Built for passengers, staff and administrators.</h2>
        </div>
        <div class="grid g-4 mt-12">
          ${FEATURES.map(
            (f, i) => html`<article class="card accent-border feature-card lift reveal" style="--d:${i * 0.06}s">
              <div class="feature-icon">${icon(f.iconName, 'i-5')}</div>
              <h3 class="bold mt-4">${f.title}</h3>
              <p class="small muted mt-1 relaxed">${f.body}</p>
            </article>`,
          )}
        </div>
      </div>
    </section>

    <section class="cta-band">
      ${smartImage({ photoKey: 'runwaySunset', width: 2000, showIcon: false, cls: 'cta-photo', alt: '' })}
      <div class="cta-shade" aria-hidden="true"></div>
      <div class="container">
        <div class="cta-copy reveal">
          <h2 class="section-title">Ready when your bag is.</h2>
          <p class="mt-4 white-80">Create an account, verify your email with a 6-digit code, and register your first bag in under a minute.</p>
          <div class="row wrap gap-3 mt-8">
            <a href="${startTo}" class="btn btn-lg btn-white">${startLabel}</a>
            <a href="/about" class="btn btn-lg btn-outline-light">About the project</a>
          </div>
        </div>
      </div>
    </section>

    <section id="faq" class="faq-band">
      <div class="container-sm section scroll-mt">
        <p class="eyebrow">FAQ</p>
        <h2 class="h2 mt-3">Straight answers</h2>
        <div class="stack-3 mt-8">
          ${FAQ.map(
            (f) => html`<details class="card faq">
              <summary>${f.q} ${icon('chevronDown', 'i-4 muted faq-chevron')}</summary>
              <p>${f.a}</p>
            </details>`,
          )}
        </div>
        <p class="row center-row gap-1 xs muted mt-10">${icon('mapPin', 'i-3')} Tracking shows verified checkpoint scans only. It does not physically locate bags.</p>
      </div>
    </section>
  `);

  // Parallax and fade-out of the hero copy while scrolling past the hero.
  const hero = ctx.el.querySelector('#hero');
  const layers = [...hero.querySelectorAll('[data-parallax]')];
  const fade = hero.querySelector('[data-fade]');
  let frame = 0;
  const onScroll = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const progress = Math.min(1, Math.max(0, window.scrollY / hero.offsetHeight));
      for (const l of layers) l.style.transform = `translateY(${progress * Number(l.dataset.parallax) * 100}%)`;
      fade.style.opacity = String(Math.max(0, 1 - progress / 0.8));
    });
  };
  if (!prefersReducedMotion()) {
    window.addEventListener('scroll', onScroll, { passive: true });
    ctx.onCleanup(() => window.removeEventListener('scroll', onScroll));
  }

  // Sample flights come from the database; the cards render immediately from the bundled list.
  const grid = ctx.el.querySelector('#landing-airlines');
  let markup;
  try {
    const r = await get('/airlines');
    markup = airlinesGrid(new Map(r.items.map((a) => [a.code, a.featuredFlight])), 'ready');
  } catch {
    markup = airlinesGrid(new Map(), 'error');
  }
  replaceRevealed(grid, html`${markup}`);
}

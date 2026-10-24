/**
 * Original SVG airliner artwork (AeroTrack colours, not any airline's livery)
 * and the two animated scenes built from it. All motion is CSS, so it stops
 * automatically for people who prefer reduced motion.
 */
import { html } from '../lib/dom.js';

/**
 * Side view of a twin-engine narrow-body airliner. Proportions follow the
 * common A320/737 layout: low swept wing with winglets, under-wing engines,
 * swept fin and a single cabin window row.
 */
export function airliner(cls = '') {
  const windows = Array.from({ length: 27 }, (_, i) => 196 + i * 11.4);
  return html`<svg viewBox="0 0 600 160" class="${cls}" role="img" aria-label="Illustration of a twin-engine passenger airliner">
    <defs>
      <linearGradient id="al-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset="0.55" stop-color="#eef3fb" /><stop offset="1" stop-color="#b9c6da" /></linearGradient>
      <linearGradient id="al-tail" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#246bfd" /><stop offset="1" stop-color="#071426" /></linearGradient>
      <linearGradient id="al-wing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe6f2" /><stop offset="1" stop-color="#97a6bd" /></linearGradient>
      <linearGradient id="al-engine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b3560" /><stop offset="1" stop-color="#071426" /></linearGradient>
      <radialGradient id="al-glow"><stop offset="0" stop-color="currentColor" stop-opacity="0.9" /><stop offset="1" stop-color="currentColor" stop-opacity="0" /></radialGradient>
    </defs>
    <!-- far-side wing and stabiliser, slightly darker for depth -->
    <path d="M380 82 L322 82 L268 62 L282 60 L350 76 Z" fill="#8c9bb3" opacity="0.7" />
    <path d="M118 78 L80 66 L72 67 L108 82 Z" fill="#8c9bb3" opacity="0.7" />
    <!-- vertical fin -->
    <path d="M158 71 L104 12 L74 12 L70 18 L86 78 Z" fill="url(#al-tail)" />
    <path d="M104 12 L74 12 L70 18 L98 18 Z" fill="#55d6ff" opacity="0.85" />
    <!-- fuselage -->
    <path d="M62 80 C 92 72, 122 70, 162 70 L 515 70 C 548 70, 571 79, 582 91 C 587 98, 581 106, 566 108 C 548 111, 530 111, 515 111 L 178 111 C 142 111, 108 103, 78 93 C 66 89, 59 85, 62 80 Z" fill="url(#al-body)" stroke="#9aa9bf" stroke-width="0.6" />
    <!-- cheatline -->
    <path d="M150 98 L 540 98 C 556 98, 568 100, 576 103 L 574 106 C 560 103, 548 102, 538 102 L 150 102 C 128 102, 108 98, 90 92 L 92 89 C 110 94, 130 98, 150 98 Z" fill="#246bfd" />
    <path d="M160 104 L 520 104 L 520 105.5 L 160 105.5 Z" fill="#55d6ff" opacity="0.8" />
    <!-- windows, doors, cockpit -->
    ${windows.map((x) => html`<rect x="${x}" y="82.5" width="4.6" height="6.4" rx="2.2" fill="#1b3560" />`)}
    <rect x="503" y="76" width="9" height="20" rx="2.5" fill="none" stroke="#9aa9bf" stroke-width="1" />
    <rect x="172" y="76" width="9" height="20" rx="2.5" fill="none" stroke="#9aa9bf" stroke-width="1" />
    <rect x="340" y="80" width="7" height="12" rx="2" fill="none" stroke="#9aa9bf" stroke-width="0.8" />
    <path d="M546 79.5 L 563 81 C 568 83, 571 86, 573 89 L 551 88.5 Z" fill="#071426" />
    <path d="M552 80.6 L 553 88.2 M 560 81.4 L 561.5 88.6" stroke="#b9c6da" stroke-width="0.8" />
    <!-- horizontal stabiliser (near side) -->
    <path d="M128 92 L 70 84 L 60 88 L 118 99 Z" fill="url(#al-wing)" stroke="#8c9bb3" stroke-width="0.5" />
    <!-- near wing with winglet -->
    <path d="M398 103 L 300 103 L 222 126 L 244 128 L 330 112 Z" fill="url(#al-wing)" stroke="#8c9bb3" stroke-width="0.6" />
    <path d="M226 125 L 211 105 L 218 104 L 240 124 Z" fill="url(#al-tail)" />
    <!-- engine and pylon -->
    <path d="M408 104 L 452 104 L 446 113 L 414 113 Z" fill="#c9d3e3" />
    <path d="M402 112 L 462 112 C 471 112, 475 118, 475 124 C 475 130, 471 136, 462 136 L 402 136 C 393 136, 388 130, 388 124 C 388 118, 393 112, 402 112 Z" fill="url(#al-engine)" />
    <ellipse cx="472" cy="124" rx="4" ry="11.5" fill="#55d6ff" opacity="0.9" />
    <ellipse cx="472.5" cy="124" rx="2.4" ry="9" fill="#0b1d36" />
    <path d="M388 120 L 380 122 L 380 126 L 388 128 Z" fill="#0b1d36" />
    <!-- belly fairing shadow -->
    <path d="M290 111 L 410 111 C 400 115, 380 117, 350 117 C 320 117, 300 115, 290 111 Z" fill="#9aa9bf" opacity="0.5" />
    <!-- lights: red anti-collision beacons, red port navigation light, white tail strobe -->
    <g class="anim-blink" style="color:#ff4d57">
      <circle cx="330" cy="69" r="7" fill="url(#al-glow)" /><circle cx="330" cy="69" r="1.8" fill="#ff4d57" />
      <circle cx="345" cy="118" r="7" fill="url(#al-glow)" /><circle cx="345" cy="118" r="1.8" fill="#ff4d57" />
    </g>
    <g style="color:#ff4d57"><circle cx="214" cy="106" r="6" fill="url(#al-glow)" opacity="0.6" /><circle cx="214" cy="106" r="1.6" fill="#ff4d57" /></g>
    <g class="anim-blink" style="color:#ffffff; animation-delay:0.5s"><circle cx="62" cy="81" r="9" fill="url(#al-glow)" /><circle cx="62" cy="81" r="1.8" fill="#ffffff" /></g>
  </svg>`;
}

/** Soft cloud bank used for the parallax layers. */
function cloudBank(opacity) {
  return html`<svg viewBox="0 0 1200 120" preserveAspectRatio="none" class="cloud-bank" aria-hidden="true">
    <defs><filter id="cloud-blur" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="9" /></filter></defs>
    <g fill="#ffffff" opacity="${opacity}" filter="url(#cloud-blur)">
      ${[60, 210, 330, 480, 640, 760, 900, 1060, 1170].map((x, i) => html`<ellipse cx="${x}" cy="${70 + (i % 3) * 8}" rx="${90 + (i % 4) * 25}" ry="${22 + (i % 3) * 7}" />`)}
    </g>
  </svg>`;
}

/** Data saver or very few CPU cores get the still version of the scenes. */
export function lowPower() {
  return !!navigator.connection?.saveData || (navigator.hardwareConcurrency ?? 8) <= 2;
}

/**
 * Hero animation: the airliner climbs into view along the flight path, then
 * cruises while two cloud layers drift past at different speeds (parallax).
 */
export function heroAircraft() {
  return html`<div class="hero-aircraft ${lowPower() ? 'is-still' : ''}">
    <svg viewBox="0 0 400 250" class="hero-path" aria-hidden="true">
      <defs>
        <linearGradient id="hero-path" x1="0" x2="1"><stop offset="0" stop-color="#55d6ff" stop-opacity="0" /><stop offset="0.6" stop-color="#55d6ff" stop-opacity="0.7" /><stop offset="1" stop-color="#ffffff" stop-opacity="0.9" /></linearGradient>
      </defs>
      <path class="draw-path" pathLength="1" d="M-40 230 C 80 210, 170 150, 300 118" fill="none" stroke="url(#hero-path)" stroke-width="1.6" />
    </svg>
    <div class="cloud-layer cloud-back"><div class="cloud-track slow">${cloudBank(0.18)}</div></div>
    <div class="hero-plane">
      <div class="hero-plane-float">
        <div class="contrail"></div>
        ${airliner('airliner')}
      </div>
    </div>
    <div class="cloud-layer cloud-front"><div class="cloud-track fast">${cloudBank(0.3)}</div></div>
  </div>`;
}

/** Sign-in scene: an airliner lifts off over a runway at dusk, with sequenced runway edge lights. */
export function runwayScene() {
  const n = 14;
  const lights = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const spread = 8 + t * 42; // perspective: lights spread out towards the viewer
    for (const side of [-1, 1]) {
      lights.push(html`<span class="runway-light" style="left:${50 + side * spread}%; bottom:${(1 - t) * 92}%; animation-delay:${((n - i) * 0.09).toFixed(2)}s; transform:scale(${(0.6 + t * 0.9).toFixed(2)})"></span>`);
    }
  }
  return html`<div class="runway-scene ${lowPower() ? 'is-still' : ''}" aria-hidden="true">
    <svg viewBox="0 0 800 300" preserveAspectRatio="none" class="runway-strip">
      <defs><linearGradient id="rw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1d36" stop-opacity="0" /><stop offset="1" stop-color="#071426" /></linearGradient></defs>
      <path d="M330 0 L470 0 L800 300 L0 300 Z" fill="url(#rw)" />
      <path d="M398 10 L402 10 L408 300 L392 300 Z" fill="#ffffff" opacity="0.25" />
    </svg>
    <div class="runway-lights">${lights}</div>
    <div class="runway-plane">${airliner('airliner')}</div>
  </div>`;
}

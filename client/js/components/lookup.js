/**
 * QR camera, the three-way lookup panel (camera, pasted QR content, typed ID)
 * used by Track Baggage, and the staff checkpoint scanner.
 */
import { parseLookupInput, parseQrPayload, normalizeReference } from '/shared/index.js';
import { html, uid } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { playSound } from '../lib/audio.js';
import { button, callout, field, input } from '../lib/ui.js';

/* ---------------------------------- Camera ---------------------------------- */

let libraryPromise = null;

/** html5-qrcode (Apache-2.0) is loaded only when a camera or photo scan is used. */
function loadScannerLibrary() {
  libraryPromise ??= new Promise((resolve, reject) => {
    if (window.__Html5QrcodeLibrary__) return resolve(window.__Html5QrcodeLibrary__);
    const s = document.createElement('script');
    s.src = '/vendor/html5-qrcode.min.js';
    s.onload = () => resolve(window.__Html5QrcodeLibrary__);
    s.onerror = () => {
      libraryPromise = null;
      reject(new Error('Scanner library could not be loaded'));
    };
    document.head.append(s);
  });
  return libraryPromise;
}

export function cameraView(regionId) {
  return html`<div class="camera" data-camera>
    <div id="${regionId}" class="camera-region" aria-label="Camera preview"></div>
    <div class="camera-off"><div>${icon('cameraOff', 'i-8 op-70')}<p class="small mt-2">Camera is off</p></div></div>
    <div class="camera-frame" aria-hidden="true"></div>
    <div class="camera-line anim-scan-line" aria-hidden="true"></div>
    <div id="${regionId}-file" hidden></div>
  </div>`;
}

/**
 * Camera QR reading. The same code is passed on at most once every 3 s, the
 * camera stops when the page is left (call stop from a cleanup), and errors
 * become plain-language messages through `onError`.
 */
export function createQrCamera({ regionId, onText, onState, onError }) {
  let scanner = null;
  let last = null;
  let active = false;

  const handleText = (text) => {
    const now = Date.now();
    if (last && last.text === text && now - last.at < 3000) return;
    last = { text, at: now };
    playSound('qrDetected');
    onText(text);
  };

  const setActive = (on) => {
    active = on;
    onState?.({ active, starting: false });
  };

  async function stop() {
    const s = scanner;
    scanner = null;
    setActive(false);
    if (s) {
      try {
        if (s.isScanning) await s.stop();
        s.clear();
      } catch {
        /* already stopped */
      }
    }
  }

  async function start() {
    onError?.(null);
    if (!window.isSecureContext) return onError?.('Camera access needs HTTPS (or localhost). Paste the QR content or type the baggage ID instead.');
    if (!navigator.mediaDevices?.getUserMedia) return onError?.('This browser does not support camera access. Paste the QR content or type the baggage ID instead.');
    onState?.({ active: false, starting: true });
    try {
      const { Html5Qrcode } = await loadScannerLibrary();
      const s = new Html5Qrcode(regionId, { verbose: false });
      scanner = s;
      await s.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 }, handleText, () => {});
      setActive(true);
      playSound('scannerOn');
    } catch (err) {
      await stop();
      const msg = String(err?.message ?? err);
      onError?.(
        /permission|NotAllowed/i.test(msg)
          ? 'Camera permission was denied. Allow camera access in your browser settings, or use another lookup method.'
          : /NotFound|no camera|Requested device not found/i.test(msg)
            ? 'No camera was found on this device. Use another lookup method.'
            : 'The camera could not be started. Use another lookup method.',
      );
    }
  }

  async function scanFile(file) {
    onError?.(null);
    try {
      const { Html5Qrcode } = await loadScannerLibrary();
      const s = new Html5Qrcode(`${regionId}-file`, { verbose: false });
      const text = await s.scanFile(file, false);
      s.clear();
      handleText(text);
    } catch {
      onError?.('No QR code could be read from that image. Try a sharper photo or another method.');
    }
  }

  return { start, stop, scanFile, isActive: () => active };
}

/** Camera controls shared by the lookup panel and the staff scanner. */
function cameraControls(startLabel, photoLabel) {
  return html`<div class="row wrap gap-2">
      ${button(html`${icon('camera')} ${startLabel}`, { attrs: html`data-cam="start"` })}
      ${button(html`${icon('cameraOff')} Stop camera`, { variant: 'secondary', cls: 'is-hidden', attrs: html`data-cam="stop"` })}
      ${button(html`${icon('imageUp')} ${photoLabel}`, { variant: 'secondary', attrs: html`data-cam="photo"` })}
      <input type="file" accept="image/*" hidden aria-label="QR code photo" data-cam="file" />
    </div>
    <div data-slot="cam-error"></div>`;
}

function wireCamera(root, ctx, onText) {
  const regionId = root.querySelector('.camera-region').id;
  const startBtn = root.querySelector('[data-cam=start]');
  const stopBtn = root.querySelector('[data-cam=stop]');
  const file = root.querySelector('[data-cam=file]');
  const errSlot = root.querySelector('[data-slot=cam-error]');
  const camera = root.querySelector('[data-camera]');
  const cam = createQrCamera({
    regionId,
    onText,
    onState: ({ active, starting }) => {
      camera.classList.toggle('is-active', active);
      startBtn.classList.toggle('is-hidden', active);
      stopBtn.classList.toggle('is-hidden', !active);
      startBtn.disabled = starting;
      startBtn.setAttribute('aria-busy', String(starting));
    },
    onError: (msg) => (errSlot.innerHTML = msg ? String(callout({ tone: 'warn', body: msg })) : ''),
  });
  startBtn.addEventListener('click', () => void cam.start());
  stopBtn.addEventListener('click', () => void cam.stop());
  root.querySelector('[data-cam=photo]').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (f) void cam.scanFile(f);
    file.value = '';
  });
  ctx.onCleanup(() => void cam.stop());
  return cam;
}

/* ------------------------------- Lookup panel ------------------------------- */

/** Origins whose tracking links are accepted when pasted: this app, plus any listed in window.AEROTRACK_PUBLIC_URL. */
export function trustedOrigins() {
  const extra = window.AEROTRACK_PUBLIC_URL ?? '';
  return [window.location.origin, ...extra.split(',').map((s) => s.trim()).filter(Boolean)];
}

const REASONS = {
  EMPTY: 'Enter something to look up.',
  UNTRUSTED_URL: 'That link is not from AeroTrack, so it was not opened. Paste an AeroTrack tracking link or the baggage ID.',
  INVALID: 'That is not a valid AeroTrack baggage tag. IDs look like AT-2026-100245.',
};

/**
 * Three ways to identify a bag. Every method ends in the same
 * `onLookup(reference)` call, so the backend lookup is shared. Identifying a
 * bag never changes its status. Returns { setBusy(on) }.
 */
export function mountLookupPanel(root, ctx, onLookup) {
  const regionId = uid('qr-region');
  root.innerHTML = String(html`<div class="stack-4">
    <div role="tablist" aria-label="Lookup method" class="tabs">
      ${[
        ['camera', 'Scan Baggage QR', 'scanLine'],
        ['paste', 'Paste QR Code Content', 'clipboardPaste'],
        ['manual', 'Baggage ID', 'keyboard'],
      ].map(([id, label, ic], i) => html`<button type="button" role="tab" class="tab" data-tab="${id}" aria-selected="${i === 0}">${icon(ic, 'i-4 shrink-0')} ${label}</button>`)}
    </div>
    <div data-panel="camera" class="stack-3">
      ${cameraView(regionId)}
      ${cameraControls('Scan Baggage QR', 'Read from photo')}
      <p class="xs muted">The camera asks for permission and stops when you close this page. Scanning only identifies the bag; it does not record a checkpoint.</p>
    </div>
    <form data-panel="paste" class="stack-2" hidden>
      <label for="qr-paste" class="field-label">Paste QR Code Content</label>
      <textarea id="qr-paste" name="text" rows="3" class="input textarea mono small" placeholder="AEROTRACK:BAG:AT-2026-100245&#10;or a tracking link from this site, or the ID"></textarea>
      <p class="xs muted">Decoded the tag with another app? Paste its text here. Links are accepted only from this site and are never opened.</p>
      ${button('Look up', { type: 'submit' })}
    </form>
    <form data-panel="manual" class="stack-2" hidden>
      <label for="bag-id" class="field-label">Baggage ID</label>
      <div class="row gap-2">
        <input id="bag-id" name="text" class="input mono upper tracking" placeholder="AT-2026-100245" autocapitalize="characters" autocomplete="off" />
        ${button('Track', { type: 'submit' })}
      </div>
    </form>
    <p role="alert" class="lookup-error" hidden></p>
    <p class="row gap-2 small muted" aria-live="polite" data-slot="busy" hidden>${icon('loader2', 'i-4 spin')} Looking up…</p>
  </div>`);

  const errorEl = root.querySelector('.lookup-error');
  const setError = (msg) => {
    errorEl.textContent = msg ?? '';
    errorEl.hidden = !msg;
  };
  const handle = (text) => {
    const r = parseLookupInput(text, trustedOrigins());
    if (!r.ok) {
      setError(REASONS[r.reason]);
      playSound('invalid');
      return;
    }
    setError(null);
    onLookup(r.reference);
  };
  const cam = wireCamera(root.querySelector('[data-panel=camera]'), ctx, handle);

  root.querySelector('[role=tablist]').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    const m = tab.dataset.tab;
    if (m !== 'camera' && cam.isActive()) void cam.stop();
    for (const t of root.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', String(t === tab));
    for (const p of root.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== m;
    setError(null);
  });
  for (const form of root.querySelectorAll('form[data-panel]')) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handle(form.elements.text.value);
    });
  }

  return {
    setBusy(on) {
      root.querySelector('[data-slot=busy]').hidden = !on;
      for (const b of root.querySelectorAll('form [type=submit]')) {
        b.disabled = on;
        b.setAttribute('aria-busy', String(on));
      }
    },
  };
}

/* ------------------------------ Staff scanner ------------------------------- */

/**
 * Staff checkpoint scanner: camera, image upload and manual entry. Payloads
 * that are not AeroTrack tags are still passed on so the server can record
 * the failed scan (repeated failures raise an alert).
 * `onScan({ qrPayload } | { reference })`. Returns { setBusy(on), stop() }.
 */
export function mountQrScanner(root, ctx, onScan) {
  const regionId = uid('qr-region');
  const refId = uid('ref');
  root.innerHTML = String(html`<div class="stack-4">
    ${cameraView(regionId)}
    ${cameraControls('Start camera', 'Scan from photo')}
    <form class="manual-entry stack-2" novalidate>
      <p class="row gap-2 small semibold">${icon('keyboard', 'i-4 muted')} Manual entry</p>
      ${field({
        label: 'Baggage reference',
        id: refId,
        control: (id, d) => html`<div class="row gap-2">${input(id, html`name="ref" placeholder="AT-2026-100245" autocomplete="off"`, d, 'mono upper')}${button('Record', { type: 'submit' })}</div>`,
      })}
    </form>
  </div>`);
  const cam = wireCamera(root, ctx, (text) => onScan({ qrPayload: text }));
  const form = root.querySelector('form');
  const err = form.querySelector(`#${refId}-err`);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = form.elements.ref.value;
    const ref = parseQrPayload(raw) ?? normalizeReference(raw);
    if (!ref) {
      err.textContent = 'Enter a reference like AT-2026-100245.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    onScan({ reference: ref });
    form.elements.ref.value = '';
  });
  return {
    setBusy(on) {
      const b = form.querySelector('[type=submit]');
      b.disabled = on;
      b.setAttribute('aria-busy', String(on));
    },
    stop: () => cam.stop(),
  };
}

/** Six single-digit boxes with paste support and arrow/backspace navigation. */
import { html } from '../lib/dom.js';

export const otpMarkup = () => html`<fieldset class="otp" data-otp>
  <legend class="field-label mb-2">6-digit code</legend>
  <div class="otp-boxes">
    ${[0, 1, 2, 3, 4, 5].map((i) => html`<input class="otp-box" inputmode="numeric" maxlength="6" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Digit ${i + 1}" data-i="${i}" />`)}
  </div>
</fieldset>`;

/**
 * Wires an otpMarkup() fieldset. Returns { value(), clear(), disable(on), focus() }.
 * `onChange(code)` runs on every edit and `onComplete(code)` when 6 digits are in.
 */
export function mountOtp(root, { onChange, onComplete } = {}) {
  const boxes = [...root.querySelectorAll('.otp-box')];
  const value = () => boxes.map((b) => b.value).join('');
  const paint = () => {
    for (const b of boxes) b.classList.toggle('filled', !!b.value);
  };
  const set = (digits) => {
    const clean = digits.replace(/\D/g, '').slice(0, 6);
    boxes.forEach((b, i) => (b.value = clean[i] ?? ''));
    paint();
    onChange?.(clean);
    if (clean.length === 6) onComplete?.(clean);
    boxes[Math.min(clean.length, 5)].focus();
  };

  boxes.forEach((box, i) => {
    box.addEventListener('focus', () => box.select());
    box.addEventListener('input', () => {
      const d = box.value.replace(/\D/g, '');
      if (!d) {
        box.value = '';
        return;
      }
      // Typing several digits (autofill) fills forward.
      const arr = boxes.map((b) => b.value.replace(/\D/g, '').slice(0, 1));
      for (let k = 0; k < d.length && i + k < 6; k++) arr[i + k] = d[k];
      const end = arr.findIndex((x) => !x);
      set(arr.slice(0, end === -1 ? 6 : end).join(''));
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (box.value) box.value = '';
        else if (i > 0) {
          boxes[i - 1].value = '';
          boxes[i - 1].focus();
        }
        paint();
        const v = value();
        onChange?.(v);
      }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < 5) boxes[i + 1].focus();
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      set(e.clipboardData.getData('text'));
    });
  });

  return {
    value,
    clear: () => {
      boxes.forEach((b) => (b.value = ''));
      paint();
      onChange?.('');
    },
    disable: (on) => boxes.forEach((b) => (b.disabled = on)),
    focus: () => boxes[0].focus(),
  };
}

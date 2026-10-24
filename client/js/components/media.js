/** Responsive catalogue photo with a branded gradient fallback. */
import { html, cx } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { photo, photoUrl } from '../lib/photos.js';

/**
 * If the image cannot load (offline, blocked network) the gradient and an
 * aircraft icon stay visible, so the layout never breaks. The image fades in
 * once loaded (see initImages).
 */
export function smartImage({ photoKey, width = 1200, cls, imgCls, alt, priority = false, showIcon = true }) {
  const p = photo(photoKey);
  const half = Math.round(width / 2);
  return html`<div class="${cx('photo-fallback smart-image', cls)}">
    ${showIcon ? html`<div class="smart-image-icon" aria-hidden="true">${icon('plane', 'i-10')}</div>` : ''}
    ${p
      ? html`<img src="${photoUrl(photoKey, width)}" srcset="${photoUrl(photoKey, half)} ${half}w, ${photoUrl(photoKey, width)} ${width}w" sizes="(max-width: 640px) 100vw, 50vw" alt="${alt ?? p.alt}" loading="${priority ? 'eager' : 'lazy'}" decoding="async" class="${cx('smart-img', imgCls)}" />`
      : ''}
  </div>`;
}

/** Fades images in when loaded and hides broken ones (capture-phase listeners catch every <img>). */
export function initImages() {
  document.addEventListener(
    'load',
    (e) => {
      if (e.target instanceof HTMLImageElement && e.target.classList.contains('smart-img')) e.target.classList.add('is-loaded');
    },
    true,
  );
  document.addEventListener(
    'error',
    (e) => {
      if (e.target instanceof HTMLImageElement && e.target.classList.contains('smart-img')) e.target.remove();
    },
    true,
  );
}

/** Images already cached by the browser may have loaded before the listener saw them. */
export function markLoadedImages(root) {
  for (const img of root.querySelectorAll('img.smart-img')) if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
}

/**
 * Scroll reveal: elements with the `reveal` class fade up the first time they
 * enter the viewport. Without IntersectionObserver (or with reduced motion,
 * handled in CSS) they are simply shown.
 */
export function initReveal() {
  if (!('IntersectionObserver' in window)) {
    document.documentElement.classList.add('no-reveal');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -60px 0px' },
  );
  const scan = (root) => {
    for (const el of root.querySelectorAll('.reveal:not(.is-visible)')) io.observe(el);
  };
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n instanceof Element) (n.classList.contains('reveal') ? io.observe(n) : scan(n));
  }).observe(document.body, { childList: true, subtree: true });
  scan(document);
}

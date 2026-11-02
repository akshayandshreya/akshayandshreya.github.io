/* Motion boot (spec 3.3, 3.4, 3.8). Runs in <head> before the first paint: unless the guest asked for reduced motion
   (or the browser cannot trigger entrances), <html> gets `motion-boot`, which keeps the entrance elements of the
   screen in view at load ([data-enter]) hidden, so the opening timeline never flashes its finished state first.
   MotionProvider removes the class as soon as the timelines are armed; if the app bundle never runs, this script
   removes it after 3 s, so content can never stay hidden. An external file: a strict CSP needs no inline hash. */
(function () {
  'use strict';
  try {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var root = document.documentElement;
    root.classList.add('motion-boot');
    window.setTimeout(function () {
      root.classList.remove('motion-boot');
    }, 3000);
  } catch {
    /* never block the page */
  }
})();

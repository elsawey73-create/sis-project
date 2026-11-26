// Shared timing so JS-driven exits match the CSS motion and reduced-motion setting.
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function motionMs(ms) {
  return prefersReducedMotion() ? 0 : ms;
}

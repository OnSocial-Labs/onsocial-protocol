/**
 * App scroll inertia — same Lenis tuning as portal's SmoothScrollProvider.
 *
 * Portal drives `window`. The OS column locks `html/body` and scrolls nested
 * overflow (`.os-app-screen-body`, `.portfolio-page`, sheets). Bind Lenis to
 * those roots instead of reopening document scroll.
 */

/** Page + overlay overflow roots. New OsAppScreen / GlassSheet hosts pick up automatically. */
export const APP_SMOOTH_SCROLL_ROOT_SELECTOR = [
  '.os-app-screen-body',
  '.portfolio-page',
  '.gate-scroll',
  '.glass-sheet-body',
  '.os-app-chrome-scroller',
].join(', ');

/**
 * Wheel coast matches portal (`lerp` / `duration` / `smoothWheel`).
 * `autoRaf`, `allowNestedScroll`, and `naiveDimensions` are required because
 * these roots are overflow elements with mixed children, not `window`.
 */
export const APP_SMOOTH_SCROLL_LENIS_OPTIONS = {
  lerp: 0.1,
  duration: 1.5,
  smoothWheel: true,
  autoRaf: true,
  allowNestedScroll: true,
  naiveDimensions: true,
} as const;

/** Desktop / trackpad only — phones keep native overflow momentum. */
export const APP_SMOOTH_WHEEL_MEDIA = '(hover: hover) and (pointer: fine)';

export type AppSmoothScrollMatchMedia = (query: string) => { matches: boolean };

export function prefersReducedMotion(
  matchMedia: AppSmoothScrollMatchMedia = (query) => window.matchMedia(query)
): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Lenis VirtualScroll always binds `touchmove` with `{ passive: false }`.
 * On iOS that can kill nested-overflow inertia even when `syncTouch` is off.
 * Native `-webkit-overflow-scrolling: touch` is the mobile path; Lenis is
 * only for fine-pointer wheel / trackpad coast.
 */
export function shouldUseAppSmoothScroll(
  matchMedia: AppSmoothScrollMatchMedia = (query) => window.matchMedia(query)
): boolean {
  return (
    !prefersReducedMotion(matchMedia) &&
    matchMedia(APP_SMOOTH_WHEEL_MEDIA).matches
  );
}

export function isAppSmoothScrollLocked(dataset: {
  scrollLocked?: string;
}): boolean {
  return dataset.scrollLocked === 'true';
}

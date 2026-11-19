/** Lenis owns overflow roots. Restoring `scrollTop` alone gets overwritten. */

export type AppLenisScrollToOptions = {
  immediate?: boolean;
  force?: boolean;
  /** Seconds — Lenis native animated scroll. */
  duration?: number;
  easing?: (t: number) => number;
  onComplete?: () => void;
};

export type AppLenisScroll = {
  readonly limit: number;
  readonly scroll: number;
  /** Live animated position. Present on the Lenis instance. */
  animatedScroll?: number;
  /** Coast target. Present on the Lenis instance. */
  targetScroll?: number;
  resize: () => void;
  scrollTo: (target: number, options?: AppLenisScrollToOptions) => void;
  /** Cancel in-flight wheel coast before an immediate adopt. */
  stop?: () => void;
  start?: () => void;
};

/**
 * Sync Lenis to the element's current scrollTop without the ±1 cancel nudge
 * (that read as desktop jiggle). stop → resize → immediate scrollTo → start.
 * `resize()` snaps Lenis's coast target — don't use this while the reader
 * is still scrolling.
 */
export function adoptAppLenisScroll(root: HTMLElement): void {
  const smooth = getAppLenis(root);
  if (!smooth) return;
  const top = root.scrollTop;
  smooth.stop?.();
  smooth.resize();
  smooth.scrollTo(top, { immediate: true, force: true });
  smooth.start?.();
}

/**
 * Move the live scroll by `delta` without cancelling a wheel coast.
 * Lenis `resize()`, `stop()`, and `scrollTo({ immediate: true })` snap the
 * target — immediate `scrollTo` also `reset()`s the animation — and that
 * reads as a hitch when a preloaded row settles while the reader is still
 * moving. Private `setScroll` only writes the wrapper (`behavior: 'instant'`).
 */
export function shiftAppLenisScroll(root: HTMLElement, delta: number): void {
  if (!Number.isFinite(delta) || Math.abs(delta) < 1) return;
  const smooth = getAppLenis(root);
  if (
    !smooth ||
    typeof smooth.animatedScroll !== 'number' ||
    typeof smooth.targetScroll !== 'number'
  ) {
    root.scrollTop += delta;
    return;
  }
  smooth.animatedScroll += delta;
  smooth.targetScroll += delta;
  root.scrollTo({ top: smooth.animatedScroll, behavior: 'instant' });
}

const byElement = new WeakMap<HTMLElement, AppLenisScroll>();

export function registerAppLenis(
  element: HTMLElement,
  lenis: AppLenisScroll
): void {
  byElement.set(element, lenis);
}

export function unregisterAppLenis(element: HTMLElement): void {
  byElement.delete(element);
}

export function getAppLenis(element: HTMLElement): AppLenisScroll | null {
  return byElement.get(element) ?? null;
}

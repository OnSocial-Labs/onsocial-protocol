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
 * target — immediate `scrollTo` also `reset()`s the animation.
 * Writing `animatedScroll` alone lasts one frame: the in-flight animator
 * assigns it back on the next `raf`. Shift that animator's `from` / `to` /
 * `value` by the same delta so the coast continues from the new position.
 * Public `scrollTo` would restart the ease and keep overwriting `scrollTop`.
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
  // Lenis types mark the animator private. The instance still has it, and
  // the next frame rebuilds `animatedScroll` from these three fields.
  const animate = (
    smooth as {
      animate?: { from?: number; to?: number; value?: number };
    }
  ).animate;
  if (
    animate &&
    typeof animate.from === 'number' &&
    typeof animate.to === 'number' &&
    typeof animate.value === 'number'
  ) {
    animate.from += delta;
    animate.to += delta;
    animate.value += delta;
  }
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

/**
 * Live scroll position when Lenis owns the root — native `scrollTop` can lag
 * the animator during coast. Capture / restore with this so underlays land
 * where the reader actually was.
 */
export function readAppScrollTop(root: HTMLElement): number {
  const lenisTop = getAppLenis(root)?.scroll ?? 0;
  return Math.max(root.scrollTop, lenisTop);
}

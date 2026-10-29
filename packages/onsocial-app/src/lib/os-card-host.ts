/**
 * One portal parent for the launcher, glass sheets, and slide-overs.
 * The overlay stack only orders siblings. A layer on `document.body` paints
 * over a layer inside the phone card no matter which z-index it was given.
 */

/** Live front card. Prefer this over a card parked under a covered feed. */
const OS_CARD_HOST_LIVE =
  '.feed-session-front .portfolio-frame.app-surface, .feed-session-front .os-app-screen.app-surface:not(.os-slide-over)';

const OS_CARD_HOST_ANY =
  '.portfolio-frame.app-surface, .os-app-screen.app-surface:not(.os-slide-over)';

/**
 * The card ref can lag a commit behind the node already in the DOM.
 * Read the node directly so a sheet opened in that gap stays inside the card.
 */
export function probeOsCardHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const live = document.querySelector<HTMLElement>(OS_CARD_HOST_LIVE);
  if (live) return live;
  const any = document.querySelector<HTMLElement>(OS_CARD_HOST_ANY);
  if (any?.closest('[data-feed-session="covered"]')) return null;
  return any;
}

/**
 * Registered card, then the card already in the DOM, then the window.
 * `viewport` layers are the window on purpose.
 */
export function resolveOsOverlayPortal<T>(input: {
  viewport?: boolean;
  registered: T | null;
  probed: T | null;
  body: T | null;
}): T | null {
  if (input.viewport) return input.body;
  return input.registered ?? input.probed ?? input.body;
}

/** Shared-element flight sits one step above the face's painted stack z. */
export function zoomFlightZ(paintedFaceZ: number): number {
  if (!Number.isFinite(paintedFaceZ)) return 0;
  return paintedFaceZ + 1;
}

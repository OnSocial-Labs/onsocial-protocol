import {
  isFullPagePanelLayout,
  parseOverlayPanelKey,
} from '@/lib/overlay-routes';
import {
  resolveOverlaySlotMode,
  type OverlaySlotMode,
} from '@/lib/overlay-slot';

export { resolveOverlaySlotMode, type OverlaySlotMode };

/**
 * Single gate for mounting the persistent portfolio glass host.
 *
 * Invariants:
 * - Full-page panel routes (hard refresh) never mount glass.
 * - Soft intercepts mount when the @overlay slot is active or portfolio is still
 *   the main child (empty layout segments under [accountId]).
 */
export function shouldMountPortfolioGlassHost(input: {
  pathname: string;
  layoutSegments: readonly string[];
  overlaySlotMode: OverlaySlotMode;
}): boolean {
  if (parseOverlayPanelKey(input.pathname) == null) {
    return false;
  }

  if (isFullPagePanelLayout(input.layoutSegments)) {
    return false;
  }

  if (input.overlaySlotMode === 'intercept') {
    return true;
  }

  return input.layoutSegments.length === 0;
}

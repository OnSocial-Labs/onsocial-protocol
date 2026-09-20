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
 * - Full-page panel routes (hard refresh) never mount glass, except an article
 *   intercept over the hard Writing shelf (first tap must paint).
 * - Soft intercepts mount when the @overlay slot is active or portfolio is still
 *   the main child (empty layout segments under [accountId]).
 */
export function shouldMountPortfolioGlassHost(input: {
  pathname: string;
  layoutSegments: readonly string[];
  overlaySlotMode: OverlaySlotMode;
}): boolean {
  const panelKey = parseOverlayPanelKey(input.pathname);
  if (panelKey == null) {
    return false;
  }

  // Feed drawer redirect and collectibles PanelPage vault — no glass host.
  if (panelKey === 'feed' || panelKey === 'collectibles') {
    return false;
  }

  if (isFullPagePanelLayout(input.layoutSegments)) {
    // Hard Writing shelf + article intercept still needs the glass host.
    return (
      input.overlaySlotMode === 'intercept' &&
      input.layoutSegments[0] === 'writing' &&
      input.layoutSegments.length === 1 &&
      Boolean(panelKey?.startsWith('writing:'))
    );
  }

  if (input.overlaySlotMode === 'intercept') {
    return true;
  }

  return input.layoutSegments.length === 0;
}

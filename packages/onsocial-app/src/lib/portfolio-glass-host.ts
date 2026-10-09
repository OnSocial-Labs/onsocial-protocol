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
 * - The network map is always the full screen, including a soft nav from Standing.
 * - Full-page panel routes (hard refresh) never mount glass.
 * - Articles (`writing:`) are always a solid page — never glass.
 * - Soft intercepts mount when the @overlay slot is active or portfolio is still
 *   the main child (empty layout segments under [accountId]).
 * - A standing peek over the network page still mounts: the underlay segment
 *   stays `network` while the URL is the list.
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

  // Feed drawer redirect, collectibles vault, and the article reader — no glass.
  // Network is the full OS screen, never the standing sheet.
  if (
    panelKey === 'feed' ||
    panelKey === 'collectibles' ||
    panelKey === 'network' ||
    panelKey.startsWith('writing:')
  ) {
    return false;
  }

  if (isFullPagePanelLayout(input.layoutSegments)) {
    const underlay = input.layoutSegments[0] ?? '';
    const pathIsUnderlay =
      panelKey === underlay || panelKey.startsWith(`${underlay}:`);
    if (pathIsUnderlay || input.overlaySlotMode !== 'intercept') {
      return false;
    }
  }

  if (input.overlaySlotMode === 'intercept') {
    return true;
  }

  return input.layoutSegments.length === 0;
}

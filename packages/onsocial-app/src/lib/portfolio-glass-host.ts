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

/** Network, the vault, the feed redirect, and an article are the screen itself. */
export function portfolioPanelIsFullScreen(panelKey: string | null): boolean {
  if (panelKey == null) return false;
  return (
    panelKey === 'feed' ||
    panelKey === 'collectibles' ||
    panelKey === 'network' ||
    panelKey.startsWith('writing:')
  );
}

/**
 * The router still names a glass sheet. Use the router pathname, not
 * `window.location`: the address bar can update a frame later and never
 * render again, which left Standing's empty frost over the map.
 */
export function routeKeepsPortfolioGlassSheet(pathname: string): boolean {
  const panelKey = parseOverlayPanelKey(pathname);
  return panelKey != null && !portfolioPanelIsFullScreen(panelKey);
}

/**
 * Keep the standing sheet mounted only while the map handoff is still opening.
 * A globe click must drop it. Once the list is up, a name tap to the profile
 * must drop it too — holding it closed through history and reopened the list.
 */
export function shouldKeepStandingGlassHost(input: {
  panelKey: string | null;
  handoffPhase: 'open' | 'close' | null;
}): boolean {
  if (input.panelKey === 'network') return false;
  return input.handoffPhase === 'open';
}

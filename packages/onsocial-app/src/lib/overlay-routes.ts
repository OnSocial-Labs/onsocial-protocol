import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import {
  applyDiscoverTabParam,
  type DiscoverTab,
} from '@/features/discover/discover-tabs';

export const OVERLAY_PANELS = [
  'discover',
  'endorsements',
  'feed',
  'standing',
  'reputation',
  'collectibles',
] as const;

export type OverlayPanel = (typeof OVERLAY_PANELS)[number];

export type { StanceDetailKind } from '@/lib/profile-social-standings';
export { standingPath } from '@/lib/profile-social-standings';

export function portfolioPath(accountId: string): string {
  return `/@${encodeURIComponent(accountId)}`;
}

export function overlayPath(accountId: string, panel: OverlayPanel): string {
  return `${portfolioPath(accountId)}/${panel}`;
}

/** Held catalog for an account — Launch See all + OS vault when connected. */
export function portfolioCollectiblesPath(
  accountId: string,
  options?: { kind?: string | null }
): string {
  const base = overlayPath(accountId, 'collectibles');
  const kind = options?.kind?.trim().toLowerCase() ?? '';
  if (!kind || kind === 'all') return base;
  return `${base}?kind=${encodeURIComponent(kind)}`;
}

/** Discover hub href. Contextual entries can deep-link a tab (e.g. Profiles). */
export function discoverPath(
  accountId: string,
  options?: { q?: string | null; tab?: DiscoverTab }
): string {
  const base = overlayPath(accountId, 'discover');
  const params = new URLSearchParams();
  if (options?.tab) {
    applyDiscoverTabParam(params, options.tab);
  }
  const normalized = normalizeProfileSearchQuery(options?.q);
  if (isProfileSearchQuery(normalized)) {
    params.set('q', normalized);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export const OVERLAY_PANEL_LABELS: Record<OverlayPanel, string> = {
  discover: 'Discover',
  endorsements: 'Endorsements',
  feed: 'Feed',
  standing: 'Standing',
  reputation: 'Reputation',
  collectibles: 'Collectibles',
};

export function panelLabel(panel: OverlayPanel): string {
  return OVERLAY_PANEL_LABELS[panel];
}

/** Stable key for cross-drawer swap + scroll cache (e.g. `standing:incoming`, `discover`). */
export function parseOverlayPanelKey(pathname: string): string | null {
  const standingMatch = pathname.match(
    /\/standing\/(incoming|outgoing|mutual)(?:\/|$|\?)/
  );
  if (standingMatch) {
    return `standing:${standingMatch[1]}`;
  }

  if (/\/standing(?:\/|$|\?)/.test(pathname)) {
    return 'standing:incoming';
  }

  for (const panel of OVERLAY_PANELS) {
    if (panel === 'standing') {
      continue;
    }
    if (new RegExp(`/${panel}(?:/|$|\\?)`).test(pathname)) {
      return panel;
    }
  }

  return null;
}

/** True when pathname is an open portfolio overlay drawer (standing tab, discover, etc.). */
export function isPortfolioOverlayPath(pathname: string): boolean {
  return parseOverlayPanelKey(pathname) != null;
}

/** Intercepting @overlay slot is active (soft nav). Empty on hard refresh / default slot. */
export function isOverlayInterceptActive(
  overlaySegments: readonly string[]
): boolean {
  return overlaySegments.length > 0;
}

/** Main `[accountId]` child route is a full-page panel (hard refresh / direct URL). */
export function isFullPagePanelLayout(segments: readonly string[]): boolean {
  if (segments.length === 0) {
    return false;
  }

  const root = segments[0];
  if (root === 'standing' || root === 'posts') {
    return true;
  }

  return (OVERLAY_PANELS as readonly string[]).includes(root);
}

/**
 * Open the portfolio glass drawer only for soft-nav intercepts over the profile
 * page.
 *
 * Face peeks — reputation, feed, endorsements, standing — stay overlay-only.
 * Hard refresh / shared link redirects to the profile face.
 *
 * Discover, collectibles, and an individual post stay real pages on hard
 * refresh (full-page `children`, no glass).
 */
export function shouldOpenPortfolioGlassOverlay(
  pathname: string,
  layoutSegments: readonly string[]
): boolean {
  if (parseOverlayPanelKey(pathname) == null) {
    return false;
  }

  return !isFullPagePanelLayout(layoutSegments);
}

export interface OverlayPanelChromeHint {
  ariaTitle: string;
  title?: string;
  expectsToolbar: boolean;
}

/** Route-derived chrome before panel providers register toolbar/title. */
export function resolveOverlayPanelChrome(
  panelKey: string | null
): OverlayPanelChromeHint | null {
  if (!panelKey) {
    return null;
  }

  if (panelKey.startsWith('standing:')) {
    return { ariaTitle: 'Standing', expectsToolbar: true };
  }

  if (panelKey === 'discover') {
    return { ariaTitle: 'Discover', expectsToolbar: true };
  }

  if (panelKey === 'feed') {
    return { ariaTitle: 'Feed', expectsToolbar: true };
  }

  if ((OVERLAY_PANELS as readonly string[]).includes(panelKey)) {
    const label = panelLabel(panelKey as OverlayPanel);
    return { ariaTitle: label, title: label, expectsToolbar: false };
  }

  return null;
}

import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';

export const OVERLAY_PANELS = [
  'discover',
  'endorsements',
  'feed',
  'standing',
  'reputation',
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

export function discoverPath(
  accountId: string,
  q?: string | null
): string {
  const base = overlayPath(accountId, 'discover');
  const normalized = normalizeProfileSearchQuery(q);
  if (isProfileSearchQuery(normalized)) {
    return `${base}?q=${encodeURIComponent(normalized)}`;
  }
  return base;
}

export const OVERLAY_PANEL_LABELS: Record<OverlayPanel, string> = {
  discover: 'Discover',
  endorsements: 'Endorsements',
  feed: 'Feed',
  standing: 'Standing',
  reputation: 'Reputation',
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
  if (root === 'standing') {
    return true;
  }

  return (OVERLAY_PANELS as readonly string[]).includes(root);
}

/**
 * Open the portfolio glass drawer only for soft-nav intercepts over the profile
 * page. Hard refresh on `/standing`, `/discover`, etc. renders the full-page
 * panel in `children` — no empty glass sheet on top.
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

  if ((OVERLAY_PANELS as readonly string[]).includes(panelKey)) {
    const label = panelLabel(panelKey as OverlayPanel);
    return { ariaTitle: label, title: label, expectsToolbar: false };
  }

  return null;
}

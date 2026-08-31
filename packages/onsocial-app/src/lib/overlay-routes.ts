import {
  APP_HOME_PATH,
  COLLECTIBLES_SEARCH_PARAM,
  MARKET_KIND_PARAM,
} from '@/lib/app-routes';
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

/** Portfolio panel URLs that always render as full pages — never the glass overlay. */
const FULL_PAGE_PORTFOLIO_PANELS = new Set<string>(['feed', 'collectibles']);

export type { StanceDetailKind } from '@/lib/profile-social-standings';
export { standingPath } from '@/lib/profile-social-standings';

export const PORTFOLIO_FEED_SECTION_ID = 'portfolio-feed';

export function portfolioPath(accountId: string): string {
  return `/@${encodeURIComponent(accountId)}`;
}

/** Shareable owner sheets on the profile face (`?sheet=`). */
export const PORTFOLIO_SHEET_PARAM = 'sheet';

export type PortfolioShareSheetId = 'boost' | 'rally';

export function parsePortfolioSheetParam(
  raw: string | null | undefined
): PortfolioShareSheetId | null {
  const value = (raw ?? '').trim().toLowerCase();
  return value === 'boost' || value === 'rally' ? value : null;
}

/** Owner boost drawer on the profile face. */
export function portfolioBoostPath(accountId: string): string {
  return `${portfolioPath(accountId)}?${PORTFOLIO_SHEET_PARAM}=boost`;
}

/** Owner rally player on the profile face. */
export function portfolioRallyPath(accountId: string): string {
  return `${portfolioPath(accountId)}?${PORTFOLIO_SHEET_PARAM}=rally`;
}

/** Viewer rally player from Home (same `sheet=` key as wallet). */
export function homeRallyPath(): string {
  return `${APP_HOME_PATH}?${PORTFOLIO_SHEET_PARAM}=rally`;
}

/** One-shot deep link — opens the portfolio page drawer, hash is stripped after. */
export function portfolioFeedPath(accountId: string): string {
  return `${portfolioPath(accountId)}#${PORTFOLIO_FEED_SECTION_ID}`;
}

export function overlayPath(accountId: string, panel: OverlayPanel): string {
  return `${portfolioPath(accountId)}/${panel}`;
}

/**
 * Endorsements overlay. Received is the default (bare URL). Given is
 * `?mode=given` so face signals can land on the matching rail — same idea as
 * `/standing/incoming` vs `/standing/outgoing`.
 */
export function endorsementsPath(
  accountId: string,
  options?: { mode?: 'received' | 'given' | string | null }
): string {
  const base = overlayPath(accountId, 'endorsements');
  const mode = (options?.mode ?? '').toString().trim().toLowerCase();
  return mode === 'given' ? `${base}?mode=given` : base;
}

/** Held catalog for an account — Launch See all + OS vault when connected. */
export function portfolioCollectiblesPath(
  accountId: string,
  options?: { kind?: string | null; q?: string | null }
): string {
  const base = overlayPath(accountId, 'collectibles');
  const params = new URLSearchParams();
  const kind = options?.kind?.trim().toLowerCase() ?? '';
  if (kind && kind !== 'all') params.set(MARKET_KIND_PARAM, kind);
  const q = options?.q?.trim() ?? '';
  if (q) params.set(COLLECTIBLES_SEARCH_PARAM, q);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
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

/** True when pathname is an open portfolio glass overlay (standing, discover, etc.). */
export function isPortfolioOverlayPath(pathname: string): boolean {
  const panelKey = parseOverlayPanelKey(pathname);
  if (panelKey == null) {
    return false;
  }
  return !FULL_PAGE_PORTFOLIO_PANELS.has(panelKey);
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
 * Face peeks — reputation, endorsements, standing — stay overlay-only.
 * Feed opens the portfolio page drawer (`#portfolio-feed` one-shot signal);
 * hard refresh on `/feed` redirects to that anchor.
 *
 * Discover and an individual post stay real pages on hard refresh (full-page
 * `children`, no glass). Collectibles vault is always PanelPage — drawer
 * Collection tab is preview-only.
 */
export function shouldOpenPortfolioGlassOverlay(
  pathname: string,
  layoutSegments: readonly string[]
): boolean {
  const panelKey = parseOverlayPanelKey(pathname);
  if (panelKey == null) {
    return false;
  }

  if (FULL_PAGE_PORTFOLIO_PANELS.has(panelKey)) {
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

  // `feed` never reaches glass chrome — it redirects into the page drawer.
  if ((OVERLAY_PANELS as readonly string[]).includes(panelKey)) {
    const label = panelLabel(panelKey as OverlayPanel);
    return { ariaTitle: label, title: label, expectsToolbar: false };
  }

  return null;
}

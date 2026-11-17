'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { PortfolioAboutOverlayLoading } from '@/components/portfolio/portfolio-about-route-loading';
import { PortfolioWritingOverlayLoading } from '@/components/portfolio/portfolio-writing-route-loading';
import { EndorsementsSheetOpening } from '@/components/panels/endorsements-sheet-opening';
import { StandingSheetOpening } from '@/components/panels/standing-sheet-opening';
import { DiscoverSheetOpening } from '@/features/discover/discover-sheet-opening';
import {
  getBrowserPath,
  getBrowserPathServerSnapshot,
  subscribeBrowserPath,
} from '@/lib/browser-path';
import { accountIdFromPath } from '@/lib/overlay-routes';
import {
  getPortfolioShelfHopServerSnapshot,
  getPortfolioShelfHopSnapshot,
  subscribePortfolioShelfHop,
  writingShelfAlreadyCovered,
} from '@/lib/portfolio-shelf-hop';

function isWritingShelfOverlay(pathname: string): boolean {
  return /\/writing\/?$/.test(pathname);
}

function isAboutOverlay(pathname: string): boolean {
  return /\/about\/?$/.test(pathname);
}

function isEndorsementsOverlay(pathname: string): boolean {
  return pathname.includes('/endorsements');
}

function isDiscoverOverlay(pathname: string): boolean {
  return /\/discover\/?$/.test(pathname);
}

/**
 * Paint cold shells for overlays we can identify from the path. Other slots
 * stay empty so a shared fallback cannot flash over an unrelated profile.
 *
 * Face peeks (standing / endorsements) wrap in OverlayInterceptRoot so the
 * glass host stays up while children briefly match the peek segment.
 * Writing / about / discover loading stay unmarked — they are not face peeks,
 * and writing must not force intercept glass around the solid article reader.
 */
export default function OverlayLoading() {
  const routerPath = usePathname() ?? '';
  const browserPath = useSyncExternalStore(
    subscribeBrowserPath,
    getBrowserPath,
    getBrowserPathServerSnapshot
  );
  // Soft nav updates the address bar before usePathname; face peeks need the
  // Opening shell on that first paint, not after the router catches up.
  const pathname = browserPath || routerPath;
  const shelfHop = useSyncExternalStore(
    subscribePortfolioShelfHop,
    getPortfolioShelfHopSnapshot,
    getPortfolioShelfHopServerSnapshot
  );
  if (pathname.includes('/standing/')) {
    return (
      <OverlayInterceptRoot>
        <StandingSheetOpening />
      </OverlayInterceptRoot>
    );
  }
  if (isEndorsementsOverlay(pathname)) {
    return (
      <OverlayInterceptRoot>
        <EndorsementsSheetOpening />
      </OverlayInterceptRoot>
    );
  }
  if (isDiscoverOverlay(pathname)) {
    return <DiscoverSheetOpening />;
  }
  if (isWritingShelfOverlay(pathname)) {
    const accountId = accountIdFromPath(pathname);
    if (!accountId) return null;
    if (
      writingShelfAlreadyCovered() ||
      (shelfHop.active && !shelfHop.arrived)
    ) {
      return null;
    }
    return <PortfolioWritingOverlayLoading accountId={accountId} />;
  }
  if (isAboutOverlay(pathname)) {
    const accountId = accountIdFromPath(pathname);
    if (!accountId) return null;
    return <PortfolioAboutOverlayLoading accountId={accountId} />;
  }
  return null;
}

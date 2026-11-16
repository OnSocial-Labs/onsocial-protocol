'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { PortfolioAboutOverlayLoading } from '@/components/portfolio/portfolio-about-route-loading';
import { PortfolioWritingOverlayLoading } from '@/components/portfolio/portfolio-writing-route-loading';
import { StandingSheetOpening } from '@/components/panels/standing-sheet-opening';
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

/**
 * Paint cold shells for overlays we can identify from the path. Other slots
 * stay empty so a shared fallback cannot flash over an unrelated profile.
 */
export default function OverlayLoading() {
  const pathname = usePathname() ?? '';
  const shelfHop = useSyncExternalStore(
    subscribePortfolioShelfHop,
    getPortfolioShelfHopSnapshot,
    getPortfolioShelfHopServerSnapshot
  );
  if (pathname.includes('/standing/')) return <StandingSheetOpening />;
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

'use client';

import { usePathname } from 'next/navigation';
import { EndorsementsOverlayFrame } from '@/components/overlay/endorsements-overlay-frame';
import { EndorsementListSkeleton } from '@/components/panels/endorsement-list-row';
import { accountIdFromPath, panelLabel } from '@/lib/overlay-routes';

/** Settled seat class while the list is still a skeleton (loading + Suspense). */
export function EndorsementsPanelSeat() {
  return (
    <div className="endorsements-panel">
      <EndorsementListSkeleton />
    </div>
  );
}

/**
 * Soft-open cold chrome while the endorsements overlay RSC loads.
 * Same job as StandingSheetOpening: frame + panel seat on the gesture,
 * list stays skeleton until the intercept page fills in.
 */
export function EndorsementsSheetOpening() {
  const pathname = usePathname() ?? '';
  const accountId = accountIdFromPath(pathname);
  if (!accountId) return null;
  const title = panelLabel('endorsements');

  return (
    <EndorsementsOverlayFrame ariaTitle={title} title={title}>
      <EndorsementsPanelSeat />
    </EndorsementsOverlayFrame>
  );
}

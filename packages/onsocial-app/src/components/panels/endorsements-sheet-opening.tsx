'use client';

import { usePathname } from 'next/navigation';
import { EndorsementsOverlayFrame } from '@/components/overlay/endorsements-overlay-frame';
import { EndorsementListSkeleton } from '@/components/panels/endorsement-list-row';
import { accountIdFromPath, panelLabel } from '@/lib/overlay-routes';

/**
 * Soft-open cold chrome while the endorsements overlay RSC loads.
 * Frame + panel seat match the settled route; list stays skeleton until
 * the intercept page replaces this slot (avoids a second live panel).
 */
export function EndorsementsSheetOpening() {
  const pathname = usePathname() ?? '';
  const accountId = accountIdFromPath(pathname);
  if (!accountId) return null;
  const title = panelLabel('endorsements');

  return (
    <EndorsementsOverlayFrame ariaTitle={title} title={title}>
      <div className="endorsements-panel">
        <EndorsementListSkeleton />
      </div>
    </EndorsementsOverlayFrame>
  );
}

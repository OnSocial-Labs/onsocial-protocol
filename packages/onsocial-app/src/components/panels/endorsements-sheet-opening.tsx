'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { EndorsementsOverlayFrame } from '@/components/overlay/endorsements-overlay-frame';
import { EndorsementListSkeleton } from '@/components/panels/endorsement-list-row';
import { EndorsementsPanel } from '@/components/panels/endorsements-panel';
import {
  getBrowserPath,
  getBrowserPathServerSnapshot,
  subscribeBrowserPath,
} from '@/lib/browser-path';
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
 * Soft-open chrome while `@overlay/(.)endorsements` RSC lags or aborts.
 * Paint the seat on the gesture, then hand off to the live client panel so
 * Endorse / menu / stubbed rows work even when OverlayInterceptRoot never
 * lands. Prefer an explicit accountId from the glass host so the seat
 * paints even when the router pathname still lags the address bar.
 */
export function EndorsementsSheetOpening({
  accountId: accountIdProp,
}: {
  accountId?: string;
} = {}) {
  const routerPath = usePathname() ?? '';
  const browserPath = useSyncExternalStore(
    subscribeBrowserPath,
    getBrowserPath,
    getBrowserPathServerSnapshot
  );
  const pathname = browserPath || routerPath;
  const accountId = accountIdProp || accountIdFromPath(pathname);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLive(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!accountId) {
    // Still paint the settled seat class so soft-open e2e / first paint
    // never wait on a missing account parse while the URL catches up.
    return <EndorsementsPanelSeat />;
  }
  const title = panelLabel('endorsements');

  return (
    <EndorsementsOverlayFrame ariaTitle={title} title={title}>
      {live ? (
        <EndorsementsPanel accountId={accountId} />
      ) : (
        <EndorsementsPanelSeat />
      )}
    </EndorsementsOverlayFrame>
  );
}

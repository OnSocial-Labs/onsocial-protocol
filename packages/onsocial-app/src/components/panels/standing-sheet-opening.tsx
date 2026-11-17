'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { StandingOverlaySheet } from '@/components/panels/standing-panel';
import { getStandingOpeningFace } from '@/components/panels/network-standing-handoff';
import {
  getBrowserPath,
  getBrowserPathServerSnapshot,
  subscribeBrowserPath,
} from '@/lib/browser-path';
import { accountIdFromPath } from '@/lib/overlay-routes';
import { parseStandingKindFromPathname } from '@/lib/profile-social-standings';

/**
 * Soft-open chrome while `@overlay/(.)standing` RSC lags or aborts.
 * Paint the preview seat on the gesture, then hand off to the live client
 * panel so the list can settle even when OverlayInterceptRoot never lands.
 * Prefer an explicit accountId from the glass host so the seat paints even
 * when the router pathname still lags the address bar.
 */
export function StandingSheetOpening({
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
  const kind = parseStandingKindFromPathname(pathname) ?? 'incoming';
  const [live, setLive] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLive(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!accountId) return null;
  const face = getStandingOpeningFace(accountId);

  return (
    <StandingOverlaySheet
      accountId={accountId}
      kind={kind}
      displayName={face?.displayName || accountId}
      avatarUrl={face?.avatarUrl ?? null}
      initialCounts={{ incoming: 0, outgoing: 0, mutual: 0 }}
      listPreview={!live}
    />
  );
}

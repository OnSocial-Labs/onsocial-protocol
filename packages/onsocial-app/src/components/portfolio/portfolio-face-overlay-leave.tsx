'use client';

import { useMemo } from 'react';
import { useRegisterDockBack } from '@/contexts/dock-chrome-context';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { portfolioFaceOverlayLeaveHref } from '@/lib/os-leave';

/** Face overlays — dock leave closes to the page, not Home. */
export function PortfolioFaceOverlayLeave({
  accountId,
}: {
  accountId: string;
}) {
  const dismiss = useOverlayDismiss();
  const entry = useMemo(
    () => ({
      fallbackHref: portfolioFaceOverlayLeaveHref(accountId),
      ariaLabel: 'Back',
      onBack: dismiss,
    }),
    [accountId, dismiss]
  );
  useRegisterDockBack(entry);
  return null;
}

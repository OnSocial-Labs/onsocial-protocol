'use client';

import { useMemo } from 'react';
import { useRegisterDockBack } from '@/contexts/dock-chrome-context';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { portfolioPath } from '@/lib/overlay-routes';

/** About overlay — no sheet header. Leave is the summon dock chevron. */
export function AboutOverlayLeave({ accountId }: { accountId: string }) {
  const dismiss = useOverlayDismiss();
  const entry = useMemo(
    () => ({
      fallbackHref: portfolioPath(accountId),
      ariaLabel: 'Back',
      onBack: dismiss,
    }),
    [accountId, dismiss]
  );
  useRegisterDockBack(entry);
  return null;
}

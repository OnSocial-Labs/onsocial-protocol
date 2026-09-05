'use client';

import { useMemo } from 'react';
import { useRegisterDockBack } from '@/contexts/dock-chrome-context';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { portfolioPath, writingPath } from '@/lib/overlay-routes';

/** Writing overlay — leave is the summon dock chevron. */
export function WritingOverlayLeave({
  accountId,
  fallback = 'face',
}: {
  accountId: string;
  fallback?: 'face' | 'shelf';
}) {
  const dismiss = useOverlayDismiss();
  const entry = useMemo(
    () => ({
      fallbackHref:
        fallback === 'shelf' ? writingPath(accountId) : portfolioPath(accountId),
      ariaLabel: 'Back',
      onBack: dismiss,
    }),
    [accountId, dismiss, fallback]
  );
  useRegisterDockBack(entry);
  return null;
}

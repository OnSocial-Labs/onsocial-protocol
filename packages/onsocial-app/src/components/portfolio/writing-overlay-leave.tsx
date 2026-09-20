'use client';

import { useMemo } from 'react';
import { useRegisterDockBack } from '@/contexts/dock-chrome-context';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { useEssayReturnSearch } from '@/hooks/use-essay-return-search';
import { withEssayReturnSearch } from '@/lib/essay-return-href';
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
  const returnSearch = useEssayReturnSearch();
  const entry = useMemo(
    () => ({
      fallbackHref:
        fallback === 'shelf'
          ? withEssayReturnSearch(writingPath(accountId), returnSearch)
          : portfolioPath(accountId),
      ariaLabel: 'Back',
      onBack: dismiss,
    }),
    [accountId, dismiss, fallback, returnSearch]
  );
  useRegisterDockBack(entry);
  return null;
}

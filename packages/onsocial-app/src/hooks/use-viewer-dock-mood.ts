'use client';

import { useMemo, type CSSProperties } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerWalletMoodVars } from '@/hooks/use-viewer-wallet-mood-vars';
import { resolvePortfolioMood } from '@/lib/moods/resolve';

/**
 * Summon dock chrome for the connected viewer — same mood everywhere
 * (home, OS apps, visiting someone else’s page).
 */
export function useViewerDockMood(pageAccountId?: string): {
  moodId: string | null;
  style: CSSProperties | undefined;
} {
  const { accountId } = useAppWallet();
  const { moodId: fetchedMoodId, style: fetchedMoodStyle } =
    useViewerWalletMoodVars(
      accountId ?? '',
      pageAccountId,
      Boolean(accountId)
    );
  const fallbackMood = useMemo(() => resolvePortfolioMood({}), []);

  const moodId = accountId
    ? (fetchedMoodId ?? fallbackMood.id)
    : null;

  const style = useMemo(() => {
    if (!accountId) return undefined;
    // Live / fetched vars only. Protocol inline would stamp OS wash over
    // inherited face vars when Edit profile portals into `.portfolio-frame`.
    if (fetchedMoodStyle) return fetchedMoodStyle;
    return undefined;
  }, [accountId, fetchedMoodStyle]);

  return { moodId, style };
}

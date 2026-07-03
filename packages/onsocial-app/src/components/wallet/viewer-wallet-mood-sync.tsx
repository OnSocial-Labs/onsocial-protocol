'use client';

import { useEffect } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerWalletMoodContext } from '@/contexts/viewer-wallet-mood-context';
import { accountIdsEqual } from '@/lib/account-match';
import type { ResolvedMood } from '@/lib/moods/types';

interface ViewerWalletMoodSyncProps {
  pageAccountId: string;
  mood: ResolvedMood;
}

/** Seeds viewer wallet mood from the live portfolio shell on the owner's page. */
export function ViewerWalletMoodSync({
  pageAccountId,
  mood,
}: ViewerWalletMoodSyncProps) {
  const { accountId, isConnected } = useAppWallet();
  const { setMood } = useViewerWalletMoodContext();

  useEffect(() => {
    if (
      !isConnected ||
      !accountId ||
      !accountIdsEqual(accountId, pageAccountId)
    ) {
      return;
    }

    setMood(mood);
  }, [accountId, isConnected, mood, pageAccountId, setMood]);

  return null;
}

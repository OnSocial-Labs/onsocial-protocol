'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';
import { mergeMoodIntoPageConfig } from '@/lib/moods/resolve';
import type { BuiltInMoodId } from '@/lib/moods/types';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function useApplyMood(pageAccountId: string) {
  const router = useRouter();
  const { accountId, isConnected, isLoading, connect, getSigningWallet } =
    useAppWallet();
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = isConnected && accountId === pageAccountId;
  const needsConnect = !isLoading && !isConnected;

  const applyMood = useCallback(
    async (moodId: BuiltInMoodId) => {
      setError(null);
      setIsApplying(true);

      try {
        const { wallet, accountId: signingAccountId } =
          await getSigningWallet();

        if (signingAccountId !== pageAccountId) {
          throw new Error(
            `Connect as @${pageAccountId} to update this page's mood.`
          );
        }

        const os = createAppOnSocialClient(signingAccountId, wallet);
        const current = await os.pages.getConfig(signingAccountId);
        const next = mergeMoodIntoPageConfig(current, moodId);
        await os.pages.setConfig(next);
        router.refresh();
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Could not apply mood on-chain.'
        );
      } finally {
        setIsApplying(false);
      }
    },
    [getSigningWallet, pageAccountId, router]
  );

  return {
    applyMood,
    connect,
    error,
    isApplying,
    isOwner,
    needsConnect,
    walletAccountId: accountId,
  };
}

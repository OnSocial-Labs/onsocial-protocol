'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BuiltInPageMoodId } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function formatApplyMoodError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Could not apply mood on-chain.';
  }

  const message = error.message.trim();
  if (!message || message === 'Failed to fetch') {
    return 'Could not reach OnSocial. Check your connection and try again.';
  }

  return message;
}

export function useApplyMood(pageAccountId: string) {
  const router = useRouter();
  const {
    accountId,
    isConnected,
    isLoading,
    isBootstrappingSession,
    connect,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner =
    isConnected && Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);
  const needsConnect = !isLoading && !isConnected;

  const applyMood = useCallback(
    async (moodId: BuiltInPageMoodId): Promise<boolean> => {
      setError(null);
      setIsApplying(true);

      try {
        const { client, accountId: signingAccountId } = await getClient();

        if (!accountIdsEqual(signingAccountId, pageAccountId)) {
          throw new Error(
            `Connect as @${pageAccountId} to update this page's mood.`
          );
        }

        await client.pages.setMood(moodId, {
          accountId: signingAccountId,
          wait: true,
        });
        router.refresh();
        return true;
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          return false;
        }
        setError(formatApplyMoodError(err));
        return false;
      } finally {
        setIsApplying(false);
      }
    },
    [getClient, pageAccountId, router]
  );

  return {
    applyMood,
    connect,
    error,
    isApplying: isApplying || isBootstrappingSession,
    isOwner,
    needsConnect,
    walletAccountId: accountId,
  };
}

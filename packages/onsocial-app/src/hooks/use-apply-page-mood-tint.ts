'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  mergePageMoodTintIntoPageConfig,
  type PageMoodId,
} from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { accountIdsEqual } from '@/lib/account-match';
import { fetchPageConfigFromBrowserProxy } from '@/lib/read-page-config';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function formatApplyMoodTintError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Could not save ink hue on-chain.';
  }

  const message = error.message.trim();
  if (!message || message === 'Failed to fetch') {
    return 'Could not reach OnSocial. Check your connection and try again.';
  }

  return message;
}

export function useApplyPageMoodTint(pageAccountId: string) {
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

  const applyMoodTint = useCallback(
    async (moodId: PageMoodId, hue: number): Promise<boolean> => {
      setError(null);
      setIsApplying(true);

      try {
        const { client, accountId: signingAccountId } = await getClient();

        if (!accountIdsEqual(signingAccountId, pageAccountId)) {
          throw new Error(
            `Connect as @${pageAccountId} to update this page's ink hue.`
          );
        }

        const current = await fetchPageConfigFromBrowserProxy(signingAccountId);

        await client.pages.setConfig(
          mergePageMoodTintIntoPageConfig(current, moodId, hue),
          { wait: true }
        );
        router.refresh();
        return true;
      } catch (err) {
        if (isWalletUserCancellation(err)) {
          return false;
        }
        setError(formatApplyMoodTintError(err));
        return false;
      } finally {
        setIsApplying(false);
      }
    },
    [getClient, pageAccountId, router]
  );

  return {
    applyMoodTint,
    connect,
    error,
    isApplying: isApplying || isBootstrappingSession,
    isOwner,
    needsConnect,
    walletAccountId: accountId,
  };
}
